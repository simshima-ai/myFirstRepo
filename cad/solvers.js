import { isLayerVisible } from "./state.js";

export function normalizeRad(a) {
    let x = Number(a) || 0;
    while (x < 0) x += Math.PI * 2;
    while (x >= Math.PI * 2) x -= Math.PI * 2;
    return x;
}

const ARC_ANGLE_EPS = 1e-6;
const SEGMENT_PARAM_EPS = 1e-6;

export function isAngleOnArc(theta, a1, a2, ccw, eps = ARC_ANGLE_EPS) {
    theta = normalizeRad(theta); a1 = normalizeRad(a1); a2 = normalizeRad(a2);
    if (ccw) {
        const span = ((a2 - a1) + Math.PI * 2) % (Math.PI * 2);
        const rel = ((theta - a1) + Math.PI * 2) % (Math.PI * 2);
        return rel <= span + eps;
    }
    const span = ((a1 - a2) + Math.PI * 2) % (Math.PI * 2);
    const rel = ((a1 - theta) + Math.PI * 2) % (Math.PI * 2);
    return rel <= span + eps;
}

export function arcParamAlong(theta, a1, a2, ccw, eps = ARC_ANGLE_EPS) {
    theta = normalizeRad(theta); a1 = normalizeRad(a1); a2 = normalizeRad(a2);
    if (ccw) {
        const span = ((a2 - a1) + Math.PI * 2) % (Math.PI * 2);
        const rel = ((theta - a1) + Math.PI * 2) % (Math.PI * 2);
        if (rel <= span + eps) return rel;
        return null;
    }
    const span = ((a1 - a2) + Math.PI * 2) % (Math.PI * 2);
    const rel = ((a1 - theta) + Math.PI * 2) % (Math.PI * 2);
    if (rel <= span + eps) return rel;
    return null;
}

/**
 * Compute the two tangent points on a circle from an external fixed point.
 * Tangent condition: (tangentPt - center) ⊥ (tangentPt - fixedPt)
 * i.e., the line segment fixedPt→tangentPt is tangent to the circle at tangentPt.
 * Returns [] if fixedPt is inside or on the circle.
 */
export function solveTangentSnapPoints(fixedPt, cx, cy, r) {
    const dx = cx - fixedPt.x;
    const dy = cy - fixedPt.y;
    const d = Math.hypot(dx, dy);
    if (d <= r + 1e-9) return []; // fixedPt is inside or on the circle
    const phi = Math.atan2(dy, dx);
    // cos(θ - phi) = -r/d  →  θ = phi ± arccos(-r/d)
    const alpha = Math.acos(-r / d); // in (π/2, π] since d > r > 0
    const th1 = phi + alpha;
    const th2 = phi - alpha;
    return [
        { x: cx + r * Math.cos(th1), y: cy + r * Math.sin(th1) },
        { x: cx + r * Math.cos(th2), y: cy + r * Math.sin(th2) },
    ];
}

export function angleDegFromOrigin(origin, p) {
    return Math.atan2(p.y - origin.y, p.x - origin.x) * 180 / Math.PI;
}

export function rotatePointAround(px, py, ox, oy, deg) {
    const r = deg * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r);
    const x = px - ox, y = py - oy;
    return { x: ox + x * c - y * s, y: oy + x * s + y * c };
}

export function segmentIntersectionPoint(a1, a2, b1, b2) {
    const r = { x: a2.x - a1.x, y: a2.y - a1.y };
    const s = { x: b2.x - b1.x, y: b2.y - b1.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-12) return null;
    const qp = { x: b1.x - a1.x, y: b1.y - a1.y };
    const t = (qp.x * s.y - qp.y * s.x) / den;
    const u = (qp.x * r.y - qp.y * r.x) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return { x: a1.x + r.x * t, y: a1.y + r.y * t };
}

export function segmentIntersectionParamPoint(a1, a2, b1, b2) {
    const r = { x: a2.x - a1.x, y: a2.y - a1.y };
    const s = { x: b2.x - b1.x, y: b2.y - b1.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-12) return null;
    const qp = { x: b1.x - a1.x, y: b1.y - a1.y };
    const t = (qp.x * s.y - qp.y * s.x) / den;
    const u = (qp.x * r.y - qp.y * r.x) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return { x: a1.x + r.x * t, y: a1.y + r.y * t, t, u };
}

