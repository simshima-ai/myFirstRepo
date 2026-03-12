import { pushHistory, setSelection } from "./state.js";
import { solveLineLineFillet, solveLineCircleFillet, solveArcArcFillet, chooseTrimSideForIntersectionByT, chooseEndsForLineByKeepEnd, segmentCircleIntersectionPoints, isAngleOnArc } from "./solvers.js";
import { getSelectedShapes, getTrimHoverCandidate, getTrimHoverCandidateForArc } from "./app_selection.js";
export function splitLineForFillet(line, p) {
    const ax = Number(line.x1), ay = Number(line.y1), bx = Number(line.x2), by = Number(line.y2);
    const mk = (x1, y1, x2, y2) => ({
        id: 0,
        type: "line",
        x1, y1, x2, y2,
        layerId: line.layerId,
        lineWidthMm: Number.isFinite(Number(line.lineWidthMm)) ? Number(line.lineWidthMm) : undefined,
        lineType: typeof line.lineType === "string" ? String(line.lineType) : undefined,
        color: (typeof line.color === "string") ? String(line.color) : undefined,
    });
    const distA = Math.hypot(ax - p.x, ay - p.y);
    const distB = Math.hypot(bx - p.x, by - p.y);
    if (distA < 1e-4) return [mk(p.x, p.y, bx, by)];
    if (distB < 1e-4) return [mk(ax, ay, p.x, p.y)];
    return [mk(ax, ay, p.x, p.y), mk(p.x, p.y, bx, by)];
}

