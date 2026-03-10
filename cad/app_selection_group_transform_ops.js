export function createSelectionGroupTransformOps(config) {
  const {
    collectGroupTreeShapeIds,
    collectGroupTreeGroupSnapshots,
    getGroup,
    snapshotModel,
    angleDegFromOrigin,
    getEffectiveGridSize,
    rotatePointAround,
    normalizeRad
  } = config || {};

  function beginGroupOriginDrag(state, group, worldRaw) {
    const pickedGroupId = Number(group.id);
    const selectedGroupIds = Array.isArray(state.selection?.groupIds)
      ? state.selection.groupIds.map(Number).filter(Number.isFinite)
      : [];
    const dragRootGroupIds = (selectedGroupIds.length > 1 && selectedGroupIds.includes(pickedGroupId))
      ? selectedGroupIds
      : [pickedGroupId];
    const dragRootSet = new Set(dragRootGroupIds.map(Number));
    const idSet = new Set();
    const dragGroupSnapshotIds = new Set();
    for (const rootGroupId of dragRootSet) {
      for (const sid of collectGroupTreeShapeIds(state, rootGroupId)) idSet.add(Number(sid));
      for (const gs of collectGroupTreeGroupSnapshots(state, rootGroupId)) dragGroupSnapshotIds.add(Number(gs.id));
    }
    const snaps = [];
    for (const s of state.shapes) {
      if (!idSet.has(Number(s.id))) continue;
      snaps.push({ id: s.id, shape: JSON.parse(JSON.stringify(s)) });
    }
    const groupSnapshots = [];
    for (const gs of (state.groups || [])) {
      const gid = Number(gs.id);
      if (!dragGroupSnapshotIds.has(gid)) continue;
      groupSnapshots.push({
        id: gid,
        originX: Number(gs.originX) || 0,
        originY: Number(gs.originY) || 0,
        rotationDeg: Number(gs.rotationDeg) || 0,
      });
    }
    state.input.groupDrag.active = true;
    state.input.groupDrag.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    state.input.groupDrag.groupId = pickedGroupId;
    state.input.groupDrag.groupIds = Array.from(dragRootSet);
    state.input.groupDrag.groupOrigin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    state.input.groupDrag.anchorGroupId = pickedGroupId;
    state.input.groupDrag.anchorGroupOrigin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    state.input.groupDrag.shapeSnapshots = snaps;
    state.input.groupDrag.groupSnapshots = groupSnapshots;
    state.input.groupDrag.modelSnapshotBeforeMove = snapshotModel(state);
    state.input.groupDrag.moved = false;
  }

  function beginGroupRotateDrag(state, group, worldRaw) {
    const idSet = new Set(collectGroupTreeShapeIds(state, group.id).map(Number));
    const snaps = [];
    for (const s of state.shapes) {
      if (!idSet.has(Number(s.id))) continue;
      snaps.push({ id: s.id, shape: JSON.parse(JSON.stringify(s)) });
    }
    const origin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    state.input.groupRotate.active = true;
    state.input.groupRotate.groupId = Number(group.id);
    state.input.groupRotate.startAngleDeg = Number(group.rotationDeg) || 0;
    state.input.groupRotate.startPointerAngleDeg = angleDegFromOrigin(origin, worldRaw);
    state.input.groupRotate.groupOrigin = origin;
    state.input.groupRotate.shapeSnapshots = snaps;
    state.input.groupRotate.groupSnapshots = collectGroupTreeGroupSnapshots(state, group.id);
    state.input.groupRotate.modelSnapshotBeforeRotate = snapshotModel(state);
    state.input.groupRotate.moved = false;
  }

  function applyGroupOriginDrag(state, worldRaw) {
    const gd = state.input.groupDrag;
    if (!gd.active || !gd.startWorldRaw) return;
    const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    const anchorOrigin = gd.anchorGroupOrigin || gd.groupOrigin || { x: 0, y: 0 };
    const rawDx = worldRaw.x - gd.startWorldRaw.x;
    const rawDy = worldRaw.y - gd.startWorldRaw.y;
    const rawTargetX = anchorOrigin.x + rawDx;
    const rawTargetY = anchorOrigin.y + rawDy;
    const targetX = state.grid.snap ? Math.round(rawTargetX / gridStep) * gridStep : rawTargetX;
    const targetY = state.grid.snap ? Math.round(rawTargetY / gridStep) * gridStep : rawTargetY;
    const dx = targetX - anchorOrigin.x;
    const dy = targetY - anchorOrigin.y;

    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) gd.moved = true;
    const g = getGroup(state, gd.anchorGroupId ?? gd.groupId);
    if (g) {
      g.originX = anchorOrigin.x + dx;
      g.originY = anchorOrigin.y + dy;
    }
    const groupById = new Map((state.groups || []).map((gg) => [Number(gg.id), gg]));
    for (const gs of (gd.groupSnapshots || [])) {
      const tg = groupById.get(Number(gs.id));
      if (!tg) continue;
      tg.originX = (Number(gs.originX) || 0) + dx;
      tg.originY = (Number(gs.originY) || 0) + dy;
    }
    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    for (const it of gd.shapeSnapshots || []) {
      const t = byId.get(Number(it.id));
      if (!t) continue;
      const b = it.shape;
      if (t.type === "line" || t.type === "rect") {
        t.x1 = b.x1 + dx; t.y1 = b.y1 + dy;
        t.x2 = b.x2 + dx; t.y2 = b.y2 + dy;
      } else if (t.type === "polyline") {
        if (Array.isArray(b.points)) {
          t.points = b.points.map((pt) => ({ x: Number(pt?.x) + dx, y: Number(pt?.y) + dy }));
        }
      } else if (t.type === "circle") {
        t.cx = b.cx + dx; t.cy = b.cy + dy;
        t.r = b.r;
      } else if (t.type === "arc") {
        t.cx = b.cx + dx; t.cy = b.cy + dy;
        t.r = b.r; t.a1 = b.a1; t.a2 = b.a2; t.ccw = b.ccw;
      } else if (t.type === "position") {
        t.x = b.x + dx; t.y = b.y + dy; t.size = b.size;
      } else if (t.type === "dim") {
        t.x1 = b.x1 + dx; t.y1 = b.y1 + dy;
        t.x2 = b.x2 + dx; t.y2 = b.y2 + dy;
        t.px = b.px + dx; t.py = b.py + dy;
        if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
          t.tx = Number(b.tx) + dx;
          t.ty = Number(b.ty) + dy;
        }
      } else if (t.type === "dimchain") {
        if (Array.isArray(b.points) && Array.isArray(t.points)) {
          t.points = b.points.map(pt => ({ x: Number(pt.x) + dx, y: Number(pt.y) + dy }));
        }
        if (Number.isFinite(Number(b.px)) && Number.isFinite(Number(b.py))) {
          t.px = Number(b.px) + dx;
          t.py = Number(b.py) + dy;
        }
        if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
          t.tx = Number(b.tx) + dx;
          t.ty = Number(b.ty) + dy;
        }
      } else if (t.type === "circleDim") {
        if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
          t.tx = Number(b.tx) + dx;
          t.ty = Number(b.ty) + dy;
        }
      } else if (t.type === "text") {
        t.x1 = b.x1 + dx; t.y1 = b.y1 + dy;
      } else if (t.type === "bspline") {
        if (Array.isArray(b.controlPoints)) {
          t.controlPoints = b.controlPoints.map((cp) => ({
            x: Number(cp?.x) + dx,
            y: Number(cp?.y) + dy,
          }));
        }
      }
    }
  }

  function applyGroupRotateDrag(state, worldRaw) {
    const gr = state.input.groupRotate;
    if (!gr.active || !gr.groupOrigin) return;
    const g = getGroup(state, gr.groupId);
    if (!g) return;
    const curPointerDeg = angleDegFromOrigin(gr.groupOrigin, worldRaw);
    let delta = curPointerDeg - gr.startPointerAngleDeg;
    const snapDeg = Math.max(0.1, Number(gr.snapDeg) || 5);
    delta = Math.round(delta / snapDeg) * snapDeg;
    if (Math.abs(delta) > 1e-9) gr.moved = true;
    g.rotationDeg = gr.startAngleDeg + delta;
    const ox = gr.groupOrigin.x, oy = gr.groupOrigin.y;
    const groupById = new Map((state.groups || []).map((gg) => [Number(gg.id), gg]));
    const d = (delta * Math.PI) / 180;
    for (const gs of (gr.groupSnapshots || [])) {
      const tg = groupById.get(Number(gs.id));
      if (!tg) continue;
      if (Number(gs.id) !== Number(gr.groupId)) {
        const rp = rotatePointAround(Number(gs.originX) || 0, Number(gs.originY) || 0, ox, oy, delta);
        tg.originX = rp.x;
        tg.originY = rp.y;
      }
      tg.rotationDeg = (Number(gs.rotationDeg) || 0) + delta;
    }
    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    for (const it of gr.shapeSnapshots || []) {
      const t = byId.get(Number(it.id));
      if (!t) continue;
      const b = it.shape;
      if (t.type === "line" || t.type === "rect") {
        const p1 = rotatePointAround(b.x1, b.y1, ox, oy, delta);
        const p2 = rotatePointAround(b.x2, b.y2, ox, oy, delta);
        t.x1 = p1.x; t.y1 = p1.y; t.x2 = p2.x; t.y2 = p2.y;
      } else if (t.type === "polyline") {
        if (Array.isArray(b.points)) {
          t.points = b.points.map((pt) => rotatePointAround(Number(pt?.x), Number(pt?.y), ox, oy, delta));
        }
      } else if (t.type === "circle") {
        const c = rotatePointAround(b.cx, b.cy, ox, oy, delta);
        t.cx = c.x; t.cy = c.y; t.r = b.r;
      } else if (t.type === "arc") {
        const c = rotatePointAround(b.cx, b.cy, ox, oy, delta);
        t.cx = c.x; t.cy = c.y; t.r = b.r;
        t.a1 = normalizeRad((Number(b.a1) || 0) + d);
        t.a2 = normalizeRad((Number(b.a2) || 0) + d);
        t.ccw = (b.ccw !== false);
      } else if (t.type === "position") {
        const p = rotatePointAround(b.x, b.y, ox, oy, delta);
        t.x = p.x; t.y = p.y; t.size = b.size;
      } else if (t.type === "dim") {
        const p1 = rotatePointAround(b.x1, b.y1, ox, oy, delta);
        const p2 = rotatePointAround(b.x2, b.y2, ox, oy, delta);
        const pp = rotatePointAround(b.px, b.py, ox, oy, delta);
        t.x1 = p1.x; t.y1 = p1.y;
        t.x2 = p2.x; t.y2 = p2.y;
        t.px = pp.x; t.py = pp.y;
        if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
          const tp = rotatePointAround(Number(b.tx), Number(b.ty), ox, oy, delta);
          t.tx = tp.x; t.ty = tp.y;
        }
      } else if (t.type === "dimchain") {
        if (Array.isArray(b.points) && Array.isArray(t.points)) {
          t.points = b.points.map(pt => rotatePointAround(Number(pt.x), Number(pt.y), ox, oy, delta));
        }
        if (Number.isFinite(Number(b.px)) && Number.isFinite(Number(b.py))) {
          const pp = rotatePointAround(Number(b.px), Number(b.py), ox, oy, delta);
          t.px = pp.x; t.py = pp.y;
        }
        if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
          const tp = rotatePointAround(Number(b.tx), Number(b.ty), ox, oy, delta);
          t.tx = tp.x; t.ty = tp.y;
        }
      } else if (t.type === "circleDim") {
        t.ang = normalizeRad((Number(b.ang) || 0) + d);
        if (Number.isFinite(Number(b.tdx)) && Number.isFinite(Number(b.tdy))) {
          const c = Math.cos(d), s = Math.sin(d);
          t.tdx = Number(b.tdx) * c - Number(b.tdy) * s;
          t.tdy = Number(b.tdx) * s + Number(b.tdy) * c;
        }
        if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
          const tp = rotatePointAround(Number(b.tx), Number(b.ty), ox, oy, delta);
          t.tx = tp.x; t.ty = tp.y;
        }
      } else if (t.type === "text") {
        const p = rotatePointAround(b.x1, b.y1, ox, oy, delta);
        t.x1 = p.x; t.y1 = p.y;
        t.textRotate = (Number(b.textRotate) || 0) + delta;
      } else if (t.type === "image") {
        const p = rotatePointAround(Number(b.x), Number(b.y), ox, oy, delta);
        t.x = p.x; t.y = p.y;
        t.rotationDeg = (Number(b.rotationDeg) || 0) + delta;
      } else if (t.type === "bspline") {
        if (Array.isArray(b.controlPoints)) {
          t.controlPoints = b.controlPoints.map((cp) => rotatePointAround(Number(cp?.x), Number(cp?.y), ox, oy, delta));
        }
      }
    }
  }

  function endGroupOriginDrag(state) {
    const moved = !!state.input.groupDrag.moved;
    const snap = state.input.groupDrag.modelSnapshotBeforeMove;
    state.input.groupDrag.active = false;
    state.input.groupDrag.startWorldRaw = null;
    state.input.groupDrag.groupId = null;
    state.input.groupDrag.groupIds = null;
    state.input.groupDrag.groupOrigin = null;
    state.input.groupDrag.anchorGroupId = null;
    state.input.groupDrag.anchorGroupOrigin = null;
    state.input.groupDrag.shapeSnapshots = null;
    state.input.groupDrag.groupSnapshots = null;
    state.input.groupDrag.modelSnapshotBeforeMove = null;
    state.input.groupDrag.moved = false;
    return { moved, snapshot: snap };
  }

  function endGroupRotateDrag(state) {
    const moved = !!state.input.groupRotate.moved;
    const snap = state.input.groupRotate.modelSnapshotBeforeRotate;
    state.input.groupRotate.active = false;
    state.input.groupRotate.groupId = null;
    state.input.groupRotate.startAngleDeg = 0;
    state.input.groupRotate.startPointerAngleDeg = 0;
    state.input.groupRotate.groupOrigin = null;
    state.input.groupRotate.shapeSnapshots = null;
    state.input.groupRotate.groupSnapshots = null;
    state.input.groupRotate.modelSnapshotBeforeRotate = null;
    state.input.groupRotate.moved = false;
    return { moved, snapshot: snap };
  }

  function beginGroupOriginPickDrag(state, group, worldRaw) {
    const gp = state.input.groupOriginPick;
    gp.dragging = true;
    gp.groupId = Number(group.id);
    gp.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    gp.startOrigin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    gp.moved = false;
    gp.modelSnapshotBeforeMove = snapshotModel(state);
  }

  function applyGroupOriginPickDrag(state, world) {
    const gp = state.input.groupOriginPick;
    if (!gp.active || !gp.dragging || !gp.startWorldRaw || !gp.startOrigin) return;
    const g = getGroup(state, gp.groupId);
    if (!g) return;
    const targetX = world.x;
    const targetY = world.y;
    if (Math.abs(g.originX - targetX) > 1e-9 || Math.abs(g.originY - targetY) > 1e-9) {
      gp.moved = true;
      g.originX = targetX;
      g.originY = targetY;
    }
  }

  function endGroupOriginPickDrag(state) {
    const gp = state.input.groupOriginPick;
    const moved = !!gp.moved;
    const snap = gp.modelSnapshotBeforeMove;
    gp.active = false;
    gp.dragging = false;
    gp.groupId = null;
    gp.startWorldRaw = null;
    gp.startOrigin = null;
    gp.moved = false;
    gp.modelSnapshotBeforeMove = null;
    return { moved, snapshot: snap };
  }

  return {
    beginGroupOriginDrag,
    beginGroupRotateDrag,
    applyGroupOriginDrag,
    applyGroupRotateDrag,
    endGroupOriginDrag,
    endGroupRotateDrag,
    beginGroupOriginPickDrag,
    applyGroupOriginPickDrag,
    endGroupOriginPickDrag
  };
}