export function segmentCircleIntersectionPoints(a1, a2, circle) {
    const x1 = Number(a1.x), y1 = Number(a1.y);
    const x2 = Number(a2.x), y2 = Number(a2.y);
    const cx = Number(circle.cx), cy = Number(circle.cy), r = Math.abs(Number(circle.r || 0));
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-12 || r <= 1e-12) return [];
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < -1e-9) return [];
    const out = [];
    const pushParam = (tRaw) => {
        if (!Number.isFinite(tRaw)) return;
        if (tRaw < -SEGMENT_PARAM_EPS || tRaw > 1 + SEGMENT_PARAM_EPS) return;
        const t = Math.max(0, Math.min(1, tRaw));
        const x = x1 + dx * t;
        const y = y1 + dy * t;
        for (const p of out) {
            if (Math.hypot(Number(p.x) - x, Number(p.y) - y) <= 1e-7) return;
        }
        out.push({ x, y, t });
    };
    if (Math.abs(disc) <= 1e-9) {
        pushParam(-b / (2 * a));
        return out;
    }
    const sdisc = Math.sqrt(Math.max(0, disc));
    const t1 = (-b - sdisc) / (2 * a);
    const t2 = (-b + sdisc) / (2 * a);
    pushParam(t1);
    pushParam(t2);
    return out;
}

export function chooseTrimSideForIntersectionByT(tClick, ip) {
    return (tClick <= Number(ip.t)) ? "p1" : "p2";
}

export function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

export function lineInfiniteIntersection(a1, a2, b1, b2) {
    const r = { x: a2.x - a1.x, y: a2.y - a1.y };
    const s = { x: b2.x - b1.x, y: b2.y - b1.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-12) return null;
    const qp = { x: b1.x - a1.x, y: b1.y - a1.y };
    const t = (qp.x * s.y - qp.y * s.x) / den;
    const u = (qp.x * r.y - qp.y * r.x) / den;
    return { x: a1.x + r.x * t, y: a1.y + r.y * t, t, u };
}

export function lineCircleInfiniteIntersectionPoints(a1, a2, circleLike, radiusOverride = null) {
    const x1 = Number(a1.x), y1 = Number(a1.y);
    const x2 = Number(a2.x), y2 = Number(a2.y);
    const cx = Number(circleLike.cx), cy = Number(circleLike.cy);
    const r = Math.abs(radiusOverride == null ? Number(circleLike.r || 0) : Number(radiusOverride));
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-12 || r <= 1e-12) return [];
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < -1e-9) return [];
    const out = [];
    if (Math.abs(disc) <= 1e-9) {
        const t = -b / (2 * a);
        out.push({ x: x1 + dx * t, y: y1 + dy * t, t });
        return out;
    }
    const sdisc = Math.sqrt(Math.max(0, disc));
    const t1 = (-b - sdisc) / (2 * a);
    const t2 = (-b + sdisc) / (2 * a);
    out.push({ x: x1 + dx * t1, y: y1 + dy * t1, t: t1 });
    if (Math.abs(t2 - t1) > 1e-9) out.push({ x: x1 + dx * t2, y: y1 + dy * t2, t: t2 });
    return out;
}

export function circleCircleIntersectionPoints(c1, r1Input, c2, r2Input) {
    const x1 = Number(c1.cx), y1 = Number(c1.cy);
    const x2 = Number(c2.cx), y2 = Number(c2.cy);
    const r1 = Math.abs(Number(r1Input));
    const r2 = Math.abs(Number(r2Input));
    if (!(r1 > 1e-9) || !(r2 > 1e-9)) return [];
    const dx = x2 - x1, dy = y2 - y1;
    const d = Math.hypot(dx, dy);
    if (d <= 1e-9) return [];
    if (d > r1 + r2 + 1e-9) return [];
    if (d < Math.abs(r1 - r2) - 1e-9) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h2 = r1 * r1 - a * a;
    if (h2 < -1e-9) return [];
    const h = Math.sqrt(Math.max(0, h2));
    const ux = dx / d, uy = dy / d;
    const px = x1 + ux * a, py = y1 + uy * a;
    const rx = -uy * h, ry = ux * h;
    const out = [{ x: px + rx, y: py + ry }];
    if (h > 1e-9) out.push({ x: px - rx, y: py - ry });
    return out;
}

export function nearestPointOnSegment(p, a, b) {
    const vx = Number(b.x) - Number(a.x);
    const vy = Number(b.y) - Number(a.y);
    const wx = Number(p.x) - Number(a.x);
    const wy = Number(p.y) - Number(a.y);
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-12) return { x: Number(a.x), y: Number(a.y) };
    let t = (wx * vx + wy * vy) / vv;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return { x: Number(a.x) + vx * t, y: Number(a.y) + vy * t, t };
}

export function distancePointToSegment(p, a, b) {
    const np = nearestPointOnSegment(p, a, b);
    return Math.hypot(p.x - np.x, p.y - np.y);
}

