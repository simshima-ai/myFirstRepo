export function getCircleThreePointRefFromShape(shape) {
  if (!shape) return null;
  if (shape.type === "position") {
    return { x: Number(shape.x), y: Number(shape.y), r: 0, shapeId: Number(shape.id), type: "position" };
  }
  if (shape.type === "circle" || shape.type === "arc") {
    return {
      x: Number(shape.cx),
      y: Number(shape.cy),
      r: Math.max(0, Math.abs(Number(shape.r) || 0)),
      shapeId: Number(shape.id),
      type: shape.type
    };
  }
  return null;
}

export function solveCircleBy3CenterRefs(refs, hint = null) {
  if (!Array.isArray(refs) || refs.length !== 3) return null;
  const p1 = refs[0], p2 = refs[1], p3 = refs[2];
  const x1 = Number(p1.x), y1 = Number(p1.y), r1 = Math.max(0, Number(p1.r) || 0);
  const x2 = Number(p2.x), y2 = Number(p2.y), r2 = Math.max(0, Number(p2.r) || 0);
  const x3 = Number(p3.x), y3 = Number(p3.y), r3 = Math.max(0, Number(p3.r) || 0);
  if (![x1, y1, x2, y2, x3, y3, r1, r2, r3].every(Number.isFinite)) return null;

  const A1 = 2 * (x1 - x2), B1 = 2 * (y1 - y2), C1 = 2 * (r2 - r1);
  const A2 = 2 * (x1 - x3), B2 = 2 * (y1 - y3), C2 = 2 * (r3 - r1);
  const D1 = (x1 * x1 + y1 * y1 - r1 * r1) - (x2 * x2 + y2 * y2 - r2 * r2);
  const D2 = (x1 * x1 + y1 * y1 - r1 * r1) - (x3 * x3 + y3 * y3 - r3 * r3);
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-9) return null;

  const ax = (-C1 * B2 + C2 * B1) / det;
  const bx = (D1 * B2 - D2 * B1) / det;
  const ay = (-A1 * C2 + A2 * C1) / det;
  const by = (A1 * D2 - A2 * D1) / det;

  const dx = bx - x1;
  const dy = by - y1;
  const qa = ax * ax + ay * ay - 1;
  const qb = 2 * (ax * dx + ay * dy - r1);
  const qc = dx * dx + dy * dy - r1 * r1;

  const roots = [];
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) < 1e-10) return null;
    roots.push(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < -1e-9) return null;
    const dd = Math.sqrt(Math.max(0, disc));
    roots.push((-qb - dd) / (2 * qa));
    roots.push((-qb + dd) / (2 * qa));
  }

  const candidates = [];
  for (const R of roots) {
    if (!Number.isFinite(R) || R <= 1e-6) continue;
    const cx = ax * R + bx;
    const cy = ay * R + by;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const e1 = Math.abs(Math.hypot(cx - x1, cy - y1) - (R + r1));
    const e2 = Math.abs(Math.hypot(cx - x2, cy - y2) - (R + r2));
    const e3 = Math.abs(Math.hypot(cx - x3, cy - y3) - (R + r3));
    const err = Math.max(e1, e2, e3);
    if (err > 1e-4) continue;
    const h = hint && Number.isFinite(Number(hint.x)) && Number.isFinite(Number(hint.y))
      ? Math.hypot(cx - Number(hint.x), cy - Number(hint.y))
      : R;
    candidates.push({ cx, cy, r: R, score: h });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
}
