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
    getSelectedShapes,
    solveLineLineFillet,
    solveLineCircleFillet,
    solveArcArcFillet
  } = config || {};

  function getTrimHoverCandidate(state, worldRaw, dom) {
    const hit = hitTestShapes(state, worldRaw, dom);
    if (!hit) return null;
    if (hit.type === "circle") return getTrimHoverCandidateForCircle(state, worldRaw, hit);
    if (hit.type === "arc") return getTrimHoverCandidateForArc(state, worldRaw, hit);
    if (hit.type !== "line") return null;

    const line = hit;
    const a1 = { x: Number(line.x1), y: Number(line.y1) };
    const a2 = { x: Number(line.x2), y: Number(line.y2) };
    const intersections = [];

    for (const s of state.shapes) {
      if (!s || Number(s.id) === Number(line.id)) continue;
      if (!isLayerVisible(state, s.layerId)) continue;
      if (s.type === "line") {
        const ip = segmentIntersectionParamPoint(a1, a2, { x: Number(s.x1), y: Number(s.y1) }, { x: Number(s.x2), y: Number(s.y2) });
        if (ip) intersections.push(ip);
      } else if (s.type === "circle") {
        for (const ip of segmentCircleIntersectionPoints(a1, a2, s)) intersections.push(ip);
      } else if (s.type === "arc") {
        for (const ip of segmentCircleIntersectionPoints(a1, a2, s)) {
          const th = Math.atan2(Number(ip.y) - Number(s.cy), Number(ip.x) - Number(s.cx));
          if (isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) intersections.push(ip);
        }
      } else if (s.type === "rect") {
        const b1 = { x: Number(s.x1), y: Number(s.y1) };
        const b2 = { x: Number(s.x2), y: Number(s.y1) };
        const b3 = { x: Number(s.x2), y: Number(s.y2) };
        const b4 = { x: Number(s.x1), y: Number(s.y2) };
        [[b1, b2], [b2, b3], [b3, b4], [b4, b1]].forEach(([pA, pB]) => {
          const ip = segmentIntersectionParamPoint(a1, a2, pA, pB);
          if (ip) intersections.push(ip);
        });
      }
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