export function nearestPointOnArc(p, arc) {
    const cx = Number(arc.cx), cy = Number(arc.cy), r = Math.abs(Number(arc.r) || 0);
    const a1 = Number(arc.a1) || 0, a2 = Number(arc.a2) || 0, ccw = arc.ccw !== false;
    const dx = p.x - cx, dy = p.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) {
        // center; pick a1 as fallback
        return { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    }
    const theta = Math.atan2(dy, dx);
    if (isAngleOnArc(theta, a1, a2, ccw)) {
        return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
    }
    const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    const p2 = { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
    const d1 = Math.hypot(p.x - p1.x, p.y - p1.y);
    const d2 = Math.hypot(p.x - p2.x, p.y - p2.y);
    return d1 <= d2 ? p1 : p2;
}

export function chooseTrimAndKeepEndsForLine(line, ip) {
    const p1 = { x: Number(line.x1), y: Number(line.y1) };
    const p2 = { x: Number(line.x2), y: Number(line.y2) };
    const d1 = Math.hypot(p1.x - ip.x, p1.y - ip.y);
    const d2 = Math.hypot(p2.x - ip.x, p2.y - ip.y);
    if (d1 <= d2) {
        return { trimEnd: "p1", trimPoint: p1, keepEnd: "p2", keepPoint: p2, keepLen: d2 };
    }
    return { trimEnd: "p2", trimPoint: p2, keepEnd: "p1", keepPoint: p1, keepLen: d1 };
}

export function chooseEndsForLineByKeepEnd(line, ip, keepEnd) {
    const p1 = { x: Number(line.x1), y: Number(line.y1) };
    const p2 = { x: Number(line.x2), y: Number(line.y2) };
    if (keepEnd === "p1") {
        return { trimEnd: "p2", trimPoint: p2, keepEnd: "p1", keepPoint: p1, keepLen: Math.hypot(p1.x - ip.x, p1.y - ip.y) };
    }
    return { trimEnd: "p1", trimPoint: p1, keepEnd: "p2", keepPoint: p2, keepLen: Math.hypot(p2.x - ip.x, p2.y - ip.y) };
}

export function createArcFromFillet(center, radius, t1, t2) {
    const a1 = normalizeRad(Math.atan2(t1.y - center.y, t1.x - center.x));
    const a2 = normalizeRad(Math.atan2(t2.y - center.y, t2.x - center.x));
    const v1 = { x: t1.x - center.x, y: t1.y - center.y };
    const v2 = { x: t2.x - center.x, y: t2.y - center.y };
    const cross = v1.x * v2.y - v1.y * v2.x;
    const tau = Math.PI * 2;
    const ccwSpan = ((a2 - a1) + tau) % tau;
    const cwSpan = ((a1 - a2) + tau) % tau;
    let ccw = cross >= 0;
    // Fillet arc should always be the shorter arc between tangent points.
    if ((ccw ? ccwSpan : cwSpan) > Math.PI) ccw = !ccw;
    return {
        type: "arc",
        cx: center.x,
        cy: center.y,
        r: radius,
        a1,
        a2,
        ccw,
    };
}

export function solveLineLineFilletWithEnds(l1, l2, radiusInput, keepEnd1, keepEnd2) {
    const radius = Math.abs(Number(radiusInput));
    if (!(radius > 0)) return { ok: false, reason: "Fillet radius must be > 0" };
    const a1 = { x: Number(l1.x1), y: Number(l1.y1) };
    const a2 = { x: Number(l1.x2), y: Number(l1.y2) };
    const b1 = { x: Number(l2.x1), y: Number(l2.y1) };
    const b2 = { x: Number(l2.x2), y: Number(l2.y2) };
    const ip = lineInfiniteIntersection(a1, a2, b1, b2);
    if (!ip) return { ok: false, reason: "Fillet failed: lines are parallel" };
    const e1 = chooseEndsForLineByKeepEnd(l1, ip, keepEnd1);
    const e2 = chooseEndsForLineByKeepEnd(l2, ip, keepEnd2);
    const d1v = { x: e1.keepPoint.x - ip.x, y: e1.keepPoint.y - ip.y };
    const d2v = { x: e2.keepPoint.x - ip.x, y: e2.keepPoint.y - ip.y };
    const d1len = Math.hypot(d1v.x, d1v.y);
    const d2len = Math.hypot(d2v.x, d2v.y);
    if (d1len <= 1e-9 || d2len <= 1e-9) return { ok: false, reason: "Fillet failed: no room near intersection" };
    const d1 = { x: d1v.x / d1len, y: d1v.y / d1len };
    const d2 = { x: d2v.x / d2len, y: d2v.y / d2len };
    const dot = clamp01((d1.x * d2.x + d1.y * d2.y + 1) / 2) * 2 - 1;
    const phi = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (!(phi > 1e-6 && phi < Math.PI - 1e-6)) return { ok: false, reason: "Fillet failed: invalid angle" };
    const distToTangent = radius / Math.tan(phi * 0.5);
    if (!(distToTangent > 0) || distToTangent > d1len + 1e-9 || distToTangent > d2len + 1e-9) {
        return { ok: false, reason: "Fillet failed: radius too large" };
    }
    const t1 = { x: ip.x + d1.x * distToTangent, y: ip.y + d1.y * distToTangent };
    const t2 = { x: ip.x + d2.x * distToTangent, y: ip.y + d2.y * distToTangent };
    const bis = { x: d1.x + d2.x, y: d1.y + d2.y };
    const bisLen = Math.hypot(bis.x, bis.y);
    if (bisLen <= 1e-9) return { ok: false, reason: "Fillet failed: degenerate bisector" };
    const centerDist = radius / Math.sin(phi * 0.5);
    const center = { x: ip.x + (bis.x / bisLen) * centerDist, y: ip.y + (bis.y / bisLen) * centerDist };
    const arc = createArcFromFillet(center, radius, t1, t2);
    const midAng = (() => {
        const a1 = Number(arc.a1) || 0, a2 = Number(arc.a2) || 0, ccw = arc.ccw !== false;
        const span = ccw ? (((a2 - a1) + Math.PI * 2) % (Math.PI * 2)) : (((a1 - a2) + Math.PI * 2) % (Math.PI * 2));
        return ccw ? normalizeRad(a1 + span * 0.5) : normalizeRad(a1 - span * 0.5);
    })();
    const arcMid = { x: center.x + Math.cos(midAng) * radius, y: center.y + Math.sin(midAng) * radius };
    return { ok: true, radius, center, t1, t2, e1, e2, arc, ip, arcMid, keepEnd1, keepEnd2 };
}

export function solveLineLineFillet(l1, l2, radiusInput, worldHint = null) {
    const candidates = [];
    for (const k1 of ["p1", "p2"]) {
        for (const k2 of ["p1", "p2"]) {
            const sol = solveLineLineFilletWithEnds(l1, l2, radiusInput, k1, k2);
            if (sol.ok) candidates.push(sol);
        }
    }
    if (!candidates.length) return { ok: false, reason: "Fillet failed" };
    if (!worldHint) return candidates[0];
    let best = candidates[0];
    let bestD = Infinity;
    for (const c of candidates) {
        const d1 = Math.hypot(worldHint.x - c.arcMid.x, worldHint.y - c.arcMid.y);
        const d2 = Math.hypot(worldHint.x - c.center.x, worldHint.y - c.center.y) * 0.25;
        const d = d1 + d2;
        if (d < bestD) { bestD = d; best = c; }
    }
    return best;
}

export function solveLineCircleFilletWithEnds(line, circle, radiusInput, keepEnd, worldHint = null) {
    const radius = Math.abs(Number(radiusInput));
    if (!(radius > 0)) return { ok: false, reason: "Fillet radius must be > 0" };
    const a1 = { x: Number(line.x1), y: Number(line.y1) };
    const a2 = { x: Number(line.x2), y: Number(line.y2) };
    const d = { x: a2.x - a1.x, y: a2.y - a1.y };
    const dLen = Math.hypot(d.x, d.y);
    if (dLen <= 1e-9) return { ok: false, reason: "Fillet failed: line too short" };
    const u = { x: d.x / dLen, y: d.y / dLen };
    const n0 = { x: -u.y, y: u.x };
    const e = chooseEndsForLineByKeepEnd(line, { x: 0, y: 0 }, keepEnd); // keep/trim labels only
    const p1 = { x: Number(line.x1), y: Number(line.y1) };
    const p2 = { x: Number(line.x2), y: Number(line.y2) };
    const allIntersections = (() => {
        const raw = lineCircleInfiniteIntersectionPoints(a1, a2, circle, Math.abs(Number(circle.r || 0)));
        const filtered = raw.filter((ip) => {
            if (circle.type !== "arc") return true;
            const th = normalizeRad(Math.atan2(ip.y - Number(circle.cy), ip.x - Number(circle.cx)));
            return isAngleOnArc(th, Number(circle.a1) || 0, Number(circle.a2) || 0, circle.ccw !== false);
        });
        const onSeg = filtered.filter((ip) => Number(ip.t) >= -1e-9 && Number(ip.t) <= 1 + 1e-9);
        return (onSeg.length ? onSeg : filtered).map((ip) => ({ x: Number(ip.x), y: Number(ip.y) }));
    })();
    const candidates = [];
    for (const lineSide of [1, -1]) {
        const n = { x: n0.x * lineSide, y: n0.y * lineSide };
        const oa1 = { x: a1.x + n.x * radius, y: a1.y + n.y * radius };
        const oa2 = { x: a2.x + n.x * radius, y: a2.y + n.y * radius };
        for (const circleMode of [1, -1]) {
            const roff = Math.abs(Number(circle.r || 0)) + circleMode * radius;
            if (!(roff > 1e-9)) continue;
            const centers = lineCircleInfiniteIntersectionPoints(oa1, oa2, circle, roff);
            for (const c of centers) {
                const tLine = ((c.x - a1.x) * d.x + (c.y - a1.y) * d.y) / (dLen * dLen);
                if (tLine < -1e-9 || tLine > 1 + 1e-9) continue;
                if (e.trimEnd === "p1" && tLine >= 1 - 1e-9) continue;
                if (e.trimEnd === "p2" && tLine <= 1e-9) continue;
                const pLine = { x: a1.x + d.x * tLine, y: a1.y + d.y * tLine, t: tLine };
                const vc = { x: c.x - Number(circle.cx), y: c.y - Number(circle.cy) };
                const vcLen = Math.hypot(vc.x, vc.y);
                if (vcLen <= 1e-9) continue;
                const uc = { x: vc.x / vcLen, y: vc.y / vcLen };
                const pCirc = {
                    x: Number(circle.cx) + uc.x * Math.abs(Number(circle.r || 0)),
                    y: Number(circle.cy) + uc.y * Math.abs(Number(circle.r || 0)),
                };
                if (circle.type === "arc") {
                    const th = normalizeRad(Math.atan2(pCirc.y - Number(circle.cy), pCirc.x - Number(circle.cx)));
                    if (!isAngleOnArc(th, Number(circle.a1) || 0, Number(circle.a2) || 0, circle.ccw !== false)) continue;
                }
                const arc = createArcFromFillet({ x: c.x, y: c.y }, radius, pLine, pCirc);
                const tangentGap = Math.hypot(Number(pLine.x) - Number(pCirc.x), Number(pLine.y) - Number(pCirc.y));
                if (!(tangentGap > 1e-6)) continue;
                const midAng = (() => {
                    const aa1 = Number(arc.a1) || 0, aa2 = Number(arc.a2) || 0, ccw = arc.ccw !== false;
                    const span = ccw ? (((aa2 - aa1) + Math.PI * 2) % (Math.PI * 2)) : (((aa1 - aa2) + Math.PI * 2) % (Math.PI * 2));
                    return ccw ? normalizeRad(aa1 + span * 0.5) : normalizeRad(aa1 - span * 0.5);
                })();
                {
                    const aa1 = Number(arc.a1) || 0, aa2 = Number(arc.a2) || 0, ccw = arc.ccw !== false;
                    const span = ccw ? (((aa2 - aa1) + Math.PI * 2) % (Math.PI * 2)) : (((aa1 - aa2) + Math.PI * 2) % (Math.PI * 2));
                    if (!(span > 1e-5 && span < Math.PI * 2 - 1e-5)) continue;
                }
                const arcMid = { x: c.x + Math.cos(midAng) * radius, y: c.y + Math.sin(midAng) * radius };
                let sharedIntersection = null;
                let sharedD = 0;
                if (allIntersections.length) {
                    let bestI = allIntersections[0];
                    let bestD = Math.hypot(arcMid.x - bestI.x, arcMid.y - bestI.y);
                    for (let ii = 1; ii < allIntersections.length; ii++) {
                        const ip = allIntersections[ii];
                        const dI = Math.hypot(arcMid.x - ip.x, arcMid.y - ip.y);
                        if (dI < bestD) {
                            bestD = dI;
                            bestI = ip;
                        }
                    }
                    sharedIntersection = bestI;
                    sharedD = bestD;
                }
                const desiredKeepEnd = sharedIntersection
                    ? ((Math.hypot(sharedIntersection.x - p1.x, sharedIntersection.y - p1.y) <= Math.hypot(sharedIntersection.x - p2.x, sharedIntersection.y - p2.y)) ? "p2" : "p1")
                    : keepEnd;
                let arcCutKey = null;
                if (circle.type === "arc") {
                    const cxArc = Number(circle.cx), cyArc = Number(circle.cy), rArc = Math.abs(Number(circle.r || 0));
                    if (rArc > 1e-9) {
                        const aArc1 = Number(circle.a1) || 0;
                        const aArc2 = Number(circle.a2) || 0;
                        const ep1 = { x: cxArc + Math.cos(aArc1) * rArc, y: cyArc + Math.sin(aArc1) * rArc };
                        const ep2 = { x: cxArc + Math.cos(aArc2) * rArc, y: cyArc + Math.sin(aArc2) * rArc };
                        const epsConn = Math.max(1e-4, dLen * 1e-5);
                        const d11 = Math.hypot(ep1.x - p1.x, ep1.y - p1.y);
                        const d12 = Math.hypot(ep1.x - p2.x, ep1.y - p2.y);
                        const d21 = Math.hypot(ep2.x - p1.x, ep2.y - p1.y);
                        const d22 = Math.hypot(ep2.x - p2.x, ep2.y - p2.y);
                        const c1 = Math.min(d11, d12) <= epsConn;
                        const c2 = Math.min(d21, d22) <= epsConn;
                        if (c1 && !c2) arcCutKey = "a1";
                        else if (c2 && !c1) arcCutKey = "a2";
                        else if (sharedIntersection) {
                            const sd1 = Math.hypot(sharedIntersection.x - ep1.x, sharedIntersection.y - ep1.y);
                            const sd2 = Math.hypot(sharedIntersection.x - ep2.x, sharedIntersection.y - ep2.y);
                            arcCutKey = (sd1 <= sd2) ? "a1" : "a2";
                        } else {
                            const th = Math.atan2(Number(pCirc.y) - cyArc, Number(pCirc.x) - cxArc);
                            const ad1 = Math.abs(Math.atan2(Math.sin(th - aArc1), Math.cos(th - aArc1)));
                            const ad2 = Math.abs(Math.atan2(Math.sin(th - aArc2), Math.cos(th - aArc2)));
                            arcCutKey = (ad1 <= ad2) ? "a1" : "a2";
                        }
                    }
                }
                let score = sharedD;
                if (desiredKeepEnd !== keepEnd) score += 1e6;
                if (worldHint) {
                    const trimSegD = distancePointToSegment(worldHint, e.trimPoint, pLine);
                    const dMid = Math.hypot(worldHint.x - arcMid.x, worldHint.y - arcMid.y);
                    const dCenter = Math.hypot(worldHint.x - c.x, worldHint.y - c.y) * 0.2;
                    score += trimSegD * 4 + dMid + dCenter;
                }
                candidates.push({
                    ok: true,
                    mode: "line-circle",
                    radius,
                    line,
                    circle,
                    center: { x: c.x, y: c.y },
                    tLine: pLine,
                    tCircle: pCirc,
                    arc,
                    arcMid,
                    sharedIntersection,
                    desiredKeepEnd,
                    arcCutKey,
                    e,
                    keepEnd,
                    score,
                    trimSegD: worldHint ? distancePointToSegment(worldHint, e.trimPoint, pLine) : 0,
                });
            }
        }
    }
    if (!candidates.length) return { ok: false, reason: "Fillet failed" };
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0];
}

