export function createHitTestOps(config) {
  const {
    isGroupVisible,
    hitTestLine,
    distancePointToSegment,
    isAngleOnArc,
    getDimChainGeometry,
    getDimAngleGeometry,
    getCircleDimGeometry,
    isPointInHatch,
    sampleBSplinePoints
  } = config || {};

  function hitTestShapes(state, world, dom) {
    const tol = 8 / Math.max(1e-9, state.view.scale);
    const textPickTol = Math.max(tol, 12 / Math.max(1e-9, state.view.scale));
    const pointInImageBounds = (shape, point, margin = 0) => {
      const x = Number(shape?.x), y = Number(shape?.y);
      const w = Math.max(1e-9, Number(shape?.width) || 0);
      const h = Math.max(1e-9, Number(shape?.height) || 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(h > 0)) return false;
      const cx = x + w * 0.5;
      const cy = y + h * 0.5;
      const rot = (Number(shape?.rotationDeg) || 0) * Math.PI / 180;
      const cos = Math.cos(-rot);
      const sin = Math.sin(-rot);
      const dx = Number(point.x) - cx;
      const dy = Number(point.y) - cy;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;
      return (
        lx >= (-w * 0.5 - margin) &&
        lx <= (w * 0.5 + margin) &&
        ly >= (-h * 0.5 - margin) &&
        ly <= (h * 0.5 + margin)
      );
    };
    const visibleLayerSet = new Set((state.layers || []).filter(l => l?.visible !== false).map(l => Number(l.id)).filter(Number.isFinite));
    const lockedLayerSet = new Set((state.layers || []).filter(l => l?.locked === true).map(l => Number(l.id)).filter(Number.isFinite));
    const isLayerVisibleFast = (layerId) => (visibleLayerSet.size ? visibleLayerSet.has(Number(layerId)) : true);
    const isLayerLockedFast = (layerId) => lockedLayerSet.has(Number(layerId));
    const shapeGroupMap = new Map();
    for (const g of (state.groups || [])) {
      const gid = Number(g?.id);
      if (!Number.isFinite(gid)) continue;
      for (const sid of (g?.shapeIds || [])) {
        const sidNum = Number(sid);
        if (!Number.isFinite(sidNum)) continue;
        shapeGroupMap.set(sidNum, gid);
      }
    }
    const resolveGroupId = (shape) => {
      const sid = Number(shape?.id);
      const gidFromMap = shapeGroupMap.has(sid) ? Number(shapeGroupMap.get(sid)) : NaN;
      return Number.isFinite(gidFromMap) ? gidFromMap : Number(shape?.groupId);
    };
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      const s = state.shapes[i];
      if (!isLayerVisibleFast(s.layerId)) continue;
      if (isLayerLockedFast(s.layerId)) continue;
      if (!isGroupVisible(state, resolveGroupId(s))) continue;
      if (state.ui?.layerView?.editOnlyActive && Number(s.layerId ?? state.activeLayerId) !== Number(state.activeLayerId)) continue;
      if (s.type === "line" && hitTestLine(world, s, tol)) return s;
      if (s.type === "bspline") {
        const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
        for (let pi = 1; pi < sampled.length; pi++) {
          const a = sampled[pi - 1];
          const b = sampled[pi];
          if (distancePointToSegment(world, a, b) <= tol) return s;
        }
      }
      if (s.type === "rect") {
        const xMin = Math.min(Number(s.x1), Number(s.x2)), xMax = Math.max(Number(s.x1), Number(s.x2));
        const yMin = Math.min(Number(s.y1), Number(s.y2)), yMax = Math.max(Number(s.y1), Number(s.y2));
        if (hitTestLine(world, { x1: xMin, y1: yMin, x2: xMax, y2: yMin }, tol) ||
          hitTestLine(world, { x1: xMax, y1: yMin, x2: xMax, y2: yMax }, tol) ||
          hitTestLine(world, { x1: xMax, y1: yMax, x2: xMin, y2: yMax }, tol) ||
          hitTestLine(world, { x1: xMin, y1: yMax, x2: xMin, y2: yMin }, tol)) return s;
      }
      if (s.type === "circle") {
        const d = Math.hypot(world.x - Number(s.cx), world.y - Number(s.cy));
        const r = Math.abs(Number(s.r) || 0);
        if (Math.abs(d - r) <= tol) return s;
        if (s.showCenterMark) {
          if (d <= Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
        }
      }
      if (s.type === "arc") {
        const dx = Number(world.x) - Number(s.cx);
        const dy = Number(world.y) - Number(s.cy);
        const d = Math.hypot(dx, dy);
        if (s.showCenterMark) {
          if (d <= Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
        }
        const r = Math.abs(Number(s.r) || 0);
        if (r > 1e-9 && Math.abs(d - r) <= tol) {
          const th = Math.atan2(dy, dx);
          if (isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) return s;
        }
      }
      if (s.type === "position") {
        const d = Math.hypot(world.x - s.x, world.y - s.y);
        if (d <= Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
      }
      if (s.type === "dim") {
        const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
        const len = Math.hypot(vx, vy);
        if (len > 1e-9) {
          const tx = vx / len, ty = vy / len;
          const nx = -ty, ny = tx;
          const off = (Number(s.px) - s.x1) * nx + (Number(s.py) - s.y1) * ny;
          const d1 = { x: s.x1 + nx * off, y: s.y1 + ny * off };
          const d2 = { x: s.x2 + nx * off, y: s.y2 + ny * off };
          if (hitTestLine(world, { x1: s.x1, y1: s.y1, x2: d1.x, y2: d1.y }, tol)) return s;
          if (hitTestLine(world, { x1: s.x2, y1: s.y2, x2: d2.x, y2: d2.y }, tol)) return s;
          if (hitTestLine(world, { x1: d1.x, y1: d1.y, x2: d2.x, y2: d2.y }, tol)) return s;
          const hasRel = Number.isFinite(Number(s.tdx)) && Number.isFinite(Number(s.tdy));
          const textPos = hasRel
            ? { x: Number((d1.x + d2.x) * 0.5) + Number(s.tdx), y: Number((d1.y + d2.y) * 0.5) + Number(s.tdy) }
            : (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
              ? { x: Number(s.tx), y: Number(s.ty) }
              : { x: Number((d1.x + d2.x) * 0.5), y: Number((d1.y + d2.y) * 0.5) };
          if (Math.hypot(world.x - textPos.x, world.y - textPos.y) <= textPickTol) return s;
        }
      }
      if (s.type === "dimchain") {
        const geom = getDimChainGeometry(s);
        if (geom) {
          for (const seg of geom.segments) {
            if (hitTestLine(world, { x1: seg.x1, y1: seg.y1, x2: seg.d1.x, y2: seg.d1.y }, tol)) return s;
            if (hitTestLine(world, { x1: seg.x2, y1: seg.y2, x2: seg.d2.x, y2: seg.d2.y }, tol)) return s;
            if (hitTestLine(world, { x1: seg.d1.x, y1: seg.d1.y, x2: seg.d2.x, y2: seg.d2.y }, tol)) return s;
          }
          const hasRel = Number.isFinite(Number(s.tdx)) && Number.isFinite(Number(s.tdy));
          const textPos = hasRel
            ? { x: Number(geom.chainMid?.x || 0) + Number(s.tdx), y: Number(geom.chainMid?.y || 0) + Number(s.tdy) }
            : (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
              ? { x: Number(s.tx), y: Number(s.ty) }
              : { x: Number(geom.chainMid?.x || 0), y: Number(geom.chainMid?.y || 0) };
          if (Math.hypot(world.x - textPos.x, world.y - textPos.y) <= textPickTol) return s;
        }
      }
      if (s.type === "dimangle") {
        const g = getDimAngleGeometry(s, state.shapes);
        const cx = Number(g?.cx), cy = Number(g?.cy), r = Number(g?.r);
        if (r > 0) {
          const d = Math.hypot(world.x - cx, world.y - cy);
          if (Math.abs(d - r) < tol) return s;
        }
        if (g && Number.isFinite(Number(g.tx)) && Number.isFinite(Number(g.ty))) {
          if (Math.hypot(world.x - Number(g.tx), world.y - Number(g.ty)) <= textPickTol) return s;
        }
      }
      if (s.type === "circleDim") {
        const g = getCircleDimGeometry(s, state.shapes);
        if (g) {
          if (hitTestLine(world, { x1: g.p1.x, y1: g.p1.y, x2: g.p2.x, y2: g.p2.y }, tol)) return s;
          if (Math.hypot(world.x - g.tx, world.y - g.ty) < Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
        }
      }
      if (s.type === "text") {
        const p1 = { x: Number(s.x1), y: Number(s.y1) };
        const txt = String(s.text || "");
        const sizePx = (Number(s.textSizePt) || 12) * 1.33;
        const rDeg = Number(s.textRotate) || 0;
        const tctx = dom?.canvas?.getContext?.("2d");
        if (!tctx) continue;
        tctx.save();
        const isBold = !!s.textBold;
        const isItalic = !!s.textItalic;
        const fontFamily = s.textFontFamily || "Yu Gothic UI";
        tctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${sizePx}px "${fontFamily}"`;
        const w = tctx.measureText(txt).width;
        tctx.restore();
        const h = sizePx;
        const rRad = rDeg * Math.PI / 180;
        const cos = Math.cos(rRad), sin = Math.sin(rRad);
        const scale = Math.max(1e-9, Number(state.view?.scale) || 1);
        const p1sx = p1.x * scale + Number(state.view?.offsetX || 0);
        const p1sy = p1.y * scale + Number(state.view?.offsetY || 0);
        const wsx = world.x * scale + Number(state.view?.offsetX || 0);
        const wsy = world.y * scale + Number(state.view?.offsetY || 0);
        const dx = wsx - p1sx, dy = wsy - p1sy;
        const rx = dx * cos + dy * sin;
        const ry = -dx * sin + dy * cos;
        const pickPadPx = 10;
        const minPickWpx = 28;
        const minPickHpx = 22;
        const wPx = Math.max(minPickWpx, Number(w) || 0);
        const hHalfPx = Math.max(minPickHpx * 0.5, Number(h) * 0.5 || 0);
        if (
          rx >= -pickPadPx &&
          rx <= (wPx + pickPadPx) &&
          ry >= (-hHalfPx - pickPadPx) &&
          ry <= (hHalfPx + pickPadPx)
        ) return s;
      }
      if (s.type === "image") {
        if (pointInImageBounds(s, world, tol)) return s;
      }
      if (s.type === "hatch") {
        if (state.tool === "dim") continue;
        if (isPointInHatch(state.shapes, s, world, state.view.scale)) return s;
      }
    }
    return null;
  }

  return { hitTestShapes };
}
