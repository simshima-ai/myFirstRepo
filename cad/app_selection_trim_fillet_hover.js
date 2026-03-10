export function createTrimFilletHoverOps(config) {
  const {
    hitTestShapes,
    isLayerVisible,
    segmentIntersectionParamPoint,
    segmentCircleIntersectionPoints,
    circleCircleIntersectionPoints,
    isAngleOnArc,
    arcParamAlong,
    normalizeRad,
    nearestPointOnSegment,
    sampleBSplinePoints,
    getSelectedShapes,
    solveLineLineFillet,
    solveLineCircleFillet,
    solveArcArcFillet
  } = config || {};

  function downsamplePoints(points, maxPoints) {
    const src = Array.isArray(points) ? points : [];
    const maxN = Math.max(2, Math.floor(Number(maxPoints) || 0));
    if (src.length <= maxN) return src.slice();
    const out = [src[0]];
    const bodyCount = maxN - 2;
    const span = src.length - 1;
    for (let i = 1; i <= bodyCount; i++) {
      const idx = Math.max(1, Math.min(src.length - 2, Math.round((i * span) / (bodyCount + 1))));
      out.push(src[idx]);
    }
    out.push(src[src.length - 1]);
    return out;
  }

  function sampleBsplinePolyline(shape, maxPoints = 0) {
    if (!shape || String(shape.type || "") !== "bspline" || typeof sampleBSplinePoints !== "function") return [];
    const sampled = sampleBSplinePoints(shape.controlPoints, Number(shape.degree) || 3);
    const filtered = Array.isArray(sampled) ? sampled.filter((p) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y))) : [];
    if (maxPoints > 0) return downsamplePoints(filtered, maxPoints);
    return filtered;
  }

  function boundsFromPoints(points) {
    const pts = Array.isArray(points) ? points : [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      const x = Number(p?.x), y = Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    return { minX, minY, maxX, maxY };
  }

  function boundsOverlap(a, b, pad = 0) {
    if (!a || !b) return false;
    return !(
      a.maxX < b.minX - pad ||
      a.minX > b.maxX + pad ||
      a.maxY < b.minY - pad ||
      a.minY > b.maxY + pad
    );
  }

  function getShapeBoundsFast(shape, fastMode = false) {
    if (!shape) return null;
    const t = String(shape.type || "").toLowerCase();
    if (t === "line") {
      const x1 = Number(shape.x1), y1 = Number(shape.y1), x2 = Number(shape.x2), y2 = Number(shape.y2);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
      return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
    }
    if (t === "rect") {
      const x1 = Number(shape.x1), y1 = Number(shape.y1), x2 = Number(shape.x2), y2 = Number(shape.y2);
      if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
      return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
    }
    if (t === "circle" || t === "arc") {
      const cx = Number(shape.cx), cy = Number(shape.cy), r = Math.abs(Number(shape.r) || 0);
      if (![cx, cy, r].every(Number.isFinite)) return null;
      return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }
    if (t === "polyline") {
      return boundsFromPoints(shape.points);
    }
    if (t === "bspline") {
      if (fastMode) return null;
      return boundsFromPoints(sampleBsplinePolyline(shape, 96));
    }
    return null;
  }

  function collectLineSegmentIntersectionsWithShape(a1, a2, s) {
    const out = [];
    if (!s) return out;
    const st = String(s.type || "").toLowerCase();
    if (st === "line") {
      const ip = segmentIntersectionParamPoint(a1, a2, { x: Number(s.x1), y: Number(s.y1) }, { x: Number(s.x2), y: Number(s.y2) });
      if (ip) out.push(ip);
      return out;
    }
    if (st === "polyline") {
      const pts = Array.isArray(s.points) ? s.points : [];
      const segCount = Math.max(0, pts.length - 1) + (s.closed ? 1 : 0);
      for (let i = 0; i < segCount; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        const ip = segmentIntersectionParamPoint(a1, a2, { x: Number(p1?.x), y: Number(p1?.y) }, { x: Number(p2?.x), y: Number(p2?.y) });
        if (ip) out.push(ip);
      }
      return out;
    }
    if (st === "bspline") {
      const sampled = sampleBsplinePolyline(s);
      for (let i = 1; i < sampled.length; i++) {
        const ip = segmentIntersectionParamPoint(a1, a2, sampled[i - 1], sampled[i]);
        if (ip) out.push(ip);
      }
      return out;
    }
    if (st === "circle") {
      for (const ip of segmentCircleIntersectionPoints(a1, a2, s)) out.push(ip);
      return out;
    }
    if (st === "arc") {
      for (const ip of segmentCircleIntersectionPoints(a1, a2, s)) {
        const th = Math.atan2(Number(ip.y) - Number(s.cy), Number(ip.x) - Number(s.cx));
        if (isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) out.push(ip);
      }
      return out;
    }
    if (st === "rect") {
      const b1 = { x: Number(s.x1), y: Number(s.y1) };
      const b2 = { x: Number(s.x2), y: Number(s.y1) };
      const b3 = { x: Number(s.x2), y: Number(s.y2) };
      const b4 = { x: Number(s.x1), y: Number(s.y2) };
      [[b1, b2], [b2, b3], [b3, b4], [b4, b1]].forEach(([pA, pB]) => {
        const ip = segmentIntersectionParamPoint(a1, a2, pA, pB);
        if (ip) out.push(ip);
      });
      return out;
    }
    return out;
  }

  function getTrimHoverCandidateForBspline(state, worldRaw, spline, options = null) {
    const fastMode = !!options?.fast;
    const sampled = sampleBsplinePolyline(spline, fastMode ? 96 : 240);
    if (sampled.length < 2) return null;
    const splineBounds = boundsFromPoints(sampled);
    const targetShapes = [];
    for (const s of (state.shapes || [])) {
      if (!s || Number(s.id) === Number(spline.id)) continue;
      if (!isLayerVisible(state, s.layerId)) continue;
      const st = String(s.type || "").toLowerCase();
      if (fastMode && st === "bspline") continue;
      const b = getShapeBoundsFast(s, fastMode);
      if (splineBounds && b && !boundsOverlap(splineBounds, b, 1e-6)) continue;
      targetShapes.push({ shape: s, bounds: b });
    }
    const intersections = [];
    const segCount = sampled.length - 1;
    for (let si = 0; si < segCount; si++) {
      const a1 = sampled[si];
      const a2 = sampled[si + 1];
      const segLen = Math.hypot(Number(a2.x) - Number(a1.x), Number(a2.y) - Number(a1.y));
      if (!(segLen > 1e-12)) continue;
      const segBounds = {
        minX: Math.min(Number(a1.x), Number(a2.x)),
        minY: Math.min(Number(a1.y), Number(a2.y)),
        maxX: Math.max(Number(a1.x), Number(a2.x)),
        maxY: Math.max(Number(a1.y), Number(a2.y)),
      };
      for (const target of targetShapes) {
        if (target.bounds && !boundsOverlap(segBounds, target.bounds, 1e-9)) continue;
        for (const ip of collectLineSegmentIntersectionsWithShape(a1, a2, target.shape)) {
          const segT = Number(ip?.t);
          if (!Number.isFinite(segT)) continue;
          const g = (si + Math.max(0, Math.min(1, segT))) / Math.max(1, segCount);
          intersections.push({ x: Number(ip.x), y: Number(ip.y), g });
        }
      }
    }
    let clickSeg = null;
    for (let si = 0; si < segCount; si++) {
      const a = sampled[si];
      const b = sampled[si + 1];
      const q = nearestPointOnSegment(worldRaw, a, b);
      if (!q) continue;
      const d2 = (Number(worldRaw.x) - Number(q.x)) ** 2 + (Number(worldRaw.y) - Number(q.y)) ** 2;
      if (!clickSeg || d2 < clickSeg.d2) clickSeg = { si, q, d2 };
    }
    if (!clickSeg) return null;
    const clickG = (clickSeg.si + Math.max(0, Math.min(1, Number(clickSeg.q.t) || 0))) / Math.max(1, segCount);
    const cuts = intersections
      .map((p) => Number(p.g))
      .filter((g) => Number.isFinite(g) && g > 1e-6 && g < 1 - 1e-6)
      .sort((a, b) => a - b);
    const dedupCuts = [];
    for (const g of cuts) {
      if (!dedupCuts.length || Math.abs(Number(dedupCuts[dedupCuts.length - 1]) - Number(g)) > 1e-5) dedupCuts.push(g);
    }
    const breaks = [0, ...dedupCuts, 1];
    let k = -1;
    for (let i = 0; i < breaks.length - 1; i++) {
      if (clickG >= Number(breaks[i]) - 1e-7 && clickG <= Number(breaks[i + 1]) + 1e-7) {
        k = i;
        break;
      }
    }
    if (k < 0) return null;
    const g0 = Number(breaks[k]);
    const g1 = Number(breaks[k + 1]);
    if (g1 - g0 < 1e-5) return null;
    const pointAtGlobal = (g) => {
      const clamped = Math.max(0, Math.min(1, Number(g) || 0));
      const idxF = clamped * segCount;
      const idx = Math.max(0, Math.min(segCount - 1, Math.floor(idxF)));
      const t = Math.max(0, Math.min(1, idxF - idx));
      const a = sampled[idx];
      const b = sampled[idx + 1];
      return {
        x: Number(a.x) + (Number(b.x) - Number(a.x)) * t,
        y: Number(a.y) + (Number(b.y) - Number(a.y)) * t,
      };
    };
    const p0 = pointAtGlobal(g0);
    const p1 = pointAtGlobal(g1);
    let mode = "middle";
    if (g0 <= 1e-6 && g1 >= 1 - 1e-6) mode = "delete-line";
    else if (g0 <= 1e-6) mode = "p1";
    else if (g1 >= 1 - 1e-6) mode = "p2";
    const first = sampled[0];
    const last = sampled[sampled.length - 1];
    return {
      targetType: "bspline",
      line: { x1: Number(first.x), y1: Number(first.y), x2: Number(last.x), y2: Number(last.y), layerId: spline.layerId },
      spline,
      sampled,
      mode,
      t0: g0,
      t1: g1,
      x1: p0.x,
      y1: p0.y,
      x2: p1.x,
      y2: p1.y,
      ip1: { x: p0.x, y: p0.y, t: g0 },
      ip2: { x: p1.x, y: p1.y, t: g1 },
      ip: (mode === "p1") ? { x: p1.x, y: p1.y, t: g1 } : { x: p0.x, y: p0.y, t: g0 },
      trimEnd: (mode === "p1") ? "p1" : "p2",
    };
  }

  function getTrimHoverCandidate(state, worldRaw, dom, options = null) {
    const hit = hitTestShapes(state, worldRaw, dom);
    if (!hit) return null;
    if (hit.type === "circle") return getTrimHoverCandidateForCircle(state, worldRaw, hit);
    if (hit.type === "arc") return getTrimHoverCandidateForArc(state, worldRaw, hit);
    if (hit.type === "bspline") return getTrimHoverCandidateForBspline(state, worldRaw, hit, options);
    if (hit.type !== "line") return null;

    const line = hit;
    const a1 = { x: Number(line.x1), y: Number(line.y1) };
    const a2 = { x: Number(line.x2), y: Number(line.y2) };
    const intersections = [];

    for (const s of state.shapes) {
      if (!s || Number(s.id) === Number(line.id)) continue;
      if (!isLayerVisible(state, s.layerId)) continue;
      for (const ip of collectLineSegmentIntersectionsWithShape(a1, a2, s)) intersections.push(ip);
    }

    const cuts = intersections.map(ip => ip.t).filter(t => t > 1e-7 && t < 1 - 1e-7).sort((a, b) => a - b);
    const dedupCuts = [];
    for (const t of cuts) {
      if (dedupCuts.length === 0 || Math.abs(dedupCuts[dedupCuts.length - 1] - t) > 1e-7) dedupCuts.push(t);
    }

    const qClick = nearestPointOnSegment(worldRaw, a1, a2);
    const tClick = Number(qClick.t);
    const breaks = [0, ...dedupCuts, 1];

    let k = -1;
    for (let i = 0; i < breaks.length - 1; i++) {
      if (tClick >= breaks[i] - 1e-7 && tClick <= breaks[i + 1] + 1e-7) {
        k = i;
        break;
      }
    }
    if (k < 0) return null;

    const t0 = breaks[k];
    const t1 = breaks[k + 1];
    if (t1 - t0 < 1e-5) return null;

    const p0 = { x: a1.x + (a2.x - a1.x) * t0, y: a1.y + (a2.y - a1.y) * t0 };
    const p1 = { x: a1.x + (a2.x - a1.x) * t1, y: a1.y + (a2.y - a1.y) * t1 };

    let mode = "middle";
    if (t0 <= 1e-7 && t1 >= 1 - 1e-7) mode = "delete-line";
    else if (t0 <= 1e-7) mode = "p1";
    else if (t1 >= 1 - 1e-7) mode = "p2";

    return {
      targetType: "line", line, mode, t0, t1,
      x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
      ip1: { x: p0.x, y: p0.y, t: t0 }, ip2: { x: p1.x, y: p1.y, t: t1 },
      ip: (mode === "p1") ? { x: p1.x, y: p1.y, t: t1 } : { x: p0.x, y: p0.y, t: t0 },
      trimEnd: (mode === "p1") ? "p1" : "p2"
    };
  }

  function getTrimHoverCandidateForArc(state, worldRaw, arc) {
    const cx = Number(arc.cx), cy = Number(arc.cy), r = Math.abs(Number(arc.r) || 0);
    if (r <= 1e-9) return null;
    const a1Arc = Number(arc.a1) || 0, a2Arc = Number(arc.a2) || 0, ccwArc = (arc.ccw !== false);
    const spanTotal = arcParamAlong(a2Arc, a1Arc, a2Arc, ccwArc) ?? 0;
    if (spanTotal <= 1e-6) return null;

    const thetaClick = normalizeRad(Math.atan2(worldRaw.y - cy, worldRaw.x - cx));
    if (!isAngleOnArc(thetaClick, a1Arc, a2Arc, ccwArc)) return null;
    const clickU = arcParamAlong(thetaClick, a1Arc, a2Arc, ccwArc);

    const ips = [];
    for (const s of state.shapes) {
      if (!s || Number(s.id) === Number(arc.id)) continue;
      if (!isLayerVisible(state, s.layerId)) continue;
      if (s.type === "line") {
        for (const ip of segmentCircleIntersectionPoints({ x: Number(s.x1), y: Number(s.y1) }, { x: Number(s.x2), y: Number(s.y2) }, arc)) {
          const ang = normalizeRad(Math.atan2(ip.y - cy, ip.x - cx));
          if (isAngleOnArc(ang, a1Arc, a2Arc, ccwArc)) {
            const u = arcParamAlong(ang, a1Arc, a2Arc, ccwArc);
            if (u != null) ips.push({ x: ip.x, y: ip.y, ang, u });
          }
        }
      } else if (s.type === "circle" || s.type === "arc") {
        for (const ip of circleCircleIntersectionPoints(arc, Number(arc.r), s, Number(s.r))) {
          const ang = normalizeRad(Math.atan2(ip.y - cy, ip.x - cx));
          if (!isAngleOnArc(ang, a1Arc, a2Arc, ccwArc)) continue;
          if (s.type === "arc") {
            const angCut = normalizeRad(Math.atan2(ip.y - Number(s.cy), ip.x - Number(s.cx)));
            if (!isAngleOnArc(angCut, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) continue;
          }
          const u = arcParamAlong(ang, a1Arc, a2Arc, ccwArc);
          if (u != null) ips.push({ x: ip.x, y: ip.y, ang, u });
        }
      } else if (s.type === "rect") {
        const b1 = { x: Number(s.x1), y: Number(s.y1) };
        const b2 = { x: Number(s.x2), y: Number(s.y1) };
        const b3 = { x: Number(s.x2), y: Number(s.y2) };
        const b4 = { x: Number(s.x1), y: Number(s.y2) };
        [[b1, b2], [b2, b3], [b3, b4], [b4, b1]].forEach(([pA, pB]) => {
          for (const ip of segmentCircleIntersectionPoints(pA, pB, arc)) {
            const ang = normalizeRad(Math.atan2(ip.y - cy, ip.x - cx));
            if (isAngleOnArc(ang, a1Arc, a2Arc, ccwArc)) {
              const u = arcParamAlong(ang, a1Arc, a2Arc, ccwArc);
              if (u != null) ips.push({ x: ip.x, y: ip.y, ang, u });
            }
          }
        });
      }
    }

    const cuts = ips.map(p => p.u).filter(u => u > 1e-7 && u < spanTotal - 1e-7).sort((a, b) => a - b);
    const dedupCuts = [];
    for (const u of cuts) {
      if (dedupCuts.length === 0 || Math.abs(dedupCuts[dedupCuts.length - 1] - u) > 1e-7) dedupCuts.push(u);
    }

    const breaks = [0, ...dedupCuts, spanTotal];
    let k = -1;
    for (let i = 0; i < breaks.length - 1; i++) {
      if (clickU >= breaks[i] - 1e-7 && clickU <= breaks[i + 1] + 1e-7) {
        k = i;
        break;
      }
    }
    if (k < 0) return null;

    const u0 = breaks[k];
    const u1 = breaks[k + 1];
    if (u1 - u0 < 1e-5) return null;

    const aStart = a1Arc;
    const ang0 = ccwArc ? normalizeRad(aStart + u0) : normalizeRad(aStart - u0);
    const ang1 = ccwArc ? normalizeRad(aStart + u1) : normalizeRad(aStart - u1);

    if (u0 <= 1e-7 && u1 >= spanTotal - 1e-7) {
      return { targetType: "arc", arc, mode: "delete-arc" };
    }
    if (u0 <= 1e-7) {
      return {
        targetType: "arc", arc, mode: "arc-remove-arc", x1: cx + Math.cos(a1Arc) * r, y1: cy + Math.sin(a1Arc) * r, x2: cx + Math.cos(ang1) * r, y2: cy + Math.sin(ang1) * r,
        remA1: a1Arc, remA2: ang1, remCCW: ccwArc, keepA1: ang1, keepA2: a2Arc
      };
    }
    if (u1 >= spanTotal - 1e-7) {
      return {
        targetType: "arc", arc, mode: "arc-remove-arc", x1: cx + Math.cos(ang0) * r, y1: cy + Math.sin(ang0) * r, x2: cx + Math.cos(a2Arc) * r, y2: cy + Math.sin(a2Arc) * r,
        remA1: ang0, remA2: a2Arc, remCCW: ccwArc, keepA1: a1Arc, keepA2: ang0
      };
    }
    return {
      targetType: "arc", arc, mode: "arc-remove-middle", x1: cx + Math.cos(ang0) * r, y1: cy + Math.sin(ang0) * r, x2: cx + Math.cos(ang1) * r, y2: cy + Math.sin(ang1) * r,
      remA1: ang0, remA2: ang1, remCCW: ccwArc, keepCCW: ccwArc, keep1A1: a1Arc, keep1A2: ang0, keep2A1: ang1, keep2A2: a2Arc
    };
  }

  function getTrimHoverCandidateForCircle(state, worldRaw, circle) {
    const cx = Number(circle.cx), cy = Number(circle.cy), r = Math.abs(Number(circle.r) || 0);
    if (r <= 1e-9) return null;
    const thetaClick = normalizeRad(Math.atan2(worldRaw.y - cy, worldRaw.x - cx));
    const ips = [];
    for (const s of state.shapes) {
      if (!s || Number(s.id) === Number(circle.id)) continue;
      if (!isLayerVisible(state, s.layerId)) continue;
      if (s.type === "line") {
        for (const ip of segmentCircleIntersectionPoints({ x: Number(s.x1), y: Number(s.y1) }, { x: Number(s.x2), y: Number(s.y2) }, circle)) {
          ips.push({ x: ip.x, y: ip.y, ang: normalizeRad(Math.atan2(ip.y - cy, ip.x - cx)) });
        }
      } else if (s.type === "circle" || s.type === "arc") {
        for (const ip of circleCircleIntersectionPoints(circle, Number(circle.r), s, Number(s.r))) {
          const ang = normalizeRad(Math.atan2(ip.y - cy, ip.x - cx));
          if (s.type === "arc") {
            if (!isAngleOnArc(normalizeRad(Math.atan2(ip.y - Number(s.cy), ip.x - Number(s.cx))), Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) continue;
          }
          ips.push({ x: ip.x, y: ip.y, ang });
        }
      } else if (s.type === "rect") {
        const b1 = { x: Number(s.x1), y: Number(s.y1) };
        const b2 = { x: Number(s.x2), y: Number(s.y1) };
        const b3 = { x: Number(s.x2), y: Number(s.y2) };
        const b4 = { x: Number(s.x1), y: Number(s.y2) };
        [[b1, b2], [b2, b3], [b3, b4], [b4, b1]].forEach(([pA, pB]) => {
          for (const ip of segmentCircleIntersectionPoints(pA, pB, circle)) {
            ips.push({ x: ip.x, y: ip.y, ang: normalizeRad(Math.atan2(ip.y - cy, ip.x - cx)) });
          }
        });
      }
    }
    if (ips.length < 2) return null;
    ips.sort((p, q) => p.ang - q.ang);
    const dedup = [];
    for (const p of ips) {
      const last = dedup[dedup.length - 1];
      if (last) {
        const diff = Math.abs(last.ang - p.ang);
        if (Math.min(diff, Math.PI * 2 - diff) <= 1e-7) continue;
      }
      dedup.push(p);
    }
    if (dedup.length >= 2) {
      const diff = Math.abs(dedup[dedup.length - 1].ang - dedup[0].ang);
      if (Math.min(diff, Math.PI * 2 - diff) <= 1e-7) dedup.pop();
    }
    if (dedup.length < 2) return null;
    let prev = dedup[dedup.length - 1], next = dedup[0];
    for (const p of dedup) {
      if (p.ang <= thetaClick + 1e-9) prev = p;
      if (p.ang >= thetaClick - 1e-9) { next = p; break; }
    }
    const angDiff = Math.abs(prev.ang - next.ang);
    if (Math.min(angDiff, Math.PI * 2 - angDiff) <= 1e-7) return null;
    const removedSpan = ((next.ang - prev.ang) + Math.PI * 2) % (Math.PI * 2);
    if (removedSpan < 1e-5) return null;
    return { targetType: "circle", circle, mode: "arc-remove-arc", x1: prev.x, y1: prev.y, x2: next.x, y2: next.y, remA1: prev.ang, remA2: next.ang, keepA1: next.ang, keepA2: prev.ang };
  }

  function getTrimDeleteOnlyHoverCandidate(state, worldRaw, dom) {
    const hit = hitTestShapes(state, worldRaw, dom);
    if (!hit || hit.type !== "line") return null;
    const line = hit, a1 = { x: Number(line.x1), y: Number(line.y1) }, a2 = { x: Number(line.x2), y: Number(line.y2) };
    for (const s of state.shapes) {
      if (!s || Number(s.id) === Number(line.id)) continue;
      if (!isLayerVisible(state, s.layerId)) continue;
      if (s.type === "line") {
        if (segmentIntersectionParamPoint(a1, a2, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 })) return null;
      } else if (s.type === "circle") {
        if (segmentCircleIntersectionPoints(a1, a2, s).length) return null;
      } else if (s.type === "arc") {
        const ips = segmentCircleIntersectionPoints(a1, a2, s);
        for (const ip of ips) {
          if (isAngleOnArc(Math.atan2(ip.y - s.cy, ip.x - s.cx), s.a1 || 0, s.a2 || 0, s.ccw !== false)) return null;
        }
      }
    }
    return { line, mode: "delete-line" };
  }

  function getFilletHoverCandidate(state, worldRaw) {
    if (state.tool !== "fillet") return null;
    const r = Number(state.filletSettings?.radius) || 20;
    const sel = getSelectedShapes(state);
    if (sel.length !== 2) return null;
    const t1 = sel[0].type, t2 = sel[1].type;
    if (t1 === "line" && t2 === "line") {
      const sol = solveLineLineFillet(sel[0], sel[1], r, worldRaw);
      if (!sol.ok) return null;
      return { mode: "line-line", arc: sol.arc, points: [sol.t1, sol.t2], sol };
    }
    if ((t1 === "line" && (t2 === "circle" || t2 === "arc")) || ((t1 === "circle" || t1 === "arc") && t2 === "line")) {
      const line = (t1 === "line") ? sel[0] : sel[1];
      const circ = (t1 !== "line") ? sel[0] : sel[1];
      const sol = solveLineCircleFillet(line, circ, r, worldRaw);
      if (!sol.ok) return null;
      return { mode: "line-circle", arc: sol.arc, points: [sol.tLine, sol.tCircle], sol };
    }
    if (t1 === "arc" && t2 === "arc") {
      const sol = solveArcArcFillet(sel[0], sel[1], r, worldRaw);
      if (!sol.ok) return null;
      return { mode: "arc-arc", arc: sol.arc, points: [sol.t1, sol.t2], sol };
    }
    return null;
  }

  return {
    getTrimHoverCandidate,
    getTrimHoverCandidateForArc,
    getTrimHoverCandidateForCircle,
    getTrimDeleteOnlyHoverCandidate,
    getFilletHoverCandidate
  };
}
