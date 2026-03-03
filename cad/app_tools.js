import {
    addShape, nextShapeId, pushHistory, pushHistorySnapshot,
    setSelection, clearSelection, snapshotModel, removeShapeById,
    getGroup, setActiveGroup, nextGroupId, addGroup, setActiveLayer, isLayerVisible, createGroupFromSelection
} from "./state.js";
import {
    solveLineLineFilletWithEnds, solveLineLineFillet, solveLineCircleFilletWithEnds,
    solveLineCircleFillet, solveArcArcFillet, isAngleOnArc, rotatePointAround,
    normalizeRad, arcParamAlong, angleDegFromOrigin, chooseTrimSideForIntersectionByT
} from "./solvers.js";
import { snapPoint, getEffectiveGridSize, mmPerUnit, getHatchPitchWorld, getHatchLineShiftWorld, getHatchPaddingWorld, getHatchDashWorld, getHatchGapWorld } from "./geom.js";
import { getDimGeometry, getDimChainGeometry, getDimAngleGeometry, getSpecialDimGeometry, getCircleDimGeometry } from "./dim_geom.js";
import { buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";
import {
    getSelectedShapes, collectGroupTreeShapeIds, collectGroupTreeGroupSnapshots,
    hitTestShapes, ensureUngroupedShapesHaveGroups, getTrimHoverCandidate
} from "./app_selection.js";
import { executeDoubleLine } from "./dline_geom.js";

export { executeDoubleLine };

function buildRandomColorMap(ids) {
    const out = {};
    for (const raw of (ids || [])) {
        const id = Number(raw);
        if (!Number.isFinite(id)) continue;
        const hue = Math.floor(Math.random() * 360);
        const sat = 62 + Math.floor(Math.random() * 28);
        const light = 34 + Math.floor(Math.random() * 20);
        out[id] = `hsl(${hue} ${sat}% ${light}%)`;
    }
    return out;
}

/**
 * Specialized Tool & Execution Logic extracted from app.js
 */

export function splitLineForFillet(line, p) {
    const ax = Number(line.x1), ay = Number(line.y1), bx = Number(line.x2), by = Number(line.y2);
    const mk = (x1, y1, x2, y2) => ({
        id: 0,
        type: "line",
        x1, y1, x2, y2,
        layerId: line.layerId
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
        if (Number.isFinite(lw) || lt) {
            src = s;
            break;
        }
    }
    const lw = Math.max(0.01, Number(src?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
    const lt = String(src?.lineType || "solid");
    targetArc.lineWidthMm = lw;
    targetArc.lineType = lt;
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
    if (doTrim) {
        const s1 = sol.t1, s2 = sol.t2;
        if (!s1 || !s2 || !Number.isFinite(Number(s1.x)) || !Number.isFinite(Number(s1.y)) || !Number.isFinite(Number(s2.x)) || !Number.isFinite(Number(s2.y))) {
            if (setStatus) setStatus("Fillet failed: invalid tangent points");
            return false;
        }
        const e1 = chooseEndsForLineByKeepEnd(line1, sol.t1, sol.keepEnd1 || "p1");
        const e2 = chooseEndsForLineByKeepEnd(line2, sol.t2, sol.keepEnd2 || "p1");
        const n1x1 = Number(e1.keepPoint?.x), n1y1 = Number(e1.keepPoint?.y), n1x2 = Number(sol.t1?.x), n1y2 = Number(sol.t1?.y);
        const n2x1 = Number(e2.keepPoint?.x), n2y1 = Number(e2.keepPoint?.y), n2x2 = Number(sol.t2?.x), n2y2 = Number(sol.t2?.y);
        if ([n1x1, n1y1, n1x2, n1y2].every(Number.isFinite) && Math.hypot(n1x2 - n1x1, n1y2 - n1y1) > 1e-6) {
            line1.x1 = n1x1; line1.y1 = n1y1; line1.x2 = n1x2; line1.y2 = n1y2;
        }
        if ([n2x1, n2y1, n2x2, n2y2].every(Number.isFinite) && Math.hypot(n2x2 - n2x1, n2y2 - n2y1) > 1e-6) {
            line2.x1 = n2x1; line2.y1 = n2y1; line2.x2 = n2x2; line2.y2 = n2y2;
        }
    }
    addShape(arc);
    setSelection(state, [arc.id]);
    if (setStatus) setStatus(`Fillet (R=${r.toFixed(2)}) created`);
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

export function executeHatch(state, helpers) {
    const { setStatus, draw, addShape, nextShapeId, buildHatchLoopsFromBoundaryIds, createGroupFromSelection } = helpers;
    const ids = state.hatchDraft?.boundaryIds || [];
    if (ids.length === 0) {
        if (setStatus) setStatus("Hatch: 蠅・阜繧帝∈謚槭＠縺ｦ縺上□縺輔＞");
        return;
    }
    const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, ids, state.view.scale);
    if (!parsed.ok) {
        if (setStatus) setStatus(`Hatch Error: ${parsed.error || "蠅・阜縺碁哩縺倥※縺・∪縺帙ｓ"}`);
        if (draw) draw();
        return;
    }
    let targetGroupId = null;
    const boundaryObjs = ids.map(id => state.shapes.find(s => s.id === id)).filter(Boolean);
    if (boundaryObjs.length > 0) {
        const groupIds = new Set(boundaryObjs.map(s => s.groupId).filter(id => id != null));
        if (groupIds.size === 1) {
            targetGroupId = Array.from(groupIds)[0];
        } else {
            // In app.js, it creates a group from selection. For now, let's assume helpers provide this
            const newG = createGroupFromSelection(state, "Hatch Group");
            if (newG) targetGroupId = newG.id;
        }
    }

    if (boundaryObjs.length > 0 && targetGroupId === null) {
        const gid = nextGroupId(state);
        const newG = {
            id: gid,
            name: "Hatch Group",
            shapeIds: [...ids],
            parentId: null,
            originX: 0, originY: 0,
            rotationDeg: 0,
        };
        const b = parsed.bounds;
        if (b) {
            newG.originX = (b.minX + b.maxX) * 0.5;
            newG.originY = (b.minY + b.maxY) * 0.5;
        }
        const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
        newG.originX = Math.round(Number(newG.originX || 0) / gridStep) * gridStep;
        newG.originY = Math.round(Number(newG.originY || 0) / gridStep) * gridStep;
        addGroup(state, newG);
        targetGroupId = gid;
        boundaryObjs.forEach(s => s.groupId = gid);
    }

    pushHistory(state);
    const shape = {
        id: nextShapeId(),
        type: "hatch",
        boundaryIds: [...ids],
        pitchMm: Number(state.hatchSettings?.pitchMm ?? 5),
        angleDeg: Number(state.hatchSettings?.angleDeg ?? 45),
        pattern: state.hatchSettings?.pattern ?? "single",
        crossAngleDeg: Number(state.hatchSettings?.crossAngleDeg ?? 90),
        rangeScale: Number(state.hatchSettings?.rangeScale ?? 1.2),
        parallelRangeScale: Number(state.hatchSettings?.parallelRangeScale ?? 1.2),
        lineShiftMm: Number(state.hatchSettings?.lineShiftMm ?? 0),
        hatchLineType: state.hatchSettings?.lineType ?? "solid",
        lineType: state.hatchSettings?.lineType ?? "solid",
        lineDashMm: Number(state.hatchSettings?.lineDashMm ?? 5),
        lineGapMm: Number(state.hatchSettings?.lineGapMm ?? 2),
        repetitionPaddingMm: Number(state.hatchSettings?.repetitionPaddingMm ?? 2),
        lineWidthMm: Math.max(0.01, Number(state.hatchSettings?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25),
        layerId: state.activeLayerId,
        groupId: targetGroupId,
    };
    addShape(shape);

    if (targetGroupId != null) {
        const parentGroup = getGroup(state, targetGroupId);
        if (parentGroup) {
            if (!parentGroup.shapeIds) parentGroup.shapeIds = [];
            if (!parentGroup.shapeIds.includes(shape.id)) parentGroup.shapeIds.push(shape.id);
        }
    }

    state.hatchDraft.boundaryIds = [];
    if (setStatus) setStatus(`Hatch #${shape.id} created (${ids.length} boundaries)`);
    if (draw) draw();
}

export function exportJsonObject(state, helpers) {
    const { snapshotModel } = helpers;
    return {
        format: "s-cad",
        version: state.buildVersion,
        model: snapshotModel ? snapshotModel() : { shapes: state.shapes, groups: state.groups, layers: state.layers },
        grid: { ...state.grid },
        view: { ...state.view },
    pageSetup: { ...state.pageSetup },
    lineWidthMm: Math.max(0.01, Number(state.lineWidthMm ?? 0.25) || 0.25),
  };
}

export function importJsonObject(state, data, helpers) {
    const { restoreModel, setStatus, draw } = helpers;
    if (!data || data.format !== "s-cad") {
        if (setStatus) setStatus("Invalid s-cad JSON");
        return;
    }
    if (!data.model) {
        if (setStatus) setStatus("Missing model");
        return;
    }
    restoreModel(state, data.model);
    ensureUngroupedShapesHaveGroups(state);

    if (data.grid) {
        if (Number.isFinite(Number(data.grid.size))) state.grid.size = Math.max(1, Number(data.grid.size));
        state.grid.snap = !!data.grid.snap;
        state.grid.show = data.grid.show !== false;
        state.grid.auto = data.grid.auto !== false;
        if (Number.isFinite(Number(data.grid.autoThreshold50))) state.grid.autoThreshold50 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold50))));
        if (Number.isFinite(Number(data.grid.autoThreshold10))) state.grid.autoThreshold10 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold10))));
        if (Number.isFinite(Number(data.grid.autoThreshold5))) state.grid.autoThreshold5 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold5))));
        if (Number.isFinite(Number(data.grid.autoThreshold1))) state.grid.autoThreshold1 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold1))));
        if (Number.isFinite(Number(data.grid.autoBasePxAtReset))) state.grid.autoBasePxAtReset = Math.max(1e-9, Number(data.grid.autoBasePxAtReset));
        if (state.grid.autoThreshold10 < state.grid.autoThreshold50) state.grid.autoThreshold10 = state.grid.autoThreshold50;
        if (state.grid.autoThreshold5 < state.grid.autoThreshold10) state.grid.autoThreshold5 = state.grid.autoThreshold10;
        if (state.grid.autoThreshold1 < state.grid.autoThreshold5) state.grid.autoThreshold1 = state.grid.autoThreshold5;
        if (Number.isFinite(Number(data.grid.autoTiming))) {
            state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Number(data.grid.autoTiming))));
        } else {
            const v50 = Math.max(110, Math.min(240, Number(state.grid.autoThreshold50) || 130));
            const s = Math.max(0, Math.min(1, (v50 - 110) / 130));
            state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Math.sqrt(s) * 100)));
        }
    }
    if (data.view) {
        if (Number.isFinite(Number(data.view.scale))) state.view.scale = Number(data.view.scale);
        if (Number.isFinite(Number(data.view.offsetX))) state.view.offsetX = Number(data.view.offsetX);
        if (Number.isFinite(Number(data.view.offsetY))) state.view.offsetY = Number(data.view.offsetY);
    }
    if (data.pageSetup && state.pageSetup) {
        state.pageSetup.size = String(data.pageSetup.size || state.pageSetup.size || "A4");
        state.pageSetup.orientation = (String(data.pageSetup.orientation || state.pageSetup.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
        state.pageSetup.scale = Math.max(0.0001, Number(data.pageSetup.scale ?? state.pageSetup.scale ?? 1) || 1);
        state.pageSetup.unit = String(data.pageSetup.unit || state.pageSetup.unit || "mm");
        state.pageSetup.showFrame = data.pageSetup.showFrame !== false;
        state.pageSetup.innerMarginMm = Math.max(0, Number(data.pageSetup.innerMarginMm ?? state.pageSetup.innerMarginMm ?? 10) || 0);
    }
    state.lineWidthMm = Math.max(0.01, Number(data.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
    for (const s of (state.shapes || [])) {
        if (!Number.isFinite(Number(s?.lineWidthMm))) s.lineWidthMm = state.lineWidthMm;
        if (typeof s?.lineType !== "string") s.lineType = "solid";
    }
    state.preview = null;
    state.polylineDraft = null;
    state.dimDraft = null;
    state.selection.drag.active = false;
    state.selection.drag.shapeSnapshots = null;
    state.selection.box.active = false;
    state.history.past = [];
    state.history.future = [];

    if (setStatus) setStatus("Imported JSON successfully");
    if (draw) draw();
}

export function saveJsonToFile(state, helpers) {
    const { setStatus, draw } = helpers;
    const data = exportJsonObject(state, helpers);
    const text = JSON.stringify(data, null, 2);
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Avoid revoking too early: some browsers can produce empty files if revoked immediately.
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (setStatus) setStatus(`Saved ${name}`);
    if (draw) draw();
}

export function saveJsonAsToFile(state, helpers) {
    const { setStatus, draw } = helpers;
    const data = exportJsonObject(state, helpers);
    const text = JSON.stringify(data, null, 2);
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fallback = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
    let name = window.prompt("保存ファイル名", fallback);
    if (name == null) {
        if (setStatus) setStatus("別名保存をキャンセルしました");
        if (draw) draw();
        return;
    }
    name = String(name).trim();
    if (!name) name = fallback;
    if (!/\.json$/i.test(name)) name += ".json";
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (setStatus) setStatus(`Saved ${name}`);
    if (draw) draw();
}

export function loadJsonFromFileDialog(state, dom) {
    if (!dom.jsonFileInput) return;
    dom.jsonFileInput.value = "";
    dom.jsonFileInput.click();
}

export function importJsonObjectAppend(state, data, helpers) {
    const { setStatus, draw } = helpers;
    if (!data || data.format !== "s-cad" || !data.model) {
        if (setStatus) setStatus("Invalid s-cad JSON");
        if (draw) draw();
        return false;
    }
    const model = data.model || {};
    const srcShapes = Array.isArray(model.shapes) ? model.shapes : [];
    const srcGroups = Array.isArray(model.groups) ? model.groups : [];
    const srcLayers = Array.isArray(model.layers) ? model.layers : [];
    pushHistory(state);

    const layerIdMap = new Map();
    const normalizeLayerName = (name) => String(name || "").trim().toLowerCase();
    const findLayerByName = (name) => {
        const key = normalizeLayerName(name);
        return (state.layers || []).find((l) => normalizeLayerName(l?.name) === key);
    };
    for (const l of srcLayers) {
        const srcId = Number(l?.id);
        if (!Number.isFinite(srcId)) continue;
        const existing = findLayerByName(l?.name);
        if (existing) {
            layerIdMap.set(srcId, Number(existing.id));
            continue;
        }
        const newId = Number(state.nextLayerId) || 1;
        state.nextLayerId = newId + 1;
        state.layers.push({
            id: newId,
            name: String(l?.name || `Layer ${newId}`),
            visible: l?.visible !== false,
            locked: l?.locked === true,
        });
        layerIdMap.set(srcId, newId);
    }

    const shapeIdMap = new Map();
    for (const s of srcShapes) {
        const oldId = Number(s?.id);
        if (!Number.isFinite(oldId)) continue;
        shapeIdMap.set(oldId, Number(nextShapeId(state)));
    }
    const groupIdMap = new Map();
    for (const g of srcGroups) {
        const oldId = Number(g?.id);
        if (!Number.isFinite(oldId)) continue;
        groupIdMap.set(oldId, Number(nextGroupId(state)));
    }

    const importedShapes = [];
    for (const src of srcShapes) {
        const oldId = Number(src?.id);
        const newId = Number(shapeIdMap.get(oldId));
        if (!Number.isFinite(newId)) continue;
        const c = JSON.parse(JSON.stringify(src));
        c.id = newId;
        if (Number.isFinite(Number(c.layerId))) {
            c.layerId = Number(layerIdMap.get(Number(c.layerId)) ?? state.activeLayerId);
        } else {
            c.layerId = state.activeLayerId;
        }
        if (Number.isFinite(Number(c.groupId))) {
            c.groupId = Number(groupIdMap.get(Number(c.groupId)) ?? c.groupId);
        }
        patternRemapRefsDeep(c, shapeIdMap);
        importedShapes.push(c);
    }

    const importedGroups = [];
    for (const src of srcGroups) {
        const oldId = Number(src?.id);
        const newId = Number(groupIdMap.get(oldId));
        if (!Number.isFinite(newId)) continue;
        const g = JSON.parse(JSON.stringify(src));
        g.id = newId;
        g.parentId = (g.parentId == null) ? null : Number(groupIdMap.get(Number(g.parentId)) ?? null);
        g.shapeIds = Array.isArray(g.shapeIds)
            ? g.shapeIds.map((sid) => Number(shapeIdMap.get(Number(sid)))).filter((sid) => Number.isFinite(sid))
            : [];
        importedGroups.push(g);
    }

    if (importedGroups.length) state.groups = [...importedGroups, ...(state.groups || [])];
    if (importedShapes.length) state.shapes = [...(state.shapes || []), ...importedShapes];
    state.selection.ids = importedShapes.map((s) => Number(s.id));
    state.selection.groupIds = importedGroups.map((g) => Number(g.id));
    state.activeGroupId = state.selection.groupIds.length ? Number(state.selection.groupIds[state.selection.groupIds.length - 1]) : state.activeGroupId;
    if (setStatus) setStatus(`インポート完了: ${importedShapes.length} 個のオブジェクト`);
    if (draw) draw();
    return true;
}

export function createLine(p1, p2) {
    return { id: 0, type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

export function createRect(p1, p2) {
    return { id: 0, type: "rect", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

export function createCircle(center, edge) {
    return { id: 0, type: "circle", cx: center.x, cy: center.y, r: Math.hypot(edge.x - center.x, edge.y - center.y) };
}

export function createPosition(p) {
    return { id: 0, type: "position", x: p.x, y: p.y };
}

export function createText(p, settings) {
    return {
        id: 0, type: "text", x1: p.x, y1: p.y,
        text: settings.content,
        textColor: "#0f172a",
        textSizePt: settings.sizePt,
        textRotate: settings.rotate,
        textFontFamily: settings.fontFamily,
        textBold: settings.bold,
        textItalic: settings.italic,
    };
}

export function createDim(patch) {
    return {
        id: 0,
        type: "dim",
        dimOffset: 24,
        extOffset: 2,
        extOver: 2,
        textOffset: 10,
        textAlong: 0,
        textRotate: "auto",
        fontSize: 12,
        precision: 1,
        rOverrun: 5,
        dimArrowType: 'open',
        dimArrowSizePt: 10,
        dimArrowDirection: "normal",
        ...patch
    };
}

export function createArc(center, radius, a1, a2, ccw = true) {
    return { id: 0, type: "arc", cx: center.x, cy: center.y, r: radius, a1, a2, ccw: !!ccw };
}

export function applyLineInput(state, helpers, len, ang) {
    const { pushHistory, draw, setStatus } = helpers;
    const sel = getSelectedShapes(state).filter(s => s.type === "line");
    if (sel.length === 0) return;
    pushHistory();
    const rad = ang * Math.PI / 180;
    for (const s of sel) {
        s.x2 = s.x1 + len * Math.cos(rad);
        s.y2 = s.y1 + len * Math.sin(rad);
    }
    if (setStatus) setStatus(`Applied Line Input (L=${len}, A=${ang})`);
    if (draw) draw();
}

export function applyRectInput(state, helpers, w, h) {
    const { pushHistory, draw, setStatus } = helpers;
    const sel = getSelectedShapes(state).filter(s => s.type === "rect");
    if (sel.length === 0) return;
    pushHistory();
    for (const s of sel) {
        s.x2 = s.x1 + w;
        s.y2 = s.y1 + h;
    }
    if (setStatus) setStatus(`Applied Rect Input (W=${w}, H=${h})`);
    if (draw) draw();
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
    let trimWarning = false;
    // Create fillet arc first (split-only state), then attempt trim.
    pushHistory(state);
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
    const arc = { id: nextShapeId(), type: "arc", cx: sol.center.x, cy: sol.center.y, r: sol.radius, a1: sol.arc.a1, a2: sol.arc.a2, ccw: sol.arc.ccw, layerId: state.activeLayerId };
    applyFilletSourceStyle(state, arc, [lineRef, circleRef]);
    addShape(arc);
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
            const arcCand = plan?.arcCandidate || null;
            if (!arcCand) {
                okAll = false;
            } else {
                circleRef.a1 = Number(arcCand.keepA1);
                circleRef.a2 = Number(arcCand.keepA2);
                circleRef.ccw = (arcCand.remCCW !== false);
                const oldSpan = autoTrimSpan(arcSnap.a1, arcSnap.a2, arcSnap.ccw);
                const newSpan = autoTrimSpan(circleRef.a1, circleRef.a2, circleRef.ccw !== false);
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
    if (doTrim) {
        const ok1 = trimArcForFilletKeepSide(arc1Ref, sol.t1, keep1);
        const ok2 = trimArcForFilletKeepSide(arc2Ref, sol.t2, keep2);
        if (!ok1 || !ok2) trimWarning = true;
    }
    const arc = { id: nextShapeId(), type: "arc", cx: sol.center.x, cy: sol.center.y, r: sol.radius, a1: sol.arc.a1, a2: sol.arc.a2, ccw: sol.arc.ccw, layerId: state.activeLayerId };
    applyFilletSourceStyle(state, arc, [arc1Ref, arc2Ref]);
    addShape(arc);
    state.input.filletFlow = null;
    if (setStatus) setStatus(trimWarning ? "Fillet created (trim skipped: arc would become full circle)" : "Fillet created");
    if (draw) draw();
}

export function trimClickedLineAtNearestIntersection(state, worldRaw, helpers) {
    const { setStatus, pushHistory, nextShapeId, addShape, removeShapeById, clearSelection, setSelection, getTrimHoverCandidate, hitTestShapes } = helpers;
    // Note: helpers are already bound to state via closures in app.js.
    // Call them WITHOUT passing state again: addShape(shape), removeShapeById(id), etc.
    const cand = getTrimHoverCandidate(state, worldRaw);
    if (!cand) {
        const hit = hitTestShapes(state, worldRaw);
        if (!hit || hit.type !== "line") return false;
        pushHistory();
        const id = Number(hit.id);
        removeShapeById(id);
        clearSelection();
        if (setStatus) setStatus(`Trim deleted line #${id}`);
        return true;
    }
    const isNoDelete = !!state.trimSettings?.noDelete;
    if (cand.targetType === "circle" || cand.targetType === "arc") {
        pushHistory();
        const a = cand.arc || cand.circle;
        const keepIds = [];
        const inGroups = (state.groups || []).filter(g => (g.shapeIds || []).some(id => Number(id) === Number(a.id)));

        if (cand.mode === "delete-arc" || cand.mode === "delete-circle") {
            if (!isNoDelete) removeShapeById(Number(a.id));
            else keepIds.push(Number(a.id));
        } else if (cand.mode === "arc-remove-arc") {
            if (isNoDelete) {
                const remArc = { ...a, id: nextShapeId(), a1: cand.remA1, a2: cand.remA2, type: "arc" };
                addShape(remArc);
                for (const g of inGroups) g.shapeIds.push(Number(remArc.id));
                keepIds.push(Number(remArc.id));
            }
            a.type = "arc";
            a.a1 = cand.keepA1; a.a2 = cand.keepA2; a.ccw = (a.ccw !== false);
            keepIds.push(Number(a.id));
        } else if (cand.mode === "arc-remove-middle") {
            if (isNoDelete) {
                const remArc = { ...a, id: nextShapeId(), a1: cand.remA1, a2: cand.remA2, type: "arc" };
                addShape(remArc);
                for (const g of inGroups) g.shapeIds.push(Number(remArc.id));
                keepIds.push(Number(remArc.id));
            }
            a.type = "arc";
            a.a1 = cand.keep1A1; a.a2 = cand.keep1A2; a.ccw = (cand.keepCCW !== false);
            keepIds.push(Number(a.id));
            const a2new = { ...a, id: nextShapeId(), a1: cand.keep2A1, a2: cand.keep2A2, ccw: (cand.keepCCW !== false) };
            addShape(a2new);
            for (const g of inGroups) g.shapeIds.push(Number(a2new.id));
            keepIds.push(Number(a2new.id));
        }

        if (keepIds.length) setSelection(keepIds);
        if (setStatus) setStatus(isNoDelete ? `Split ${a.type} #${a.id}` : `Trimmed ${a.type} #${a.id}`);
        return true;
    }

    const line = cand.line;
    pushHistory();
    const inGroups = (state.groups || []).filter(g => (g.shapeIds || []).some(id => Number(id) === Number(line.id)));

    if (cand.mode === "delete-line") {
        if (!isNoDelete) {
            removeShapeById(Number(line.id));
            setSelection([]);
        } else {
            setSelection([Number(line.id)]);
        }
    } else if (cand.mode === "p1") {
        if (isNoDelete) {
            const cutLine = { ...line, id: nextShapeId(), x2: cand.ip.x, y2: cand.ip.y };
            addShape(cutLine);
            for (const g of inGroups) g.shapeIds.push(Number(cutLine.id));
        }
        line.x1 = cand.ip.x; line.y1 = cand.ip.y;
        setSelection(isNoDelete ? [Number(line.id), Number(state.shapes[state.shapes.length - 1].id)] : [Number(line.id)]);
    } else if (cand.mode === "p2") {
        if (isNoDelete) {
            const cutLine = { ...line, id: nextShapeId(), x1: cand.ip.x, y1: cand.ip.y };
            addShape(cutLine);
            for (const g of inGroups) g.shapeIds.push(Number(cutLine.id));
        }
        line.x2 = cand.ip.x; line.y2 = cand.ip.y;
        setSelection(isNoDelete ? [Number(line.id), Number(state.shapes[state.shapes.length - 1].id)] : [Number(line.id)]);
    } else if (cand.mode === "middle") {
        const ox1 = Number(line.x1), oy1 = Number(line.y1);
        const ox2 = Number(line.x2), oy2 = Number(line.y2);
        const left = cand.ip1, right = cand.ip2;

        if (isNoDelete) {
            const midLine = { ...line, id: nextShapeId(), x1: left.x, y1: left.y, x2: right.x, y2: right.y };
            addShape(midLine);
            for (const g of inGroups) g.shapeIds.push(Number(midLine.id));
        }
        line.x1 = ox1; line.y1 = oy1; line.x2 = left.x; line.y2 = left.y;
        const newLine = { ...line, id: nextShapeId(), x1: right.x, y1: right.y, x2: ox2, y2: oy2 };
        addShape(newLine);
        for (const g of inGroups) g.shapeIds.push(Number(newLine.id));
        setSelection([Number(line.id), Number(newLine.id)]);
    }

    if (setStatus) setStatus(isNoDelete ? `Split line #${line.id}` : `Trimmed line #${line.id}`);
    return true;
}

export function beginOrAdvanceDim(state, worldRaw, helpers) {
    const { setStatus } = helpers;
    const world = { x: worldRaw.x, y: worldRaw.y };
    const circleMode = state.dimSettings?.circleMode || "radius";
    const circleArrowSide = state.dimSettings?.circleArrowSide === "inside" ? "inside" : "outside";
    const linearMode = state.dimSettings?.linearMode || "single";
    const snapMode = String(state.dimSettings?.snapMode || "endpoint");
    const lineObjectPickEnabled = (snapMode === "object" || snapMode === "endpoint");

    if (!state.dimDraft) {
        const hit = hitTestShapes(state, worldRaw);
        if (linearMode === "angle") {
            if (hit && hit.type === "line") {
                state.dimDraft = {
                    type: "dimangle",
                    line1Id: Number(hit.id),
                    pick1: { x: world.x, y: world.y }
                };
                if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
                return "p1";
            }
            if (setStatus) setStatus("角度寸法: 1本目のラインをクリック");
            return "noop";
        }
        // Object mode: clicking a line creates a linear dimension from line endpoints immediately.
        if (lineObjectPickEnabled && linearMode !== "chain" && hit && hit.type === "line") {
            state.dimDraft = {
                p1: { x: Number(hit.x1), y: Number(hit.y1) },
                p2: { x: Number(hit.x2), y: Number(hit.y2) },
                place: { x: world.x, y: world.y },
            };
            return "place";
        }
        if (hit && (hit.type === 'circle' || hit.type === 'arc')) {
            const cx = Number(hit.cx), cy = Number(hit.cy), r = Number(hit.r);
            const ang = Math.atan2(world.y - cy, world.x - cx);
            const ux = Math.cos(ang), uy = Math.sin(ang);
            const textOff = r + 20 / Math.max(1e-9, state.view.scale);
            state.dimDraft = {
                type: "circleDim",
                dimRef: { targetId: Number(hit.id) },
                kind: circleMode === "diameter" ? "diameter" : "radius",
                circleArrowSide,
                ang: ang,
                off1: r + 20 / state.view.scale,
                off2: circleMode === "diameter" ? -r : 0,
                tdx: ux * textOff, tdy: uy * textOff
            };
            return "place";
        }

        if (linearMode === "chain") {
            state.dimDraft = {
                type: "dimchain",
                points: [{ x: world.x, y: world.y }],
                hoverPoint: { x: world.x, y: world.y },
                hoverPlace: { x: world.x, y: world.y },
                awaitingPlacement: false
            };
            if (setStatus) setStatus("逶ｴ蛻怜ｯｸ豕包ｼ・轤ｹ逶ｮ繧帝∈謚槭＠縺ｦ縺上□縺輔＞");
            return "p1";
        } else {
            state.dimDraft = { p1: { x: world.x, y: world.y }, hover: { x: world.x, y: world.y } };
            if (setStatus) setStatus("蟇ｸ豕包ｼ・轤ｹ逶ｮ繧帝∈謚槭＠縺ｦ縺上□縺輔＞");
            return "p1";
        }
    }

    if (state.dimDraft.type === "dimchain") {
        if (state.dimDraft.awaitingPlacement) {
            state.dimDraft.place = { x: world.x, y: world.y };
            return "place";
        }
        if (state.dimDraft.points.length === 1) {
            state.dimDraft.points.push({ x: world.x, y: world.y });
            if (setStatus) setStatus("Chain dim: click more points, then press Enter to place.");
            return "p2";
        }
        state.dimDraft.points.push({ x: world.x, y: world.y });
        return "point";
    }

    if (state.dimDraft.type === "dimangle") {
        const hit = hitTestShapes(state, worldRaw);
        if (!hit || hit.type !== "line") {
            if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
            return "noop";
        }
        const line1Id = Number(state.dimDraft.line1Id);
        const line2Id = Number(hit.id);
        if (line1Id === line2Id) {
            if (setStatus) setStatus("角度寸法: 別のラインを選択してください");
            return "noop";
        }
        const line1 = (state.shapes || []).find(s => Number(s?.id) === line1Id && s.type === "line");
        const line2 = (state.shapes || []).find(s => Number(s?.id) === line2Id && s.type === "line");
        if (!line1 || !line2) {
            if (setStatus) setStatus("角度寸法: ラインが見つかりません");
            return "noop";
        }
        const solved = solveDimAngleFromLines(state, line1, line2, state.dimDraft.pick1 || world, world);
        if (!solved) {
            if (setStatus) setStatus("角度寸法: 平行ラインには作成できません");
            return "noop";
        }
        state.dimDraft = {
            type: "dimangle",
            line1Id,
            line2Id,
            ...solved
        };
        return "place";
    }

    if (state.dimDraft.dimRef && state.dimDraft.type === "circleDim") {
        const ref = state.shapes.find(s => Number(s?.id) === Number(state.dimDraft?.dimRef?.targetId));
        if (ref && (ref.type === "circle" || ref.type === "arc")) {
            const cx = Number(ref.cx), cy = Number(ref.cy);
            state.dimDraft.tdx = world.x - cx;
            state.dimDraft.tdy = world.y - cy;
        } else {
            state.dimDraft.tx = world.x;
            state.dimDraft.ty = world.y;
        }
        return "place";
    }

    if (state.dimDraft.dimRef) return "circle-ref";

    if (!state.dimDraft.p2) {
        if (Math.hypot(world.x - state.dimDraft.p1.x, world.y - state.dimDraft.p1.y) < 1e-9) return "noop";
        state.dimDraft.p2 = { x: world.x, y: world.y };
        if (setStatus) setStatus("蟇ｸ豕包ｼ夐・鄂ｮ菴咲ｽｮ繧呈欠螳壹＠縺ｦ縺上□縺輔＞");
        return "p2";
    }

    state.dimDraft.place = { x: world.x, y: world.y };
    return "place";
}

export function updateDimHover(state, worldRaw, worldSnapped, helpers) {
    const { setStatus } = helpers;
    const world = worldSnapped ? { x: worldSnapped.x, y: worldSnapped.y } : { x: worldRaw.x, y: worldRaw.y };
    const { snapMode, circleMode, linearMode } = state.dimSettings;
    const lineObjectPickEnabled = (String(snapMode || "endpoint") === "object" || String(snapMode || "endpoint") === "endpoint");
    const circleArrowSide = state.dimSettings?.circleArrowSide === "inside" ? "inside" : "outside";

    if (!state.dimDraft) {
        const hit = hitTestShapes(state, worldRaw);
        // Dim tool candidate marker on mouse-over (line/circle/arc), independent from object-snap toggle.
        let hoverCandidate = null;
        if (hit && hit.type === "line") {
            const x1 = Number(hit.x1), y1 = Number(hit.y1), x2 = Number(hit.x2), y2 = Number(hit.y2);
            const vx = x2 - x1, vy = y2 - y1;
            const vv = vx * vx + vy * vy;
            if (vv > 1e-12) {
                let t = ((worldRaw.x - x1) * vx + (worldRaw.y - y1) * vy) / vv;
                if (t < 0) t = 0;
                if (t > 1) t = 1;
                hoverCandidate = { x: x1 + vx * t, y: y1 + vy * t, kind: "nearest" };
            } else {
                hoverCandidate = { x: x1, y: y1, kind: "nearest" };
            }
        } else if (hit && (hit.type === "circle" || hit.type === "arc")) {
            const cx = Number(hit.cx), cy = Number(hit.cy), r = Math.abs(Number(hit.r) || 0);
            if (r > 1e-9) {
                let ang = Math.atan2(worldRaw.y - cy, worldRaw.x - cx);
                if (hit.type === "arc" && !isAngleOnArc(ang, Number(hit.a1) || 0, Number(hit.a2) || 0, hit.ccw !== false)) {
                    const a1 = Number(hit.a1) || 0, a2 = Number(hit.a2) || 0;
                    const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
                    const p2 = { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
                    const d1 = Math.hypot(worldRaw.x - p1.x, worldRaw.y - p1.y);
                    const d2 = Math.hypot(worldRaw.x - p2.x, worldRaw.y - p2.y);
                    hoverCandidate = (d1 <= d2) ? { ...p1, kind: "nearest" } : { ...p2, kind: "nearest" };
                } else {
                    hoverCandidate = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, kind: "nearest" };
                }
            }
        }
        // In single mode, always show a target marker before first click,
        // even when not hovering an object.
        if (!hoverCandidate && String(linearMode || "single") !== "chain") {
            hoverCandidate = { x: Number(world.x), y: Number(world.y), kind: "nearest" };
        }
        state.input.objectSnapHover = hoverCandidate;

        if (hit && (hit.type === "circle" || hit.type === "arc")) {
            const cx = Number(hit.cx), cy = Number(hit.cy), r = Number(hit.r);
            const ang = Math.atan2(world.y - cy, world.x - cx);
            const ux = Math.cos(ang), uy = Math.sin(ang);
            const textOff = r + 20 / Math.max(1e-9, state.view.scale);
            // Radial/Diameter Preview on hover
            state.input.dimHoveredShapeId = Number(hit.id);
            state.input.dimHoverPreview = {
                type: "circleDim",
                dimRef: { targetId: Number(hit.id) },
                kind: circleMode === "diameter" ? "diameter" : "radius",
                circleArrowSide,
                ang: ang,
                off1: r + 20 / state.view.scale,
                off2: circleMode === "diameter" ? -r : 0,
                tdx: ux * textOff, tdy: uy * textOff
            };
            if (setStatus) setStatus("繧ｯ繝ｪ繝・け縺ｧ蟇ｸ豕穂ｽ懈・");
            return;
        } else {
            state.input.dimHoverPreview = null;
        }

        if (String(linearMode || "single") === "angle") {
            if (hit && hit.type === "line") {
                state.input.dimHoveredShapeId = Number(hit.id);
                if (setStatus) setStatus("角度寸法: 1本目/2本目のラインをクリック");
            } else {
                state.input.dimHoveredShapeId = null;
                if (setStatus) setStatus("角度寸法: ライン上にマウスオーバーしてクリック");
            }
        } else if (lineObjectPickEnabled) {
            if (hit && hit.type === "line") {
                state.input.dimHoveredShapeId = Number(hit.id);
                if (setStatus) setStatus("Dim: line selected. Press Enter to confirm.");
            } else {
                state.input.dimHoveredShapeId = null;
                if (setStatus) setStatus("蟇ｸ豕包ｼ壼ｯｾ雎｡繧帝∈謚槭☆繧九°1轤ｹ逶ｮ繧偵け繝ｪ繝・け");
            }
        } else {
            state.input.dimHoveredShapeId = null;
            if (setStatus) setStatus("蟇ｸ豕包ｼ・轤ｹ逶ｮ繧偵け繝ｪ繝・け");
        }
        return;
    }

    state.input.dimHoveredShapeId = null;
    state.input.dimHoverPreview = null;

    if (state.dimDraft.type === "dimangle") {
        const hit = hitTestShapes(state, worldRaw);
        if (hit && hit.type === "line" && Number(hit.id) !== Number(state.dimDraft.line1Id)) {
            const x1 = Number(hit.x1), y1 = Number(hit.y1), x2 = Number(hit.x2), y2 = Number(hit.y2);
            const vx = x2 - x1, vy = y2 - y1;
            const vv = vx * vx + vy * vy;
            let p = { x: x1, y: y1, kind: "nearest" };
            if (vv > 1e-12) {
                let t = ((worldRaw.x - x1) * vx + (worldRaw.y - y1) * vy) / vv;
                if (t < 0) t = 0;
                if (t > 1) t = 1;
                p = { x: x1 + vx * t, y: y1 + vy * t, kind: "nearest" };
            }
            state.input.objectSnapHover = p;
            state.input.dimHoveredShapeId = Number(hit.id);
            if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
        } else {
            state.input.objectSnapHover = null;
            if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
        }
        return;
    }

    if (state.dimDraft.type === "dimchain") {
        if (state.dimDraft.awaitingPlacement) {
            state.dimDraft.hoverPlace = { x: world.x, y: world.y };
        } else {
            state.dimDraft.hoverPoint = { x: world.x, y: world.y };
        }
    } else if (state.dimDraft.dimRef) {
        state.dimDraft.x2 = world.x;
        state.dimDraft.y2 = world.y;
    } else if (!state.dimDraft.p2) {
        state.dimDraft.hover = { x: world.x, y: world.y };
    } else {
        state.dimDraft.place = { x: world.x, y: world.y };
    }
}

export function cancelDimDraft(state) {
    state.dimDraft = null;
}

export function finalizeDimDraft(state, helpers) {
    const { pushHistory, addShape, setSelection, nextShapeId } = helpers;
    const d = state.dimDraft;
    if (!d) return false;

    let dim = null;
    if (d.type === 'circleDim') {
        dim = createDim({
            type: 'circleDim',
            kind: d.kind,
            dimRef: d.dimRef,
            circleArrowSide: d.circleArrowSide === "inside" ? "inside" : "outside",
            ang: d.ang,
            off1: d.off1,
            off2: d.off2,
            tdx: d.tdx, tdy: d.tdy,
            tx: d.tx, ty: d.ty,
            layerId: state.activeLayerId
        });
    } else if (d.dimRef) {
        // Fallback for old dim-radial style if any
        dim = createDim({
            type: 'dim',
            kind: d.kind,
            dimRef: d.dimRef,
            x2: d.x2, y2: d.y2,
            layerId: state.activeLayerId
        });
    } else if (d.type === "dimangle" && Number.isFinite(Number(d.cx)) && Number.isFinite(Number(d.cy))
        && Number.isFinite(Number(d.r)) && Number.isFinite(Number(d.a1)) && Number.isFinite(Number(d.a2))) {
        dim = createDim({
            type: "dimangle",
            cx: Number(d.cx), cy: Number(d.cy),
            r: Math.max(1e-6, Number(d.r)),
            a1: Number(d.a1), a2: Number(d.a2),
            line1Id: Number(d.line1Id),
            line2Id: Number(d.line2Id),
            line1RayEnd: String(d.line1RayEnd || "p1"),
            line2RayEnd: String(d.line2RayEnd || "p1"),
            textOffset: Number(d.textOffset),
            tx: Number(d.tx), ty: Number(d.ty),
            layerId: state.activeLayerId
        });
    } else if (d.points && d.points.length >= 2) {
        dim = createDim({
            type: 'dimchain',
            points: d.points.map(p => ({ x: p.x, y: p.y })),
            px: d.place.x, py: d.place.y,
            layerId: state.activeLayerId
        });
    } else if (d.p1 && d.p2 && d.place) {
        if (Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y) < 1e-9) {
            state.dimDraft = null;
            return false;
        }
        dim = createDim({
            type: 'dim',
            x1: d.p1.x, y1: d.p1.y,
            x2: d.p2.x, y2: d.p2.y,
            px: d.place.x, py: d.place.y,
            layerId: state.activeLayerId
        });
    }

    if (dim && state.dimSettings) {
        const ds = state.dimSettings;
        if (ds.precision !== undefined) dim.precision = ds.precision;
        if (ds.textRotate !== undefined) dim.textRotate = ds.textRotate;
        if (ds.extOffset !== undefined) dim.extOffset = ds.extOffset;
        if (ds.extOver !== undefined) dim.extOver = ds.extOver;
        if (ds.fontSize !== undefined) dim.fontSize = ds.fontSize;
        if (ds.dimArrowType !== undefined) dim.dimArrowType = ds.dimArrowType;
        if (ds.dimArrowSize !== undefined) dim.dimArrowSizePt = ds.dimArrowSize;
        if (ds.dimArrowDirection !== undefined) dim.dimArrowDirection = (String(ds.dimArrowDirection) === "reverse" ? "reverse" : "normal");
        if (ds.rOvershoot !== undefined) dim.rOverrun = ds.rOvershoot;
        if (ds.circleArrowSide !== undefined) dim.circleArrowSide = (ds.circleArrowSide === "inside" ? "inside" : "outside");
        dim.lineWidthMm = Math.max(0.01, Number(ds.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        dim.lineType = String(ds.lineType || "solid");
    }

    if (dim) {
        if (pushHistory) pushHistory();
        dim.id = nextShapeId();
        dim.groupId = state.input.dimSessionGroupId;
        addShape(dim);

        if (!state.input.dimSessionGroupId) {
            // If we don't have a session group yet, find the one addShape created
            const createdShape = state.shapes.find(s => s.id === dim.id);
            if (createdShape && createdShape.groupId != null) {
                state.input.dimSessionGroupId = createdShape.groupId;
                // Rename the group to "Dim" if it was auto-named
                const g = getGroup(state, state.input.dimSessionGroupId);
                if (g && g.name.startsWith("Group ")) {
                    g.name = "Dim";
                }
            }
        } else {
            // Add to existing session group
            const g = getGroup(state, state.input.dimSessionGroupId);
            if (g) {
                if (!g.shapeIds.includes(dim.id)) g.shapeIds.push(dim.id);
            }
        }

        // Re-select the created dimension object itself (not group selection),
        // so its edit controllers are immediately adjustable.
        state.activeGroupId = null;
        setSelection([dim.id]);
        state.dimDraft = null;
        state.input.dimHoveredShapeId = null;
        state.input.dimHoverPreview = null;
        return true;
    }

    state.dimDraft = null;
    return false;
}

export function beginOrExtendPolyline(state, world) {
    if (!state.polylineDraft) {
        state.polylineDraft = {
            points: [{ x: world.x, y: world.y }],
            hoverPoint: { x: world.x, y: world.y },
        };
        return;
    }
    const pts = state.polylineDraft.points;
    const last = pts[pts.length - 1];
    if (Math.hypot(world.x - last.x, world.y - last.y) < 1e-9) return;
    pts.push({ x: world.x, y: world.y });
    state.polylineDraft.hoverPoint = { x: world.x, y: world.y };
}

export function updatePolylineHover(state, world) {
    if (!state.polylineDraft) return;
    state.polylineDraft.hoverPoint = { x: world.x, y: world.y };
}

export function cancelPolylineDraft(state) {
    state.polylineDraft = null;
}

export function finalizePolylineDraft(state, helpers) {
    const { pushHistory, addShapesAsGroup, setSelection } = helpers;
    const d = state.polylineDraft;
    if (!d || !Array.isArray(d.points) || d.points.length < 2) {
        state.polylineDraft = null;
        return false;
    }
    const lines = [];
    const createdIds = [];
    if (pushHistory) pushHistory();
    for (let i = 0; i < d.points.length - 1; i++) {
        const a = d.points[i], b = d.points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
        const line = createLine(a, b);
        line.layerId = state.activeLayerId;
        line.id = nextShapeId(state);
        line.lineWidthMm = Math.max(0.01, Number(state.lineSettings?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        line.lineType = String(state.lineSettings?.lineType || "solid");
        lines.push(line);
        createdIds.push(line.id);
    }
    state.polylineDraft = null;
    if (lines.length) {
        if (typeof addShapesAsGroup === "function") {
            addShapesAsGroup(lines);
        } else {
            // Fallback: add as one explicit group id
            const gid = Number(state.nextGroupId) || 1;
            state.nextGroupId = gid + 1;
            state.groups.unshift({
                id: gid,
                name: state.tool === "line" ? "Line Group" : "Polyline",
                shapeIds: createdIds.slice(),
                parentId: null,
                originX: 0,
                originY: 0,
                rotationDeg: 0,
            });
            for (const line of lines) {
                line.groupId = gid;
                state.shapes.push(line);
            }
        }
        setSelection(createdIds);
    }
    return createdIds.length > 0;
}

function lineInfiniteIntersection(l1, l2) {
    const x1 = Number(l1.x1), y1 = Number(l1.y1), x2 = Number(l1.x2), y2 = Number(l1.y2);
    const x3 = Number(l2.x1), y3 = Number(l2.y1), x4 = Number(l2.x2), y4 = Number(l2.y2);
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-12) return null;
    const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d;
    const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    return { x: px, y: py };
}

function lineDirectionFromPick(line, center, pick) {
    const ax = Number(line.x1), ay = Number(line.y1), bx = Number(line.x2), by = Number(line.y2);
    const vx = bx - ax, vy = by - ay;
    const lv = Math.hypot(vx, vy);
    if (lv < 1e-12) return null;
    const ux = vx / lv, uy = vy / lv;
    const tx = Number(pick.x) - Number(center.x), ty = Number(pick.y) - Number(center.y);
    const sign = ((tx * ux + ty * uy) >= 0) ? 1 : -1;
    return { x: ux * sign, y: uy * sign };
}

function pickRayEndKey(line, center, dir) {
    const p1 = { x: Number(line.x1), y: Number(line.y1) };
    const p2 = { x: Number(line.x2), y: Number(line.y2) };
    const v1 = { x: p1.x - Number(center.x), y: p1.y - Number(center.y) };
    const v2 = { x: p2.x - Number(center.x), y: p2.y - Number(center.y) };
    const d1 = v1.x * Number(dir.x) + v1.y * Number(dir.y);
    const d2 = v2.x * Number(dir.x) + v2.y * Number(dir.y);
    return d2 > d1 ? "p2" : "p1";
}

function dimMmToWorldInTools(state, mm) {
    const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
    const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
    return (Math.max(0, Number(mm) || 0) * pageScale) / Math.max(1e-9, unitMm);
}

function solveDimAngleFromLines(state, line1, line2, pick1, pick2) {
    const c = lineInfiniteIntersection(line1, line2);
    if (!c) return null;
    const d1 = lineDirectionFromPick(line1, c, pick1);
    const d2 = lineDirectionFromPick(line2, c, pick2);
    if (!d1 || !d2) return null;
    let a1 = Math.atan2(d1.y, d1.x);
    let a2 = Math.atan2(d2.y, d2.x);
    let da = normalizeRad(a2 - a1);
    if (da > Math.PI) {
        const t = a1; a1 = a2; a2 = t;
        da = normalizeRad(a2 - a1);
    }
    if (da < 1e-6) return null;
    const rMin = dimMmToWorldInTools(state, 8);
    const rBase = dimMmToWorldInTools(state, 18);
    const distPick = Math.hypot(Number(pick2.x) - c.x, Number(pick2.y) - c.y);
    const r = Math.max(rMin, Math.min(distPick * 0.8, rBase * 2.5, Math.max(rBase, distPick * 0.35)));
    const midA = a1 + da * 0.5;
    const textOff = dimMmToWorldInTools(state, 4) + dimMmToWorldInTools(state, Number(state.dimSettings?.fontSize ?? 12) * 0.25);
    return {
        cx: c.x,
        cy: c.y,
        r,
        a1,
        a2,
        tx: c.x + Math.cos(midA) * (r + textOff),
        ty: c.y + Math.sin(midA) * (r + textOff),
        textOffset: r + textOff,
        line1RayEnd: pickRayEndKey(line1, c, d1),
        line2RayEnd: pickRayEndKey(line2, c, d2),
    };
}

export function popDimChainPoint(state, helpers) {
    const { draw, setStatus } = helpers;
    if (state.dimDraft && state.dimDraft.points && state.dimDraft.points.length > 0) {
        state.dimDraft.points.pop();
        if (state.dimDraft.points.length === 0) {
            state.dimDraft = null;
            if (setStatus) setStatus("Dim chain canceled.");
        } else {
            if (setStatus) setStatus(`Dim chain point removed (points: ${state.dimDraft.points.length})`);
        }
        if (draw) draw();
    }
}

export function applyDimSettingsToSelection(state, helpers, patch) {
    const { pushHistory, draw } = helpers;
    const selectedDimIds = (state.selection?.ids || []).map(Number);
    const selectedDims = (state.shapes || []).filter(s => selectedDimIds.includes(Number(s.id)) && (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim"));

    if (selectedDims.length > 0) {
        if (pushHistory) pushHistory();
        for (const dim of selectedDims) {
            Object.assign(dim, patch);
        }
        if (draw) draw();
    }
}

// UI Bridge Functions
export function setObjectSnapEnabled(state, val) {
    if (!state.objectSnap) state.objectSnap = {};
    state.objectSnap.enabled = !!val;
}
export function setObjectSnapKind(state, kind, val) {
    if (!state.objectSnap) state.objectSnap = {};
    state.objectSnap[kind] = !!val;
}
export function setGridSize(state, size) {
    const prevSize = Math.max(1e-9, Number(state.grid?.size) || 1);
    const nextSize = Math.max(1, Number(size) || 1);
    state.grid.size = nextSize;
    const prevBasePx = Number(state.grid?.autoBasePxAtReset);
    if (Number.isFinite(prevBasePx) && prevBasePx > 0) {
        state.grid.autoBasePxAtReset = prevBasePx * (nextSize / prevSize);
    } else {
        const sc = Math.max(1e-9, Number(state.view?.scale) || 1);
        state.grid.autoBasePxAtReset = nextSize * sc;
    }
    state.grid.autoLevel = 100;
}
export function setGridSnap(state, val) {
    state.grid.snap = !!val;
}
export function setGridShow(state, val) {
    state.grid.show = !!val;
}
export function setGridAuto(state, val) {
    state.grid.auto = !!val;
}
export function setGridAutoThresholds(state, t50, t10, t5, t1, timing = null) {
    const v50 = Math.max(100, Math.min(2000, Math.round(Number(t50) || 130)));
    const v10 = Math.max(v50, Math.min(2000, Math.round(Number(t10) || 180)));
    const v5 = Math.max(v10, Math.min(2000, Math.round(Number(t5) || 240)));
    const v1 = Math.max(v5, Math.min(2000, Math.round(Number(t1) || 320)));
    state.grid.autoThreshold50 = v50;
    state.grid.autoThreshold10 = v10;
    state.grid.autoThreshold5 = v5;
    state.grid.autoThreshold1 = v1;
    if (Number.isFinite(Number(timing))) {
        state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Number(timing))));
    } else {
        const s = Math.max(0, Math.min(1, (v50 - 110) / 130));
        state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Math.sqrt(s) * 100)));
    }
}
export function setLayerColorize(state, helpers, val) {
    if (!state.ui) state.ui = {};
    if (!state.ui.layerView) state.ui.layerView = {};
    state.ui.layerView.colorize = !!val;
    if (state.ui.layerView.colorize) {
        state.ui.layerView.colorMap = buildRandomColorMap((state.layers || []).map(l => Number(l.id)));
    }
    if (helpers.draw) helpers.draw();
}
export function setGroupColorize(state, helpers, val) {
    if (!state.ui) state.ui = {};
    if (!state.ui.groupView) state.ui.groupView = {};
    state.ui.groupView.colorize = !!val;
    if (state.ui.groupView.colorize) {
        state.ui.groupView.colorMap = buildRandomColorMap((state.groups || []).map(g => Number(g.id)));
    }
    if (helpers.draw) helpers.draw();
}
export function setEditOnlyActiveLayer(state, helpers, val) {
    if (!state.ui) state.ui = {};
    if (!state.ui.layerView) state.ui.layerView = {};
    state.ui.layerView.editOnlyActive = !!val;
    if (helpers.draw) helpers.draw();
}
export function setGroupRotateSnap(state, val) {
    state.groupRotateSettings.snapDeg = val;
}
export function setVertexLinkCoincident(state, val) {
    if (!state.vertexEdit) state.vertexEdit = {};
    state.vertexEdit.linkCoincident = !!val;
}
export function setLineInputs(state, len, ang) {
    if (len !== null) state.lineSettings.length = len;
    if (ang !== null) {
        state.lineSettings.angleDeg = ang;
        state.lineSettings.angle = ang; // legacy alias
    }
}
export function setLineSizeLocked(state, helpers, on = null) {
    if (!state.lineSettings) state.lineSettings = {};
    const next = (on == null) ? !state.lineSettings.sizeLocked : !!on;
    state.lineSettings.sizeLocked = next;
    if (helpers?.setStatus) helpers.setStatus(next ? "線作成: サイズ固定 ON" : "線作成: サイズ固定 OFF");
    if (helpers?.draw) helpers.draw();
}
export function setLineAnchor(state, anchor) {
    const key = String(anchor || "endpoint_a").toLowerCase();
    if (key === "center" || key === "endpoint_b") {
        state.lineSettings.anchor = key;
    } else {
        state.lineSettings.anchor = "endpoint_a";
    }
}
export function setRectInputs(state, w, h) {
    if (w !== null) state.rectSettings.width = w;
    if (h !== null) state.rectSettings.height = h;
}
export function setRectSizeLocked(state, helpers, on = null) {
    if (!state.rectSettings) state.rectSettings = {};
    const next = (on == null) ? !state.rectSettings.sizeLocked : !!on;
    state.rectSettings.sizeLocked = next;
    if (helpers?.setStatus) {
        helpers.setStatus(next ? "四角作成: サイズ固定 ON" : "四角作成: サイズ固定 OFF");
    }
    if (helpers?.draw) helpers.draw();
}
export function setRectAnchor(state, anchor) {
    const allowed = new Set(["tl", "tc", "tr", "cl", "c", "cr", "bl", "bc", "br"]);
    const key = String(anchor || "c").toLowerCase();
    state.rectSettings.anchor = allowed.has(key) ? key : "c";
}
export function setCircleRadiusInput(state, r) {
    state.circleSettings.radius = r;
}
export function setCircleRadiusLocked(state, helpers, on = null) {
    if (!state.circleSettings) state.circleSettings = {};
    const next = (on == null) ? !state.circleSettings.radiusLocked : !!on;
    state.circleSettings.radiusLocked = next;
    if (helpers?.setStatus) {
        helpers.setStatus(next ? "円作成: 半径固定 ON" : "円作成: 半径固定 OFF");
    }
    if (helpers?.draw) helpers.draw();
}
export function setPositionSize(state, helpers, v) {
    const next = Math.max(1, Number(v) || 20);
    if (!state.positionSettings) state.positionSettings = { size: next };
    const selectedPositions = getSelectedShapes(state).filter(s => s.type === "position");
    const needsShapeUpdate = selectedPositions.some(s => Number(s.size ?? 20) !== next);
    if (needsShapeUpdate && helpers.pushHistory) helpers.pushHistory();
    if (needsShapeUpdate) {
        for (const s of selectedPositions) s.size = next;
    }
    const prevSetting = Number(state.positionSettings.size ?? 20);
    if (prevSetting !== next) state.positionSettings.size = next;
    if (needsShapeUpdate || prevSetting !== next) {
        if (helpers.draw) helpers.draw();
    }
}

function normalizeLineWidthPreset(v) {
    const presets = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.25;
    let best = presets[0];
    let bestD = Math.abs(n - best);
    for (let i = 1; i < presets.length; i++) {
        const d = Math.abs(n - presets[i]);
        if (d < bestD) { bestD = d; best = presets[i]; }
    }
    return best;
}

function normalizeLineTypePreset(v) {
    const allowed = new Set(["solid", "dashed", "dotted", "dashdot", "longdash", "center", "hidden"]);
    const key = String(v || "solid").toLowerCase();
    return allowed.has(key) ? key : "solid";
}

function resolveToolStyleTarget(state, tool) {
    const key = String(tool || state.tool || "").toLowerCase();
    if (key === "line") return state.lineSettings;
    if (key === "rect") return state.rectSettings;
    if (key === "circle") return state.circleSettings;
    if (key === "position") return state.positionSettings;
    if (key === "text") return state.textSettings;
    if (key === "dim") return state.dimSettings;
    if (key === "hatch") return state.hatchSettings;
    if (key === "doubleline") return state.dlineSettings;
    if (key === "fillet") return state.filletSettings;
    return null;
}

export function setLineWidthMm(state, helpers, v, toolKey = null) {
    const { draw, setStatus } = helpers;
    const nearest = normalizeLineWidthPreset(v);
    const name = String(toolKey || state.tool || "tool");
    const target = resolveToolStyleTarget(state, name);
    if (target) target.lineWidthMm = nearest;
    if (setStatus) setStatus(`${name} 線幅を ${nearest} mm に設定`);
    if (draw) draw();
}

export function setToolLineType(state, helpers, v, toolKey = null) {
    const { draw, setStatus } = helpers;
    const type = normalizeLineTypePreset(v);
    const name = String(toolKey || state.tool || "tool");
    const target = resolveToolStyleTarget(state, name);
    if (target) {
        target.lineType = type;
        // Hatch uses dedicated property as render/export source.
        if (name === "hatch") target.lineType = type;
    }
    if (setStatus) setStatus(`${name} 線種を ${type} に設定`);
    if (draw) draw();
}

export function setSelectedLineWidthMm(state, helpers, v) {
    const { pushHistory, draw, setStatus } = helpers;
    const presets = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
    const n = Number(v);
    const nearest = (() => {
        if (!Number.isFinite(n)) return 0.25;
        let best = presets[0];
        let bestD = Math.abs(n - best);
        for (let i = 1; i < presets.length; i++) {
            const d = Math.abs(n - presets[i]);
            if (d < bestD) { bestD = d; best = presets[i]; }
        }
        return best;
    })();
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const isStyleEditableShape = (s) => {
        if (!s) return false;
        return s.type === "line"
            || s.type === "circle"
            || s.type === "arc"
            || s.type === "position"
            || s.type === "dim"
            || s.type === "dimchain"
            || s.type === "dimangle"
            || s.type === "circleDim";
    };
    const selected = (state.shapes || []).filter(s => selIds.has(Number(s.id)) && isStyleEditableShape(s));
    if (!selected.length) {
        if (setStatus) setStatus("線幅変更: 対象オブジェクトなし");
        if (draw) draw();
        return;
    }
    const hasAnyDiff = selected.some(s => Math.abs((Number(s.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0) - nearest) > 1e-9);
    if (hasAnyDiff) pushHistory();
    for (const s of selected) {
        s.lineWidthMm = nearest;
    }
    if (setStatus) setStatus(`選択オブジェクトの線幅を ${nearest} mm に設定`);
    if (draw) draw();
}

export function setSelectedLineType(state, helpers, v) {
    const { pushHistory, draw, setStatus } = helpers;
    const type = normalizeLineTypePreset(v);
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selected = (state.shapes || []).filter((s) => {
        if (!selIds.has(Number(s.id))) return false;
        return s.type === "line"
            || s.type === "circle"
            || s.type === "arc"
            || s.type === "position"
            || s.type === "dim"
            || s.type === "dimchain"
            || s.type === "dimangle"
            || s.type === "circleDim";
    });
    if (!selected.length) {
        if (setStatus) setStatus("線種変更: 対象オブジェクトなし");
        if (draw) draw();
        return;
    }
    const hasAnyDiff = selected.some((s) => String(s.lineType || "solid") !== type);
    if (hasAnyDiff) pushHistory();
    for (const s of selected) s.lineType = type;
    if (setStatus) setStatus(`選択オブジェクトの線種を ${type} に設定`);
    if (draw) draw();
}
export function setSelectionCircleCenterMark(state, helpers, on) {
    const sel = getSelectedShapes(state).filter(s => s.type === "circle" || s.type === "arc");
    if (sel.length) {
        helpers.pushHistory();
        for (const s of sel) s.showCenterMark = !!on;
        helpers.draw();
    }
}
export function setFilletRadius(state, v) {
    state.filletSettings.radius = v;
}
export function setFilletLineMode(state, mode) {
    state.filletSettings.lineMode = mode;
}
export function setFilletNoTrim(state, on) {
    if (!state.filletSettings) state.filletSettings = {};
    state.filletSettings.noTrim = !!on;
}
export function setVertexMoveInputs(state, dx, dy) {
    if (dx !== null) state.vertexEdit.moveDx = dx;
    if (dy !== null) state.vertexEdit.moveDy = dy;
}
export function moveSelectedShapes(state, helpers, dx, dy) {
    const sel = getSelectedShapes(state);
    if (sel.length === 0) return;
    helpers.pushHistory();
    for (const s of sel) {
        if (s.type === 'line' || s.type === 'rect' || s.type === 'dim') {
            s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy;
            if (s.type === 'dim' && s.px != null) { s.px += dx; s.py += dy; }
        } else if (s.type === 'circle' || s.type === 'arc') {
            s.cx += dx; s.cy += dy;
        } else if (s.type === 'text' || s.type === 'position') {
            if (s.x1 != null) { s.x1 += dx; s.y1 += dy; } else { s.x += dx; s.y += dy; }
        } else if (s.type === 'dimchain') {
            if (Array.isArray(s.points)) {
                for (const pt of s.points) { pt.x += dx; pt.y += dy; }
            }
            if (s.px != null) { s.px += dx; s.py += dy; }
        }
    }
    helpers.draw();
}

export function mergeSelectedShapesToGroup(state, helpers) {
    const selIds = state.selection?.ids || [];
    if (selIds.length < 2) return;
    helpers.pushHistory();
    // Regroup selected objects even when they already belong to existing groups.
    const group = createGroupFromSelection(state, "");
    if (group) {
        state.activeGroupId = null;
        setSelection(state, collectGroupTreeShapeIds(state, group.id));
        if (helpers.draw) helpers.draw();
    }
}

export function cycleLayerMode(state, helpers, layerId) {
    const l = state.layers.find(ly => ly.id === layerId);
    if (!l) return;
    // Cycle: ON -> OFF -> LOCK -> ON
    const visible = l.visible !== false;
    const locked = l.locked === true;
    if (visible && !locked) {
        l.visible = false; l.locked = false; // OFF
    } else if (!visible) {
        l.visible = true; l.locked = true;   // LOCK
    } else {
        l.visible = true; l.locked = false;  // ON
    }
    if (helpers.draw) helpers.draw();
}

export function moveActiveGroupOrder(state, helpers, direction) {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const list = state.groups || [];
    const idx = list.findIndex(g => Number(g.id) === gid);
    if (idx < 0) return;
    const step = Number(direction) < 0 ? -1 : 1;
    const ni = idx + step;
    if (ni < 0 || ni >= list.length) return;
    if (helpers.pushHistory) helpers.pushHistory();
    const tmp = list[idx];
    list[idx] = list[ni];
    list[ni] = tmp;
    if (helpers.draw) helpers.draw();
}

export function moveActiveLayerOrder(state, helpers, direction) {
    const lid = Number(state.activeLayerId);
    if (!Number.isFinite(lid)) return;
    const list = state.layers || [];
    const idx = list.findIndex(l => Number(l.id) === lid);
    if (idx < 0) return;
    const step = Number(direction) < 0 ? -1 : 1;
    const ni = idx + step;
    if (ni < 0 || ni >= list.length) return;
    if (helpers.pushHistory) helpers.pushHistory();
    const tmp = list[idx];
    list[idx] = list[ni];
    list[ni] = tmp;
    if (helpers.draw) helpers.draw();
}

export function renameActiveLayer(state, helpers, name) {
    const l = state.layers.find(ly => ly.id === state.activeLayerId);
    if (l && name.trim()) {
        l.name = name.trim();
        if (helpers.draw) helpers.draw();
    }
}

export function deleteActiveLayer(state, helpers) {
    const layers = Array.isArray(state.layers) ? state.layers : [];
    if (layers.length <= 1) return;
    const activeId = Number(state.activeLayerId);
    const idx = layers.findIndex(l => Number(l.id) === activeId);
    if (idx < 0) return;
    const fallbackIdx = idx > 0 ? (idx - 1) : 1;
    const fallback = layers[fallbackIdx];
    if (!fallback) return;
    if (helpers.pushHistory) helpers.pushHistory();
    const fallbackId = Number(fallback.id);
    for (const s of (state.shapes || [])) {
        if (Number(s.layerId) === activeId) s.layerId = fallbackId;
    }
    state.layers = layers.filter(l => Number(l.id) !== activeId);
    state.activeLayerId = fallbackId;
    if (helpers.draw) helpers.draw();
}
export function renameActiveGroup(state, helpers, name) {
    const g = (state.groups || []).find(gg => Number(gg.id) === Number(state.activeGroupId));
    if (g && String(name || "").trim()) {
        g.name = String(name).trim();
        if (helpers.draw) helpers.draw();
    }
}

export function moveSelectionToLayer(state, helpers) {
    const sel = getSelectedShapes(state);
    if (sel.length === 0) return;
    helpers.pushHistory();
    for (const s of sel) s.layerId = state.activeLayerId;
    helpers.draw();
}

export function deleteActiveGroup(state, helpers) {
    if (state.selection.activeGroupId == null) return;
    const gid = state.selection.activeGroupId;
    helpers.pushHistory();
    // Logic to delete group (but keep shapes or delete them? Usually delete group only)
    state.groups = state.groups.filter(g => g.id !== gid);
    state.selection.activeGroupId = null;
    helpers.draw();
}

export function unparentActiveGroup(state, helpers) {
    if (state.selection.activeGroupId == null) return;
    const g = getGroup(state, state.selection.activeGroupId);
    if (g) {
        helpers.pushHistory();
        g.parentId = null;
        helpers.draw();
    }
}

export function moveActiveGroup(state, helpers, dx, dy) {
    if (state.selection.activeGroupId == null) return;
    helpers.pushHistory();
    moveGroupOrigin(state, state.selection.activeGroupId, dx, dy);
    helpers.draw();
}

export function updateSelectedTextSettings(state, helpers, settings) {
    const sel = getSelectedShapes(state).filter(s => s.type === "text");
    if (sel.length === 0) return;
    helpers.pushHistory();
    for (const s of sel) {
        if (settings.text !== undefined) s.text = settings.text;
        if (settings.textSizePt !== undefined) s.textSizePt = settings.textSizePt;
        if (settings.textRotate !== undefined) s.textRotate = settings.textRotate;
        if (settings.textFontFamily !== undefined) s.textFontFamily = settings.textFontFamily;
        if (settings.textBold !== undefined) s.textBold = settings.textBold;
        if (settings.textItalic !== undefined) s.textItalic = settings.textItalic;
        if (settings.textColor !== undefined) s.textColor = settings.textColor;
    }
    helpers.draw();
}

export function moveSelectedVertices(state, helpers, dx, dy) {
    // This needs beginVertexDrag / applyVertexDrag logic or simplified version
    const sel = state.selection.vertices || [];
    if (sel.length === 0) return;
    helpers.pushHistory();
    // Simplified vertex move
    for (const v of sel) {
        const s = state.shapes.find(sh => sh.id === v.shapeId);
        if (!s) continue;
        if (v.part === 'p1' || v.part === 'x1') { s.x1 += dx; s.y1 += dy; }
        else if (v.part === 'p2' || v.part === 'x2') { s.x2 += dx; s.y2 += dy; }
        else if (v.part === 'center') { s.cx += dx; s.cy += dy; }
    }
    helpers.draw();
}

export function exportPdf(state, helpers) {
    const { setStatus } = helpers;
    const ps = state.pageSetup;
    const PAGE_SIZES_MM = {
        A4: [297, 210],
        A3: [420, 297],
        A2: [594, 420],
        A1: [841, 594],
    };
    const MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, inch: 25.4 };

    const key = String(ps?.size || "A4");
    const [wMm, hMm] = PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4;
    const isPortrait = String(ps?.orientation || "landscape") === "portrait";
    const mmW = isPortrait ? Math.min(wMm, hMm) : Math.max(wMm, hMm);
    const mmH = isPortrait ? Math.max(wMm, hMm) : Math.min(wMm, hMm);

    const scale = Math.max(0.0001, Number(ps?.scale ?? 1) || 1);
    const unit = String(ps?.unit || "mm");
    const mpU = MM_PER_UNIT[unit] || 1;

    const cadW = mmW * scale / mpU;
    const cadH = mmH * scale / mpU;

    // Target DPI for export (e.g., 300 DPI)
    const dpi = 300;
    const mmToInch = 1 / 25.4;
    const pxW = Math.round(mmW * mmToInch * dpi);
    const pxH = Math.round(mmH * mmToInch * dpi);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = pxW;
    offCanvas.height = pxH;
    const offCtx = offCanvas.getContext("2d");

    // Fill white background
    offCtx.fillStyle = "#ffffff";
    offCtx.fillRect(0, 0, pxW, pxH);

    // We need to render the model onto this canvas. 
    // The render function is in render.js. Let's assume it's available in helpers.
    if (!helpers.render) {
        if (setStatus) setStatus("Error: render function not found in helpers");
        return;
    }

    // Setup view for offscreen rendering
    // Paper is centered at (0,0) in world coordinates.
    // We want the bounding box [-cadW/2, -cadH/2, cadW/2, cadH/2] to fill the canvas [0, 0, pxW, pxH].
    const drawScale = pxW / cadW;
    const offView = {
        scale: drawScale,
        offsetX: pxW / 2,
        offsetY: pxH / 2
    };

    // Create a temporary state for rendering that only contains what's needed
    const pdfState = {
        ...state,
        view: offView,
        grid: { ...state.grid, show: false }, // Hide grid for PDF
        pageSetup: { ...state.pageSetup, showFrame: false }, // Hide frame/crop marks for the PDF image itself
        selection: { ...state.selection, ids: [] }, // Clear selection for PDF
        ui: { ...state.ui, layerView: { ...state.ui.layerView, colorize: false } }
    };

    helpers.render(offCtx, offCanvas, pdfState);

    const dataUrl = offCanvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) {
        if (setStatus) setStatus("Please allow popups to export PDF");
        return;
    }

    win.document.write(`
        <html>
        <head>
            <title>PDF Export - ${new Date().toLocaleString()}</title>
            <style>
                body { margin: 0; padding: 0; display: flex; justify-content: center; background: #eee; }
                img { max-width: 100%; height: auto; box-shadow: 0 0 10px rgba(0,0,0,0.2); background: white; }
                @media print {
                    @page { size: ${mmW}mm ${mmH}mm; margin: 0; }
                    body { background: white; }
                    img { width: ${mmW}mm; height: ${mmH}mm; box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <img src="${dataUrl}" />
            <script>
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                        // window.close(); // Optional: close after printing
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    win.document.close();

    if (setStatus) setStatus("PDF Export window opened");
}

export function exportSvg(state, helpers) {
    const { setStatus } = helpers;
    const ps = state.pageSetup;
    const PAGE_SIZES_MM = {
        A4: [297, 210],
        A3: [420, 297],
        A2: [594, 420],
        A1: [841, 594],
    };
    const key = String(ps?.size || "A4");
    const [wMm, hMm] = PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4;
    const isPortrait = String(ps?.orientation || "landscape") === "portrait";
    const mmW = isPortrait ? Math.min(wMm, hMm) : Math.max(wMm, hMm);
    const mmH = isPortrait ? Math.max(wMm, hMm) : Math.min(wMm, hMm);

    const pageScale = Math.max(0.0001, Number(ps?.scale ?? 1) || 1);
    const unit = String(ps?.unit || "mm");
    const unitMm = mmPerUnit(unit);
    const cadW = mmW * pageScale / Math.max(1e-9, unitMm);
    const cadH = mmH * pageScale / Math.max(1e-9, unitMm);

    const dpi = 300;
    const pxW = Math.max(1, Math.round(mmW / 25.4 * dpi));
    const drawScale = pxW / Math.max(1e-9, cadW);

    const fmt = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return "0";
        return Number(n.toFixed(6)).toString();
    };
    const esc = (s) => String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    const dimWorldPerMm = () => pageScale / Math.max(1e-9, unitMm);
    const dimMmToWorld = (mm) => Math.max(0, Number(mm) || 0) * dimWorldPerMm();
    const dimPtToWorld = (pt) => dimMmToWorld(Math.max(0, Number(pt) || 0) * (25.4 / 72));
    const strokeWorld = (px) => Math.max(0.02, Number(px) / Math.max(1e-9, drawScale));
    const normalizeRad = (a) => {
        let r = Number(a) || 0;
        while (r < 0) r += Math.PI * 2;
        while (r >= Math.PI * 2) r -= Math.PI * 2;
        return r;
    };
    const deltaAlong = (a1, a2, ccw) => {
        if (ccw) return normalizeRad(a2 - a1);
        return normalizeRad(a1 - a2);
    };
    const autoTextAngleDeg = (tx, ty) => {
        let a = Math.atan2(ty, tx) * 180 / Math.PI;
        while (a >= 90) a -= 180;
        while (a < -90) a += 180;
        return a;
    };
    const hatchLoopPathData = (loop) => {
        if (!loop || !Array.isArray(loop.steps) || loop.steps.length === 0) return "";
        const step0 = loop.steps[0];
        if (step0.kind === "circle") {
            const cx = Number(step0.cx), cy = Number(step0.cy), r = Math.abs(Number(step0.r) || 0);
            if (!(r > 1e-9)) return "";
            return `M ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} Z`;
        }
        const nodePoint = (nodeIdx) => {
            for (const st of loop.steps) {
                const e = st.edge;
                if (!e) continue;
                if (nodeIdx === e.n1) {
                    if (e.type === "line") return { x: Number(e.s.x1), y: Number(e.s.y1) };
                    if (e.type === "arc") return { x: Number(e.s.cx) + Math.cos(Number(e.s.a1)) * Number(e.s.r), y: Number(e.s.cy) + Math.sin(Number(e.s.a1)) * Number(e.s.r) };
                }
                if (nodeIdx === e.n2) {
                    if (e.type === "line") return { x: Number(e.s.x2), y: Number(e.s.y2) };
                    if (e.type === "arc") return { x: Number(e.s.cx) + Math.cos(Number(e.s.a2)) * Number(e.s.r), y: Number(e.s.cy) + Math.sin(Number(e.s.a2)) * Number(e.s.r) };
                }
            }
            return null;
        };
        const start = nodePoint(step0.from);
        if (!start) return "";
        let d = `M ${fmt(start.x)} ${fmt(start.y)}`;
        for (const st of loop.steps) {
            const e = st.edge;
            if (!e) continue;
            const pTo = nodePoint(st.to);
            if (!pTo) continue;
            if (e.type === "line") {
                d += ` L ${fmt(pTo.x)} ${fmt(pTo.y)}`;
            } else if (e.type === "arc") {
                const cx = Number(e.s.cx), cy = Number(e.s.cy), r = Math.abs(Number(e.s.r) || 0);
                const ccw = !!e.s.ccw;
                const forward = st.from === e.n1 && st.to === e.n2;
                const startA = forward ? Number(e.s.a1) : Number(e.s.a2);
                const endA = forward ? Number(e.s.a2) : Number(e.s.a1);
                const dirCcw = forward ? ccw : !ccw;
                const span = deltaAlong(startA, endA, dirCcw);
                const largeArc = span > Math.PI ? 1 : 0;
                const sweep = dirCcw ? 0 : 1;
                d += ` A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweep} ${fmt(pTo.x)} ${fmt(pTo.y)}`;
            }
        }
        d += " Z";
        return d;
    };

    const arrowSvg = (p, dir, sizeWorld, color, arrowType) => {
        const len = Math.max(1e-9, Math.hypot(Number(dir?.x) || 0, Number(dir?.y) || 0));
        const ux = (Number(dir?.x) || 0) / len;
        const uy = (Number(dir?.y) || 0) / len;
        const nx = -uy, ny = ux;
        const headLen = Math.max(1e-9, Number(sizeWorld) || 0);
        const headWid = headLen * 0.35;
        const p1 = { x: Number(p.x) - ux * headLen + nx * headWid, y: Number(p.y) - uy * headLen + ny * headWid };
        const p2 = { x: Number(p.x) - ux * headLen - nx * headWid, y: Number(p.y) - uy * headLen - ny * headWid };
        const b = { x: Number(p.x) - ux * headLen, y: Number(p.y) - uy * headLen };
        if (arrowType === "circle" || arrowType === "circle_filled") {
            const rr = Math.max(1e-9, headLen * 0.45);
            const fill = arrowType === "circle_filled" ? color : "#ffffff";
            return `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(rr)}" fill="${fill}" stroke="${color}" stroke-width="${fmt(strokeWorld(1.5))}"/>`;
        }
        if (arrowType === "closed") {
            return `<polygon points="${fmt(p.x)},${fmt(p.y)} ${fmt(p1.x)},${fmt(p1.y)} ${fmt(p2.x)},${fmt(p2.y)}" fill="${color}" stroke="${color}" stroke-width="${fmt(strokeWorld(1))}"/>`;
        }
        if (arrowType === "hollow") {
            const eraseW = strokeWorld(2.4);
            return [
                `<path d="M ${fmt(p.x)} ${fmt(p.y)} L ${fmt(b.x)} ${fmt(b.y)}" fill="none" stroke="#ffffff" stroke-width="${fmt(eraseW)}" stroke-linecap="round"/>`,
                `<polygon points="${fmt(p.x)},${fmt(p.y)} ${fmt(p1.x)},${fmt(p1.y)} ${fmt(p2.x)},${fmt(p2.y)}" fill="#ffffff" stroke="${color}" stroke-width="${fmt(strokeWorld(1.5))}"/>`
            ].join("");
        }
        return `<path d="M ${fmt(p1.x)} ${fmt(p1.y)} L ${fmt(p.x)} ${fmt(p.y)} L ${fmt(p2.x)} ${fmt(p2.y)}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWorld(1.5))}" stroke-linecap="round"/>`;
    };

    const parts = [];
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(mmW)}mm" height="${fmt(mmH)}mm" viewBox="${fmt(-cadW * 0.5)} ${fmt(-cadH * 0.5)} ${fmt(cadW)} ${fmt(cadH)}" version="1.1">`);
    parts.push(`<rect x="${fmt(-cadW * 0.5)}" y="${fmt(-cadH * 0.5)}" width="${fmt(cadW)}" height="${fmt(cadH)}" fill="#ffffff"/>`);
    parts.push(`<g fill="none" stroke="#0f172a" stroke-width="${fmt(strokeWorld(1.5))}" stroke-linecap="round" stroke-linejoin="round">`);

    for (const s of (state.shapes || [])) {
        if (!isLayerVisible(state, s.layerId)) continue;
        if (s.type === "line") {
            parts.push(`<line x1="${fmt(s.x1)}" y1="${fmt(s.y1)}" x2="${fmt(s.x2)}" y2="${fmt(s.y2)}"/>`);
            continue;
        }
        if (s.type === "rect") {
            const x = Math.min(Number(s.x1), Number(s.x2));
            const y = Math.min(Number(s.y1), Number(s.y2));
            const w = Math.abs(Number(s.x2) - Number(s.x1));
            const h = Math.abs(Number(s.y2) - Number(s.y1));
            parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"/>`);
            continue;
        }
        if (s.type === "circle") {
            parts.push(`<circle cx="${fmt(s.cx)}" cy="${fmt(s.cy)}" r="${fmt(Math.abs(Number(s.r) || 0))}"/>`);
            continue;
        }
        if (s.type === "arc") {
            const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
            if (!(r > 1e-9)) continue;
            const a1 = Number(s.a1) || 0;
            const a2 = Number(s.a2) || 0;
            const ccw = s.ccw !== false;
            const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
            const p2 = { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
            const largeArc = deltaAlong(a1, a2, ccw) > Math.PI ? 1 : 0;
            const sweep = ccw ? 1 : 0;
            parts.push(`<path d="M ${fmt(p1.x)} ${fmt(p1.y)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweep} ${fmt(p2.x)} ${fmt(p2.y)}"/>`);
            continue;
        }
        if (s.type === "position") {
            const x = Number(s.x), y = Number(s.y), size = Math.max(0.1, Number(s.size ?? 20));
            parts.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(size * 0.28)}"/>`);
            parts.push(`<line x1="${fmt(x - size)}" y1="${fmt(y)}" x2="${fmt(x + size)}" y2="${fmt(y)}"/>`);
            parts.push(`<line x1="${fmt(x)}" y1="${fmt(y - size)}" x2="${fmt(x)}" y2="${fmt(y + size)}"/>`);
            continue;
        }
        if (s.type === "text") {
            const fontPt = Math.max(1, Number(s.textSizePt) || 12);
            const fontWorld = dimPtToWorld(fontPt);
            const fill = String(s.textColor || "#0f172a");
            const rot = Number(s.textRotate) || 0;
            const weight = s.textBold ? "700" : "400";
            const style = s.textItalic ? "italic" : "normal";
            const family = esc(s.textFontFamily || "Yu Gothic UI");
            const txt = esc(s.text || "");
            parts.push(`<text x="${fmt(s.x1)}" y="${fmt(s.y1)}" font-size="${fmt(fontWorld)}" fill="${fill}" font-style="${style}" font-weight="${weight}" font-family="${family}" dominant-baseline="middle" text-anchor="start" transform="rotate(${fmt(rot)} ${fmt(s.x1)} ${fmt(s.y1)})">${txt}</text>`);
            continue;
        }
        if (s.type === "hatch") {
            const parsed = buildHatchLoopsFromBoundaryIds(state.shapes || [], s.boundaryIds || [], Number(state.view?.scale) || 1);
            if (!parsed?.ok || !Array.isArray(parsed.loops) || !parsed.loops.length || !parsed.bounds) continue;
            const clipId = `hclip_${Number(s.id)}`;
            const loopPaths = parsed.loops.map(hatchLoopPathData).filter(Boolean);
            if (!loopPaths.length) continue;
            parts.push(`<defs><clipPath id="${clipId}">`);
            for (const d of loopPaths) parts.push(`<path d="${d}" fill-rule="evenodd"/>`);
            parts.push(`</clipPath></defs>`);

            const pitch = Math.max(1e-9, Number(getHatchPitchWorld(state, s)) || 1);
            const ang = (Number(s.hatchAngleDeg ?? state.hatchSettings?.angleDeg) || 45) * (Math.PI / 180);
            const pattern = s.hatchPattern || state.hatchSettings?.pattern || "single";
            const crossAng = (Number(s.hatchCrossAngleDeg ?? state.hatchSettings?.crossAngleDeg) || 90) * (Math.PI / 180);
            const lineShift = Number(getHatchLineShiftWorld(state, s)) || 0;
            const padding = Math.max(0, Number(getHatchPaddingWorld(state, s)) || 0);
            const lineType = s.hatchLineType || state.hatchSettings?.lineType || "solid";
            const dashW = Number(getHatchDashWorld(state, s)) || 0;
            const gapW = Number(getHatchGapWorld(state, s)) || 0;
            const dashAttr = (() => {
                if (lineType === "dashed") return ` stroke-dasharray="${fmt(dashW)} ${fmt(gapW)}"`;
                if (lineType === "dotted") return ` stroke-dasharray="${fmt(Math.max(0.15, strokeWorld(1)))} ${fmt(gapW)}"`;
                if (lineType === "dashdot") return ` stroke-dasharray="${fmt(dashW)} ${fmt(gapW)} ${fmt(Math.max(0.15, strokeWorld(1)))} ${fmt(gapW)}"`;
                if (lineType === "longdash") return ` stroke-dasharray="${fmt(dashW * 1.8)} ${fmt(gapW)}"`;
                if (lineType === "center") return ` stroke-dasharray="${fmt(dashW * 1.4)} ${fmt(gapW)} ${fmt(Math.max(0.15, strokeWorld(1)))} ${fmt(gapW)}"`;
                if (lineType === "hidden") return ` stroke-dasharray="${fmt(dashW * 0.7)} ${fmt(gapW * 0.9)}"`;
                return "";
            })();
            const b = parsed.bounds;
            const origin = { x: (Number(b.minX) + Number(b.maxX)) * 0.5, y: (Number(b.minY) + Number(b.maxY)) * 0.5 };
            const corners = [
                { x: Number(b.minX), y: Number(b.minY) }, { x: Number(b.maxX), y: Number(b.minY) },
                { x: Number(b.maxX), y: Number(b.maxY) }, { x: Number(b.minX), y: Number(b.maxY) }
            ];
            const familyAngles = [ang];
            if (pattern === "cross") familyAngles.push(ang + crossAng);
            parts.push(`<g clip-path="url(#${clipId})" stroke="#0f172a" stroke-width="${fmt(strokeWorld(1))}"${dashAttr}>`);
            for (const angleRad of familyAngles) {
                const u = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
                const n = { x: -u.y, y: u.x };
                let nMin = Infinity, nMax = -Infinity;
                let uMin = Infinity, uMax = -Infinity;
                for (const p of corners) {
                    const rx = p.x - origin.x;
                    const ry = p.y - origin.y;
                    const pn = rx * n.x + ry * n.y;
                    const pu = rx * u.x + ry * u.y;
                    nMin = Math.min(nMin, pn);
                    nMax = Math.max(nMax, pn);
                    uMin = Math.min(uMin, pu);
                    uMax = Math.max(uMax, pu);
                }
                const L = (Math.max(Math.abs(uMin), Math.abs(uMax)) * 2 + pitch) * 1.5;
                const startN = Math.floor((nMin - padding - pitch * 0.1) / pitch) * pitch;
                const endN = nMax + padding + pitch * 0.1;
                let idx = 0;
                let safety = 0;
                for (let offN = startN; offN <= endN && safety < 8000; offN += pitch, idx++, safety++) {
                    const shiftU = (idx % 2 === 1) ? lineShift : 0;
                    const cp = { x: origin.x + n.x * offN + u.x * shiftU, y: origin.y + n.y * offN + u.y * shiftU };
                    const p1 = { x: cp.x - u.x * L, y: cp.y - u.y * L };
                    const p2 = { x: cp.x + u.x * L, y: cp.y + u.y * L };
                    parts.push(`<line x1="${fmt(p1.x)}" y1="${fmt(p1.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}"/>`);
                }
            }
            parts.push(`</g>`);
            continue;
        }

        if (s.type === "dim") {
            const baseStroke = "#0f172a";
            const arrowType = s.dimArrowType || "open";
            const reverseArrow = String(s.dimArrowDirection || "normal") === "reverse";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            if (s.dimRef) {
                const g = getSpecialDimGeometry(s, state.shapes);
                if (!g) continue;
                const label = (g.kind === "circle" ? "D " : "R ") + (Number(g.len) || 0).toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
                parts.push(`<line x1="${fmt(g.cx)}" y1="${fmt(g.cy)}" x2="${fmt(s.x2)}" y2="${fmt(s.y2)}"/>`);
                const dref = reverseArrow ? { x: -Number(g.u?.x || 0), y: -Number(g.u?.y || 0) } : g.u;
                parts.push(arrowSvg({ x: Number(s.x2), y: Number(s.y2) }, dref, arrowSize, baseStroke, arrowType));
                const tx = Number.isFinite(Number(s.tx)) ? Number(s.tx) : (Number(s.x2) + Number(g.u.x) * dimPtToWorld(Number(s.fontSize ?? 12) || 12));
                const ty = Number.isFinite(Number(s.ty)) ? Number(s.ty) : (Number(s.y2) + Number(g.u.y) * dimPtToWorld(Number(s.fontSize ?? 12) || 12));
                parts.push(`<text x="${fmt(tx)}" y="${fmt(ty)}" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(label)}</text>`);
                continue;
            }
            const g = getDimGeometry(s);
            if (!g) continue;
            const extOff = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
            const extOver = dimMmToWorld(Number(s.extOver ?? 2) || 0);
            const dimOver = dimMmToWorld(Math.max(0, Number(s.rOverrun ?? 0) || 0));
            const sign = Math.sign(g.off) || 1;
            const enx = g.nx * sign, eny = g.ny * sign;
            parts.push(`<line x1="${fmt(g.x1 + extOff * enx)}" y1="${fmt(g.y1 + extOff * eny)}" x2="${fmt(g.d1.x + extOver * enx)}" y2="${fmt(g.d1.y + extOver * eny)}"/>`);
            parts.push(`<line x1="${fmt(g.x2 + extOff * enx)}" y1="${fmt(g.y2 + extOff * eny)}" x2="${fmt(g.d2.x + extOver * enx)}" y2="${fmt(g.d2.y + extOver * eny)}"/>`);
            parts.push(`<line x1="${fmt(g.d1.x - g.tx * dimOver)}" y1="${fmt(g.d1.y - g.ty * dimOver)}" x2="${fmt(g.d2.x + g.tx * dimOver)}" y2="${fmt(g.d2.y + g.ty * dimOver)}"/>`);
            const d1dir = reverseArrow ? { x: g.tx, y: g.ty } : { x: -g.tx, y: -g.ty };
            const d2dir = reverseArrow ? { x: -g.tx, y: -g.ty } : { x: g.tx, y: g.ty };
            parts.push(arrowSvg(g.d1, d1dir, arrowSize, baseStroke, arrowType));
            parts.push(arrowSvg(g.d2, d2dir, arrowSize, baseStroke, arrowType));
            const textVal = (Number(g.len) || 0).toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
            const mid = { x: (g.d1.x + g.d2.x) * 0.5, y: (g.d1.y + g.d2.y) * 0.5 };
            const hasRel = Number.isFinite(Number(s.tdx)) && Number.isFinite(Number(s.tdy));
            const tw = hasRel ? { x: Number(g.allCtrl.x) + Number(s.tdx), y: Number(g.allCtrl.y) + Number(s.tdy) }
                : (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) ? { x: Number(s.tx), y: Number(s.ty) }
                    : { x: mid.x + g.nx * dimPtToWorld(Number(s.fontSize ?? 12) || 12), y: mid.y + g.ny * dimPtToWorld(Number(s.fontSize ?? 12) || 12) };
            const rotDeg = (s.textRotate === "auto" || s.textRotate == null) ? autoTextAngleDeg(g.tx, g.ty) : (Number(s.textRotate) || 0);
            parts.push(`<text x="${fmt(tw.x)}" y="${fmt(tw.y)}" transform="rotate(${fmt(rotDeg)} ${fmt(tw.x)} ${fmt(tw.y)})" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(textVal)}</text>`);
            continue;
        }

        if (s.type === "dimchain") {
            const geom = getDimChainGeometry(s);
            if (!geom) continue;
            const baseStroke = "#0f172a";
            const arrowType = s.dimArrowType || "open";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            const dimOver = dimMmToWorld(Math.max(0, Number(s.rOverrun ?? 0) || 0));
            const extOff = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
            const defaultVis = Math.max(0, Math.abs(Number(geom.off) || 0) - extOff);
            const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
            const sign = Math.sign(Number(geom.off) || 0) || 1;
            const enx = Number(geom.nx) * sign, eny = Number(geom.ny) * sign;
            if (Array.isArray(geom.dimPoints)) {
                for (let i = 0; i < geom.dimPoints.length; i++) {
                    const dpt = geom.dimPoints[i];
                    const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVis;
                    const sw = { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis };
                    parts.push(`<line x1="${fmt(sw.x)}" y1="${fmt(sw.y)}" x2="${fmt(dpt.x)}" y2="${fmt(dpt.y)}"/>`);
                }
            }
            for (const g of (geom.segments || [])) {
                parts.push(`<line x1="${fmt(g.d1.x - g.tx * dimOver)}" y1="${fmt(g.d1.y - g.ty * dimOver)}" x2="${fmt(g.d2.x + g.tx * dimOver)}" y2="${fmt(g.d2.y + g.ty * dimOver)}"/>`);
                parts.push(arrowSvg(g.d1, { x: -g.tx, y: -g.ty }, arrowSize, baseStroke, arrowType));
                parts.push(arrowSvg(g.d2, { x: g.tx, y: g.ty }, arrowSize, baseStroke, arrowType));
                const textVal = (Number(g.len) || 0).toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
                const mid = { x: (g.d1.x + g.d2.x) * 0.5, y: (g.d1.y + g.d2.y) * 0.5 };
                const defaultOff = dimPtToWorld(Number(s.fontSize ?? 12) || 12);
                const off = (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
                    ? ((Number(s.tx) - Number(g.chainMid?.x || 0)) * g.nx + (Number(s.ty) - Number(g.chainMid?.y || 0)) * g.ny)
                    : defaultOff;
                const tw = { x: mid.x + g.nx * off, y: mid.y + g.ny * off };
                const rotDeg = (s.textRotate === "auto" || s.textRotate == null) ? autoTextAngleDeg(g.tx, g.ty) : (Number(s.textRotate) || 0);
                parts.push(`<text x="${fmt(tw.x)}" y="${fmt(tw.y)}" transform="rotate(${fmt(rotDeg)} ${fmt(tw.x)} ${fmt(tw.y)})" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(textVal)}</text>`);
            }
            continue;
        }

        if (s.type === "circleDim") {
            const g = getCircleDimGeometry(s, state.shapes);
            if (!g) continue;
            const baseStroke = "#0f172a";
            const arrowType = s.dimArrowType || "open";
            const reverseArrow = String(s.dimArrowDirection || "normal") === "reverse";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            const c1 = { x: g.cx + g.ux * g.r, y: g.cy + g.uy * g.r };
            const c2 = { x: g.cx - g.ux * g.r, y: g.cy - g.uy * g.r };
            parts.push(`<line x1="${fmt(g.p1.x)}" y1="${fmt(g.p1.y)}" x2="${fmt(g.p2.x)}" y2="${fmt(g.p2.y)}"/>`);
            if (Math.hypot(g.p1.x - c1.x, g.p1.y - c1.y) > 1e-9) parts.push(`<line x1="${fmt(g.p1.x)}" y1="${fmt(g.p1.y)}" x2="${fmt(c1.x)}" y2="${fmt(c1.y)}"/>`);
            const arrowSide = s.circleArrowSide === "inside" ? "inside" : "outside";
            const dir1 = arrowSide === "inside" ? { x: -g.ux, y: -g.uy } : { x: g.ux, y: g.uy };
            const d1 = reverseArrow ? { x: -dir1.x, y: -dir1.y } : dir1;
            parts.push(arrowSvg(c1, d1, arrowSize, baseStroke, arrowType));
            if (s.kind === "diameter") {
                if (Math.hypot(g.p2.x - c2.x, g.p2.y - c2.y) > 1e-9) parts.push(`<line x1="${fmt(g.p2.x)}" y1="${fmt(g.p2.y)}" x2="${fmt(c2.x)}" y2="${fmt(c2.y)}"/>`);
                const dir2 = arrowSide === "inside" ? { x: g.ux, y: g.uy } : { x: -g.ux, y: -g.uy };
                const d2 = reverseArrow ? { x: -dir2.x, y: -dir2.y } : dir2;
                parts.push(arrowSvg(c2, d2, arrowSize, baseStroke, arrowType));
            }
            const value = s.kind === "diameter" ? (Number(g.r) * 2) : Number(g.r);
            const textVal = (s.kind === "diameter" ? "D " : "R ") + value.toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
            const rotDeg = (s.textRotate === "auto" || s.textRotate == null) ? autoTextAngleDeg(g.ux, g.uy) : (Number(s.textRotate) || 0);
            parts.push(`<text x="${fmt(g.tx)}" y="${fmt(g.ty)}" transform="rotate(${fmt(rotDeg)} ${fmt(g.tx)} ${fmt(g.ty)})" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(textVal)}</text>`);
            continue;
        }

        if (s.type === "dimangle") {
            const g = getDimAngleGeometry(s, state.shapes);
            if (!g) continue;
            const cx = Number(g.cx), cy = Number(g.cy), r = Math.abs(Number(g.r) || 0);
            const a1 = Number(g.a1) || 0, a2 = Number(g.a2) || 0;
            const over = dimMmToWorld(Math.max(0, Number(s.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
            const overAng = r > 1e-9 ? over / r : 0;
            const a1d = a1 - overAng;
            const a2d = a2 + overAng;
            const p1 = { x: cx + Math.cos(a1d) * r, y: cy + Math.sin(a1d) * r };
            const p2 = { x: cx + Math.cos(a2d) * r, y: cy + Math.sin(a2d) * r };
            const da = normalizeRad(a2d - a1d);
            const largeArc = da > Math.PI ? 1 : 0;
            parts.push(`<path d="M ${fmt(p1.x)} ${fmt(p1.y)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} 1 ${fmt(p2.x)} ${fmt(p2.y)}"/>`);
            const arrowType = s.dimArrowType || "open";
            const reverseArrow = String(s.dimArrowDirection || "normal") === "reverse";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            const d1 = { x: Math.sin(a1), y: -Math.cos(a1) };
            const d2 = { x: -Math.sin(a2), y: Math.cos(a2) };
            const ad1 = reverseArrow ? { x: -d1.x, y: -d1.y } : d1;
            const ad2 = reverseArrow ? { x: -d2.x, y: -d2.y } : d2;
            parts.push(arrowSvg({ x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r }, ad1, arrowSize, "#0f172a", arrowType));
            parts.push(arrowSvg({ x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r }, ad2, arrowSize, "#0f172a", arrowType));
            const angle = Number(g.angle) * 180 / Math.PI;
            const label = angle.toFixed(Math.max(0, Number(s.precision ?? 1) || 0)) + "°";
            const midA = a1 + da * 0.5;
            const tx = Number(g.tx);
            const ty = Number(g.ty);
            parts.push(`<text x="${fmt(tx)}" y="${fmt(ty)}" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(label)}</text>`);
            continue;
        }
    }

    parts.push(`</g>`);
    parts.push(`</svg>`);

    const svg = parts.join("\n");
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.svg`;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (setStatus) setStatus(`Exported ${name} (vector SVG)`);
}

function patternShiftShapeDeep(node, dx, dy) {
    if (!node || typeof node !== "object") return;
    const shiftXKeys = new Set(["x", "x1", "x2", "cx", "px", "tx", "originX"]);
    const shiftYKeys = new Set(["y", "y1", "y2", "cy", "py", "ty", "originY"]);
    if (Array.isArray(node)) {
        for (const item of node) patternShiftShapeDeep(item, dx, dy);
        return;
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "number" && Number.isFinite(v)) {
            if (shiftXKeys.has(k)) node[k] = v + Number(dx || 0);
            else if (shiftYKeys.has(k)) node[k] = v + Number(dy || 0);
            continue;
        }
        if (v && typeof v === "object") patternShiftShapeDeep(v, dx, dy);
    }
}

function patternRemapRefsDeep(node, shapeIdMap) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) patternRemapRefsDeep(item, shapeIdMap);
        return;
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "number" && Number.isFinite(v)) {
            if (k !== "id" && k !== "groupId" && k !== "layerId" && k.toLowerCase().endsWith("id")) {
                const mapped = shapeIdMap.get(Number(v));
                if (Number.isFinite(Number(mapped))) node[k] = Number(mapped);
            }
            continue;
        }
        if (Array.isArray(v) && k.toLowerCase().endsWith("ids")) {
            node[k] = v.map((vv) => {
                const mapped = shapeIdMap.get(Number(vv));
                return Number.isFinite(Number(mapped)) ? Number(mapped) : vv;
            });
            continue;
        }
        if (v && typeof v === "object") patternRemapRefsDeep(v, shapeIdMap);
    }
}

function appendShapeToGroupIfNeeded(state, shape) {
    const gid = Number(shape?.groupId);
    if (!Number.isFinite(gid)) return;
    const g = (state.groups || []).find(gr => Number(gr.id) === gid);
    if (!g) return;
    if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
    if (!g.shapeIds.map(Number).includes(Number(shape.id))) g.shapeIds.push(Number(shape.id));
}

function getRootSelectedGroupIds(state) {
    const selected = new Set((state.selection?.groupIds || []).map(Number).filter(Number.isFinite));
    if (!selected.size) return [];
    const byId = new Map((state.groups || []).map(g => [Number(g.id), g]));
    const roots = [];
    for (const gid of selected) {
        let cur = byId.get(gid);
        let hasSelectedAncestor = false;
        while (cur && cur.parentId != null) {
            const pid = Number(cur.parentId);
            if (selected.has(pid)) { hasSelectedAncestor = true; break; }
            cur = byId.get(pid);
        }
        if (!hasSelectedAncestor) roots.push(gid);
    }
    return roots;
}

function collectGroupSubtreeIdsFromRoot(state, rootId) {
    const byParent = new Map();
    for (const g of (state.groups || [])) {
        const pid = (g.parentId == null) ? null : Number(g.parentId);
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(Number(g.id));
    }
    const out = [];
    const seen = new Set();
    const stack = [Number(rootId)];
    while (stack.length) {
        const gid = Number(stack.pop());
        if (!Number.isFinite(gid) || seen.has(gid)) continue;
        seen.add(gid);
        out.push(gid);
        const kids = byParent.get(gid) || [];
        for (let i = kids.length - 1; i >= 0; i--) stack.push(Number(kids[i]));
    }
    return out;
}

function applyTransformToShapeDeep(node, transformPoint) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) applyTransformToShapeDeep(item, transformPoint);
        return;
    }
    const pairs = [
        ["x", "y"], ["x1", "y1"], ["x2", "y2"], ["cx", "cy"],
        ["px", "py"], ["tx", "ty"], ["originX", "originY"]
    ];
    for (const [kx, ky] of pairs) {
        if (Object.prototype.hasOwnProperty.call(node, kx) && Object.prototype.hasOwnProperty.call(node, ky)) {
            const x = Number(node[kx]), y = Number(node[ky]);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                const p = transformPoint(x, y);
                node[kx] = Number(p.x);
                node[ky] = Number(p.y);
            }
        }
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === "object") applyTransformToShapeDeep(v, transformPoint);
    }
}

function makeCopiedGroupName(baseName, usedNameKeys) {
    const base = String(baseName || "Group").trim() || "Group";
    let i = 1;
    while (i < 1000000) {
        const cand = `${base}_${i}`;
        const key = cand.toLowerCase();
        if (!usedNameKeys.has(key)) {
            usedNameKeys.add(key);
            return cand;
        }
        i += 1;
    }
    return `${base}_${Date.now()}`;
}

function cloneGroupsWithTransform(state, rootGroupIds, transformPoint, options = {}) {
    const flipOrientation = !!options.flipOrientation;
    const rotationDeltaRad = Number(options.rotationDeltaRad || 0);
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const byId = new Map(groups.map(g => [Number(g.id), g]));
    const uniqueGroupIds = [];
    const gidSet = new Set();
    for (const rootId of (rootGroupIds || [])) {
        for (const gid of collectGroupSubtreeIdsFromRoot(state, rootId)) {
            if (gidSet.has(gid)) continue;
            gidSet.add(gid);
            uniqueGroupIds.push(gid);
        }
    }
    if (!uniqueGroupIds.length) return { newRootGroupIds: [], newShapeIds: [] };

    const groupIdMap = new Map();
    for (const oldGid of uniqueGroupIds) {
        const newGid = Number(state.nextGroupId) || 1;
        state.nextGroupId = newGid + 1;
        groupIdMap.set(oldGid, newGid);
    }

    const shapeIdMap = new Map();
    const clones = [];
    for (const oldGid of uniqueGroupIds) {
        const g = byId.get(oldGid);
        const shapeIds = Array.isArray(g?.shapeIds) ? g.shapeIds : [];
        for (const sidRaw of shapeIds) {
            const sid = Number(sidRaw);
            if (!Number.isFinite(sid) || shapeIdMap.has(sid)) continue;
            const src = (state.shapes || []).find(s => Number(s.id) === sid);
            if (!src) continue;
            const newSid = Number(nextShapeId(state));
            shapeIdMap.set(sid, newSid);
            const c = JSON.parse(JSON.stringify(src));
            c.id = newSid;
            c.groupId = Number(groupIdMap.get(oldGid));
            applyTransformToShapeDeep(c, transformPoint);
            if (c.type === "arc") {
                const cx = Number(c.cx), cy = Number(c.cy), a1 = Number(c.a1), a2 = Number(c.a2);
                if ([cx, cy, a1, a2].every(Number.isFinite)) {
                    const p1 = transformPoint(cx + Math.cos(a1) * Number(c.r || 0), cy + Math.sin(a1) * Number(c.r || 0));
                    const p2 = transformPoint(cx + Math.cos(a2) * Number(c.r || 0), cy + Math.sin(a2) * Number(c.r || 0));
                    c.a1 = Math.atan2(Number(p1.y) - Number(c.cy), Number(p1.x) - Number(c.cx));
                    c.a2 = Math.atan2(Number(p2.y) - Number(c.cy), Number(p2.x) - Number(c.cx));
                    c.ccw = flipOrientation ? !(src.ccw !== false) : (src.ccw !== false);
                }
            } else if (c.type === "circleDim" && Math.abs(rotationDeltaRad) > 1e-12) {
                if (Number.isFinite(Number(c.ang))) c.ang = Number(c.ang) + rotationDeltaRad;
            }
            clones.push(c);
        }
    }
    for (const c of clones) patternRemapRefsDeep(c, shapeIdMap);
    if (clones.length) state.shapes.push(...clones);

    const newGroups = [];
    const usedNameKeys = new Set((state.groups || []).map(g => String(g?.name || "").trim().toLowerCase()).filter(Boolean));
    for (const oldGid of uniqueGroupIds) {
        const oldG = byId.get(oldGid);
        if (!oldG) continue;
        const gid = Number(groupIdMap.get(oldGid));
        const mappedParent = (oldG.parentId == null)
            ? oldG.parentId
            : (groupIdMap.get(Number(oldG.parentId)) ?? oldG.parentId);
        const origin = transformPoint(Number(oldG.originX) || 0, Number(oldG.originY) || 0);
        const newShapeIds = (Array.isArray(oldG.shapeIds) ? oldG.shapeIds : [])
            .map(id => shapeIdMap.get(Number(id)))
            .filter(id => Number.isFinite(Number(id)));
        newGroups.push({
            ...JSON.parse(JSON.stringify(oldG)),
            id: gid,
            name: makeCopiedGroupName(oldG?.name, usedNameKeys),
            parentId: mappedParent,
            originX: Number(origin.x),
            originY: Number(origin.y),
            rotationDeg: Number(oldG.rotationDeg || 0) + (rotationDeltaRad * 180 / Math.PI),
            shapeIds: newShapeIds,
        });
    }
    if (newGroups.length) state.groups = [...newGroups, ...state.groups];
    return {
        newRootGroupIds: (rootGroupIds || []).map(id => Number(groupIdMap.get(Number(id)))).filter(Number.isFinite),
        newShapeIds: clones.map(s => Number(s.id)),
    };
}

function mirrorPointAcrossLine(x, y, ax, ay, bx, by) {
    const vx = Number(bx) - Number(ax);
    const vy = Number(by) - Number(ay);
    const len2 = vx * vx + vy * vy;
    if (len2 <= 1e-12) return { x: Number(x), y: Number(y) };
    const t = (((Number(x) - Number(ax)) * vx) + ((Number(y) - Number(ay)) * vy)) / len2;
    const px = Number(ax) + vx * t;
    const py = Number(ay) + vy * t;
    return { x: 2 * px - Number(x), y: 2 * py - Number(y) };
}

export function setPatternCopyMode(state, mode) {
    const m = String(mode || "array").toLowerCase();
    state.patternCopySettings.mode = (m === "rotate" || m === "mirror") ? m : "array";
}

export function setPatternCopyCenterFromSelection(state, helpers) {
    const { setStatus, draw } = helpers;
    const selected = getSelectedShapes(state);
    const pos = selected.find(s => s && s.type === "position");
    if (!pos) {
        if (setStatus) setStatus("中心には位置オブジェクトを選択してください");
        if (draw) draw();
        return false;
    }
    state.input.patternCopyFlow.centerPositionId = Number(pos.id);
    if (setStatus) setStatus(`中心を設定: 点 #${pos.id}`);
    if (draw) draw();
    return true;
}

export function clearPatternCopyCenter(state, helpers) {
    const { setStatus, draw } = helpers;
    state.input.patternCopyFlow.centerPositionId = null;
    if (setStatus) setStatus("中心設定を解除");
    if (draw) draw();
}

export function setPatternCopyAxisFromSelection(state, helpers) {
    const { setStatus, draw } = helpers;
    const selected = getSelectedShapes(state);
    const ln = selected.find(s => s && s.type === "line");
    if (!ln) {
        if (setStatus) setStatus("軸には線オブジェクトを選択してください");
        if (draw) draw();
        return false;
    }
    state.input.patternCopyFlow.axisLineId = Number(ln.id);
    if (setStatus) setStatus(`軸を設定: 線 #${ln.id}`);
    if (draw) draw();
    return true;
}

export function clearPatternCopyAxis(state, helpers) {
    const { setStatus, draw } = helpers;
    state.input.patternCopyFlow.axisLineId = null;
    if (setStatus) setStatus("軸設定を解除");
    if (draw) draw();
}

export function executePatternCopy(state, helpers) {
    const { setStatus, draw } = helpers;
    const mode = String(state.patternCopySettings?.mode || "array");
    const selected = getSelectedShapes(state);
    const rootGroupIds = getRootSelectedGroupIds(state);
    if (!selected.length && !rootGroupIds.length) {
        if (setStatus) setStatus("Pattern copy: コピー元を選択してください");
        if (draw) draw();
        return false;
    }

    const newIds = [];
    const newRootIds = [];
    if (mode === "array") {
        const countX = Math.max(1, Math.round(Number(state.patternCopySettings?.arrayCountX) || 1));
        const countY = Math.max(1, Math.round(Number(state.patternCopySettings?.arrayCountY) || 1));
        const dxBase = Number(state.patternCopySettings?.arrayDx) || 0;
        const dyBase = Number(state.patternCopySettings?.arrayDy) || 0;
        const instanceCount = Math.max(0, countX * countY - 1);
        if (instanceCount <= 0) {
            if (setStatus) setStatus("Pattern copy: 配列数が不足しています");
            if (draw) draw();
            return false;
        }
        pushHistory(state);
        for (let iy = 0; iy < countY; iy++) {
            for (let ix = 0; ix < countX; ix++) {
                if (ix === 0 && iy === 0) continue;
                const dx = ix * dxBase;
                const dy = iy * dyBase;
                if (rootGroupIds.length) {
                    const r = cloneGroupsWithTransform(state, rootGroupIds, (x, y) => ({ x: Number(x) + dx, y: Number(y) + dy }));
                    newIds.push(...r.newShapeIds);
                    newRootIds.push(...r.newRootGroupIds);
                } else {
                    const idMap = new Map();
                    for (const s of selected) idMap.set(Number(s.id), Number(nextShapeId(state)));
                    const clones = [];
                    for (const s of selected) {
                        const c = JSON.parse(JSON.stringify(s));
                        c.id = Number(idMap.get(Number(s.id)));
                        patternShiftShapeDeep(c, dx, dy);
                        clones.push(c);
                    }
                    for (const c of clones) {
                        patternRemapRefsDeep(c, idMap);
                        state.shapes.push(c);
                        appendShapeToGroupIfNeeded(state, c);
                        newIds.push(Number(c.id));
                    }
                }
            }
        }
    } else if (mode === "rotate") {
        const centerId = Number(state.input?.patternCopyFlow?.centerPositionId);
        const center = (state.shapes || []).find(s => Number(s.id) === centerId && s.type === "position");
        if (!center) {
            if (setStatus) setStatus("Pattern copy: 回転中心が未設定です");
            if (draw) draw();
            return false;
        }
        const cx = Number(center.x), cy = Number(center.y);
        const angleDeg = Number(state.patternCopySettings?.rotateAngleDeg) || 0;
        const count = Math.max(1, Math.round(Number(state.patternCopySettings?.rotateCount) || 1));
        if (count <= 1) {
            if (setStatus) setStatus("Pattern copy: 回転数が不足しています");
            if (draw) draw();
            return false;
        }
        pushHistory(state);
        for (let i = 1; i < count; i++) {
            const deg = angleDeg * i;
            const rad = deg * Math.PI / 180;
            const tf = (x, y) => rotatePointAround(Number(x), Number(y), cx, cy, deg);
            if (rootGroupIds.length) {
                const r = cloneGroupsWithTransform(state, rootGroupIds, tf, { rotationDeltaRad: rad });
                newIds.push(...r.newShapeIds);
                newRootIds.push(...r.newRootGroupIds);
            } else {
                const idMap = new Map();
                for (const s of selected) idMap.set(Number(s.id), Number(nextShapeId(state)));
                const clones = [];
                for (const s of selected) {
                    const c = JSON.parse(JSON.stringify(s));
                    c.id = Number(idMap.get(Number(s.id)));
                    applyTransformToShapeDeep(c, tf);
                    if (c.type === "arc") {
                        c.a1 = Number(s.a1) + rad;
                        c.a2 = Number(s.a2) + rad;
                        c.ccw = (s.ccw !== false);
                    } else if (c.type === "circleDim" && Number.isFinite(Number(c.ang))) {
                        c.ang = Number(c.ang) + rad;
                    } else if (c.type === "text") {
                        c.textRotate = Number(c.textRotate || 0) + deg;
                    }
                    clones.push(c);
                }
                for (const c of clones) {
                    patternRemapRefsDeep(c, idMap);
                    state.shapes.push(c);
                    appendShapeToGroupIfNeeded(state, c);
                    newIds.push(Number(c.id));
                }
            }
        }
    } else if (mode === "mirror") {
        const axisId = Number(state.input?.patternCopyFlow?.axisLineId);
        const axis = (state.shapes || []).find(s => Number(s.id) === axisId && s.type === "line");
        if (!axis) {
            if (setStatus) setStatus("Pattern copy: 反転軸が未設定です");
            if (draw) draw();
            return false;
        }
        pushHistory(state);
        const ax = Number(axis.x1), ay = Number(axis.y1), bx = Number(axis.x2), by = Number(axis.y2);
        const tf = (x, y) => mirrorPointAcrossLine(x, y, ax, ay, bx, by);
        if (rootGroupIds.length) {
            const r = cloneGroupsWithTransform(state, rootGroupIds, tf, { flipOrientation: true });
            newIds.push(...r.newShapeIds);
            newRootIds.push(...r.newRootGroupIds);
        } else {
            const idMap = new Map();
            for (const s of selected) idMap.set(Number(s.id), Number(nextShapeId(state)));
            const clones = [];
            for (const s of selected) {
                const c = JSON.parse(JSON.stringify(s));
                c.id = Number(idMap.get(Number(s.id)));
                applyTransformToShapeDeep(c, tf);
                if (c.type === "arc") {
                    const p1 = tf(Number(s.cx) + Math.cos(Number(s.a1) || 0) * Number(s.r || 0), Number(s.cy) + Math.sin(Number(s.a1) || 0) * Number(s.r || 0));
                    const p2 = tf(Number(s.cx) + Math.cos(Number(s.a2) || 0) * Number(s.r || 0), Number(s.cy) + Math.sin(Number(s.a2) || 0) * Number(s.r || 0));
                    c.a1 = Math.atan2(Number(p1.y) - Number(c.cy), Number(p1.x) - Number(c.cx));
                    c.a2 = Math.atan2(Number(p2.y) - Number(c.cy), Number(p2.x) - Number(c.cx));
                    c.ccw = !(s.ccw !== false);
                }
                clones.push(c);
            }
            for (const c of clones) {
                patternRemapRefsDeep(c, idMap);
                state.shapes.push(c);
                appendShapeToGroupIfNeeded(state, c);
                newIds.push(Number(c.id));
            }
        }
    } else {
        if (setStatus) setStatus(`Pattern copy: ${mode} は現在調整中です`);
        if (draw) draw();
        return false;
    }

    if (newIds.length) setSelection(state, newIds);
    if (newRootIds.length) {
        state.selection.groupIds = Array.from(new Set(newRootIds.map(Number)));
        state.activeGroupId = Number(state.selection.groupIds[state.selection.groupIds.length - 1]);
    } else {
        state.activeGroupId = null;
    }
    if (setStatus) setStatus(`Pattern copy: ${newIds.length} 個作成`);
    if (draw) draw();
    return newIds.length > 0;
}
