export function normalizeAimConstraint(raw) {
  const targetTypeRaw = String(raw?.targetType || "").toLowerCase();
  const targetType = (targetTypeRaw === "group" || targetTypeRaw === "position") ? targetTypeRaw : null;
  const targetIdNum = Number(raw?.targetId);
  return {
    enabled: !!raw?.enabled,
    targetType,
    targetId: Number.isFinite(targetIdNum) ? targetIdNum : null,
  };
}

export function normalizeRadLocal(a) {
  let x = Number(a) || 0;
  while (x < 0) x += Math.PI * 2;
  while (x >= Math.PI * 2) x -= Math.PI * 2;
  return x;
}

export function normalizeDeltaDeg(delta) {
  let d = Number(delta) || 0;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export function rotatePointAroundDeg(x, y, ox, oy, deltaDeg) {
  const r = (Number(deltaDeg) || 0) * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = (Number(x) || 0) - (Number(ox) || 0);
  const dy = (Number(y) || 0) - (Number(oy) || 0);
  return {
    x: (Number(ox) || 0) + dx * c - dy * s,
    y: (Number(oy) || 0) + dx * s + dy * c,
  };
}

export function rotateShapeAroundForAim(shape, ox, oy, deltaDeg) {
  if (!shape) return;
  const d = (Number(deltaDeg) || 0) * Math.PI / 180;
  if (shape.type === "line" || shape.type === "rect") {
    const p1 = rotatePointAroundDeg(shape.x1, shape.y1, ox, oy, deltaDeg);
    const p2 = rotatePointAroundDeg(shape.x2, shape.y2, ox, oy, deltaDeg);
    shape.x1 = p1.x; shape.y1 = p1.y; shape.x2 = p2.x; shape.y2 = p2.y;
    return;
  }
  if (shape.type === "polyline") {
    if (Array.isArray(shape.points)) {
      shape.points = shape.points.map((pt) => rotatePointAroundDeg(Number(pt?.x), Number(pt?.y), ox, oy, deltaDeg));
    }
    return;
  }
  if (shape.type === "circle") {
    const c = rotatePointAroundDeg(shape.cx, shape.cy, ox, oy, deltaDeg);
    shape.cx = c.x; shape.cy = c.y;
    return;
  }
  if (shape.type === "arc") {
    const c = rotatePointAroundDeg(shape.cx, shape.cy, ox, oy, deltaDeg);
    shape.cx = c.x; shape.cy = c.y;
    shape.a1 = normalizeRadLocal((Number(shape.a1) || 0) + d);
    shape.a2 = normalizeRadLocal((Number(shape.a2) || 0) + d);
    return;
  }
  if (shape.type === "position") {
    const p = rotatePointAroundDeg(shape.x, shape.y, ox, oy, deltaDeg);
    shape.x = p.x; shape.y = p.y;
    return;
  }
  if (shape.type === "dim") {
    const p1 = rotatePointAroundDeg(shape.x1, shape.y1, ox, oy, deltaDeg);
    const p2 = rotatePointAroundDeg(shape.x2, shape.y2, ox, oy, deltaDeg);
    const pp = rotatePointAroundDeg(shape.px, shape.py, ox, oy, deltaDeg);
    shape.x1 = p1.x; shape.y1 = p1.y;
    shape.x2 = p2.x; shape.y2 = p2.y;
    shape.px = pp.x; shape.py = pp.y;
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "dimchain") {
    if (Array.isArray(shape.points)) {
      shape.points = shape.points.map((pt) => rotatePointAroundDeg(Number(pt?.x), Number(pt?.y), ox, oy, deltaDeg));
    }
    if (Number.isFinite(Number(shape.px)) && Number.isFinite(Number(shape.py))) {
      const pp = rotatePointAroundDeg(shape.px, shape.py, ox, oy, deltaDeg);
      shape.px = pp.x; shape.py = pp.y;
    }
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "circleDim") {
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "dimangle") {
    if (Number.isFinite(Number(shape.cx)) && Number.isFinite(Number(shape.cy))) {
      const cp = rotatePointAroundDeg(shape.cx, shape.cy, ox, oy, deltaDeg);
      shape.cx = cp.x; shape.cy = cp.y;
    }
    shape.a1 = normalizeRadLocal((Number(shape.a1) || 0) + d);
    shape.a2 = normalizeRadLocal((Number(shape.a2) || 0) + d);
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "text") {
    const p = rotatePointAroundDeg(shape.x1, shape.y1, ox, oy, deltaDeg);
    shape.x1 = p.x; shape.y1 = p.y;
    shape.textRotate = (Number(shape.textRotate) || 0) + Number(deltaDeg || 0);
    return;
  }
  if (shape.type === "image") {
    const p = rotatePointAroundDeg(shape.x, shape.y, ox, oy, deltaDeg);
    shape.x = p.x; shape.y = p.y;
    shape.rotationDeg = (Number(shape.rotationDeg) || 0) + Number(deltaDeg || 0);
    return;
  }
  if (shape.type === "bspline") {
    if (Array.isArray(shape.controlPoints)) {
      shape.controlPoints = shape.controlPoints.map((cp) => rotatePointAroundDeg(Number(cp?.x), Number(cp?.y), ox, oy, deltaDeg));
    }
  }
}
