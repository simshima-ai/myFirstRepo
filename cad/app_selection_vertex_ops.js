export function createSelectionVertexOps(config) {
  const {
    setSelection,
    snapshotModel,
    pushHistory,
    isLayerVisible,
    segmentIntersectionPoint,
    isAngleOnArc,
    getObjectSnapPoint,
    solveTangentSnapPoints,
    getEffectiveGridSize,
    snapPoint,
    sampleBSplinePoints,
    findConnectedLinesChain
  } = config || {};

  function getVertexTargetSet(state) {
    const ids = Array.isArray(state?.vertexEdit?.targetShapeIds)
      ? state.vertexEdit.targetShapeIds.map(Number).filter(Number.isFinite)
      : [];
    return new Set(ids);
  }

  function getVertexAtKey(shape, key) {
    if (!shape) return null;
    if (key === "p1" && (shape.type === "line" || shape.type === "rect")) return { x: shape.x1, y: shape.y1 };
    if (key === "p2" && (shape.type === "line" || shape.type === "rect")) return { x: shape.x2, y: shape.y2 };
    if (shape.type === "polyline") {
      const m = /^v(\d+)$/.exec(String(key || ""));
      if (!m) return null;
      const idx = Number(m[1]);
      const pt = Array.isArray(shape.points) ? shape.points[idx] : null;
      if (!pt) return null;
      const x = Number(pt.x), y = Number(pt.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    }
    if (shape.type === "bspline") {
      const m = /^cp(\d+)$/.exec(String(key || ""));
      if (!m) return null;
      const idx = Number(m[1]);
      const cp = Array.isArray(shape.controlPoints) ? shape.controlPoints[idx] : null;
      if (!cp) return null;
      const x = Number(cp.x), y = Number(cp.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    }
    if (shape.type === "arc" && key === "a1") {
      const cx = Number(shape.cx), cy = Number(shape.cy), r = Number(shape.r), a1 = Number(shape.a1);
      if (![cx, cy, r, a1].every(Number.isFinite)) return null;
      return { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    }
    if (shape.type === "arc" && key === "a2") {
      const cx = Number(shape.cx), cy = Number(shape.cy), r = Number(shape.r), a2 = Number(shape.a2);
      if (![cx, cy, r, a2].every(Number.isFinite)) return null;
      return { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
    }
    return null;
  }

  function setVertexAtKey(shape, key, p) {
    if (!shape || !p) return false;
    if (key === "p1" && (shape.type === "line" || shape.type === "rect")) {
      shape.x1 = p.x; shape.y1 = p.y; return true;
    }
    if (key === "p2" && (shape.type === "line" || shape.type === "rect")) {
      shape.x2 = p.x; shape.y2 = p.y; return true;
    }
    if (shape.type === "polyline") {
      const m = /^v(\d+)$/.exec(String(key || ""));
      if (!m) return false;
      const idx = Number(m[1]);
      if (!Array.isArray(shape.points) || !shape.points[idx]) return false;
      shape.points[idx].x = Number(p.x);
      shape.points[idx].y = Number(p.y);
      return Number.isFinite(shape.points[idx].x) && Number.isFinite(shape.points[idx].y);
    }
    if (shape.type === "arc" && (key === "a1" || key === "a2")) {
      const cx = Number(shape.cx), cy = Number(shape.cy);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
      const ang = Math.atan2(Number(p.y) - cy, Number(p.x) - cx);
      if (key === "a1") shape.a1 = ang;
      else shape.a2 = ang;
      return true;
    }
    if (shape.type === "bspline") {
      const m = /^cp(\d+)$/.exec(String(key || ""));
      if (!m) return false;
      const idx = Number(m[1]);
      if (!Array.isArray(shape.controlPoints) || !shape.controlPoints[idx]) return false;
      shape.controlPoints[idx].x = Number(p.x);
      shape.controlPoints[idx].y = Number(p.y);
      return Number.isFinite(shape.controlPoints[idx].x) && Number.isFinite(shape.controlPoints[idx].y);
    }
    return false;
  }

  function hitTestVertexHandle(state, world) {
    const tol = 10 / Math.max(1e-9, state.view.scale);
    const filterShapeId = state.vertexEdit?.filterShapeId != null ? Number(state.vertexEdit.filterShapeId) : null;
    const targetSet = getVertexTargetSet(state);
    if (!targetSet.size) return null;
    const visibleLayerSet = new Set((state.layers || []).filter(l => l?.visible !== false).map(l => Number(l.id)).filter(Number.isFinite));
    const isLayerVisibleFast = (layerId) => (visibleLayerSet.size ? visibleLayerSet.has(Number(layerId)) : true);
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      const s = state.shapes[i];
      if (!targetSet.has(Number(s.id))) continue;
      if (!isLayerVisibleFast(s.layerId)) continue;
      if (!(s.type === "line" || s.type === "rect" || s.type === "arc" || s.type === "bspline" || s.type === "polyline")) continue;
      if (filterShapeId !== null && Number(s.id) !== filterShapeId) continue;
      if (s.type === "line" || s.type === "rect") {
        const p1d = Math.hypot(world.x - s.x1, world.y - s.y1);
        if (p1d <= tol) return { shapeId: s.id, key: "p1" };
        const p2d = Math.hypot(world.x - s.x2, world.y - s.y2);
        if (p2d <= tol) return { shapeId: s.id, key: "p2" };
      } else if (s.type === "arc") {
        const pA1 = getVertexAtKey(s, "a1");
        const pA2 = getVertexAtKey(s, "a2");
        if (pA1 && Math.hypot(world.x - pA1.x, world.y - pA1.y) <= tol) return { shapeId: s.id, key: "a1" };
        if (pA2 && Math.hypot(world.x - pA2.x, world.y - pA2.y) <= tol) return { shapeId: s.id, key: "a2" };
      } else if (s.type === "bspline" && Array.isArray(s.controlPoints)) {
        for (let ci = 0; ci < s.controlPoints.length; ci++) {
          const cp = s.controlPoints[ci];
          const x = Number(cp?.x), y = Number(cp?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (Math.hypot(world.x - x, world.y - y) <= tol) return { shapeId: s.id, key: `cp${ci}` };
        }
      } else if (s.type === "polyline" && Array.isArray(s.points)) {
        for (let vi = 0; vi < s.points.length; vi++) {
          const p = s.points[vi];
          const x = Number(p?.x), y = Number(p?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (Math.hypot(world.x - x, world.y - y) <= tol) return { shapeId: s.id, key: `v${vi}` };
        }
      }
    }
    return null;
  }

  function vertexKeyOf(v) { return `${Number(v.shapeId)}:${v.key}`; }

  function isVertexEditableType(shape) {
    const t = String(shape?.type || "");
    return t === "line" || t === "rect" || t === "arc" || t === "bspline" || t === "polyline";
  }

  function getEditableVertexKeys(shape) {
    if (!shape || !isVertexEditableType(shape)) return [];
    if (shape.type === "arc") return ["a1", "a2"];
    if (shape.type === "bspline") return Array.isArray(shape.controlPoints) ? shape.controlPoints.map((_, i) => `cp${i}`) : [];
    if (shape.type === "polyline") return Array.isArray(shape.points) ? shape.points.map((_, i) => `v${i}`) : [];
    return ["p1", "p2"];
  }

  function getCoincidentVertexGroup(state, hit) {
    if (state.vertexEdit?.linkCoincident === false) return [{ shapeId: Number(hit.shapeId), key: hit.key }];
    const baseShape = state.shapes.find(s => Number(s.id) === Number(hit.shapeId));
    const base = getVertexAtKey(baseShape, hit.key);
    if (!base) return [{ shapeId: Number(hit.shapeId), key: hit.key }];
    const eps = 1e-9;
    const out = [];
    for (const s of state.shapes) {
      if (!s || !isLayerVisible(state, s.layerId)) continue;
      if (!isVertexEditableType(s)) continue;
      for (const k of getEditableVertexKeys(s)) {
        const p = getVertexAtKey(s, k);
        if (!p) continue;
        if (Math.hypot(Number(p.x) - base.x, Number(p.y) - base.y) <= eps) out.push({ shapeId: Number(s.id), key: k });
      }
    }
    if (!out.length) out.push({ shapeId: Number(hit.shapeId), key: hit.key });
    return out;
  }

  function hasSelectedVertex(state, hit) {
    const group = getCoincidentVertexGroup(state, hit);
    const set = new Set((state.vertexEdit.selectedVertices || []).map(vertexKeyOf));
    return group.some(v => set.has(vertexKeyOf(v)));
  }

  function toggleVertexSelection(state, hit) {
    const arr = Array.isArray(state.vertexEdit.selectedVertices) ? state.vertexEdit.selectedVertices.slice() : [];
    const group = getCoincidentVertexGroup(state, hit);
    const keySet = new Set(arr.map(vertexKeyOf));
    const groupKeys = group.map(vertexKeyOf);
    const anySelected = groupKeys.some(k => keySet.has(k));
    if (anySelected) {
      const remove = new Set(groupKeys);
      state.vertexEdit.selectedVertices = arr.filter(v => !remove.has(vertexKeyOf(v)));
    } else {
      for (const v of group) if (!keySet.has(vertexKeyOf(v))) arr.push(v);
      state.vertexEdit.selectedVertices = arr;
    }
    const fin = state.vertexEdit.selectedVertices || [];
    state.vertexEdit.activeVertex = fin.length ? { shapeId: Number(hit.shapeId), key: hit.key } : null;
  }

  function setSingleVertexSelection(state, hit) {
    state.vertexEdit.selectedVertices = getCoincidentVertexGroup(state, hit);
    state.vertexEdit.activeVertex = { shapeId: Number(hit.shapeId), key: hit.key };
  }

  function clearVertexSelection(state) {
    state.vertexEdit.selectedVertices = [];
    state.vertexEdit.activeVertex = null;
  }

  function beginVertexSelectionBox(state, screen, additive) {
    state.selection.box.active = true;
    state.selection.box.additive = !!additive;
    state.selection.box.startScreen = { x: screen.x, y: screen.y };
    state.selection.box.currentScreen = { x: screen.x, y: screen.y };
  }

  function endVertexSelectionBox(state, helpers) {
    const { setStatus } = helpers;
    const box = state.selection.box;
    if (!box.active || !box.startScreen || !box.currentScreen) {
      state.selection.box.active = false;
      state.selection.box.startScreen = null;
      state.selection.box.currentScreen = null;
      return false;
    }
    const xMin = Math.min(box.startScreen.x, box.currentScreen.x);
    const xMax = Math.max(box.startScreen.x, box.currentScreen.x);
    const yMin = Math.min(box.startScreen.y, box.currentScreen.y);
    const yMax = Math.max(box.startScreen.y, box.currentScreen.y);
    // Slightly relax hit area so near-overlap drags still pick vertices.
    const pickPadPx = 8;
    const xMinPick = xMin - pickPadPx;
    const xMaxPick = xMax + pickPadPx;
    const yMinPick = yMin - pickPadPx;
    const yMaxPick = yMax + pickPadPx;
    const pointInPickRect = (x, y) => (x >= xMinPick && x <= xMaxPick && y >= yMinPick && y <= yMaxPick);
    const segIntersectsPickRect = (x1, y1, x2, y2) => {
      if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) return false;
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
      if (maxX < xMinPick || minX > xMaxPick || maxY < yMinPick || minY > yMaxPick) return false;
      if (pointInPickRect(x1, y1) || pointInPickRect(x2, y2)) return true;
      const orient = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const onSeg = (ax, ay, bx, by, cx, cy) =>
        Math.min(ax, bx) - 1e-9 <= cx && cx <= Math.max(ax, bx) + 1e-9
        && Math.min(ay, by) - 1e-9 <= cy && cy <= Math.max(ay, by) + 1e-9;
      const segHit = (ax, ay, bx, by, cx, cy, dx, dy) => {
        const o1 = orient(ax, ay, bx, by, cx, cy);
        const o2 = orient(ax, ay, bx, by, dx, dy);
        const o3 = orient(cx, cy, dx, dy, ax, ay);
        const o4 = orient(cx, cy, dx, dy, bx, by);
        if (Math.abs(o1) <= 1e-9 && onSeg(ax, ay, bx, by, cx, cy)) return true;
        if (Math.abs(o2) <= 1e-9 && onSeg(ax, ay, bx, by, dx, dy)) return true;
        if (Math.abs(o3) <= 1e-9 && onSeg(cx, cy, dx, dy, ax, ay)) return true;
        if (Math.abs(o4) <= 1e-9 && onSeg(cx, cy, dx, dy, bx, by)) return true;
        return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
      };
      return (
        segHit(x1, y1, x2, y2, xMinPick, yMinPick, xMaxPick, yMinPick) ||
        segHit(x1, y1, x2, y2, xMaxPick, yMinPick, xMaxPick, yMaxPick) ||
        segHit(x1, y1, x2, y2, xMaxPick, yMaxPick, xMinPick, yMaxPick) ||
        segHit(x1, y1, x2, y2, xMinPick, yMaxPick, xMinPick, yMinPick)
      );
    };
    const dragged = ((xMax - xMin) > 4 || (yMax - yMin) > 4);
    if (dragged) {
      const targetSet = getVertexTargetSet(state);
      const hasExplicitTarget = targetSet.size > 0;
      const picked = [];
      for (const s of state.shapes) {
        if (hasExplicitTarget && !targetSet.has(Number(s.id))) continue;
        if (!isLayerVisible(state, s.layerId)) continue;
        if (!(s.type === "line" || s.type === "rect" || s.type === "arc" || s.type === "bspline" || s.type === "polyline")) continue;
        const pts = (s.type === "arc")
          ? [
            (() => { const p = getVertexAtKey(s, "a1"); return p ? { shapeId: Number(s.id), key: "a1", x: p.x, y: p.y } : null; })(),
            (() => { const p = getVertexAtKey(s, "a2"); return p ? { shapeId: Number(s.id), key: "a2", x: p.x, y: p.y } : null; })(),
          ].filter(Boolean)
          : (s.type === "bspline"
            ? (Array.isArray(s.controlPoints)
              ? s.controlPoints.map((cp, idx) => {
                const x = Number(cp?.x), y = Number(cp?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                return { shapeId: Number(s.id), key: `cp${idx}`, x, y };
              }).filter(Boolean)
              : [])
            : (s.type === "polyline"
              ? (Array.isArray(s.points)
                ? s.points.map((p, idx) => {
                  const x = Number(p?.x), y = Number(p?.y);
                  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                  return { shapeId: Number(s.id), key: `v${idx}`, x, y };
                }).filter(Boolean)
                : [])
            : [
              { shapeId: Number(s.id), key: "p1", x: s.x1, y: s.y1 },
              { shapeId: Number(s.id), key: "p2", x: s.x2, y: s.y2 },
            ]));
        for (const p of pts) {
          const sx = p.x * state.view.scale + state.view.offsetX;
          const sy = p.y * state.view.scale + state.view.offsetY;
          if (sx >= xMinPick && sx <= xMaxPick && sy >= yMinPick && sy <= yMaxPick) {
            for (const cv of getCoincidentVertexGroup(state, { shapeId: p.shapeId, key: p.key })) picked.push(cv);
          }
        }
      }
      const pickedUnique = Array.from(new Map(picked.map(v => [vertexKeyOf(v), v])).values());
      const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
      const expandByConnectedLineChain = (ids) => {
        const out = new Set((ids || []).map(Number).filter(Number.isFinite));
        const seedLines = Array.from(out).filter((sid) => {
          const s = shapeById.get(Number(sid));
          return !!s && s.type === "line";
        });
        for (const sid of seedLines) {
          const chain = (typeof findConnectedLinesChain === "function")
            ? findConnectedLinesChain(state, Number(sid))
            : [Number(sid)];
          for (const cid of (chain || [])) {
            const n = Number(cid);
            if (!Number.isFinite(n)) continue;
            const s = shapeById.get(n);
            if (!s) continue;
            if (s.type === "line" || s.type === "rect" || s.type === "arc" || s.type === "polyline" || s.type === "bspline") {
              out.add(n);
            }
          }
        }
        return Array.from(out);
      };
      const overlappedLineIds = [];
      if (!hasExplicitTarget) {
        for (const s of state.shapes || []) {
          if (!s || s.type !== "line") continue;
          if (!isLayerVisible(state, s.layerId)) continue;
          const x1 = Number(s.x1) * state.view.scale + state.view.offsetX;
          const y1 = Number(s.y1) * state.view.scale + state.view.offsetY;
          const x2 = Number(s.x2) * state.view.scale + state.view.offsetX;
          const y2 = Number(s.y2) * state.view.scale + state.view.offsetY;
          if (segIntersectsPickRect(x1, y1, x2, y2)) overlappedLineIds.push(Number(s.id));
        }
      }
      if (!hasExplicitTarget && pickedUnique.length > 0) {
        const baseTargetIds = Array.from(new Set([
          ...pickedUnique.map(v => Number(v.shapeId)).filter(Number.isFinite),
          ...overlappedLineIds
        ]));
        const targetIds = expandByConnectedLineChain(baseTargetIds);
        state.vertexEdit.targetShapeIds = targetIds;
        state.vertexEdit.filterShapeId = null;
        state.activeGroupId = null;
        setSelection(state, targetIds);
      } else if (!hasExplicitTarget && overlappedLineIds.length > 0) {
        const targetIds = expandByConnectedLineChain(overlappedLineIds);
        state.vertexEdit.targetShapeIds = targetIds;
        state.vertexEdit.filterShapeId = null;
        state.activeGroupId = null;
        setSelection(state, targetIds);
      } else if (hasExplicitTarget && pickedUnique.length > 0) {
        const merged = Array.from(new Set([...(state.vertexEdit.targetShapeIds || []).map(Number), ...pickedUnique.map(v => Number(v.shapeId))]));
        const targetIds = expandByConnectedLineChain(merged);
        state.vertexEdit.targetShapeIds = targetIds;
        setSelection(state, targetIds);
      }
      if (box.additive) {
        const cur = new Map((state.vertexEdit.selectedVertices || []).map(v => [vertexKeyOf(v), v]));
        for (const v of pickedUnique) {
          const k = vertexKeyOf(v);
          if (cur.has(k)) cur.delete(k); else cur.set(k, v);
        }
        state.vertexEdit.selectedVertices = Array.from(cur.values());
      } else {
        state.vertexEdit.selectedVertices = pickedUnique;
      }
      state.vertexEdit.activeVertex = state.vertexEdit.selectedVertices.length
        ? state.vertexEdit.selectedVertices[state.vertexEdit.selectedVertices.length - 1]
        : null;
      if (setStatus) {
        if (state.vertexEdit.selectedVertices.length) setStatus(`Vertex box selected ${state.vertexEdit.selectedVertices.length}`);
        else if ((state.vertexEdit.targetShapeIds || []).length > 0) setStatus("Vertex target selected");
        else setStatus("No vertex");
      }
    } else if (!box.additive) {
      state.vertexEdit.selectedVertices = [];
      state.vertexEdit.activeVertex = null;
      state.vertexEdit.targetShapeIds = [];
      state.vertexEdit.filterShapeId = null;
      state.vertexEdit.insertCandidate = null;
      state.activeGroupId = null;
      setSelection(state, []);
    }
    state.selection.box.active = false;
    state.selection.box.additive = false;
    state.selection.box.startScreen = null;
    state.selection.box.currentScreen = null;
    return dragged;
  }

  function beginVertexDrag(state, hit, worldRaw, helpers, additive = false) {
    const { cloneShapeForDrag } = helpers;
    const shape = state.shapes.find(s => Number(s.id) === Number(hit.shapeId));
    if (!shape) return false;
    if (additive) toggleVertexSelection(state, hit);
    else {
      if (!hasSelectedVertex(state, hit)) setSingleVertexSelection(state, hit);
      else state.vertexEdit.activeVertex = { shapeId: Number(hit.shapeId), key: hit.key };
    }
    const selected = (state.vertexEdit.selectedVertices || []);
    if (!selected.length) return false;
    const keySet = new Set(selected.map(vertexKeyOf));
    const shapeIdSet = new Set(selected.map(v => Number(v.shapeId)));
    state.vertexEdit.targetShapeIds = Array.from(new Set([
      ...((state.vertexEdit.targetShapeIds || []).map(Number).filter(Number.isFinite)),
      ...Array.from(shapeIdSet)
    ]));
    const baseSnaps = [];
    for (const s of state.shapes) if (shapeIdSet.has(Number(s.id))) baseSnaps.push({ id: Number(s.id), shape: cloneShapeForDrag(s) });
    state.vertexEdit.drag.active = true;
    state.vertexEdit.drag.anchorShapeId = Number(hit.shapeId);
    state.vertexEdit.drag.anchorKey = hit.key;
    state.vertexEdit.drag.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    state.vertexEdit.drag.selectedVertexKeys = Array.from(keySet);
    state.vertexEdit.drag.baseShapeSnapshots = baseSnaps;
    state.vertexEdit.drag.modelSnapshotBeforeMove = snapshotModel(state);
    state.vertexEdit.drag.moved = false;
    state.vertexEdit.drag.lastTangentSnap = null;
    state.vertexEdit.drag.lastIntersectionSnap = null;
    state.vertexEdit.drag.lastObjectSnap = null;
    setSelection(state, Array.from(new Set(selected.map(v => Number(v.shapeId)))));
    return true;
  }

  function applyVertexDrag(state, worldRaw) {
    const vd = state.vertexEdit.drag;
    if (!vd.active || !vd.baseShapeSnapshots || !vd.startWorldRaw) return;
    const baseMap = new Map((vd.baseShapeSnapshots || []).map(it => [Number(it.id), it.shape]));
    const anchorBaseShape = baseMap.get(Number(vd.anchorShapeId));
    if (!anchorBaseShape) return;
    const baseV = getVertexAtKey(anchorBaseShape, vd.anchorKey);
    if (!baseV) return;
    const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    const draggingShapeIds = new Set((vd.baseShapeSnapshots || []).map(it => Number(it.id)));
    const anchorShapeIdNum = Number(vd.anchorShapeId);
    const anchorShapeNow = (state.shapes || []).find((s) => Number(s.id) === anchorShapeIdNum) || null;
    const allowSelfSnapBspline = !!(anchorShapeNow && String(anchorShapeNow.type || "") === "bspline");
    const excludeForObjectSnap = allowSelfSnapBspline
      ? new Set(Array.from(draggingShapeIds).filter((id) => Number(id) !== anchorShapeIdNum))
      : draggingShapeIds;
    let objectSnap = getObjectSnapPoint(state, worldRaw, null, excludeForObjectSnap);
    // In B-spline self-snap mode, ignore snaps to currently moved control points.
    if (allowSelfSnapBspline && objectSnap && Number(objectSnap.shapeId) === anchorShapeIdNum && String(objectSnap.refType || "") === "bspline_control") {
      const selectedOnAnchor = (vd.selectedVertexKeys || [])
        .map((k) => String(k || ""))
        .filter((k) => k.startsWith(`${anchorShapeIdNum}:cp`))
        .map((k) => k.split(":")[1]);
      if (selectedOnAnchor.includes(String(objectSnap.refKey || ""))) {
        const selectedIdxSet = new Set(
          selectedOnAnchor
            .map((k) => {
              const m = /^cp(\d+)$/.exec(k);
              return m ? Number(m[1]) : NaN;
            })
            .filter(Number.isFinite)
        );
        const cps = Array.isArray(anchorShapeNow?.controlPoints) ? anchorShapeNow.controlPoints : [];
        const filteredCps = cps.filter((_, i) => !selectedIdxSet.has(Number(i)));
        const tempShapes = (state.shapes || []).map((s) => {
          if (Number(s.id) !== anchorShapeIdNum) return s;
          return {
            ...s,
            controlPoints: filteredCps,
            degree: Math.max(1, Math.min(Number(s.degree) || 3, Math.max(1, filteredCps.length - 1))),
          };
        });
        const tempState = { ...state, shapes: tempShapes };
        objectSnap = getObjectSnapPoint(tempState, worldRaw, null, excludeForObjectSnap);
      }
    }

    state.input.objectSnapHover = objectSnap;
    vd.lastObjectSnap = objectSnap ? { ...objectSnap } : null;

    let target = objectSnap ? { x: objectSnap.x, y: objectSnap.y } : (state.grid.snap ? snapPoint(worldRaw, gridStep) : worldRaw);
    let tangentSnapResult = null;
    let intersectionSnapResult = null;
    if (objectSnap && objectSnap.kind === "intersection") {
      const lineAId = Number(objectSnap.lineAId);
      const lineBId = Number(objectSnap.lineBId);
      if (Number.isFinite(lineAId) && Number.isFinite(lineBId)) intersectionSnapResult = { x: Number(objectSnap.x), y: Number(objectSnap.y), lineAId, lineBId };
    }
    if (state.objectSnap?.tangent && anchorBaseShape.type === "line") {
      const fixedKey = vd.anchorKey === "p1" ? "p2" : "p1";
      const fixedPt = getVertexAtKey(anchorBaseShape, fixedKey);
      if (fixedPt) {
        const tol = 12 / Math.max(1e-9, state.view.scale);
        let bestD = Infinity;
        let bestPt = null;
        let bestCircleId = null;
        for (const s of state.shapes) {
          if (!s || !isLayerVisible(state, s.layerId)) continue;
          if (s.type !== "circle" && s.type !== "arc") continue;
          const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
          if (r <= 1e-9) continue;
          const pts = solveTangentSnapPoints(fixedPt, cx, cy, r);
          for (const pt of pts) {
            if (s.type === "arc") {
              const th = Math.atan2(pt.y - cy, pt.x - cx);
              if (!isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) continue;
            }
            const d = Math.hypot(worldRaw.x - pt.x, worldRaw.y - pt.y);
            if (d <= tol && d < bestD) {
              bestD = d;
              bestPt = pt;
              bestCircleId = Number(s.id);
            }
          }
        }
        if (bestPt) {
          target = bestPt;
          tangentSnapResult = { x: bestPt.x, y: bestPt.y, circleId: bestCircleId };
          state.input.objectSnapHover = { x: bestPt.x, y: bestPt.y, kind: "tangent" };
          vd.lastObjectSnap = { x: bestPt.x, y: bestPt.y, kind: "tangent", circleId: bestCircleId };
        }
      }
    }
    vd.lastTangentSnap = tangentSnapResult;
    vd.lastIntersectionSnap = tangentSnapResult ? null : intersectionSnapResult;

    if (!tangentSnapResult && state.objectSnap?.vector && anchorBaseShape.type === "line") {
      const fixedKey = vd.anchorKey === "p1" ? "p2" : "p1";
      const fixedPt = getVertexAtKey(anchorBaseShape, fixedKey);
      if (fixedPt) {
        const dirX = baseV.x - fixedPt.x;
        const dirY = baseV.y - fixedPt.y;
        const lenSq = dirX * dirX + dirY * dirY;
        if (lenSq > 1e-18) {
          let axisIntersectionSnap = null;
          if (state.objectSnap?.enabled !== false) {
            const tol = 12 / Math.max(1e-9, state.view.scale);
            let bestD = Infinity;
            for (const s of state.shapes) {
              if (!s || !isLayerVisible(state, s.layerId)) continue;
              if (draggingShapeIds.has(Number(s.id))) continue;
              for (const ip of getVectorAxisIntersections(fixedPt, dirX, dirY, s)) {
                const d = Math.hypot(worldRaw.x - ip.x, worldRaw.y - ip.y);
                if (d <= tol && d < bestD) {
                  bestD = d;
                  axisIntersectionSnap = ip;
                }
              }
            }
          }
          if (axisIntersectionSnap) target = axisIntersectionSnap;
          else {
            const t = ((target.x - fixedPt.x) * dirX + (target.y - fixedPt.y) * dirY) / lenSq;
            target = { x: fixedPt.x + t * dirX, y: fixedPt.y + t * dirY };
          }
        }
      }
    }

    const dx = target.x - baseV.x;
    const dy = target.y - baseV.y;
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) vd.moved = true;
    const byId = new Map(state.shapes.map(s => [Number(s.id), s]));
    for (const key of (vd.selectedVertexKeys || [])) {
      const [shapeIdStr, vkey] = String(key).split(":");
      const sid = Number(shapeIdStr);
      const curShape = byId.get(sid);
      const baseShape = baseMap.get(sid);
      if (!curShape || !baseShape) continue;
      const pBase = getVertexAtKey(baseShape, vkey);
      if (!pBase) continue;
      setVertexAtKey(curShape, vkey, { x: pBase.x + dx, y: pBase.y + dy });
    }
  }

  function endVertexDrag(state) {
    const vd = state.vertexEdit.drag;
    const moved = !!vd.moved;
    const snapshot = vd.modelSnapshotBeforeMove;
    const anchorShapeId = vd.anchorShapeId;
    const anchorKey = vd.anchorKey;
    const lastTangentSnap = vd.lastTangentSnap || null;
    const lastIntersectionSnap = vd.lastIntersectionSnap || null;
    const lastObjectSnap = vd.lastObjectSnap || null;
    vd.active = false;
    vd.anchorShapeId = null;
    vd.anchorKey = null;
    vd.startWorldRaw = null;
    vd.selectedVertexKeys = null;
    vd.baseShapeSnapshots = null;
    vd.modelSnapshotBeforeMove = null;
    vd.moved = false;
    vd.lastTangentSnap = null;
    vd.lastIntersectionSnap = null;
    vd.lastObjectSnap = null;
    return { moved, snapshot, anchorShapeId, anchorKey, lastTangentSnap, lastIntersectionSnap, lastObjectSnap };
  }

  function getVectorAxisIntersections(fixedPt, dirX, dirY, shape) {
    const result = [];
    const fx = fixedPt.x, fy = fixedPt.y;
    const tryLineSeg = (ax, ay, bx, by) => {
      const d2x = bx - ax, d2y = by - ay;
      const cross = dirX * d2y - dirY * d2x;
      if (Math.abs(cross) < 1e-12) return;
      const t2 = ((ax - fx) * dirY - (ay - fy) * dirX) / cross;
      if (t2 < -1e-7 || t2 > 1 + 1e-7) return;
      const t1 = ((ax - fx) * d2y - (ay - fy) * d2x) / cross;
      result.push({ x: fx + t1 * dirX, y: fy + t1 * dirY });
    };
    if (shape.type === "line") {
      tryLineSeg(Number(shape.x1), Number(shape.y1), Number(shape.x2), Number(shape.y2));
    } else if (shape.type === "rect") {
      const x1 = Number(shape.x1), y1 = Number(shape.y1);
      const x2 = Number(shape.x2), y2 = Number(shape.y2);
      tryLineSeg(x1, y1, x2, y1);
      tryLineSeg(x2, y1, x2, y2);
      tryLineSeg(x2, y2, x1, y2);
      tryLineSeg(x1, y2, x1, y1);
    } else if (shape.type === "circle" || shape.type === "arc") {
      const cx = Number(shape.cx), cy = Number(shape.cy), r = Math.abs(Number(shape.r) || 0);
      if (r <= 1e-9) return result;
      const ux = fx - cx, uy = fy - cy;
      const a = dirX * dirX + dirY * dirY;
      if (a < 1e-18) return result;
      const b = 2 * (ux * dirX + uy * dirY);
      const c = ux * ux + uy * uy - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return result;
      const sqrtDisc = Math.sqrt(Math.max(0, disc));
      for (const t of [(-b + sqrtDisc) / (2 * a), (-b - sqrtDisc) / (2 * a)]) {
        const ix = fx + t * dirX, iy = fy + t * dirY;
        if (shape.type === "arc") {
          const th = Math.atan2(iy - cy, ix - cx);
          if (!isAngleOnArc(th, Number(shape.a1) || 0, Number(shape.a2) || 0, shape.ccw !== false)) continue;
        }
        result.push({ x: ix, y: iy });
      }
    }
    return result;
  }

  function resolveVertexTangentAttribs(state, excludeShapeIds) {
    const excludeSet = excludeShapeIds instanceof Set ? excludeShapeIds : null;
    for (const shape of state.shapes) {
      if (shape.type !== "line") continue;
      if (excludeSet && excludeSet.has(Number(shape.id))) continue;
      for (const key of ["p1", "p2"]) {
        const attrib = key === "p1" ? shape.p1Attrib : shape.p2Attrib;
        if (!attrib) continue;
        if (attrib.type === "fixedPoint") {
          const fx = Number(attrib.x), fy = Number(attrib.y);
          if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
            if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
            continue;
          }
          if (key === "p1") { shape.x1 = fx; shape.y1 = fy; }
          else { shape.x2 = fx; shape.y2 = fy; }
          continue;
        }
        if (attrib.type === "followPoint") {
          const ref = state.shapes.find(s => Number(s.id) === Number(attrib.shapeId));
          if (!ref) {
            if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
            continue;
          }
          let pt = null;
          if (attrib.refType === "line_endpoint" && ref.type === "line") {
            pt = (attrib.refKey === "p2") ? { x: Number(ref.x2), y: Number(ref.y2) } : { x: Number(ref.x1), y: Number(ref.y1) };
          } else if (attrib.refType === "polyline_vertex" && ref.type === "polyline") {
            const pts = Array.isArray(ref.points) ? ref.points : [];
            const m = String(attrib.refKey || "").match(/^v(\d+)$/);
            const idx = m ? Number(m[1]) : NaN;
            if (Number.isFinite(idx) && idx >= 0 && idx < pts.length) {
              const p = pts[idx];
              pt = { x: Number(p.x), y: Number(p.y) };
            }
          } else if (attrib.refType === "bspline_control" && ref.type === "bspline") {
            const cps = Array.isArray(ref.controlPoints) ? ref.controlPoints : [];
            const m = String(attrib.refKey || "").match(/^cp(\d+)$/);
            const idx = m ? Number(m[1]) : NaN;
            if (Number.isFinite(idx) && idx >= 0 && idx < cps.length) {
              const p = cps[idx];
              pt = { x: Number(p.x), y: Number(p.y) };
            }
          } else if (attrib.refType === "dim_endpoint" && ref.type === "dim") {
            pt = (attrib.refKey === "p2") ? { x: Number(ref.x2), y: Number(ref.y2) } : { x: Number(ref.x1), y: Number(ref.y1) };
          } else if (attrib.refType === "rect_corner" && ref.type === "rect") {
            const x1 = Number(ref.x1), y1 = Number(ref.y1), x2 = Number(ref.x2), y2 = Number(ref.y2);
            if (attrib.refKey === "c2") pt = { x: x2, y: y1 };
            else if (attrib.refKey === "c3") pt = { x: x2, y: y2 };
            else if (attrib.refKey === "c4") pt = { x: x1, y: y2 };
            else pt = { x: x1, y: y1 };
          } else if (attrib.refType === "line_midpoint" && ref.type === "line") {
            pt = { x: (Number(ref.x1) + Number(ref.x2)) * 0.5, y: (Number(ref.y1) + Number(ref.y2)) * 0.5 };
          } else if (attrib.refType === "rect_midpoint" && ref.type === "rect") {
            const x1 = Number(ref.x1), y1 = Number(ref.y1), x2 = Number(ref.x2), y2 = Number(ref.y2);
            if (attrib.refKey === "m2") pt = { x: x2, y: (y1 + y2) * 0.5 };
            else if (attrib.refKey === "m3") pt = { x: (x1 + x2) * 0.5, y: y2 };
            else if (attrib.refKey === "m4") pt = { x: x1, y: (y1 + y2) * 0.5 };
            else pt = { x: (x1 + x2) * 0.5, y: y1 };
          } else if (attrib.refType === "circle_center" && ref.type === "circle") {
            pt = { x: Number(ref.cx), y: Number(ref.cy) };
          } else if (attrib.refType === "arc_center" && ref.type === "arc") {
            pt = { x: Number(ref.cx), y: Number(ref.cy) };
          } else if (attrib.refType === "position_center" && ref.type === "position") {
            pt = { x: Number(ref.x), y: Number(ref.y) };
          } else if (attrib.refType === "arc_endpoint" && ref.type === "arc") {
            const r = Math.abs(Number(ref.r) || 0);
            const cx = Number(ref.cx), cy = Number(ref.cy);
            const a = (attrib.refKey === "a2") ? (Number(ref.a2) || 0) : (Number(ref.a1) || 0);
            pt = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
          }
          if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
            if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
            continue;
          }
          if (key === "p1") { shape.x1 = pt.x; shape.y1 = pt.y; }
          else { shape.x2 = pt.x; shape.y2 = pt.y; }
          continue;
        }
        if (attrib.type === "intersection") {
          const la = state.shapes.find(s => Number(s.id) === Number(attrib.lineAId));
          const lb = state.shapes.find(s => Number(s.id) === Number(attrib.lineBId));
          if (!la || !lb || la.type !== "line" || lb.type !== "line") {
            if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
            continue;
          }
          const ip = segmentIntersectionPoint(
            { x: Number(la.x1), y: Number(la.y1) }, { x: Number(la.x2), y: Number(la.y2) },
            { x: Number(lb.x1), y: Number(lb.y1) }, { x: Number(lb.x2), y: Number(lb.y2) }
          );
          if (!ip) continue;
          if (key === "p1") { shape.x1 = ip.x; shape.y1 = ip.y; }
          else { shape.x2 = ip.x; shape.y2 = ip.y; }
          continue;
        }
        if (attrib.type !== "tangent") continue;
        const circle = state.shapes.find(s => Number(s.id) === attrib.circleId);
        if (!circle || (circle.type !== "circle" && circle.type !== "arc")) {
          if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
          continue;
        }
        const fixedKey = key === "p1" ? "p2" : "p1";
        const fixedPt = fixedKey === "p1" ? { x: Number(shape.x1), y: Number(shape.y1) } : { x: Number(shape.x2), y: Number(shape.y2) };
        const cx = Number(circle.cx), cy = Number(circle.cy), r = Math.abs(Number(circle.r) || 0);
        const pts = solveTangentSnapPoints(fixedPt, cx, cy, r);
        if (!pts.length) continue;
        let best = pts[0];
        if (pts.length > 1) {
          const cross0 = (cx - fixedPt.x) * (pts[0].y - fixedPt.y) - (cy - fixedPt.y) * (pts[0].x - fixedPt.x);
          if ((cross0 >= 0 ? 1 : -1) !== attrib.side) best = pts[1];
        }
        if (key === "p1") { shape.x1 = best.x; shape.y1 = best.y; }
        else { shape.x2 = best.x; shape.y2 = best.y; }
        if (circle.type === "arc") {
          const newTheta = Math.atan2(best.y - cy, best.x - cx);
          const angDist = (th, a) => Math.abs(Math.atan2(Math.sin(th - a), Math.cos(th - a)));
          const a1 = Number(circle.a1), a2 = Number(circle.a2);
          if (angDist(newTheta, a1) <= angDist(newTheta, a2)) circle.a1 = newTheta;
          else circle.a2 = newTheta;
        }
      }
    }
  }

  function closestPointOnSegment(world, a, b) {
    const ax = Number(a?.x), ay = Number(a?.y), bx = Number(b?.x), by = Number(b?.y);
    if (![ax, ay, bx, by].every(Number.isFinite)) return null;
    const vx = bx - ax, vy = by - ay;
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-12) {
      return { x: ax, y: ay, t: 0, dist: Math.hypot(Number(world.x) - ax, Number(world.y) - ay) };
    }
    const wx = Number(world.x) - ax, wy = Number(world.y) - ay;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
    const px = ax + vx * t, py = ay + vy * t;
    return { x: px, y: py, t, dist: Math.hypot(Number(world.x) - px, Number(world.y) - py) };
  }

  function getVertexInsertCandidate(state, world) {
    const tol = 12 / Math.max(1e-9, Number(state.view?.scale) || 1);
    const filterShapeId = state.vertexEdit?.filterShapeId != null ? Number(state.vertexEdit.filterShapeId) : null;
    const targetSet = getVertexTargetSet(state);
    if (!targetSet.size) return null;
    let best = null;
    const consider = (cand) => {
      if (!cand || !(Number(cand.dist) <= tol)) return;
      if (!best || Number(cand.dist) < Number(best.dist)) best = cand;
    };
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      const s = state.shapes[i];
      if (!targetSet.has(Number(s.id))) continue;
      if (!s || !isLayerVisible(state, s.layerId)) continue;
      if (filterShapeId !== null && Number(s.id) !== filterShapeId) continue;
      if (s.type === "line") {
        const cp = closestPointOnSegment(world, { x: Number(s.x1), y: Number(s.y1) }, { x: Number(s.x2), y: Number(s.y2) });
        if (!cp || cp.t <= 1e-6 || cp.t >= 1 - 1e-6) continue;
        consider({ shapeId: Number(s.id), shapeType: "line", insertIndex: 1, x: cp.x, y: cp.y, dist: cp.dist });
        continue;
      }
      if (s.type === "polyline") {
        const pts = Array.isArray(s.points) ? s.points : [];
        if (pts.length < 2) continue;
        for (let k = 1; k < pts.length; k++) {
          const cp = closestPointOnSegment(world, pts[k - 1], pts[k]);
          if (!cp || cp.t <= 1e-6 || cp.t >= 1 - 1e-6) continue;
          consider({ shapeId: Number(s.id), shapeType: "polyline", insertIndex: k, x: cp.x, y: cp.y, dist: cp.dist });
        }
        if (s.closed && pts.length >= 3) {
          const cp = closestPointOnSegment(world, pts[pts.length - 1], pts[0]);
          if (cp && cp.t > 1e-6 && cp.t < 1 - 1e-6) {
            consider({ shapeId: Number(s.id), shapeType: "polyline", insertIndex: pts.length, x: cp.x, y: cp.y, dist: cp.dist });
          }
        }
        continue;
      }
      if (s.type === "bspline") {
        const cps = Array.isArray(s.controlPoints) ? s.controlPoints : [];
        if (cps.length < 2 || typeof sampleBSplinePoints !== "function") continue;
        const sampled = sampleBSplinePoints(cps, Number(s.degree) || 3);
        if (!Array.isArray(sampled) || sampled.length < 2) continue;
        let bestSeg = null;
        for (let si = 1; si < sampled.length; si++) {
          const cp = closestPointOnSegment(world, sampled[si - 1], sampled[si]);
          if (!cp) continue;
          if (!bestSeg || Number(cp.dist) < Number(bestSeg.dist)) bestSeg = { ...cp, segIndex: si - 1 };
        }
        if (!bestSeg || Number(bestSeg.dist) > tol) continue;
        const tGlobal = (Number(bestSeg.segIndex) + Number(bestSeg.t || 0)) / Math.max(1, sampled.length - 1);
        const insertIndex = Math.max(1, Math.min(cps.length - 1, Math.round(tGlobal * (cps.length - 1)) + 1));
        consider({ shapeId: Number(s.id), shapeType: "bspline", insertIndex, x: Number(bestSeg.x), y: Number(bestSeg.y), dist: Number(bestSeg.dist) });
      }
    }
    if (!best) return null;
    return {
      shapeId: Number(best.shapeId),
      shapeType: String(best.shapeType || ""),
      insertIndex: Math.max(0, Number(best.insertIndex) || 0),
      x: Number(best.x),
      y: Number(best.y),
    };
  }

  function insertVertexAtCandidate(state, candidate, helpers) {
    const c = (candidate && typeof candidate === "object") ? candidate : null;
    if (!c) return false;
    const shape = (state.shapes || []).find((s) => Number(s.id) === Number(c.shapeId));
    if (!shape) return false;
    const x = Number(c.x), y = Number(c.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const idx = Math.max(0, Number(c.insertIndex) || 0);
    helpers?.pushHistory?.();
    if (shape.type === "line") {
      const p1 = { x: Number(shape.x1), y: Number(shape.y1) };
      const p2 = { x: Number(shape.x2), y: Number(shape.y2) };
      shape.type = "polyline";
      shape.points = [p1, { x, y }, p2];
      shape.closed = false;
      delete shape.x1; delete shape.y1; delete shape.x2; delete shape.y2;
      delete shape.p1Attrib; delete shape.p2Attrib;
      state.vertexEdit.selectedVertices = [{ shapeId: Number(shape.id), key: "v1" }];
      state.vertexEdit.activeVertex = state.vertexEdit.selectedVertices[0];
    } else if (shape.type === "polyline") {
      if (!Array.isArray(shape.points) || shape.points.length < 2) return false;
      const ins = Math.max(1, Math.min(shape.points.length, idx));
      shape.points.splice(ins, 0, { x, y });
      state.vertexEdit.selectedVertices = [{ shapeId: Number(shape.id), key: `v${ins}` }];
      state.vertexEdit.activeVertex = state.vertexEdit.selectedVertices[0];
    } else if (shape.type === "bspline") {
      if (!Array.isArray(shape.controlPoints) || shape.controlPoints.length < 2) return false;
      const ins = Math.max(1, Math.min(shape.controlPoints.length - 1, idx));
      shape.controlPoints.splice(ins, 0, { x, y });
      state.vertexEdit.selectedVertices = [{ shapeId: Number(shape.id), key: `cp${ins}` }];
      state.vertexEdit.activeVertex = state.vertexEdit.selectedVertices[0];
    } else {
      return false;
    }
    state.vertexEdit.insertCandidate = null;
    setSelection(state, [Number(shape.id)]);
    return true;
  }

  function moveSelectedVerticesByDelta(state, dx, dy, helpers) {
    const { setStatus, draw } = helpers;
    dx = Number(dx) || 0;
    dy = Number(dy) || 0;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
      if (setStatus) setStatus("No vertex move");
      if (draw) draw();
      return;
    }
    const selected = state.vertexEdit.selectedVertices || [];
    if (!selected.length) {
      if (setStatus) setStatus("No vertices selected");
      if (draw) draw();
      return;
    }
    pushHistory(state);
    const byId = new Map(state.shapes.map(s => [Number(s.id), s]));
    const seen = new Set();
    for (const v of selected) {
      const sid = Number(v.shapeId);
      const key = String(v.key || "");
      const uniq = `${sid}:${key}`;
      if (seen.has(uniq)) continue;
      seen.add(uniq);
      const shape = byId.get(sid);
      if (!shape) continue;
      const p = getVertexAtKey(shape, key);
      if (!p) continue;
      const next = { x: p.x + dx, y: p.y + dy };
      if (state.grid.snap) {
        const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
        const snapped = snapPoint(next, gridStep);
        setVertexAtKey(shape, key, snapped);
      } else {
        setVertexAtKey(shape, key, next);
      }
    }
    state.vertexEdit.moveDx = dx;
    state.vertexEdit.moveDy = dy;
    setSelection(state, Array.from(new Set(selected.map(v => Number(v.shapeId)))));
    if (setStatus) setStatus(`Moved ${selected.length} vertices by ${dx}, ${dy}`);
    if (draw) draw();
  }

  function deleteSelectedPolylineVertices(state, helpers) {
    const { setStatus, draw } = helpers || {};
    const selected = Array.isArray(state.vertexEdit?.selectedVertices) ? state.vertexEdit.selectedVertices : [];
    if (!selected.length) {
      if (setStatus) setStatus("No vertices selected");
      if (draw) draw();
      return false;
    }
    const byId = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    const removeMap = new Map();
    for (const v of selected) {
      const sid = Number(v?.shapeId);
      const key = String(v?.key || "");
      if (!Number.isFinite(sid)) continue;
      const shape = byId.get(sid);
      if (!shape) continue;
      let idx = NaN;
      if (String(shape.type || "") === "polyline" && Array.isArray(shape.points)) {
        const m = /^v(\d+)$/.exec(key);
        if (!m) continue;
        idx = Number(m[1]);
        if (!Number.isFinite(idx) || idx < 0 || idx >= shape.points.length) continue;
      } else if (String(shape.type || "") === "bspline" && Array.isArray(shape.controlPoints)) {
        const m = /^cp(\d+)$/.exec(key);
        if (!m) continue;
        idx = Number(m[1]);
        if (!Number.isFinite(idx) || idx < 0 || idx >= shape.controlPoints.length) continue;
      } else {
        continue;
      }
      let set = removeMap.get(sid);
      if (!set) {
        set = new Set();
        removeMap.set(sid, set);
      }
      set.add(idx);
    }
    if (!removeMap.size) {
      if (setStatus) setStatus("Vertex delete: polyline / B-spline vertex only");
      if (draw) draw();
      return false;
    }
    let canChange = false;
    for (const [sid, idxSet] of removeMap.entries()) {
      const shape = byId.get(Number(sid));
      if (!shape) continue;
      const isPoly = String(shape.type || "") === "polyline" && Array.isArray(shape.points);
      const isBs = String(shape.type || "") === "bspline" && Array.isArray(shape.controlPoints);
      if (!isPoly && !isBs) continue;
      const arr = isPoly ? shape.points : shape.controlPoints;
      if (arr.length <= 2) continue;
      const validIdxCount = Array.from(idxSet).filter((idx) => idx >= 0 && idx < arr.length).length;
      if (validIdxCount > 0) {
        canChange = true;
        break;
      }
    }
    if (!canChange) {
      if (setStatus) setStatus("Vertex delete skipped");
      if (draw) draw();
      return false;
    }
    pushHistory(state);
    let removedCount = 0;
    let touchedPolylineCount = 0;
    let touchedBsplineCount = 0;
    let changed = false;
    for (const [sid, idxSet] of removeMap.entries()) {
      const shape = byId.get(Number(sid));
      if (!shape) continue;
      const isPoly = String(shape.type || "") === "polyline" && Array.isArray(shape.points);
      const isBs = String(shape.type || "") === "bspline" && Array.isArray(shape.controlPoints);
      if (!isPoly && !isBs) continue;
      const arr = isPoly ? shape.points : shape.controlPoints;
      const idxs = Array.from(idxSet).sort((a, b) => b - a);
      let removedLocal = 0;
      for (const idx of idxs) {
        if (arr.length <= 2) break;
        if (idx < 0 || idx >= arr.length) continue;
        arr.splice(idx, 1);
        removedLocal += 1;
      }
      if (removedLocal > 0) {
        changed = true;
        removedCount += removedLocal;
        if (isPoly) {
          touchedPolylineCount += 1;
          if (shape.closed && arr.length < 3) shape.closed = false;
        }
        if (isBs) {
          touchedBsplineCount += 1;
          shape.degree = Math.max(1, Math.min(Number(shape.degree) || 3, arr.length - 1));
        }
      }
    }
    if (!changed) return false;
    state.vertexEdit.selectedVertices = [];
    state.vertexEdit.activeVertex = null;
    state.vertexEdit.insertCandidate = null;
    state.vertexEdit.drag.active = false;
    if (setStatus) {
      const parts = [];
      if (touchedPolylineCount > 0) parts.push(`${touchedPolylineCount} polyline${touchedPolylineCount === 1 ? "" : "s"}`);
      if (touchedBsplineCount > 0) parts.push(`${touchedBsplineCount} B-spline${touchedBsplineCount === 1 ? "" : "s"}`);
      const targetText = parts.length ? parts.join(" + ") : "shapes";
      setStatus(`Deleted ${removedCount} vertex${removedCount === 1 ? "" : "es"} from ${targetText}`);
    }
    if (draw) draw();
    return true;
  }

  return {
    getVertexAtKey,
    setVertexAtKey,
    hitTestVertexHandle,
    vertexKeyOf,
    getCoincidentVertexGroup,
    hasSelectedVertex,
    toggleVertexSelection,
    setSingleVertexSelection,
    clearVertexSelection,
    beginVertexSelectionBox,
    endVertexSelectionBox,
    beginVertexDrag,
    applyVertexDrag,
    endVertexDrag,
    resolveVertexTangentAttribs,
    moveSelectedVerticesByDelta,
    deleteSelectedPolylineVertices,
    getVertexInsertCandidate,
    insertVertexAtCandidate
  };
}