export function solveLineCircleFillet(line, circle, radiusInput, worldHint = null) {
    const candidates = [];
    for (const keepEnd of ["p1", "p2"]) {
        const sol = solveLineCircleFilletWithEnds(line, circle, radiusInput, keepEnd, worldHint);
        if (sol.ok) candidates.push(sol);
    }
    if (!candidates.length) return { ok: false, reason: "Fillet failed" };
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0];
}

export function solveArcArcFillet(arc1, arc2, radiusInput, worldHint = null) {
    const radius = Math.abs(Number(radiusInput));
    if (!(radius > 0)) return { ok: false, reason: "Fillet radius must be > 0" };
    const r1 = Math.abs(Number(arc1.r) || 0);
    const r2 = Math.abs(Number(arc2.r) || 0);
    if (!(r1 > 1e-9) || !(r2 > 1e-9)) return { ok: false, reason: "Fillet failed: invalid arc radius" };
    const candidates = [];
    for (const m1 of [1, -1]) {
        const ro1 = r1 + m1 * radius;
        if (!(ro1 > 1e-9)) continue;
        for (const m2 of [1, -1]) {
            const ro2 = r2 + m2 * radius;
            if (!(ro2 > 1e-9)) continue;
            const centers = circleCircleIntersectionPoints(arc1, ro1, arc2, ro2);
            for (const c of centers) {
                const v1 = { x: c.x - Number(arc1.cx), y: c.y - Number(arc1.cy) };
                const v2 = { x: c.x - Number(arc2.cx), y: c.y - Number(arc2.cy) };
                const l1 = Math.hypot(v1.x, v1.y), l2 = Math.hypot(v2.x, v2.y);
                if (l1 <= 1e-9 || l2 <= 1e-9) continue;
                const u1 = { x: v1.x / l1, y: v1.y / l1 };
                const u2 = { x: v2.x / l2, y: v2.y / l2 };
                const t1 = { x: Number(arc1.cx) + u1.x * r1, y: Number(arc1.cy) + u1.y * r1 };
                const t2 = { x: Number(arc2.cx) + u2.x * r2, y: Number(arc2.cy) + u2.y * r2 };
                const th1 = normalizeRad(Math.atan2(t1.y - Number(arc1.cy), t1.x - Number(arc1.cx)));
                const th2 = normalizeRad(Math.atan2(t2.y - Number(arc2.cy), t2.x - Number(arc2.cx)));
                if (!isAngleOnArc(th1, Number(arc1.a1) || 0, Number(arc1.a2) || 0, arc1.ccw !== false)) continue;
                if (!isAngleOnArc(th2, Number(arc2.a1) || 0, Number(arc2.a2) || 0, arc2.ccw !== false)) continue;
                const arc = createArcFromFillet({ x: c.x, y: c.y }, radius, t1, t2);
                const aa1 = Number(arc.a1) || 0, aa2 = Number(arc.a2) || 0, ccw = arc.ccw !== false;
                const span = ccw ? (((aa2 - aa1) + Math.PI * 2) % (Math.PI * 2)) : (((aa1 - aa2) + Math.PI * 2) % (Math.PI * 2));
                const midAng = ccw ? normalizeRad(aa1 + span * 0.5) : normalizeRad(aa1 - span * 0.5);
                const arcMid = { x: c.x + Math.cos(midAng) * radius, y: c.y + Math.sin(midAng) * radius };
                const score = worldHint ? (Math.hypot(worldHint.x - arcMid.x, worldHint.y - arcMid.y) + Math.hypot(worldHint.x - c.x, worldHint.y - c.y) * 0.2) : 0;
                candidates.push({ ok: true, mode: "arc-arc", radius, arc1, arc2, center: { x: c.x, y: c.y }, t1, t2, arc, arcMid, score });
            }
        }
    }
    if (!candidates.length) return { ok: false, reason: "Fillet failed" };
    candidates.sort((a, b) => a.score - b.score);
    return candidates[0];
}

