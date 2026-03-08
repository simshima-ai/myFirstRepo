export function createSelectionBoxOps(config) {
  const {
    screenToWorld,
    segmentIntersectionPoint,
    segmentCircleIntersectionPoints,
    buildHatchLoopsFromBoundaryIds,
    isHatchBoundaryShape,
    getDimChainGeometry,
    getCircleDimGeometry,
    getDimAngleGeometry,
    setSelection,
    collectGroupTreeShapeIds,
    isLayerVisible,
    isLayerLocked,
    sampleBSplinePoints,
    getImageCornersWorld
  } = config || {};

  function beginSelectionBox(state, screen, additive) {
    state.selection.box.active = true;
    state.selection.box.additive = !!additive;
    state.selection.box.startScreen = { x: screen.x, y: screen.y };
    state.selection.box.currentScreen = { x: screen.x, y: screen.y };
  }

  function updateSelectionBox(state, screen) {
    if (!state.selection.box.active) return;
    state.selection.box.currentScreen = { x: screen.x, y: screen.y };
  }

  function endSelectionBox(state, helpers) {
    const { setStatus } = helpers;
    const box = state.selection.box;
    if (!box.active || !box.startScreen || !box.currentScreen) {
      box.active = false;
      return false;
    }
    const xMin = Math.min(box.startScreen.x, box.currentScreen.x);
    const xMax = Math.max(box.startScreen.x, box.currentScreen.x);
    const yMin = Math.min(box.startScreen.y, box.currentScreen.y);
    const yMax = Math.max(box.startScreen.y, box.currentScreen.y);
    const dragged = (xMax - xMin > 4 || yMax - yMin > 4);

    if (dragged) {
      const leftToRight = box.currentScreen.x >= box.startScreen.x;
      const pMin = screenToWorld(state.view, { x: xMin, y: yMin });
      const pMax = screenToWorld(state.view, { x: xMax, y: yMax });
      const wx1 = pMin.x, wy1 = pMin.y, wx2 = pMax.x, wy2 = pMax.y;

      const aabbFromPoints = (pts) => {
        const valid = (pts || []).filter(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
        if (!valid.length) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of valid) {
          const x = Number(p.x), y = Number(p.y);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
        return { minX, minY, maxX, maxY };
      };
      const getImageCorners = (s) => {
        const corners = getImageCornersWorld(s);
        if (!corners) return [];
        return [corners.tl, corners.tr, corners.br, corners.bl];
      };
      const boxCorners = [
        { x: wx1, y: wy1 },
        { x: wx2, y: wy1 },
        { x: wx2, y: wy2 },
        { x: wx1, y: wy2 },
      ];
      const boxEdges = [
        [boxCorners[0], boxCorners[1]],
        [boxCorners[1], boxCorners[2]],
        [boxCorners[2], boxCorners[3]],
        [boxCorners[3], boxCorners[0]],
      ];
      const pointInRect = (p) => Number(p.x) >= wx1 && Number(p.x) <= wx2 && Number(p.y) >= wy1 && Number(p.y) <= wy2;
      const pointInPolygon = (p, poly) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = Number(poly[i]?.x), yi = Number(poly[i]?.y);
          const xj = Number(poly[j]?.x), yj = Number(poly[j]?.y);
          const intersects = ((yi > p.y) !== (yj > p.y))
            && (p.x < ((xj - xi) * (p.y - yi)) / Math.max(1e-12, (yj - yi)) + xi);
          if (intersects) inside = !inside;
        }
        return inside;
      };

      const getDimLikeBounds = (s) => {
        if (!s) return null;
        if (s.type === "dim") {
          return aabbFromPoints([
            { x: Number(s.x1), y: Number(s.y1) },
            { x: Number(s.x2), y: Number(s.y2) },
            { x: Number(s.px), y: Number(s.py) },
            (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) ? { x: Number(s.tx), y: Number(s.ty) } : null
          ]);
        }
        if (s.type === "dimchain") {
          const g = getDimChainGeometry(s);
          if (!g) return null;
          const pts = []
            .concat(Array.isArray(s.points) ? s.points : [])
            .concat(Array.isArray(g.dimPoints) ? g.dimPoints : [])
            .concat(Array.isArray(g.segments) ? g.segments.flatMap(seg => [seg?.d1, seg?.d2]) : [])
            .concat((Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) ? [{ x: Number(s.tx), y: Number(s.ty) }] : []);
          return aabbFromPoints(pts);
        }
        if (s.type === "circleDim") {
          const g = getCircleDimGeometry(s, state.shapes || []);
          if (!g) return null;
          const c1 = { x: Number(g.cx) + Number(g.ux) * Number(g.r), y: Number(g.cy) + Number(g.uy) * Number(g.r) };
          const c2 = { x: Number(g.cx) - Number(g.ux) * Number(g.r), y: Number(g.cy) - Number(g.uy) * Number(g.r) };
          return aabbFromPoints([g.p1, g.p2, c1, c2, { x: Number(g.tx), y: Number(g.ty) }]);
        }
        if (s.type === "dimangle") {
          const g = getDimAngleGeometry(s, state.shapes || []);
          if (!g) return null;
          const p1 = { x: Number(g.cx) + Math.cos(Number(g.a1)) * Number(g.r), y: Number(g.cy) + Math.sin(Number(g.a1)) * Number(g.r) };
          const p2 = { x: Number(g.cx) + Math.cos(Number(g.a2)) * Number(g.r), y: Number(g.cy) + Math.sin(Number(g.a2)) * Number(g.r) };
          return aabbFromPoints([p1, p2, { x: Number(g.cx), y: Number(g.cy) }, { x: Number(g.tx), y: Number(g.ty) }]);
        }
        return null;
      };

      const isInside = (s) => {
        const dimBounds = getDimLikeBounds(s);
        if (dimBounds) {
          return (dimBounds.minX >= wx1 && dimBounds.maxX <= wx2 && dimBounds.minY >= wy1 && dimBounds.maxY <= wy2);
        }
        if (s.type === "line") {
          return (s.x1 >= wx1 && s.x1 <= wx2 && s.y1 >= wy1 && s.y1 <= wy2) &&
            (s.x2 >= wx1 && s.x2 <= wx2 && s.y2 >= wy1 && s.y2 <= wy2);
        }
        if (s.type === "rect") {
          const sxMin = Math.min(s.x1, s.x2), sxMax = Math.max(s.x1, s.x2);
          const syMin = Math.min(s.y1, s.y2), syMax = Math.max(s.y1, s.y2);
          return (sxMin >= wx1 && sxMax <= wx2 && syMin >= wy1 && syMax <= wy2);
        }
        if (s.type === "circle" || s.type === "arc") {
          return (s.cx - s.r >= wx1 && s.cx + s.r <= wx2 && s.cy - s.r >= wy1 && s.cy + s.r <= wy2);
        }
        if (s.type === "position") return (s.x >= wx1 && s.x <= wx2 && s.y >= wy1 && s.y <= wy2);
        if (s.type === "text") return (s.x1 >= wx1 && s.x1 <= wx2 && s.y1 >= wy1 && s.y1 <= wy2);
        if (s.type === "image") {
          const corners = getImageCorners(s);
          if (!corners.length) return false;
          return corners.every(pointInRect);
        }
        if (s.type === "bspline") {
          const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
          if (!sampled.length) return false;
          return sampled.every((p) => Number(p.x) >= wx1 && Number(p.x) <= wx2 && Number(p.y) >= wy1 && Number(p.y) <= wy2);
        }
        return false;
      };

      const isCrossing = (s) => {
        const dimBounds = getDimLikeBounds(s);
        if (dimBounds) {
          return !(dimBounds.maxX < wx1 || dimBounds.minX > wx2 || dimBounds.maxY < wy1 || dimBounds.minY > wy2);
        }
        if (s.type === "line") {
          const lxMin = Math.min(s.x1, s.x2), lxMax = Math.max(s.x1, s.x2);
          const lyMin = Math.min(s.y1, s.y2), lyMax = Math.max(s.y1, s.y2);
          if (lxMax < wx1 || lxMin > wx2 || lyMax < wy1 || lyMin > wy2) return false;
          const rectEdges = [
            [{ x: wx1, y: wy1 }, { x: wx2, y: wy1 }],
            [{ x: wx2, y: wy1 }, { x: wx2, y: wy2 }],
            [{ x: wx2, y: wy2 }, { x: wx1, y: wy2 }],
            [{ x: wx1, y: wy2 }, { x: wx1, y: wy1 }]
          ];
          const p1 = { x: s.x1, y: s.y1 }, p2 = { x: s.x2, y: s.y2 };
          if (isInside(s)) return true;
          return rectEdges.some(edge => segmentIntersectionPoint(p1, p2, edge[0], edge[1]));
        }
        if (s.type === "rect") {
          const sxMin = Math.min(s.x1, s.x2), sxMax = Math.max(s.x1, s.x2);
          const syMin = Math.min(s.y1, s.y2), syMax = Math.max(s.y1, s.y2);
          return !(sxMax < wx1 || sxMin > wx2 || syMax < wy1 || syMin > wy2);
        }
        if (s.type === "circle") {
          const distSq = (px, py) => (px - s.cx) ** 2 + (py - s.cy) ** 2;
          const rSq = s.r ** 2;
          if (s.cx + s.r < wx1 || s.cx - s.r > wx2 || s.cy + s.r < wy1 || s.cy - s.r > wy2) return false;
          if (s.cx >= wx1 && s.cx <= wx2 && s.cy >= wy1 && s.cy <= wy2) return true;
          if (distSq(wx1, wy1) <= rSq || distSq(wx2, wy1) <= rSq || distSq(wx2, wy2) <= rSq || distSq(wx1, wy2) <= rSq) return true;
          const edges = [
            { a: { x: wx1, y: wy1 }, b: { x: wx2, y: wy1 } },
            { a: { x: wx2, y: wy1 }, b: { x: wx2, y: wy2 } },
            { a: { x: wx2, y: wy2 }, b: { x: wx1, y: wy2 } },
            { a: { x: wx1, y: wy2 }, b: { x: wx1, y: wy1 } }
          ];
          return edges.some(e => segmentCircleIntersectionPoints(e.a, e.b, s).length > 0);
        }
        if (s.type === "arc") return !(s.cx + s.r < wx1 || s.cx - s.r > wx2 || s.cy + s.r < wy1 || s.cy - s.r > wy2);
        if (s.type === "position") return s.x >= wx1 && s.x <= wx2 && s.y >= wy1 && s.y <= wy2;
        if (s.type === "text") return !(s.x1 > wx2 || s.x1 < wx1 || s.y1 > wy2 || s.y1 < wy1);
        if (s.type === "image") {
          const corners = getImageCorners(s);
          if (!corners.length) return false;
          const aabb = aabbFromPoints(corners);
          if (!aabb || aabb.maxX < wx1 || aabb.minX > wx2 || aabb.maxY < wy1 || aabb.minY > wy2) return false;
          if (corners.some(pointInRect)) return true;
          if (boxCorners.some((p) => pointInPolygon(p, corners))) return true;
          const imgEdges = [
            [corners[0], corners[1]],
            [corners[1], corners[2]],
            [corners[2], corners[3]],
            [corners[3], corners[0]],
          ];
          for (const ie of imgEdges) {
            for (const be of boxEdges) {
              if (segmentIntersectionPoint(ie[0], ie[1], be[0], be[1])) return true;
            }
          }
          return false;
        }
        if (s.type === "bspline") {
          const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
          if (sampled.length < 2) return false;
          const edges = [
            [{ x: wx1, y: wy1 }, { x: wx2, y: wy1 }],
            [{ x: wx2, y: wy1 }, { x: wx2, y: wy2 }],
            [{ x: wx2, y: wy2 }, { x: wx1, y: wy2 }],
            [{ x: wx1, y: wy2 }, { x: wx1, y: wy1 }]
          ];
          for (let i = 1; i < sampled.length; i++) {
            const p1 = sampled[i - 1];
            const p2 = sampled[i];
            const minX = Math.min(Number(p1.x), Number(p2.x));
            const maxX = Math.max(Number(p1.x), Number(p2.x));
            const minY = Math.min(Number(p1.y), Number(p2.y));
            const maxY = Math.max(Number(p1.y), Number(p2.y));
            if (maxX < wx1 || minX > wx2 || maxY < wy1 || minY > wy2) continue;
            if ((Number(p1.x) >= wx1 && Number(p1.x) <= wx2 && Number(p1.y) >= wy1 && Number(p1.y) <= wy2)
              || (Number(p2.x) >= wx1 && Number(p2.x) <= wx2 && Number(p2.y) >= wy1 && Number(p2.y) <= wy2)) return true;
            if (edges.some((e) => segmentIntersectionPoint(p1, p2, e[0], e[1]))) return true;
          }
          return false;
        }
        if (s.type === "hatch") {
          const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, s.boundaryIds || [], state.view.scale);
          if (parsed.ok && parsed.bounds) {
            const b = parsed.bounds;
            return !(b.maxX < wx1 || b.minX > wx2 || b.maxY < wy1 || b.minY > wy2);
          }
        }
        return false;
      };

      const picked = [];
      for (const s of state.shapes) {
        if (!isLayerVisible(state, s.layerId)) continue;
        if (isLayerLocked(state, s.layerId)) continue;
        if (state.ui?.layerView?.editOnlyActive && Number(s.layerId ?? state.activeLayerId) !== Number(state.activeLayerId)) continue;
        if (leftToRight ? isInside(s) : isCrossing(s)) picked.push(Number(s.id));
      }

      if (state.tool === "hatch") {
        const valid = picked.filter(id => isHatchBoundaryShape(state.shapes.find(sh => sh.id === id)));
        if (box.additive) state.hatchDraft.boundaryIds = Array.from(new Set([...state.hatchDraft.boundaryIds, ...valid]));
        else state.hatchDraft.boundaryIds = valid;
        if (setStatus) setStatus(`Hatch: ${state.hatchDraft.boundaryIds.length} selected`);
      } else {
        const pickMode = String(state.ui?.selectPickMode || "object");
        if (pickMode === "group") {
          const byId = new Map((state.shapes || []).map(s => [Number(s.id), s]));
          const pickedGroupIds = new Set();
          for (const sid of picked) {
            const s = byId.get(Number(sid));
            const gid = Number(s?.groupId);
            if (Number.isFinite(gid)) pickedGroupIds.add(gid);
          }
          const nextGroupIds = box.additive
            ? Array.from(new Set([...(state.selection?.groupIds || []).map(Number), ...pickedGroupIds]))
            : Array.from(pickedGroupIds);
          const nextShapeIds = new Set();
          for (const gid of nextGroupIds) {
            for (const sid of collectGroupTreeShapeIds(state, gid)) nextShapeIds.add(Number(sid));
          }
          setSelection(state, Array.from(nextShapeIds));
          state.selection.groupIds = nextGroupIds.map(Number).filter(Number.isFinite);
          state.activeGroupId = state.selection.groupIds.length
            ? Number(state.selection.groupIds[state.selection.groupIds.length - 1])
            : null;
          if (setStatus) setStatus(`Selected ${state.selection.groupIds.length} group(s) (${leftToRight ? "Window" : "Crossing"})`);
        } else {
          if (box.additive) {
            const cur = new Set(state.selection.ids.map(Number));
            for (const id of picked) cur.add(id);
            setSelection(state, Array.from(cur));
          } else {
            setSelection(state, picked);
          }
          if (setStatus) setStatus(`Selected ${picked.length} object(s) (${leftToRight ? "Window" : "Crossing"})`);
        }
      }
    } else {
      if (!box.additive) {
        setSelection(state, []);
        state.activeGroupId = null;
      }
    }

    box.active = false;
    box.additive = false;
    box.startScreen = null;
    box.currentScreen = null;
    return dragged;
  }

  return {
    beginSelectionBox,
    updateSelectionBox,
    endSelectionBox
  };
}
