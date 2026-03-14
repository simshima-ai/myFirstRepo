export function createGroupStructureOps(config) {
  const {
    state,
    getGroup,
    collectGroupTreeShapeIds,
    pushHistory,
    draw
  } = config || {};

  function scalePointAround(x, y, ox, oy, factorX, factorY = factorX) {
    return {
      x: ox + (Number(x) - ox) * factorX,
      y: oy + (Number(y) - oy) * factorY,
    };
  }

  function averageScale(factorX, factorY) {
    return (Math.abs(Number(factorX) || 0) + Math.abs(Number(factorY) || 0)) / 2 || 1;
  }

  function normalizeScaleOptions(raw) {
    const allowScale = !!raw?.allowScale;
    const keepAspect = allowScale ? (raw?.keepAspect !== false) : false;
    const scaleFactor = Math.max(1e-9, Number(raw?.scaleFactor) || 1);
    const scaleX = Math.max(1e-9, Number(raw?.scaleX) || scaleFactor);
    const scaleY = Math.max(1e-9, Number(raw?.scaleY) || scaleFactor);
    return { allowScale, keepAspect, scaleFactor, scaleX, scaleY };
  }

  function applyScaleToShape(target, base, ox, oy, factorX, factorY) {
    const radialFactor = averageScale(factorX, factorY);
    if (target.type === "line" || target.type === "rect") {
      const p1 = scalePointAround(base.x1, base.y1, ox, oy, factorX, factorY);
      const p2 = scalePointAround(base.x2, base.y2, ox, oy, factorX, factorY);
      target.x1 = p1.x; target.y1 = p1.y; target.x2 = p2.x; target.y2 = p2.y;
    } else if (target.type === "polyline") {
      if (Array.isArray(base.points)) {
        target.points = base.points.map((pt) => scalePointAround(Number(pt?.x), Number(pt?.y), ox, oy, factorX, factorY));
      }
    } else if (target.type === "circle") {
      const c = scalePointAround(base.cx, base.cy, ox, oy, factorX, factorY);
      target.cx = c.x; target.cy = c.y; target.r = Math.abs(Number(base.r) || 0) * radialFactor;
    } else if (target.type === "arc") {
      const c = scalePointAround(base.cx, base.cy, ox, oy, factorX, factorY);
      target.cx = c.x; target.cy = c.y; target.r = Math.abs(Number(base.r) || 0) * radialFactor;
      target.a1 = base.a1; target.a2 = base.a2; target.ccw = base.ccw;
    } else if (target.type === "position") {
      const p = scalePointAround(base.x, base.y, ox, oy, factorX, factorY);
      target.x = p.x; target.y = p.y; target.size = Math.max(0.1, Number(base.size) * radialFactor);
    } else if (target.type === "dim") {
      const p1 = scalePointAround(base.x1, base.y1, ox, oy, factorX, factorY);
      const p2 = scalePointAround(base.x2, base.y2, ox, oy, factorX, factorY);
      const pp = scalePointAround(base.px, base.py, ox, oy, factorX, factorY);
      target.x1 = p1.x; target.y1 = p1.y; target.x2 = p2.x; target.y2 = p2.y; target.px = pp.x; target.py = pp.y;
      if (Number.isFinite(Number(base.tx)) && Number.isFinite(Number(base.ty))) {
        const tp = scalePointAround(Number(base.tx), Number(base.ty), ox, oy, factorX, factorY);
        target.tx = tp.x; target.ty = tp.y;
      }
      if (Number.isFinite(Number(base.tdx)) && Number.isFinite(Number(base.tdy))) {
        target.tdx = Number(base.tdx) * factorX;
        target.tdy = Number(base.tdy) * factorY;
      }
      target.groupScaleComp = Math.max(1e-9, (Number(base.groupScaleComp) || 1) * radialFactor);
    } else if (target.type === "dimchain") {
      if (Array.isArray(base.points)) target.points = base.points.map((pt) => scalePointAround(Number(pt?.x), Number(pt?.y), ox, oy, factorX, factorY));
      if (Number.isFinite(Number(base.px)) && Number.isFinite(Number(base.py))) {
        const pp = scalePointAround(Number(base.px), Number(base.py), ox, oy, factorX, factorY);
        target.px = pp.x; target.py = pp.y;
      }
      if (Number.isFinite(Number(base.tx)) && Number.isFinite(Number(base.ty))) {
        const tp = scalePointAround(Number(base.tx), Number(base.ty), ox, oy, factorX, factorY);
        target.tx = tp.x; target.ty = tp.y;
      }
      target.groupScaleComp = Math.max(1e-9, (Number(base.groupScaleComp) || 1) * radialFactor);
    } else if (target.type === "circleDim") {
      if (Number.isFinite(Number(base.tx)) && Number.isFinite(Number(base.ty))) {
        const tp = scalePointAround(Number(base.tx), Number(base.ty), ox, oy, factorX, factorY);
        target.tx = tp.x; target.ty = tp.y;
      }
      if (Number.isFinite(Number(base.tdx)) && Number.isFinite(Number(base.tdy))) {
        target.tdx = Number(base.tdx) * factorX;
        target.tdy = Number(base.tdy) * factorY;
      }
      target.groupScaleComp = Math.max(1e-9, (Number(base.groupScaleComp) || 1) * radialFactor);
    } else if (target.type === "dimangle") {
      if (Number.isFinite(Number(base.cx)) && Number.isFinite(Number(base.cy))) {
        const cp = scalePointAround(Number(base.cx), Number(base.cy), ox, oy, factorX, factorY);
        target.cx = cp.x; target.cy = cp.y;
      }
      if (Number.isFinite(Number(base.r))) target.r = Math.abs(Number(base.r)) * radialFactor;
      if (Number.isFinite(Number(base.tx)) && Number.isFinite(Number(base.ty))) {
        const tp = scalePointAround(Number(base.tx), Number(base.ty), ox, oy, factorX, factorY);
        target.tx = tp.x; target.ty = tp.y;
      }
    } else if (target.type === "text") {
      const p = scalePointAround(base.x1, base.y1, ox, oy, factorX, factorY);
      target.x1 = p.x; target.y1 = p.y;
    } else if (target.type === "image") {
      const p = scalePointAround(Number(base.x), Number(base.y), ox, oy, factorX, factorY);
      target.x = p.x; target.y = p.y;
      target.width = Math.max(1e-6, Number(base.width) * factorX);
      target.height = Math.max(1e-6, Number(base.height) * factorY);
    } else if (target.type === "bspline") {
      if (Array.isArray(base.controlPoints)) {
        target.controlPoints = base.controlPoints.map((cp) => scalePointAround(Number(cp?.x), Number(cp?.y), ox, oy, factorX, factorY));
      }
    }
  }

  function setActiveGroupParent(pid) {
    const movingGroupId = Number(state.activeGroupId);
    const newParentId = (pid == null) ? null : Number(pid);
    if (!Number.isFinite(movingGroupId)) return;
    const moving = getGroup(state, movingGroupId);
    if (!moving) return;
    if (newParentId != null && newParentId === movingGroupId) return;

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
    for (const g of (state.groups || [])) {
      if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
      g.shapeIds = g.shapeIds.map(Number).filter(id => Number.isFinite(id) && id !== shapeId);
    }
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
    const prev = normalizeScaleOptions(g.scaleOptions);
    const allowScale = Object.prototype.hasOwnProperty.call(options, "allowScale")
      ? !!options.allowScale
      : prev.allowScale;
    const keepAspect = allowScale
      ? (Object.prototype.hasOwnProperty.call(options, "keepAspect") ? !!options.keepAspect : prev.keepAspect)
      : false;
    const requestedScaleX = Object.prototype.hasOwnProperty.call(options, "scaleX") ? Number(options.scaleX) : prev.scaleX;
    const requestedScaleY = Object.prototype.hasOwnProperty.call(options, "scaleY") ? Number(options.scaleY) : prev.scaleY;
    const requestedScaleFactor = Object.prototype.hasOwnProperty.call(options, "scaleFactor") ? Number(options.scaleFactor) : prev.scaleFactor;
    let scaleX = Math.max(1e-9, Number.isFinite(requestedScaleX) && requestedScaleX > 0 ? requestedScaleX : prev.scaleX);
    let scaleY = Math.max(1e-9, Number.isFinite(requestedScaleY) && requestedScaleY > 0 ? requestedScaleY : prev.scaleY);
    let scaleFactor = Math.max(1e-9, Number.isFinite(requestedScaleFactor) && requestedScaleFactor > 0 ? requestedScaleFactor : prev.scaleFactor);
    if (keepAspect) {
      const unified = Math.max(1e-9, Number.isFinite(requestedScaleFactor) && requestedScaleFactor > 0
        ? requestedScaleFactor
        : (Number.isFinite(requestedScaleX) && requestedScaleX > 0 ? requestedScaleX : scaleX));
      scaleX = unified;
      scaleY = unified;
      scaleFactor = unified;
    } else {
      scaleFactor = averageScale(scaleX, scaleY);
    }
    if (
      prev.allowScale === allowScale &&
      prev.keepAspect === keepAspect &&
      Math.abs(prev.scaleFactor - scaleFactor) < 1e-9 &&
      Math.abs(prev.scaleX - scaleX) < 1e-9 &&
      Math.abs(prev.scaleY - scaleY) < 1e-9
    ) {
      draw();
      return;
    }
    pushHistory(state);
    g.scaleOptions = { allowScale, keepAspect, scaleFactor, scaleX, scaleY };
    draw();
  }

  function setActiveGroupScaleFactors(targetScaleX, targetScaleY = targetScaleX) {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const scOpt = normalizeScaleOptions(g.scaleOptions);
    if (!scOpt.allowScale) return;
    const currentScaleX = Math.max(1e-9, scOpt.scaleX || scOpt.scaleFactor || 1);
    const currentScaleY = Math.max(1e-9, scOpt.scaleY || scOpt.scaleFactor || 1);
    let nextScaleX = Math.max(1e-9, Number(targetScaleX) || 1);
    let nextScaleY = Math.max(1e-9, Number(targetScaleY) || nextScaleX);
    if (scOpt.keepAspect) nextScaleY = nextScaleX;
    const ratioX = nextScaleX / currentScaleX;
    const ratioY = nextScaleY / currentScaleY;
    if (!Number.isFinite(ratioX) || !Number.isFinite(ratioY) || ratioX <= 0 || ratioY <= 0) {
      draw();
      return;
    }
    if (Math.abs(ratioX - 1) < 1e-9 && Math.abs(ratioY - 1) < 1e-9) {
      draw();
      return;
    }
    const shapeIds = (typeof collectGroupTreeShapeIds === "function")
      ? collectGroupTreeShapeIds(state, gid)
      : (Array.isArray(g.shapeIds) ? g.shapeIds : []);
    const idSet = new Set((shapeIds || []).map(Number).filter(Number.isFinite));
    const ox = Number(g.originX) || 0;
    const oy = Number(g.originY) || 0;
    const baseById = new Map();
    for (const t of (state.shapes || [])) {
      if (!idSet.has(Number(t.id))) continue;
      baseById.set(Number(t.id), JSON.parse(JSON.stringify(t)));
    }
    pushHistory(state);
    for (const t of (state.shapes || [])) {
      if (!idSet.has(Number(t.id))) continue;
      const base = baseById.get(Number(t.id));
      if (!base) continue;
      applyScaleToShape(t, base, ox, oy, ratioX, ratioY);
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
        const p = scalePointAround(Number(cg.originX) || 0, Number(cg.originY) || 0, ox, oy, ratioX, ratioY);
        cg.originX = p.x;
        cg.originY = p.y;
      }
      for (const ccId of (byParent.get(cgId) || [])) queue.push(Number(ccId));
    }
    g.scaleOptions = {
      allowScale: true,
      keepAspect: scOpt.keepAspect,
      scaleFactor: averageScale(nextScaleX, nextScaleY),
      scaleX: nextScaleX,
      scaleY: nextScaleY,
    };
    draw();
  }

  function setActiveGroupScaleFactor(targetScaleFactor) {
    const target = Math.max(1e-9, Number(targetScaleFactor) || 1);
    setActiveGroupScaleFactors(target, target);
  }

  return {
    setActiveGroupParent,
    moveShapeToGroup,
    moveShapesToGroup,
    setActiveGroupScaleOptions,
    setActiveGroupScaleFactor,
    setActiveGroupScaleFactors,
  };
}