export function getObjectSnapPoint(state, worldRaw, shouldUseObjectSnap, excludeShapeIds) {
    if (shouldUseObjectSnap && !shouldUseObjectSnap()) return null;
    const tol = 12 / Math.max(1e-9, state.view.scale);
    const excludeSet = excludeShapeIds ? new Set([...excludeShapeIds].map(Number)) : null;

    // High-priority snaps: endpoint, center, intersection
    // These always win over nearest-on-line fallback
    let highBest = null;
    let highBestD = Infinity;
    const consider = (x, y, kind, meta = null) => {
        const d = Math.hypot(worldRaw.x - x, worldRaw.y - y);
        if (d <= tol && d < highBestD) {
            highBestD = d;
            highBest = { x, y, kind, ...(meta || {}) };
        }
    };

    for (const s of state.shapes) {
        if (!s || !isLayerVisible(state, s.layerId)) continue;
        if (excludeSet && excludeSet.has(Number(s.id))) continue;
        if (s.type === "line") {
            if (state.objectSnap?.endpoint !== false) {
                consider(Number(s.x1), Number(s.y1), "endpoint", { shapeId: Number(s.id), refType: "line_endpoint", refKey: "p1" });
                consider(Number(s.x2), Number(s.y2), "endpoint", { shapeId: Number(s.id), refType: "line_endpoint", refKey: "p2" });
            }
            if (state.objectSnap?.midpoint) {
                consider((Number(s.x1) + Number(s.x2)) * 0.5, (Number(s.y1) + Number(s.y2)) * 0.5, "midpoint", { shapeId: Number(s.id), refType: "line_midpoint", refKey: "mid" });
            }
        } else if (s.type === "rect") {
            const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
            if (state.objectSnap?.endpoint !== false) {
                consider(x1, y1, "endpoint", { shapeId: Number(s.id), refType: "rect_corner", refKey: "c1" });
                consider(x2, y1, "endpoint", { shapeId: Number(s.id), refType: "rect_corner", refKey: "c2" });
                consider(x2, y2, "endpoint", { shapeId: Number(s.id), refType: "rect_corner", refKey: "c3" });
                consider(x1, y2, "endpoint", { shapeId: Number(s.id), refType: "rect_corner", refKey: "c4" });
            }
            if (state.objectSnap?.midpoint) {
                consider((x1 + x2) * 0.5, y1, "midpoint", { shapeId: Number(s.id), refType: "rect_midpoint", refKey: "m1" });
                consider(x2, (y1 + y2) * 0.5, "midpoint", { shapeId: Number(s.id), refType: "rect_midpoint", refKey: "m2" });
                consider((x1 + x2) * 0.5, y2, "midpoint", { shapeId: Number(s.id), refType: "rect_midpoint", refKey: "m3" });
                consider(x1, (y1 + y2) * 0.5, "midpoint", { shapeId: Number(s.id), refType: "rect_midpoint", refKey: "m4" });
            }
        } else if (s.type === "circle") {
            if (state.objectSnap?.center !== false) consider(Number(s.cx), Number(s.cy), "center", { shapeId: Number(s.id), refType: "circle_center", refKey: "center" });
        } else if (s.type === "arc") {
            const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
            if (state.objectSnap?.center !== false) consider(cx, cy, "center", { shapeId: Number(s.id), refType: "arc_center", refKey: "center" });
            if (state.objectSnap?.endpoint !== false && r > 1e-9) {
                const a1 = Number(s.a1) || 0, a2 = Number(s.a2) || 0;
                consider(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r, "endpoint", { shapeId: Number(s.id), refType: "arc_endpoint", refKey: "a1" });
                consider(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r, "endpoint", { shapeId: Number(s.id), refType: "arc_endpoint", refKey: "a2" });
            }
        } else if (s.type === "position") {
            if (state.objectSnap?.center !== false) consider(Number(s.x), Number(s.y), "center", { shapeId: Number(s.id), refType: "position_center", refKey: "center" });
        } else if (s.type === "dim") {
            if (state.objectSnap?.endpoint !== false) {
                consider(Number(s.x1), Number(s.y1), "endpoint", { shapeId: Number(s.id), refType: "dim_endpoint", refKey: "p1" });
                consider(Number(s.x2), Number(s.y2), "endpoint", { shapeId: Number(s.id), refType: "dim_endpoint", refKey: "p2" });
            }
        }
    }
    // Intersections
    if (state.objectSnap?.intersection !== false) {
        const lines = [];
        const circles = []; // includes arcs
        for (const s of state.shapes) {
            if (!s || !isLayerVisible(state, s.layerId)) continue;
            if (excludeSet && excludeSet.has(Number(s.id))) continue;
            if (s.type === "line") {
                lines.push({ id: s.id, p1: { x: Number(s.x1), y: Number(s.y1) }, p2: { x: Number(s.x2), y: Number(s.y2) } });
            } else if (s.type === "rect") {
                const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
                lines.push({ p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 } });
                lines.push({ p1: { x: x2, y: y1 }, p2: { x: x2, y: y2 } });
                lines.push({ p1: { x: x2, y: y2 }, p2: { x: x1, y: y2 } });
                lines.push({ p1: { x: x1, y: y2 }, p2: { x: x1, y: y1 } });
            } else if (s.type === "circle") {
                circles.push({ cx: Number(s.cx), cy: Number(s.cy), r: Math.abs(Number(s.r) || 0) });
            } else if (s.type === "arc") {
                circles.push({ cx: Number(s.cx), cy: Number(s.cy), r: Math.abs(Number(s.r) || 0), a1: Number(s.a1), a2: Number(s.a2), ccw: s.ccw !== false, isArc: true });
            }
        }

        // Line-Line
        for (let i = 0; i < lines.length; i++) {
            for (let j = i + 1; j < lines.length; j++) {
                const ip = segmentIntersectionPoint(lines[i].p1, lines[i].p2, lines[j].p1, lines[j].p2);
                if (ip) {
                    const idA = Number(lines[i].id);
                    const idB = Number(lines[j].id);
                    const meta = (Number.isFinite(idA) && Number.isFinite(idB))
                        ? { lineAId: idA, lineBId: idB }
                        : null;
                    consider(ip.x, ip.y, "intersection", meta);
                }
            }
        }
        // Line-Circle/Arc
        for (const l of lines) {
            for (const c of circles) {
                const ips = lineCircleInfiniteIntersectionPoints(l.p1, l.p2, c);
                for (const ip of ips) {
                    if (ip.t < -1e-9 || ip.t > 1 + 1e-9) continue;
                    if (c.isArc && !isAngleOnArc(Math.atan2(ip.y - c.cy, ip.x - c.cx), c.a1, c.a2, c.ccw)) continue;
                    consider(ip.x, ip.y, "intersection");
                }
            }
        }
        // Circle-Circle
        for (let i = 0; i < circles.length; i++) {
            for (let j = i + 1; j < circles.length; j++) {
                const c1 = circles[i], c2 = circles[j];
                const ips = circleCircleIntersectionPoints(c1, c1.r, c2, c2.r);
                for (const ip of ips) {
                    if (c1.isArc && !isAngleOnArc(Math.atan2(ip.y - c1.cy, ip.x - c1.cx), c1.a1, c1.a2, c1.ccw)) continue;
                    if (c2.isArc && !isAngleOnArc(Math.atan2(ip.y - c2.cy, ip.x - c2.cx), c2.a1, c2.a2, c2.ccw)) continue;
                    consider(ip.x, ip.y, "intersection");
                }
            }
        }
    }

    // If any high-priority snap found, return it (don't fall through to nearest)
    if (highBest) return highBest;

    // Nearest (On Line) fallback — only activates when no endpoint/center/intersection found
    if (state.objectSnap?.enabled !== false) {
        let nearBest = null;
        let nearBestD = Infinity;
        for (const s of state.shapes) {
            if (!s || !isLayerVisible(state, s.layerId)) continue;
            if (excludeSet && excludeSet.has(Number(s.id))) continue;
            let np = null;
            if (s.type === "line") {
                np = nearestPointOnSegment(worldRaw, { x: Number(s.x1), y: Number(s.y1) }, { x: Number(s.x2), y: Number(s.y2) });
            } else if (s.type === "rect") {
                const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
                const pts = [
                    nearestPointOnSegment(worldRaw, { x: x1, y: y1 }, { x: x2, y: y1 }),
                    nearestPointOnSegment(worldRaw, { x: x2, y: y1 }, { x: x2, y: y2 }),
                    nearestPointOnSegment(worldRaw, { x: x2, y: y2 }, { x: x1, y: y2 }),
                    nearestPointOnSegment(worldRaw, { x: x1, y: y2 }, { x: x1, y: y1 })
                ];
                let minD = Infinity;
                for (const pt of pts) {
                    const d = Math.hypot(worldRaw.x - pt.x, worldRaw.y - pt.y);
                    if (d < minD) { minD = d; np = pt; }
                }
            } else if (s.type === "circle") {
                const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
                const dx = worldRaw.x - cx, dy = worldRaw.y - cy;
                const d = Math.hypot(dx, dy);
                if (d > 1e-9) np = { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
            } else if (s.type === "arc") {
                np = nearestPointOnArc(worldRaw, s);
            }
            if (np) {
                const d = Math.hypot(worldRaw.x - np.x, worldRaw.y - np.y);
                if (d <= tol && d < nearBestD) {
                    nearBestD = d;
                    nearBest = { x: np.x, y: np.y, kind: "nearest" };
                }
            }
        }
        return nearBest;
    }

    return null;
}
