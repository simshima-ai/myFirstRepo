export function createRenderBoundsOps(deps) {
  const { sampleBSplinePoints } = deps;

  function getShapeWorldBounds(shape, shapeById = null, visiting = null) {
    const expandBounds = (acc, b) => {
      if (!b) return acc;
      if (!acc) return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
      acc.minX = Math.min(acc.minX, b.minX);
      acc.minY = Math.min(acc.minY, b.minY);
      acc.maxX = Math.max(acc.maxX, b.maxX);
      acc.maxY = Math.max(acc.maxY, b.maxY);
      return acc;
    };
    const boundsFromPoints = (pts) => {
      let acc = null;
      for (const p of (pts || [])) {
        const x = Number(p?.x);
        const y = Number(p?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const b = { minX: x, minY: y, maxX: x, maxY: y };
        acc = expandBounds(acc, b);
      }
      return acc;
    };

    if (!shape || !shape.type) return null;
    if (shape.type === "line" || shape.type === "rect" || shape.type === "text") {
      const x1 = Number(shape.x1);
      const y1 = Number(shape.y1);
      const x2 = Number(shape.x2);
      const y2 = Number(shape.y2);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
      return {
        minX: Math.min(x1, x2),
        minY: Math.min(y1, y2),
        maxX: Math.max(x1, x2),
        maxY: Math.max(y1, y2),
      };
    }
    if (shape.type === "polyline") {
      return boundsFromPoints(shape.points || []);
    }
    if (shape.type === "image") {
      const x = Number(shape.x);
      const y = Number(shape.y);
      const w = Math.abs(Number(shape.width) || 0);
      const h = Math.abs(Number(shape.height) || 0);
      if (![x, y, w, h].every(Number.isFinite) || !(w > 0) || !(h > 0)) return null;
      const cx = x + w * 0.5;
      const cy = y + h * 0.5;
      const rotDeg = Number(shape.rotationDeg) || 0;
      const rotPt = (px, py) => {
        const r = rotDeg * Math.PI / 180;
        const dx = px - cx;
        const dy = py - cy;
        return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
      };
      return boundsFromPoints([
        rotPt(x, y),
        rotPt(x + w, y),
        rotPt(x + w, y + h),
        rotPt(x, y + h),
      ]);
    }
    if (shape.type === "bspline") {
      const sampled = sampleBSplinePoints(shape.controlPoints, Number(shape.degree) || 3);
      return boundsFromPoints(sampled);
    }
    if (shape.type === "circle" || shape.type === "arc") {
      const cx = Number(shape.cx);
      const cy = Number(shape.cy);
      const r = Math.abs(Number(shape.r));
      if (![cx, cy, r].every(Number.isFinite)) return null;
      return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }
    if (shape.type === "position") {
      const x = Number(shape.x);
      const y = Number(shape.y);
      const size = Math.max(0, Number(shape.size ?? 20) || 20);
      if (![x, y].every(Number.isFinite)) return null;
      return { minX: x - size, minY: y - size, maxX: x + size, maxY: y + size };
    }
    if (shape.type === "dim") {
      return boundsFromPoints([
        { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 },
        { x: shape.px, y: shape.py }, { x: shape.tx, y: shape.ty },
      ]);
    }
    if (shape.type === "dimchain") {
      const pts = [];
      if (Array.isArray(shape.points)) {
        for (const p of shape.points) pts.push({ x: p?.x, y: p?.y });
      }
      pts.push({ x: shape.px, y: shape.py }, { x: shape.tx, y: shape.ty });
      return boundsFromPoints(pts);
    }
    if (shape.type === "dimangle") {
      const pts = [
        { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 },
        { x: shape.tx, y: shape.ty }, { x: shape.cx, y: shape.cy },
      ];
      const cx = Number(shape.cx);
      const cy = Number(shape.cy);
      const r = Math.abs(Number(shape.r));
      let b = boundsFromPoints(pts);
      if ([cx, cy, r].every(Number.isFinite)) {
        b = expandBounds(b, { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r });
      }
      return b;
    }
    if (shape.type === "circleDim") {
      const cx = Number(shape.cx);
      const cy = Number(shape.cy);
      const r = Math.abs(Number(shape.r));
      let b = boundsFromPoints([{ x: shape.tx, y: shape.ty }, { x: shape.px, y: shape.py }]);
      if ([cx, cy, r].every(Number.isFinite)) {
        b = expandBounds(b, { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r });
      }
      return b;
    }
    if (shape.type === "hatch") {
      const ids = Array.isArray(shape.boundaryIds) ? shape.boundaryIds.map(Number).filter(Number.isFinite) : [];
      if (!ids.length || !shapeById) return null;
      const seen = visiting || new Set();
      const selfId = Number(shape.id);
      if (Number.isFinite(selfId)) seen.add(selfId);
      let out = null;
      for (const id of ids) {
        if (seen.has(Number(id))) continue;
        seen.add(Number(id));
        const ref = shapeById.get(Number(id));
        if (!ref) continue;
        const rb = getShapeWorldBounds(ref, shapeById, seen);
        out = expandBounds(out, rb);
      }
      return out;
    }
    return null;
  }

  function isBoundsOutsideView(bounds, viewWorld) {
    if (!bounds || !viewWorld) return false;
    if (bounds.maxX < viewWorld.minX) return true;
    if (bounds.minX > viewWorld.maxX) return true;
    if (bounds.maxY < viewWorld.minY) return true;
    if (bounds.minY > viewWorld.maxY) return true;
    return false;
  }

  return {
    getShapeWorldBounds,
    isBoundsOutsideView,
  };
}