function applyFilletSourceStyle(state, targetArc, sources) {
    const arr = Array.isArray(sources) ? sources : [sources];
    let src = null;
    for (const s of arr) {
        if (!s) continue;
        const lw = Number(s.lineWidthMm);
        const lt = String(s.lineType || "");
        const col = String(s.color || "");
        if (Number.isFinite(lw) || lt || col) {
            src = s;
            break;
        }
    }
    const lw = Math.max(0.01, Number(src?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
    const lt = String(src?.lineType || "solid");
    const col = String(src?.color || "#0f172a");
    targetArc.lineWidthMm = lw;
    targetArc.lineType = lt;
    targetArc.color = col;
}

export function tryCreateLineLineFillet(state, helpers, radiusInput, worldHint = null) {
    const { setStatus, draw, addShape, nextShapeId } = helpers;
    // addShape and nextShapeId from helpers are already bound to state 窶・call without state arg
    const sel = getSelectedShapes(state).filter(s => s.type === "line");
    if (sel.length !== 2) return false;
    const line1 = state.shapes.find(s => Number(s.id) === Number(sel[0].id));
    const line2 = state.shapes.find(s => Number(s.id) === Number(sel[1].id));
    if (!line1 || !line2) return false;
    const r = Math.max(0, Number(radiusInput));
    const sol = solveLineLineFillet(sel[0], sel[1], r, worldHint);
    if (!sol || !sol.ok) return false;
    const arc = {
        id: nextShapeId(),
        type: "arc",
        cx: Number(sol.arc?.cx ?? sol.center?.x),
        cy: Number(sol.arc?.cy ?? sol.center?.y),
        r: Number(sol.arc?.r ?? sol.radius),
        a1: Number(sol.arc?.a1),
        a2: Number(sol.arc?.a2),
        ccw: sol.arc?.ccw !== false,
        layerId: line1.layerId ?? state.activeLayerId
    };
    applyFilletSourceStyle(state, arc, [line1, line2]);
    if (![arc.cx, arc.cy, arc.r, arc.a1, arc.a2].every(Number.isFinite) || arc.r <= 0) {
        if (setStatus) setStatus("Fillet failed: arc geometry is invalid");
        return false;
    }
    pushHistory(state);
    const mode = state.filletSettings.lineMode || "trim";
    const doTrim = (mode === "trim");
    let trimWarning = false;
    // Always create fillet arc first (equivalent to no-trim), then attempt trim.
    addShape(arc);
    if (doTrim) {
        const line1Snap = { x1: Number(line1.x1), y1: Number(line1.y1), x2: Number(line1.x2), y2: Number(line1.y2) };
        const line2Snap = { x1: Number(line2.x1), y1: Number(line2.y1), x2: Number(line2.x2), y2: Number(line2.y2) };
        let okAll = true;
        const s1 = sol.t1, s2 = sol.t2;
        if (!s1 || !s2 || !Number.isFinite(Number(s1.x)) || !Number.isFinite(Number(s1.y)) || !Number.isFinite(Number(s2.x)) || !Number.isFinite(Number(s2.y))) {
            okAll = false;
        } else {
            const e1 = chooseEndsForLineByKeepEnd(line1, sol.t1, sol.keepEnd1 || "p1");
            const e2 = chooseEndsForLineByKeepEnd(line2, sol.t2, sol.keepEnd2 || "p1");
            const n1x1 = Number(e1.keepPoint?.x), n1y1 = Number(e1.keepPoint?.y), n1x2 = Number(sol.t1?.x), n1y2 = Number(sol.t1?.y);
            const n2x1 = Number(e2.keepPoint?.x), n2y1 = Number(e2.keepPoint?.y), n2x2 = Number(sol.t2?.x), n2y2 = Number(sol.t2?.y);
            if ([n1x1, n1y1, n1x2, n1y2].every(Number.isFinite) && Math.hypot(n1x2 - n1x1, n1y2 - n1y1) > 1e-6) {
                line1.x1 = n1x1; line1.y1 = n1y1; line1.x2 = n1x2; line1.y2 = n1y2;
            } else okAll = false;
            if ([n2x1, n2y1, n2x2, n2y2].every(Number.isFinite) && Math.hypot(n2x2 - n2x1, n2y2 - n2y1) > 1e-6) {
                line2.x1 = n2x1; line2.y1 = n2y1; line2.x2 = n2x2; line2.y2 = n2y2;
            } else okAll = false;
        }
        if (!okAll) {
            line1.x1 = line1Snap.x1; line1.y1 = line1Snap.y1; line1.x2 = line1Snap.x2; line1.y2 = line1Snap.y2;
            line2.x1 = line2Snap.x1; line2.y1 = line2Snap.y1; line2.x2 = line2Snap.x2; line2.y2 = line2Snap.y2;
            trimWarning = true;
        }
    }
    setSelection(state, [arc.id]);
    if (setStatus) setStatus(trimWarning ? `Fillet (R=${r.toFixed(2)}) created (trim skipped)` : `Fillet (R=${r.toFixed(2)}) created`);
    if (draw) draw();
    return true;
}

export function getFilletSelectionPair(state) {
    const sel = getSelectedShapes(state);
    if (sel.length !== 2) return null;
    const t1 = sel[0].type, t2 = sel[1].type;
    if ((t1 === "line" && t2 === "circle") || (t1 === "circle" && t2 === "line")) {
        return { kind: "line-circle", line: t1 === "line" ? sel[0] : sel[1], circle: t1 === "circle" ? sel[0] : sel[1] };
    }
    if ((t1 === "line" && t2 === "arc") || (t1 === "arc" && t2 === "line")) {
        return { kind: "line-arc", line: t1 === "line" ? sel[0] : sel[1], arc: t1 === "arc" ? sel[0] : sel[1] };
    }
    if (t1 === "arc" && t2 === "arc") {
        return { kind: "arc-arc", arc1: sel[0], arc2: sel[1] };
    }
    return null;
}

const AUTO_TRIM_TAU = Math.PI * 2;
function autoTrimNormPi(a) {
    let x = Number(a) || 0;
    while (x <= -Math.PI) x += AUTO_TRIM_TAU;
    while (x > Math.PI) x -= AUTO_TRIM_TAU;
    return x;
}
function autoTrimSpan(a1, a2, ccw) {
    const s1 = Number(a1) || 0;
    const s2 = Number(a2) || 0;
    return ccw ? (((s2 - s1) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU) : (((s1 - s2) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU);
}
function autoTrimArcPoint(arcShape, ang) {
    const cx = Number(arcShape?.cx), cy = Number(arcShape?.cy), rr = Math.abs(Number(arcShape?.r) || 0);
    return { x: cx + Math.cos(ang) * rr, y: cy + Math.sin(ang) * rr };
}
function autoTrimPickArcCutKey(arcShape, tangentPoint, towardPoint = null) {
    if (!arcShape || arcShape.type !== "arc") return "a1";
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    if (towardPoint && Number.isFinite(Number(towardPoint.x)) && Number.isFinite(Number(towardPoint.y))) {
        const p1 = autoTrimArcPoint(arcShape, a1);
        const p2 = autoTrimArcPoint(arcShape, a2);
        const d1 = Math.hypot(Number(towardPoint.x) - p1.x, Number(towardPoint.y) - p1.y);
        const d2 = Math.hypot(Number(towardPoint.x) - p2.x, Number(towardPoint.y) - p2.y);
        return (d1 <= d2) ? "a1" : "a2";
    }
    const th = Math.atan2(Number(tangentPoint?.y) - Number(arcShape.cy), Number(tangentPoint?.x) - Number(arcShape.cx));
    const d1 = Math.abs(autoTrimNormPi(th - a1));
    const d2 = Math.abs(autoTrimNormPi(th - a2));
    return (d1 <= d2) ? "a1" : "a2";
}
function autoTrimBuildLineClickCandidates(a, b) {
    const ax = Number(a?.x), ay = Number(a?.y), bx = Number(b?.x), by = Number(b?.y);
    if (![ax, ay, bx, by].every(Number.isFinite)) return [];
    const out = [];
    for (const t of [0.01, 0.03, 0.06, 0.12, 0.22, 0.35, 0.5, 0.65, 0.78, 0.88, 0.94, 0.97, 0.99]) {
        out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t });
    }
    return out;
}
function autoTrimBuildArcClickCandidates(arcShape, tangentPoint, cutKey) {
    if (!arcShape || arcShape.type !== "arc") return [];
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), rr = Math.abs(Number(arcShape.r) || 0);
    if (!(rr > 1e-9)) return [];
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    const ccw = arcShape.ccw !== false;
    const th = Math.atan2(Number(tangentPoint?.y) - cy, Number(tangentPoint?.x) - cx);
    const start = (cutKey === "a1") ? a1 : th;
    const end = (cutKey === "a1") ? th : a2;
    const span = ccw ? (((end - start) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU) : (((start - end) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU);
    const out = [];
    for (const t of [0.01, 0.03, 0.06, 0.1, 0.15, 0.22, 0.35, 0.5, 0.65, 0.78, 0.88, 0.94, 0.97, 0.99]) {
        const a = ccw ? (start + span * t) : (start - span * t);
        out.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    return out;
}

function pickLineArcIntersectionA(lineRef, arcRef, sol, worldHint = null) {
    const sx = Number(sol?.sharedIntersection?.x);
    const sy = Number(sol?.sharedIntersection?.y);
    if ([sx, sy].every(Number.isFinite)) return { x: sx, y: sy };
    const lineA = { x: Number(lineRef?.x1), y: Number(lineRef?.y1) };
    const lineB = { x: Number(lineRef?.x2), y: Number(lineRef?.y2) };
    const ips = segmentCircleIntersectionPoints(lineA, lineB, arcRef) || [];
    const cand = [];
    for (const p of ips) {
        const th = Math.atan2(Number(p.y) - Number(arcRef?.cy), Number(p.x) - Number(arcRef?.cx));
        if (!isAngleOnArc(th, Number(arcRef?.a1) || 0, Number(arcRef?.a2) || 0, arcRef?.ccw !== false)) continue;
        cand.push({ x: Number(p.x), y: Number(p.y) });
    }
    if (!cand.length) return null;
    if (cand.length === 1) return cand[0];
    // Choose A deterministically from geometry only (zoom/mouse independent):
    // intersection closest to fillet tangent B on the original arc.
    const tPoint = { x: Number(sol?.tCircle?.x), y: Number(sol?.tCircle?.y) };
    if ([tPoint.x, tPoint.y].every(Number.isFinite)) {
        cand.sort((p, q) =>
            Math.hypot(Number(p.x) - tPoint.x, Number(p.y) - tPoint.y)
            - Math.hypot(Number(q.x) - tPoint.x, Number(q.y) - tPoint.y)
        );
        return cand[0];
    }
    const hint = (sol?.arcMid || null);
    if (!hint || !Number.isFinite(Number(hint.x)) || !Number.isFinite(Number(hint.y))) return cand[0];
    cand.sort((p, q) =>
        Math.hypot(Number(p.x) - Number(hint.x), Number(p.y) - Number(hint.y))
        - Math.hypot(Number(q.x) - Number(hint.x), Number(q.y) - Number(hint.y))
    );
    return cand[0];
}

function pickArcKeepSideByABCMid(arcShape, tangentPointB, intersectionA, c3Point) {
    if (!arcShape || !tangentPointB || !intersectionA || !c3Point) return null;
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), r = Math.abs(Number(arcShape.r) || 0);
    if (![cx, cy, r].every(Number.isFinite) || !(r > 1e-9)) return null;
    const aA = Math.atan2(Number(intersectionA.y) - cy, Number(intersectionA.x) - cx);
    const aB = Math.atan2(Number(tangentPointB.y) - cy, Number(tangentPointB.x) - cx);
    if (![aA, aB].every(Number.isFinite)) return null;
    const spanAB = ((aB - aA) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU;
    const m1 = aA + spanAB * 0.5;
    const spanBA = ((aA - aB) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU;
    const m2 = aB + spanBA * 0.5;
    const c1 = { x: cx + Math.cos(m1) * r, y: cy + Math.sin(m1) * r };
    const c2 = { x: cx + Math.cos(m2) * r, y: cy + Math.sin(m2) * r };
    const d13 = Math.hypot(Number(c1.x) - Number(c3Point.x), Number(c1.y) - Number(c3Point.y));
    const d23 = Math.hypot(Number(c2.x) - Number(c3Point.x), Number(c2.y) - Number(c3Point.y));
    const targetMid = (d13 <= d23) ? m1 : m2;
    const th = aB;
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    const ccw = arcShape.ccw !== false;
    const inRemovedIfKeepA1 = isAngleOnArc(targetMid, th, a2, ccw);
    const inRemovedIfKeepA2 = isAngleOnArc(targetMid, a1, th, ccw);
    if (inRemovedIfKeepA1 && !inRemovedIfKeepA2) return "a1";
    if (inRemovedIfKeepA2 && !inRemovedIfKeepA1) return "a2";
    return null;
}

function buildArcTrimVirtualClicksByABCMid(arcShape, tangentPointB, intersectionA, c3Point) {
    if (!arcShape || !tangentPointB || !intersectionA || !c3Point) return [];
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), r = Math.abs(Number(arcShape.r) || 0);
    if (![cx, cy, r].every(Number.isFinite) || !(r > 1e-9)) return [];
    const aA = Math.atan2(Number(intersectionA.y) - cy, Number(intersectionA.x) - cx);
    const aB = Math.atan2(Number(tangentPointB.y) - cy, Number(tangentPointB.x) - cx);
    if (![aA, aB].every(Number.isFinite)) return [];
    const spanAB = ((aB - aA) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU;
    const m1 = aA + spanAB * 0.5;
    const spanBA = ((aA - aB) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU;
    const m2 = aB + spanBA * 0.5;
    const c1 = { x: cx + Math.cos(m1) * r, y: cy + Math.sin(m1) * r };
    const c2 = { x: cx + Math.cos(m2) * r, y: cy + Math.sin(m2) * r };
    const d13 = Math.hypot(Number(c1.x) - Number(c3Point.x), Number(c1.y) - Number(c3Point.y));
    const d23 = Math.hypot(Number(c2.x) - Number(c3Point.x), Number(c2.y) - Number(c3Point.y));
    const primaryStart = (d13 <= d23) ? aA : aB;
    const primarySpan = (d13 <= d23) ? spanAB : spanBA;
    const secondaryStart = (d13 <= d23) ? aB : aA;
    const secondarySpan = (d13 <= d23) ? spanBA : spanAB;
    const weights = [0.5, 0.35, 0.65, 0.25, 0.75];
    const angles = [];
    const pushAngle = (ang) => {
        const n = normalizeRad(ang);
        if (!Number.isFinite(n)) return;
        if (angles.some((a) => Math.abs(Math.atan2(Math.sin(a - n), Math.cos(a - n))) < 1e-7)) return;
        angles.push(n);
    };
    for (const w of weights) pushAngle(primaryStart + primarySpan * w);
    for (const w of weights) pushAngle(secondaryStart + secondarySpan * w);
    return angles.map((ang) => ({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r }));
}

function buildArcTrimVirtualClicksFallback(arcShape) {
    if (!arcShape || arcShape.type !== "arc") return [];
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), r = Math.abs(Number(arcShape.r) || 0);
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    const ccw = arcShape.ccw !== false;
    const span = autoTrimSpan(a1, a2, ccw);
    if (![cx, cy, r, a1, a2, span].every(Number.isFinite) || !(r > 1e-9) || !(span > 1e-6)) return [];
    const ws = [0.15, 0.3, 0.5, 0.7, 0.85];
    const out = [];
    for (const w of ws) {
        const ang = ccw ? (a1 + span * w) : (a1 - span * w);
        const n = normalizeRad(ang);
        if (!isAngleOnArc(n, a1, a2, ccw)) continue;
        out.push({ x: cx + Math.cos(n) * r, y: cy + Math.sin(n) * r });
    }
    return out;
}

function expandArcClickPointWithJitter(arcRef, p) {
    if (!arcRef || arcRef.type !== "arc" || !p) return [];
    const cx = Number(arcRef.cx), cy = Number(arcRef.cy), r = Math.abs(Number(arcRef.r) || 0);
    const a1 = Number(arcRef.a1) || 0;
    const a2 = Number(arcRef.a2) || 0;
    const ccw = arcRef.ccw !== false;
    if (![cx, cy, r].every(Number.isFinite) || !(r > 1e-9)) return [];
    const base = Math.atan2(Number(p.y) - cy, Number(p.x) - cx);
    if (!Number.isFinite(base)) return [];
    const deltas = [0, 0.002, -0.002, 0.006, -0.006, 0.012, -0.012];
    const out = [];
    for (const d of deltas) {
        const ang = normalizeRad(base + d);
        if (!isAngleOnArc(ang, a1, a2, ccw)) continue;
        out.push({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r });
    }
    return out;
}

function applyArcTrimByVirtualClickCandidate(state, arcRef, clickPoint) {
    if (!state || !arcRef || arcRef.type !== "arc" || !clickPoint) return false;
    const cand = getTrimHoverCandidateForArc(state, clickPoint, arcRef) || null;
    if (!cand || cand.targetType !== "arc") return false;
    if (Number(cand.arc?.id) !== Number(arcRef.id)) return false;
    if (cand.mode !== "arc-remove-arc") return false;
    const keepA1 = Number(cand.keepA1);
    const keepA2 = Number(cand.keepA2);
    if (![keepA1, keepA2].every(Number.isFinite)) return false;
    const oldA1 = Number(arcRef.a1) || 0;
    const oldA2 = Number(arcRef.a2) || 0;
    const oldCcw = arcRef.ccw !== false;
    const oldSpan = autoTrimSpan(oldA1, oldA2, oldCcw);
    arcRef.a1 = keepA1;
    arcRef.a2 = keepA2;
    arcRef.ccw = (cand.remCCW !== false);
    const newSpan = autoTrimSpan(Number(arcRef.a1), Number(arcRef.a2), arcRef.ccw !== false);
    const ok = (newSpan > 1e-5 && newSpan < AUTO_TRIM_TAU - 1e-6 && newSpan < oldSpan - 1e-6);
    if (ok) return true;
    arcRef.a1 = oldA1;
    arcRef.a2 = oldA2;
    arcRef.ccw = oldCcw;
    return false;
}
function withSuppressedShape(state, shapeId, fn) {
    if (shapeId == null) return fn();
    const arr = state?.shapes || [];
    const sid = Number(shapeId);
    const idx = arr.findIndex((s) => Number(s?.id) === sid);
    if (idx < 0) return fn();
    const removed = arr.splice(idx, 1)[0];
    try {
        return fn();
    } finally {
        arr.splice(idx, 0, removed);
    }
}
export function computeLineCircleAutoTrimPlan(state, sol, lineRef, circleRef, keepEnd, suppressShapeId = null) {
    const result = {
        okLine: false,
        okArc: (circleRef?.type !== "arc"),
        okAll: false,
        effectiveKeepEnd: String(sol?.desiredKeepEnd || keepEnd || sol?.keepEnd || "p1"),
        lineCandidate: null,
        arcCandidate: null,
        cutKey: null,
        lineClickCandidates: [],
        arcClickCandidates: [],
        trimSegA: null,
        trimSegB: null,
    };
    if (!state || !sol || !lineRef || !circleRef || lineRef.type !== "line") return result;

    const tLine = { x: Number(sol?.tLine?.x), y: Number(sol?.tLine?.y) };
    const trimSegA = (result.effectiveKeepEnd === "p1")
        ? { x: Number(tLine.x), y: Number(tLine.y) }
        : { x: Number(lineRef.x1), y: Number(lineRef.y1) };
    const trimSegB = (result.effectiveKeepEnd === "p1")
        ? { x: Number(lineRef.x2), y: Number(lineRef.y2) }
        : { x: Number(tLine.x), y: Number(tLine.y) };
    result.trimSegA = trimSegA;
    result.trimSegB = trimSegB;
    const expectedLineMode = (result.effectiveKeepEnd === "p1") ? "p2" : "p1";
    const lineClicks = autoTrimBuildLineClickCandidates(trimSegA, trimSegB);
    result.lineClickCandidates = lineClicks.slice();

    result.lineCandidate = withSuppressedShape(state, suppressShapeId, () => {
        for (const p of lineClicks) {
            const cand = getTrimHoverCandidate(state, p) || null;
            if (!cand) continue;
            if (cand.targetType !== "line") continue;
            if (Number(cand.line?.id) !== Number(lineRef.id)) continue;
            if (cand.mode !== expectedLineMode) continue;
            return cand;
        }
        return null;
    });
    // Fallback: deterministic line trim (same result as trimming the target-side endpoint to tangent point).
    if (!result.lineCandidate) {
        const ip = { x: Number(sol?.tLine?.x), y: Number(sol?.tLine?.y) };
        if ([ip.x, ip.y].every(Number.isFinite)) {
            result.lineCandidate = {
                targetType: "line",
                line: lineRef,
                mode: expectedLineMode,
                ip,
            };
        }
    }
    result.okLine = !!result.lineCandidate;

    if (circleRef.type === "arc") {
        const nearFullEps = 0.02; // rad: reject almost-full-circle trims and retry opposite side.
        const oldA1 = Number(circleRef.a1) || 0;
        const oldA2 = Number(circleRef.a2) || 0;
        const ccw = circleRef.ccw !== false;
        const oldSpan = autoTrimSpan(oldA1, oldA2, ccw);
        const validateArcCandidate = (cand) => {
            if (!cand) return false;
            const k1 = Number(cand.keepA1);
            const k2 = Number(cand.keepA2);
            if (![k1, k2].every(Number.isFinite)) return false;
            const span = autoTrimSpan(k1, k2, (cand.remCCW !== false));
            if (!(span > 1e-5)) return false;
            if (span >= AUTO_TRIM_TAU - nearFullEps) return false;
            if (span >= oldSpan - 1e-6) return false;
            return true;
        };
        const th = Math.atan2(Number(sol?.tCircle?.y) - Number(circleRef.cy), Number(sol?.tCircle?.x) - Number(circleRef.cx));
        const buildDeterministicArcCandidate = (cutKey) => {
            const keepA1 = (cutKey === "a1") ? th : oldA1;
            const keepA2 = (cutKey === "a1") ? oldA2 : th;
            return {
                targetType: "arc",
                arc: circleRef,
                mode: "arc-remove-arc",
                keepA1,
                keepA2,
                remA1: (cutKey === "a1") ? oldA1 : th,
                remA2: (cutKey === "a1") ? th : oldA2,
                remCCW: ccw,
            };
        };
        const tryCutKey = (cutKey) => {
            const clicks = autoTrimBuildArcClickCandidates(circleRef, sol.tCircle, cutKey);
            const picked = withSuppressedShape(state, suppressShapeId, () => {
                for (const p of clicks) {
                    const cand = getTrimHoverCandidate(state, p) || null;
                    if (!cand) continue;
                    if (cand.targetType !== "arc") continue;
                    if (Number(cand.arc?.id) !== Number(circleRef.id)) continue;
                    if (cand.mode !== "arc-remove-arc") continue;
                    if (!validateArcCandidate(cand)) continue;
                    return cand;
                }
                return null;
            });
            if (picked) return { candidate: picked, clicks };
            const det = buildDeterministicArcCandidate(cutKey);
            if (validateArcCandidate(det)) return { candidate: det, clicks };
            return { candidate: null, clicks };
        };

        const initialCutKey = (sol.arcCutKey === "a1" || sol.arcCutKey === "a2")
            ? sol.arcCutKey
            : autoTrimPickArcCutKey(circleRef, sol.tCircle, sol.sharedIntersection || sol.arcMid || null);
        const altCutKey = (initialCutKey === "a1") ? "a2" : "a1";
        let arcTry = tryCutKey(initialCutKey);
        let acceptedCutKey = initialCutKey;
        if (!arcTry.candidate) {
            const altTry = tryCutKey(altCutKey);
            if (altTry.candidate) {
                arcTry = altTry;
                acceptedCutKey = altCutKey;
            }
        }

        result.cutKey = acceptedCutKey;
        result.arcClickCandidates = arcTry.clicks.slice();
        result.arcCandidate = arcTry.candidate;
        result.okArc = !!result.arcCandidate;
    }

    result.okAll = !!(result.okLine && result.okArc);
    return result;
}

export function trimArcEndpointForFillet(arcShape, tangentPoint) {
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy);
    const oldA1 = Number(arcShape.a1), oldA2 = Number(arcShape.a2);
    const th = Math.atan2(tangentPoint.y - cy, tangentPoint.x - cx);
    const d1 = Math.abs(Math.atan2(Math.sin(th - oldA1), Math.cos(th - oldA1)));
    const d2 = Math.abs(Math.atan2(Math.sin(th - oldA2), Math.cos(th - oldA2)));
    if (d1 < d2) arcShape.a1 = th; else arcShape.a2 = th;
    const ccw = arcShape.ccw !== false;
    const nA1 = Number(arcShape.a1), nA2 = Number(arcShape.a2);
    const span = ccw ? (((nA2 - nA1) + Math.PI * 2) % (Math.PI * 2)) : (((nA1 - nA2) + Math.PI * 2) % (Math.PI * 2));
    if (!(span > 1e-5 && span < Math.PI * 2 - 1e-5)) {
        arcShape.a1 = oldA1;
        arcShape.a2 = oldA2;
        return false;
    }
    return true;
}

function trimArcEndpointForFilletByKey(arcShape, tangentPoint, cutKey) {
    if (!arcShape || arcShape.type !== "arc") return false;
    if (cutKey !== "a1" && cutKey !== "a2") return false;
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), r = Math.abs(Number(arcShape.r) || 0);
    if (!(r > 1e-9)) return false;
    const th = Math.atan2(Number(tangentPoint?.y) - cy, Number(tangentPoint?.x) - cx);
    if (!Number.isFinite(th)) return false;
    const oldA1 = Number(arcShape.a1) || 0;
    const oldA2 = Number(arcShape.a2) || 0;
    const ccw = arcShape.ccw !== false;
    const spanOf = (sa1, sa2) => ccw
        ? ((((sa2 - sa1) + Math.PI * 2) % (Math.PI * 2)))
        : ((((sa1 - sa2) + Math.PI * 2) % (Math.PI * 2)));
    const oldSpan = spanOf(oldA1, oldA2);
    if (!(oldSpan > 1e-5 && oldSpan < Math.PI * 2 - 1e-5)) return false;
    if (cutKey === "a1") arcShape.a1 = th;
    else arcShape.a2 = th;
    const nA1 = Number(arcShape.a1) || 0;
    const nA2 = Number(arcShape.a2) || 0;
    const span = spanOf(nA1, nA2);
    if (!(span > 1e-5 && span < Math.PI * 2 - 1e-5)) {
        arcShape.a1 = oldA1;
        arcShape.a2 = oldA2;
        return false;
    }
    // Trimming must reduce arc span; otherwise side selection is wrong.
    if (span >= oldSpan - 1e-6) {
        arcShape.a1 = oldA1;
        arcShape.a2 = oldA2;
        return false;
    }
    return true;
}

export function trimArcEndpointForFilletTowardPoint(arcShape, tangentPoint, towardPoint = null, lineRef = null) {
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), r = Math.abs(Number(arcShape.r) || 0);
    if (!(r > 1e-9)) {
        trimArcEndpointForFillet(arcShape, tangentPoint);
        return true;
    }
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    const p2 = { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
    const th = Math.atan2(tangentPoint.y - cy, tangentPoint.x - cx);
    let cutKey = null;
    if (lineRef && lineRef.type === "line") {
        const lx1 = Number(lineRef.x1), ly1 = Number(lineRef.y1), lx2 = Number(lineRef.x2), ly2 = Number(lineRef.y2);
        const lineLen = Math.max(1e-9, Math.hypot(lx2 - lx1, ly2 - ly1));
        const eps = Math.max(1e-4, lineLen * 1e-5);
        const d11 = Math.hypot(p1.x - lx1, p1.y - ly1);
        const d12 = Math.hypot(p1.x - lx2, p1.y - ly2);
        const d21 = Math.hypot(p2.x - lx1, p2.y - ly1);
        const d22 = Math.hypot(p2.x - lx2, p2.y - ly2);
        const p1Connected = (Math.min(d11, d12) <= eps);
        const p2Connected = (Math.min(d21, d22) <= eps);
        if (p1Connected && !p2Connected) cutKey = "a1";
        else if (p2Connected && !p1Connected) cutKey = "a2";
    }
    if (!cutKey && towardPoint && Number.isFinite(Number(towardPoint.x)) && Number.isFinite(Number(towardPoint.y))) {
        const d1 = Math.hypot(Number(towardPoint.x) - p1.x, Number(towardPoint.y) - p1.y);
        const d2 = Math.hypot(Number(towardPoint.x) - p2.x, Number(towardPoint.y) - p2.y);
        cutKey = (d1 <= d2) ? "a1" : "a2";
    }
    if (!cutKey) {
        const d1 = Math.abs(Math.atan2(Math.sin(th - a1), Math.cos(th - a1)));
        const d2 = Math.abs(Math.atan2(Math.sin(th - a2), Math.cos(th - a2)));
        cutKey = (d1 < d2) ? "a1" : "a2";
    }

    if (trimArcEndpointForFilletByKey(arcShape, tangentPoint, cutKey)) return true;
    const altKey = (cutKey === "a1") ? "a2" : "a1";
    return trimArcEndpointForFilletByKey(arcShape, tangentPoint, altKey);
}

export function getArcKeepSideByPoint(arcShape, tangentPoint, worldRaw) {
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), r = Number(arcShape.r);
    const thT = Math.atan2(tangentPoint.y - cy, tangentPoint.x - cx);
    const thM = Math.atan2(worldRaw.y - cy, worldRaw.x - cx);
    const ccw = (arcShape.ccw !== false);
    const d = normalizeRad(thM - thT);
    if (ccw) return (d >= 0) ? "a2" : "a1";
    return (d <= 0) ? "a2" : "a1";
}

export function trimArcForFilletKeepSide(arcShape, tangentPoint, keepSide) {
    const oldA1 = Number(arcShape.a1), oldA2 = Number(arcShape.a2);
    const ccw = arcShape.ccw !== false;
    const th = Math.atan2(tangentPoint.y - arcShape.cy, tangentPoint.x - arcShape.cx);
    if (keepSide === "a1") arcShape.a2 = th; else arcShape.a1 = th;
    const nA1 = Number(arcShape.a1), nA2 = Number(arcShape.a2);
    const span = ccw ? (((nA2 - nA1) + Math.PI * 2) % (Math.PI * 2)) : (((nA1 - nA2) + Math.PI * 2) % (Math.PI * 2));
    if (!(span > 1e-5 && span < Math.PI * 2 - 1e-5)) {
        arcShape.a1 = oldA1;
        arcShape.a2 = oldA2;
        return false;
    }
    return true;
}

export function trimateFillet(state, helpers, radiusInput, worldHint = null) {
    // Dispatcher logic usually in app.js, moving here for tool module
    const { setStatus, draw } = helpers;
    const sel = getSelectedShapes(state);
    if (sel.length !== 2) return false;
    const r = Math.max(0, Number(radiusInput));
    const t1 = sel[0].type, t2 = sel[1].type;
    if (t1 === "line" && t2 === "line") return tryCreateLineLineFillet(state, helpers, r, worldHint);

    // Future: dispatch other types from here or confirmed stages
    return false;
}

export function applyCircleInput(state, helpers, r) {
    const { pushHistory, draw, setStatus } = helpers;
    const sel = getSelectedShapes(state).filter(s => s.type === "circle" || s.type === "arc");
    if (sel.length === 0) return;
    const nextR = Math.max(0, Number(r) || 0);
    const eps = 1e-4;
    const getArcEndPoint = (arc, endKey) => {
        const cx = Number(arc.cx), cy = Number(arc.cy), rr = Number(arc.r);
        const a = Number(endKey === "a1" ? arc.a1 : arc.a2);
        if (![cx, cy, rr, a].every(Number.isFinite)) return null;
        return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr };
    };
    const findConnectedLineAtPoint = (pt, excludeId = null) => {
        let best = null;
        let bestD = Infinity;
        for (const s of (state.shapes || [])) {
            if (!s || s.type !== "line") continue;
            if (excludeId != null && Number(s.id) === Number(excludeId)) continue;
            const p1 = { x: Number(s.x1), y: Number(s.y1) };
            const p2 = { x: Number(s.x2), y: Number(s.y2) };
            const d1 = Math.hypot(pt.x - p1.x, pt.y - p1.y);
            const d2 = Math.hypot(pt.x - p2.x, pt.y - p2.y);
            if (d1 <= eps && d1 < bestD) { bestD = d1; best = { line: s, key: "p1" }; }
            if (d2 <= eps && d2 < bestD) { bestD = d2; best = { line: s, key: "p2" }; }
        }
        return best;
    };
    const findConnectedRoundAtPoint = (pt, excludeIds = new Set()) => {
        let best = null;
        let bestD = Infinity;
        for (const s of (state.shapes || [])) {
            if (!s || (s.type !== "circle" && s.type !== "arc")) continue;
            if (excludeIds && excludeIds.has(Number(s.id))) continue;
            const cx = Number(s.cx), cy = Number(s.cy), rr = Math.abs(Number(s.r) || 0);
            if (![cx, cy, rr].every(Number.isFinite) || rr <= 1e-9) continue;
            const dC = Math.abs(Math.hypot(pt.x - cx, pt.y - cy) - rr);
            if (dC > eps) continue;
            if (s.type === "arc") {
                const th = Math.atan2(pt.y - cy, pt.x - cx);
                if (!isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) continue;
            }
            if (dC < bestD) { bestD = dC; best = s; }
        }
        return best;
    };
    const findConnectedArcAtPoint = (pt, excludeIds = new Set()) => {
        let best = null;
        let bestD = Infinity;
        for (const s of (state.shapes || [])) {
            if (!s || s.type !== "arc") continue;
            if (excludeIds && excludeIds.has(Number(s.id))) continue;
            const p1 = getArcEndPoint(s, "a1");
            const p2 = getArcEndPoint(s, "a2");
            if (p1) {
                const d1 = Math.hypot(pt.x - p1.x, pt.y - p1.y);
                if (d1 <= eps && d1 < bestD) { bestD = d1; best = s; }
            }
            if (p2) {
                const d2 = Math.hypot(pt.x - p2.x, pt.y - p2.y);
                if (d2 <= eps && d2 < bestD) { bestD = d2; best = s; }
            }
        }
        return best;
    };
    const arcMidHint = (arc) => {
        const a1 = Number(arc.a1) || 0;
        const a2 = Number(arc.a2) || 0;
        const ccw = arc.ccw !== false;
        let am = a1;
        if (ccw) {
            const span = ((a2 - a1) + Math.PI * 2) % (Math.PI * 2);
            am = a1 + span * 0.5;
        } else {
            const span = ((a1 - a2) + Math.PI * 2) % (Math.PI * 2);
            am = a1 - span * 0.5;
        }
        return {
            x: Number(arc.cx) + Math.cos(am) * Number(arc.r),
            y: Number(arc.cy) + Math.sin(am) * Number(arc.r),
        };
    };
    const fitArcAsLineLineFillet = (arcShape) => {
        if (!arcShape || arcShape.type !== "arc") return false;
        const end1 = getArcEndPoint(arcShape, "a1");
        const end2 = getArcEndPoint(arcShape, "a2");
        if (!end1 || !end2) return false;
        const c1 = findConnectedLineAtPoint(end1, null);
        const c2 = findConnectedLineAtPoint(end2, c1?.line?.id);
        if (!c1 || !c2 || !c1.line || !c2.line) return false;
        const hint = arcMidHint(arcShape);
        const sol = solveLineLineFillet(c1.line, c2.line, nextR, hint);
        if (!sol || !sol.ok || !sol.arc) return false;
        const t1 = sol.t1, t2 = sol.t2;
        if (!t1 || !t2) return false;
        if (c1.key === "p1") { c1.line.x1 = Number(t1.x); c1.line.y1 = Number(t1.y); } else { c1.line.x2 = Number(t1.x); c1.line.y2 = Number(t1.y); }
        if (c2.key === "p1") { c2.line.x1 = Number(t2.x); c2.line.y1 = Number(t2.y); } else { c2.line.x2 = Number(t2.x); c2.line.y2 = Number(t2.y); }
        arcShape.cx = Number(sol.arc.cx ?? sol.center?.x);
        arcShape.cy = Number(sol.arc.cy ?? sol.center?.y);
        arcShape.r = Number(sol.arc.r ?? sol.radius);
        arcShape.a1 = Number(sol.arc.a1);
        arcShape.a2 = Number(sol.arc.a2);
        arcShape.ccw = sol.arc.ccw !== false;
        return [arcShape.cx, arcShape.cy, arcShape.r, arcShape.a1, arcShape.a2].every(Number.isFinite);
    };
    const fitArcAsLineRoundFillet = (arcShape) => {
        if (!arcShape || arcShape.type !== "arc") return false;
        const end1 = getArcEndPoint(arcShape, "a1");
        const end2 = getArcEndPoint(arcShape, "a2");
        if (!end1 || !end2) return false;

        const tryFit = (lineAtEnd, roundAtEnd, endLinePt, endRoundPt) => {
            const lineConn = findConnectedLineAtPoint(endLinePt, null);
            if (!lineConn || !lineConn.line) return false;
            const exclude = new Set([Number(arcShape.id), Number(lineConn.line.id)]);
            const roundConn = findConnectedRoundAtPoint(endRoundPt, exclude);
            if (!roundConn) return false;
            const hint = arcMidHint(arcShape);
            const sol = solveLineCircleFillet(lineConn.line, roundConn, nextR, hint);
            if (!sol || !sol.ok || !sol.arc || !sol.tLine || !sol.tCircle) return false;
            const lineBeforeTrim = {
                type: "line",
                x1: Number(lineConn.line.x1), y1: Number(lineConn.line.y1),
                x2: Number(lineConn.line.x2), y2: Number(lineConn.line.y2),
            };

            if (roundConn.type === "arc") {
                const okArcTrim = (sol.arcCutKey === "a1" || sol.arcCutKey === "a2")
                    ? trimArcEndpointForFilletByKey(roundConn, sol.tCircle, sol.arcCutKey)
                    : trimArcEndpointForFilletTowardPoint(roundConn, sol.tCircle, sol.sharedIntersection || sol.arcMid || null, lineBeforeTrim);
                if (!okArcTrim) return false;
            }

            if (lineConn.key === "p1") { lineConn.line.x1 = Number(sol.tLine.x); lineConn.line.y1 = Number(sol.tLine.y); }
            else { lineConn.line.x2 = Number(sol.tLine.x); lineConn.line.y2 = Number(sol.tLine.y); }

            arcShape.cx = Number(sol.arc.cx ?? sol.center?.x);
            arcShape.cy = Number(sol.arc.cy ?? sol.center?.y);
            arcShape.r = Number(sol.arc.r ?? sol.radius);
            arcShape.a1 = Number(sol.arc.a1);
            arcShape.a2 = Number(sol.arc.a2);
            arcShape.ccw = sol.arc.ccw !== false;
            return [arcShape.cx, arcShape.cy, arcShape.r, arcShape.a1, arcShape.a2].every(Number.isFinite);
        };

        // Try both endpoint assignments:
        // a1 -> line / a2 -> round, then reverse.
        if (tryFit("a1", "a2", end1, end2)) return true;
        if (tryFit("a2", "a1", end2, end1)) return true;
        return false;
    };
    const fitArcAsArcArcFillet = (arcShape) => {
        if (!arcShape || arcShape.type !== "arc") return false;
        const end1 = getArcEndPoint(arcShape, "a1");
        const end2 = getArcEndPoint(arcShape, "a2");
        if (!end1 || !end2) return false;
        const c1 = findConnectedArcAtPoint(end1, new Set([Number(arcShape.id)]));
        const c2 = findConnectedArcAtPoint(end2, new Set([Number(arcShape.id), Number(c1?.id)]));
        if (!c1 || !c2) return false;
        const hint = arcMidHint(arcShape);
        const sol = solveArcArcFillet(c1, c2, nextR, hint);
        if (!sol || !sol.ok || !sol.arc || !sol.t1 || !sol.t2) return false;

        // Keep neighboring arcs connected at their fillet-side endpoint.
        const ok1 = trimArcEndpointForFillet(c1, sol.t1);
        const ok2 = trimArcEndpointForFillet(c2, sol.t2);
        if (!ok1 || !ok2) return false;

        arcShape.cx = Number(sol.arc.cx ?? sol.center?.x);
        arcShape.cy = Number(sol.arc.cy ?? sol.center?.y);
        arcShape.r = Number(sol.arc.r ?? sol.radius);
        arcShape.a1 = Number(sol.arc.a1);
        arcShape.a2 = Number(sol.arc.a2);
        arcShape.ccw = sol.arc.ccw !== false;
        return [arcShape.cx, arcShape.cy, arcShape.r, arcShape.a1, arcShape.a2].every(Number.isFinite);
    };
    pushHistory();
    let adjustedFilletArcs = 0;
    let adjustedSimple = 0;
    for (const s of sel) {
        if (s.type === "arc" && (fitArcAsLineLineFillet(s) || fitArcAsLineRoundFillet(s) || fitArcAsArcArcFillet(s))) {
            adjustedFilletArcs++;
            continue;
        }
        s.r = nextR;
        adjustedSimple++;
    }
    if (setStatus) {
        if (adjustedFilletArcs > 0) {
            setStatus(`Applied Radius (R=${nextR}) - fillet arcs: ${adjustedFilletArcs}, normal: ${adjustedSimple}`);
        } else {
            setStatus(`Applied Circle/Arc Radius Input (R=${nextR})`);
        }
    }
    if (draw) draw();
}

export function applyFillet(state, helpers, radius, worldHint = null) {
    return trimateFillet(state, helpers, radius, worldHint);
}

export function applyPendingLineCircleFillet(state, helpers, keepEnd) {
    const { setStatus, draw, addShape, nextShapeId } = helpers;
    const ff = state.input.filletFlow;
    if (!ff || !ff.sol) return;
    const sol = ff.sol;
    const lineRef = state.shapes.find(s => Number(s.id) === Number(ff.line?.id));
    const circleRef = state.shapes.find(s => Number(s.id) === Number(ff.circle?.id));
    if (!lineRef || !circleRef) {
        if (setStatus) setStatus("Fillet failed: target object was not found");
        state.input.filletFlow = null;
        if (draw) draw();
        return;
    }
    const mode = state.filletSettings.lineMode || "trim";
    const doTrim = (mode === "trim");
    const stepMode = !!ff.debugStepActive;
    const phase = Number(ff.debugPhase || 0);
    let trimWarning = false;
    const arcSpan = (() => {
        const a1 = Number(sol.arc?.a1);
        const a2 = Number(sol.arc?.a2);
        const ccw = sol.arc?.ccw !== false;
        if (![a1, a2].every(Number.isFinite)) return NaN;
        return ccw
            ? (((a2 - a1) + Math.PI * 2) % (Math.PI * 2))
            : (((a1 - a2) + Math.PI * 2) % (Math.PI * 2));
    })();
    if (!(arcSpan > 1e-5 && arcSpan < Math.PI * 2 - 1e-5)) {
        if (setStatus) setStatus("Fillet failed: invalid fillet arc span");
        state.input.filletFlow = null;
        if (draw) draw();
        return;
    }
    const hintPointForTrim = (ff?.clickWorld && Number.isFinite(Number(ff.clickWorld.x)) && Number.isFinite(Number(ff.clickWorld.y)))
        ? { x: Number(ff.clickWorld.x), y: Number(ff.clickWorld.y) }
        : (sol.sharedIntersection || sol.arcMid || null);
    const trimA = pickLineArcIntersectionA(lineRef, circleRef, sol, hintPointForTrim);
    const trimB = { x: Number(sol?.tCircle?.x), y: Number(sol?.tCircle?.y) };
    const trimMid = (trimA && [trimB.x, trimB.y].every(Number.isFinite))
        ? { x: (Number(trimA.x) + Number(trimB.x)) * 0.5, y: (Number(trimA.y) + Number(trimB.y)) * 0.5 }
        : null;
    if (ff) {
        ff.debugTrimA = trimA || null;
        ff.debugTrimB = [trimB.x, trimB.y].every(Number.isFinite) ? trimB : null;
        ff.debugTrimClick = trimMid || null;
        ff.debugTrimVirtualClicks = [];
        if (circleRef.type === "arc") {
            const C3 = sol?.arcMid || {
                x: (Number(sol?.tLine?.x) + Number(sol?.tCircle?.x)) * 0.5,
                y: (Number(sol?.tLine?.y) + Number(sol?.tCircle?.y)) * 0.5
            };
            let previewClicks = [];
            if (trimA && Number.isFinite(Number(sol?.tCircle?.x)) && Number.isFinite(Number(sol?.tCircle?.y))) {
                previewClicks = buildArcTrimVirtualClicksByABCMid(circleRef, sol.tCircle, trimA, C3);
            }
            if (!previewClicks.length) previewClicks = buildArcTrimVirtualClicksFallback(circleRef);
            ff.debugTrimVirtualClicks = previewClicks.slice();
        }
    }
    let arc = null;
    if (stepMode && phase >= 1 && Number.isFinite(Number(ff.debugArcId))) {
        arc = state.shapes.find((s) => Number(s.id) === Number(ff.debugArcId)) || null;
    }
    if (!arc) {
        pushHistory(state);
        arc = { id: nextShapeId(), type: "arc", cx: sol.center.x, cy: sol.center.y, r: sol.radius, a1: sol.arc.a1, a2: sol.arc.a2, ccw: sol.arc.ccw, layerId: state.activeLayerId };
        applyFilletSourceStyle(state, arc, [lineRef, circleRef]);
        addShape(arc);
        if (stepMode) {
            ff.debugArcId = Number(arc.id);
            ff.debugPhase = 1;
            if (setStatus) setStatus("Fillet Step 1/2: R created. Press Enter to run trim.");
            if (draw) draw();
            return;
        }
    }
    if (doTrim) {
        // Keep sources unchanged when auto-trim cannot be resolved robustly.
        const lineSnap = { x1: Number(lineRef.x1), y1: Number(lineRef.y1), x2: Number(lineRef.x2), y2: Number(lineRef.y2) };
        const arcSnap = (circleRef.type === "arc")
            ? { a1: Number(circleRef.a1), a2: Number(circleRef.a2), ccw: circleRef.ccw !== false }
            : null;
        const plan = computeLineCircleAutoTrimPlan(state, sol, lineRef, circleRef, keepEnd, arc.id);
        let okAll = !!plan?.okAll;
        const lineCand = plan?.lineCandidate || null;
        if (!okAll || !lineCand) {
            okAll = false;
        } else {
            if (lineCand.mode === "p1") {
                lineRef.x1 = Number(lineCand.ip?.x);
                lineRef.y1 = Number(lineCand.ip?.y);
            } else {
                lineRef.x2 = Number(lineCand.ip?.x);
                lineRef.y2 = Number(lineCand.ip?.y);
            }
            const ll = Math.hypot(Number(lineRef.x2) - Number(lineRef.x1), Number(lineRef.y2) - Number(lineRef.y1));
            if (!(ll > 1e-6)) okAll = false;
        }
        if (okAll && circleRef.type === "arc") {
            const A = trimA;
            let okArc = false;
            const C3 = sol?.arcMid || {
                x: (Number(sol?.tLine?.x) + Number(sol?.tCircle?.x)) * 0.5,
                y: (Number(sol?.tLine?.y) + Number(sol?.tCircle?.y)) * 0.5
            };
            let virtualClicks = [];
            if (A && Number.isFinite(Number(sol?.tCircle?.x)) && Number.isFinite(Number(sol?.tCircle?.y))) {
                virtualClicks = buildArcTrimVirtualClicksByABCMid(circleRef, sol.tCircle, A, C3);
            }
            if (!virtualClicks.length) {
                virtualClicks = buildArcTrimVirtualClicksFallback(circleRef);
            }
            if (ff) ff.debugTrimVirtualClicks = virtualClicks.slice();
            for (const cp of virtualClicks) {
                const retryPoints = expandArcClickPointWithJitter(circleRef, cp);
                for (const rp of retryPoints) {
                    if (applyArcTrimByVirtualClickCandidate(state, circleRef, rp)) {
                        okArc = true;
                        break;
                    }
                }
                if (okArc) break;
            }
            if (!okArc) {
                okAll = false;
            } else {
                const oldSpan = autoTrimSpan(arcSnap.a1, arcSnap.a2, arcSnap.ccw);
                const newSpan = autoTrimSpan(Number(circleRef.a1), Number(circleRef.a2), circleRef.ccw !== false);
                const nearFullEps = 0.02;
                if (!(newSpan > 1e-5 && newSpan < AUTO_TRIM_TAU - nearFullEps && newSpan < oldSpan - 1e-6)) okAll = false;
            }
        }
        if (!okAll) {
            lineRef.x1 = lineSnap.x1; lineRef.y1 = lineSnap.y1;
            lineRef.x2 = lineSnap.x2; lineRef.y2 = lineSnap.y2;
            if (arcSnap) {
                circleRef.a1 = arcSnap.a1;
                circleRef.a2 = arcSnap.a2;
                circleRef.ccw = arcSnap.ccw;
            }
            trimWarning = true;
        }
    }
    if (stepMode) {
        ff.debugPhase = 0;
        ff.debugArcId = null;
        ff.debugStepActive = false;
    }
    state.input.filletFlow = null;
    if (setStatus) setStatus(trimWarning ? "Fillet created (trim skipped: source geometry kept)" : "Fillet created");
    if (draw) draw();
}

export function applyPendingArcArcFillet(state, helpers, keep1, keep2) {
    const { setStatus, draw, addShape, nextShapeId } = helpers;
    const ff = state.input.filletFlow;
    if (!ff || !ff.sol) return;
    const sol = ff.sol;
    const arc1Ref = state.shapes.find(s => Number(s.id) === Number(ff.sol?.arc1?.id));
    const arc2Ref = state.shapes.find(s => Number(s.id) === Number(ff.sol?.arc2?.id));
    if (!arc1Ref || !arc2Ref) {
        if (setStatus) setStatus("Fillet failed: target arc was not found");
        state.input.filletFlow = null;
        if (draw) draw();
        return;
    }
    pushHistory(state);
    const mode = state.filletSettings.lineMode || "trim";
    const doTrim = (mode === "trim");
    let trimWarning = false;
    const arc = { id: nextShapeId(), type: "arc", cx: sol.center.x, cy: sol.center.y, r: sol.radius, a1: sol.arc.a1, a2: sol.arc.a2, ccw: sol.arc.ccw, layerId: state.activeLayerId };
    applyFilletSourceStyle(state, arc, [arc1Ref, arc2Ref]);
    addShape(arc);
    if (doTrim) {
        const arc1Snap = { a1: Number(arc1Ref.a1), a2: Number(arc1Ref.a2), ccw: arc1Ref.ccw !== false };
        const arc2Snap = { a1: Number(arc2Ref.a1), a2: Number(arc2Ref.a2), ccw: arc2Ref.ccw !== false };
        const ok1 = trimArcForFilletKeepSide(arc1Ref, sol.t1, keep1);
        const ok2 = trimArcForFilletKeepSide(arc2Ref, sol.t2, keep2);
        if (!ok1 || !ok2) {
            arc1Ref.a1 = arc1Snap.a1; arc1Ref.a2 = arc1Snap.a2; arc1Ref.ccw = arc1Snap.ccw;
            arc2Ref.a1 = arc2Snap.a1; arc2Ref.a2 = arc2Snap.a2; arc2Ref.ccw = arc2Snap.ccw;
            trimWarning = true;
        }
    }
    state.input.filletFlow = null;
    if (setStatus) setStatus(trimWarning ? "Fillet created (trim skipped: arc would become full circle)" : "Fillet created");
    if (draw) draw();
}

