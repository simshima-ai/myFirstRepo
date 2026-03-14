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
      target.cx = c.x; target.cy = c.y;
      target.r = Math.abs(Number(base.r) || 0) * radialFactor;
      target.a1 = base.a1; target.a2 = base.a2; target.ccw = base.ccw;
    } else if (target.type === "position") {
      const p = scalePointAround(base.x, base.y, ox, oy, factorX, factorY);
      target.x = p.x; target.y = p.y; target.size = Math.max(0.1, Number(base.size) * radialFactor);
    } else if (target.type === "dim") {
      const p1 = scalePointAround(base.x1, base.y1, ox, oy, factorX, factorY);
      const p2 = scalePointAround(base.x2, base.y2, ox, oy, factorX, factorY);
      const pp = scalePointAround(base.px, base.py, ox, oy, factorX, factorY);
      target.x1 = p1.x; target.y1 = p1.y;
      target.x2 = p2.x; target.y2 = p2.y;
      target.px = pp.x; target.py = pp.y;
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
      if (Array.isArray(base.points) && Array.isArray(target.points)) {
        target.points = base.points.map(pt => scalePointAround(Number(pt.x), Number(pt.y), ox, oy, factorX, factorY));
      }
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
    state.input.groupRotate.snapDeg = Math.max(0.1, Number(state.groupRotateSettings?.snapDeg) || 5);
    state.input.groupRotate.moved = false;
  }

  function beginGroupScaleDrag(state, group, worldRaw) {
    const idSet = new Set(collectGroupTreeShapeIds(state, group.id).map(Number));
    const snaps = [];
    for (const s of state.shapes) {
      if (!idSet.has(Number(s.id))) continue;
      snaps.push({ id: s.id, shape: JSON.parse(JSON.stringify(s)) });
    }
    const origin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    const startVectorX = Number(worldRaw.x) - origin.x;
    const startVectorY = Number(worldRaw.y) - origin.y;
    const startDistance = Math.max(1e-9, Math.hypot(startVectorX, startVectorY));
    const scaleOptions = normalizeScaleOptions(group.scaleOptions);
    state.input.groupScale.active = true;
    state.input.groupScale.groupId = Number(group.id);
    state.input.groupScale.startDistance = startDistance;
    state.input.groupScale.startScaleFactor = Math.max(1e-9, Number(scaleOptions.scaleFactor) || 1);
    state.input.groupScale.startScaleX = Math.max(1e-9, Number(scaleOptions.scaleX) || Number(scaleOptions.scaleFactor) || 1);
    state.input.groupScale.startScaleY = Math.max(1e-9, Number(scaleOptions.scaleY) || Number(scaleOptions.scaleFactor) || 1);
    state.input.groupScale.startVectorX = startVectorX;
    state.input.groupScale.startVectorY = startVectorY;
    state.input.groupScale.groupOrigin = origin;
    state.input.groupScale.shapeSnapshots = snaps;
    state.input.groupScale.groupSnapshots = collectGroupTreeGroupSnapshots(state, group.id);
    state.input.groupScale.modelSnapshotBeforeScale = snapshotModel(state);
    state.input.groupScale.moved = false;
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
        t.cx = b.cx + dx; t.cy = b.cy + dy; t.r = b.r;
      } else if (t.type === "arc") {
        t.cx = b.cx + dx; t.cy = b.cy + dy; t.r = b.r; t.a1 = b.a1; t.a2 = b.a2; t.ccw = b.ccw;
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

  function applyGroupScaleDrag(state, worldRaw) {
    const gs = state.input.groupScale;
    if (!gs.active || !gs.groupOrigin) return;
    const g = getGroup(state, gs.groupId);
    if (!g) return;
    const scOpt = normalizeScaleOptions(g.scaleOptions);
    if (!scOpt.allowScale) return;
    const ox = gs.groupOrigin.x;
    const oy = gs.groupOrigin.y;
    let nextScaleX = Math.max(1e-9, Number(gs.startScaleX || 1));
    let nextScaleY = Math.max(1e-9, Number(gs.startScaleY || 1));
    if (scOpt.keepAspect) {
      const curDist = Math.max(1e-9, Math.hypot(Number(worldRaw.x) - ox, Number(worldRaw.y) - oy));
      const dragFactor = Math.max(0.02, Math.min(100, curDist / Math.max(1e-9, Number(gs.startDistance) || 1)));
      nextScaleX = Math.max(1e-9, Number(gs.startScaleX || 1) * dragFactor);
      nextScaleY = Math.max(1e-9, Number(gs.startScaleY || 1) * dragFactor);
    } else {
      const startVectorX = Number(gs.startVectorX);
      const startVectorY = Number(gs.startVectorY);
      const currentVectorX = Number(worldRaw.x) - ox;
      const currentVectorY = Number(worldRaw.y) - oy;
      const ratioX = Math.abs(startVectorX) > 1e-9
        ? Math.max(0.02, Math.min(100, Math.abs(currentVectorX) / Math.abs(startVectorX)))
        : 1;
      const ratioY = Math.abs(startVectorY) > 1e-9
        ? Math.max(0.02, Math.min(100, Math.abs(currentVectorY) / Math.abs(startVectorY)))
        : 1;
      nextScaleX = Math.max(1e-9, Number(gs.startScaleX || 1) * ratioX);
      nextScaleY = Math.max(1e-9, Number(gs.startScaleY || 1) * ratioY);
    }
    const factorX = nextScaleX / Math.max(1e-9, Number(gs.startScaleX || 1));
    const factorY = nextScaleY / Math.max(1e-9, Number(gs.startScaleY || 1));
    if (
      Math.abs(nextScaleX - Number(scOpt.scaleX || scOpt.scaleFactor || 1)) > 1e-9 ||
      Math.abs(nextScaleY - Number(scOpt.scaleY || scOpt.scaleFactor || 1)) > 1e-9
    ) {
      gs.moved = true;
    }
    g.scaleOptions = {
      allowScale: true,
      keepAspect: scOpt.keepAspect,
      scaleFactor: averageScale(nextScaleX, nextScaleY),
      scaleX: nextScaleX,
      scaleY: nextScaleY,
    };

    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    for (const it of gs.shapeSnapshots || []) {
      const t = byId.get(Number(it.id));
      if (!t) continue;
      applyScaleToShape(t, it.shape, ox, oy, factorX, factorY);
    }
    const groupById = new Map((state.groups || []).map((gg) => [Number(gg.id), gg]));
    for (const snapshot of (gs.groupSnapshots || [])) {
      const target = groupById.get(Number(snapshot.id));
      if (!target || Number(snapshot.id) === Number(g.id)) continue;
      const p = scalePointAround(Number(snapshot.originX) || 0, Number(snapshot.originY) || 0, ox, oy, factorX, factorY);
      target.originX = p.x;
      target.originY = p.y;
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

  function endGroupScaleDrag(state) {
    const moved = !!state.input.groupScale.moved;
    const snap = state.input.groupScale.modelSnapshotBeforeScale;
    state.input.groupScale.active = false;
    state.input.groupScale.groupId = null;
    state.input.groupScale.startDistance = 0;
    state.input.groupScale.startScaleFactor = 1;
    state.input.groupScale.startScaleX = 1;
    state.input.groupScale.startScaleY = 1;
    state.input.groupScale.startVectorX = 0;
    state.input.groupScale.startVectorY = 0;
    state.input.groupScale.groupOrigin = null;
    state.input.groupScale.shapeSnapshots = null;
    state.input.groupScale.groupSnapshots = null;
    state.input.groupScale.modelSnapshotBeforeScale = null;
    state.input.groupScale.moved = false;
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
    beginGroupScaleDrag,
    applyGroupOriginDrag,
    applyGroupRotateDrag,
    applyGroupScaleDrag,
    endGroupOriginDrag,
    endGroupRotateDrag,
    endGroupScaleDrag,
    beginGroupOriginPickDrag,
    applyGroupOriginPickDrag,
    endGroupOriginPickDrag
  };
}
