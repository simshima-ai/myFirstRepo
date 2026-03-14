import { pushHistory, setSelection, pruneEmptyGroups } from "./state.js";
import { solveLineLineFillet, solveLineCircleFillet, solveLineCircleFilletWithEnds, solveArcArcFillet, chooseTrimSideForIntersectionByT, chooseEndsForLineByKeepEnd, segmentCircleIntersectionPoints, isAngleOnArc } from "./solvers.js";
import { getSelectedShapes, getTrimHoverCandidate } from "./app_selection.js";
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

function applyLineLikeFilletTrim(source, tangentPoint, keepEnd) {
    if (!source || !tangentPoint) return false;
    const tx = Number(tangentPoint.x), ty = Number(tangentPoint.y);
    if (![tx, ty].every(Number.isFinite)) return false;
    if (source.kind === "line") {
        const line = source.shape;
        if (!line || String(line.type || "") !== "line") return false;
        const e = source.keepEnd || keepEnd;
        if (e === "p1") {
            line.x2 = tx; line.y2 = ty;
        } else {
            line.x1 = tx; line.y1 = ty;
        }
        return Math.hypot(Number(line.x2) - Number(line.x1), Number(line.y2) - Number(line.y1)) > 1e-6;
    }
    if (source.kind === "polyline") {
        const pts = Array.isArray(source.shape?.points) ? source.shape.points : null;
        const i1 = Number(source.i1);
        const i2 = Number(source.i2);
        if (!pts || !Number.isInteger(i1) || !Number.isInteger(i2) || i1 < 0 || i2 < 0 || i1 >= pts.length || i2 >= pts.length) return false;
        const e = source.keepEnd || keepEnd;
        const idx = (e === "p1") ? i2 : i1;
        pts[idx] = { x: tx, y: ty };
        if (source.line) {
            source.line.x1 = Number(pts[i1]?.x);
            source.line.y1 = Number(pts[i1]?.y);
            source.line.x2 = Number(pts[i2]?.x);
            source.line.y2 = Number(pts[i2]?.y);
        }
        return Math.hypot(Number(pts[i2]?.x) - Number(pts[i1]?.x), Number(pts[i2]?.y) - Number(pts[i1]?.y)) > 1e-6;
    }
    return false;
}


function findShapeGroupId(state, shapeOrId) {
    const sid = Number(typeof shapeOrId === "object" ? shapeOrId?.id : shapeOrId);
    if (Number.isFinite(sid)) {
        for (const g of (state.groups || [])) {
            const ids = Array.isArray(g?.shapeIds) ? g.shapeIds : [];
            if (ids.some((id) => Number(id) === sid)) return Number(g.id);
        }
    }
    const gid = Number(typeof shapeOrId === "object" ? shapeOrId?.groupId : NaN);
    return Number.isFinite(gid) ? gid : null;
}

function attachShapesToGroup(state, groupId, shapes) {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return false;
    const group = (state.groups || []).find((g) => Number(g?.id) === gid);
    if (!group) return false;
    if (!Array.isArray(group.shapeIds)) group.shapeIds = [];
    const idSet = new Set(group.shapeIds.map(Number).filter(Number.isFinite));
    for (const shape of (shapes || [])) {
        const sid = Number(shape?.id);
        if (!Number.isFinite(sid)) continue;
        shape.groupId = gid;
        if (!idSet.has(sid)) {
            group.shapeIds.push(sid);
            idSet.add(sid);
        }
    }
    return true;
}

function resolvePreferredFilletGroupId(groupIds) {
    const ids = Array.from(new Set((groupIds || []).map(Number).filter(Number.isFinite)));
    if (!ids.length) return null;
    return ids[0];
}

function createVirtualLineFromLineLikeSource(source) {
    if (!source) return null;
    if (source.kind === "line") {
        const line = source.shape;
        if (!line || String(line.type || "") !== "line") return null;
        return {
            id: Number(line.id),
            type: "line",
            x1: Number(line.x1),
            y1: Number(line.y1),
            x2: Number(line.x2),
            y2: Number(line.y2),
            layerId: line.layerId,
            lineWidthMm: Number.isFinite(Number(line.lineWidthMm)) ? Number(line.lineWidthMm) : undefined,
            lineType: typeof line.lineType === "string" ? String(line.lineType) : undefined,
            color: typeof line.color === "string" ? String(line.color) : undefined,
        };
    }
    if (source.kind === "polyline") {
        const pts = Array.isArray(source.shape?.points) ? source.shape.points : null;
        const i1 = Number(source.i1);
        const i2 = Number(source.i2);
        if (!pts || !Number.isInteger(i1) || !Number.isInteger(i2) || i1 < 0 || i2 < 0 || i1 >= pts.length || i2 >= pts.length) return null;
        return {
            id: Number(source.shape?.id),
            type: "line",
            x1: Number(pts[i1]?.x),
            y1: Number(pts[i1]?.y),
            x2: Number(pts[i2]?.x),
            y2: Number(pts[i2]?.y),
            layerId: source.shape?.layerId,
            lineWidthMm: Number.isFinite(Number(source.shape?.lineWidthMm)) ? Number(source.shape.lineWidthMm) : undefined,
            lineType: typeof source.shape?.lineType === "string" ? String(source.shape.lineType) : undefined,
            color: typeof source.shape?.color === "string" ? String(source.shape.color) : undefined,
        };
    }
    return null;
}

export function normalizeFilletLineSource(state, deps, source) {
    void state;
    if (!source) return null;
    if (source.kind === "line") {
        return {
            ...source,
            shape: source.shape,
            line: source.line || source.shape,
            sourceGroupId: findShapeGroupId(state, source.shape),
            normalizedShapes: [source.shape],
            pendingAddShapes: [],
            pendingRemoveShapeIds: [],
        };
    }
    if (source.kind !== "polyline") return null;
    const poly = source.shape;
    const pts = Array.isArray(poly?.points) ? poly.points : null;
    const segCount = Math.max(0, (pts?.length || 0) - 1) + (poly?.closed ? 1 : 0);
    const nextShapeId = deps?.nextShapeId;
    if (!pts || pts.length < 2 || segCount < 1 || typeof nextShapeId !== "function") return null;
    const lines = [];
    let targetLine = null;
    for (let si = 0; si < segCount; si++) {
        const i1 = si;
        const i2 = (si + 1) % pts.length;
        const p1 = pts[i1];
        const p2 = pts[i2];
        const x1 = Number(p1?.x), y1 = Number(p1?.y), x2 = Number(p2?.x), y2 = Number(p2?.y);
        if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
        if (Math.hypot(x2 - x1, y2 - y1) <= 1e-6) continue;
        const line = {
            id: nextShapeId(),
            type: "line",
            x1,
            y1,
            x2,
            y2,
            layerId: poly.layerId,
            lineWidthMm: Number.isFinite(Number(poly.lineWidthMm)) ? Number(poly.lineWidthMm) : undefined,
            lineType: typeof poly.lineType === "string" ? String(poly.lineType) : undefined,
            color: typeof poly.color === "string" ? String(poly.color) : undefined,
        };
        lines.push(line);
        if (Number(si) === Number(source.segIndex)) targetLine = line;
    }
    if (!lines.length || !targetLine) return null;
    return {
        kind: "line",
        shape: targetLine,
        keepEnd: normalizeKeepEndValue(source.keepEnd) || undefined,
        line: targetLine,
        sourceGroupId: findShapeGroupId(state, poly),
        normalizedShapes: lines.slice(),
        pendingAddShapes: lines.slice(),
        pendingRemoveShapeIds: [Number(poly.id)],
    };
}

function commitNormalizedLineSources(state, helpers, sources) {
    const arr = Array.isArray(sources) ? sources.filter(Boolean) : [];
    for (const source of arr) {
        const shapes = Array.isArray(source.pendingAddShapes) ? source.pendingAddShapes.filter(Boolean) : [];
        const gid = Number(source?.sourceGroupId);
        if (Number.isFinite(gid)) {
            for (const shape of shapes) shape.groupId = gid;
            attachShapesToGroup(state, gid, shapes);
        }
        for (const shape of shapes) helpers.addShape?.(shape);
    }
    const removeIds = Array.from(new Set(arr.flatMap((source) => Array.isArray(source.pendingRemoveShapeIds) ? source.pendingRemoveShapeIds : []).map(Number).filter(Number.isFinite)));
    for (const id of removeIds) {
        if (!helpers.removeShapeById?.(id)) return false;
    }
    pruneEmptyGroups(state);
    return true;
}

function normalizeKeepEndValue(value) {
    return (value === "p1" || value === "p2") ? value : null;
}

function resolveEffectiveKeepEnd(preferredKeepEnd, sol) {
    return normalizeKeepEndValue(preferredKeepEnd)
        || normalizeKeepEndValue(sol?.keepEnd)
        || normalizeKeepEndValue(sol?.desiredKeepEnd)
        || "p1";
}

function solveLineCircleFilletForSource(lineSource, roundConn, radius, worldHint = null) {
    const workingLine = createVirtualLineFromLineLikeSource(lineSource);
    if (!workingLine || !roundConn) return { ok: false, reason: "invalid-source" };
    const preferredKeepEnd = normalizeKeepEndValue(lineSource?.keepEnd);
    if (preferredKeepEnd) {
        const fixed = solveLineCircleFilletWithEnds(workingLine, roundConn, radius, preferredKeepEnd, worldHint);
        if (fixed?.ok) return fixed;
    }
    return solveLineCircleFillet(workingLine, roundConn, radius, worldHint);
}

function trimVirtualLineForFillet(line, tangentPoint, keepEnd) {
    if (!line || String(line.type || "") !== "line" || !tangentPoint) return false;
    const tx = Number(tangentPoint.x);
    const ty = Number(tangentPoint.y);
    if (![tx, ty].every(Number.isFinite)) return false;
    if (String(keepEnd || "p1") === "p1") {
        line.x2 = tx;
        line.y2 = ty;
    } else {
        line.x1 = tx;
        line.y1 = ty;
    }
    return Math.hypot(Number(line.x2) - Number(line.x1), Number(line.y2) - Number(line.y1)) > 1e-6;
}

function buildLineCircleFilletMeta(lineSource, circleRef, keepEnd, arcCutKey) {
    if (!lineSource || !circleRef) return null;
    const lineMeta = (lineSource.kind === "polyline")
        ? {
            kind: "polyline",
            shapeId: Number(lineSource.shape?.id),
            segIndex: Number(lineSource.segIndex),
            i1: Number(lineSource.i1),
            i2: Number(lineSource.i2),
            keepEnd: String(keepEnd || "p1"),
        }
        : {
            kind: "line",
            shapeId: Number(lineSource.shape?.id),
            keepEnd: String(keepEnd || "p1"),
        };
    return {
        kind: "line-circle",
        line: lineMeta,
        round: {
            shapeId: Number(circleRef.id),
            type: String(circleRef.type || "").toLowerCase(),
        },
        arcCutKey: (arcCutKey === "a1" || arcCutKey === "a2") ? arcCutKey : null,
    };
}

function resolveLineLikeSourceFromMeta(state, meta) {
    if (!state || !meta || !Number.isFinite(Number(meta.shapeId))) return null;
    const shape = (state.shapes || []).find((s) => Number(s?.id) === Number(meta.shapeId));
    if (!shape) return null;
    if (String(meta.kind || "") === "line") {
        if (String(shape.type || "") !== "line") return null;
        return {
            kind: "line",
            shape,
            keepEnd: normalizeKeepEndValue(meta.keepEnd) || undefined,
            line: createVirtualLineFromLineLikeSource({ kind: "line", shape }),
        };
    }
    if (String(meta.kind || "") === "polyline") {
        if (String(shape.type || "") !== "polyline") return null;
        const pts = Array.isArray(shape.points) ? shape.points : null;
        const i1 = Number(meta.i1);
        const i2 = Number(meta.i2);
        if (!pts || !Number.isInteger(i1) || !Number.isInteger(i2) || i1 < 0 || i2 < 0 || i1 >= pts.length || i2 >= pts.length) return null;
        const source = {
            kind: "polyline",
            shape,
            segIndex: Number(meta.segIndex),
            i1,
            i2,
            keepEnd: normalizeKeepEndValue(meta.keepEnd) || undefined,
        };
        source.line = createVirtualLineFromLineLikeSource(source);
        return source.line ? source : null;
    }
    return null;
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
    // addShape and nextShapeId from helpers are already bound to state.
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
function autoTrimNormTau(a) {
    let x = Number(a) || 0;
    while (x < 0) x += AUTO_TRIM_TAU;
    while (x >= AUTO_TRIM_TAU) x -= AUTO_TRIM_TAU;
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
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), rr = Math.abs(Number(arcShape.r) || 0);
    const ccw = arcShape.ccw !== false;
    const th = Math.atan2(Number(tangentPoint?.y) - Number(arcShape.cy), Number(tangentPoint?.x) - Number(arcShape.cx));
    const removedMidPoint = (cutKey) => {
        const start = (cutKey === "a1") ? a1 : th;
        const end = (cutKey === "a1") ? th : a2;
        const span = ccw
            ? (((end - start) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU)
            : (((start - end) + AUTO_TRIM_TAU) % AUTO_TRIM_TAU);
        const mid = ccw ? (start + span * 0.5) : (start - span * 0.5);
        return autoTrimArcPoint(arcShape, mid);
    };
    if (towardPoint && Number.isFinite(Number(towardPoint.x)) && Number.isFinite(Number(towardPoint.y))) {
        const p1 = removedMidPoint("a1");
        const p2 = removedMidPoint("a2");
        const d1 = Math.hypot(Number(towardPoint.x) - Number(p1.x), Number(towardPoint.y) - Number(p1.y));
        const d2 = Math.hypot(Number(towardPoint.x) - Number(p2.x), Number(towardPoint.y) - Number(p2.y));
        return (d1 <= d2) ? "a1" : "a2";
    }
    if (![cx, cy, rr].every(Number.isFinite) || !(rr > 1e-9)) return "a1";
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

function pickLineArcIntersectionTowardPoint(lineRef, arcRef, sol, fallbackPoint = null) {
    const sx = Number(sol?.sharedIntersection?.x);
    const sy = Number(sol?.sharedIntersection?.y);
    if (Number.isFinite(sx) && Number.isFinite(sy)) return { x: sx, y: sy };
    if (!lineRef || lineRef.type !== "line" || !arcRef || arcRef.type !== "arc") return fallbackPoint;
    const a = { x: Number(lineRef.x1), y: Number(lineRef.y1) };
    const b = { x: Number(lineRef.x2), y: Number(lineRef.y2) };
    const ips = segmentCircleIntersectionPoints(a, b, arcRef) || [];
    const cand = [];
    for (const ip of ips) {
        const x = Number(ip?.x), y = Number(ip?.y);
        if (![x, y].every(Number.isFinite)) continue;
        const th = Math.atan2(y - Number(arcRef.cy), x - Number(arcRef.cx));
        if (!isAngleOnArc(th, Number(arcRef.a1) || 0, Number(arcRef.a2) || 0, arcRef.ccw !== false)) continue;
        cand.push({ x, y });
    }
    if (!cand.length) return fallbackPoint;
    if (cand.length === 1) return cand[0];
    const hint = (sol?.arcMid && Number.isFinite(Number(sol.arcMid.x)) && Number.isFinite(Number(sol.arcMid.y)))
        ? { x: Number(sol.arcMid.x), y: Number(sol.arcMid.y) }
        : (fallbackPoint && Number.isFinite(Number(fallbackPoint.x)) && Number.isFinite(Number(fallbackPoint.y))
            ? { x: Number(fallbackPoint.x), y: Number(fallbackPoint.y) }
            : null);
    if (!hint) return cand[0];
    cand.sort((p, q) =>
        Math.hypot(Number(p.x) - Number(hint.x), Number(p.y) - Number(hint.y))
        - Math.hypot(Number(q.x) - Number(hint.x), Number(q.y) - Number(hint.y))
    );
    return cand[0];
}

function splitArcAtAngleKeepEndpointsFromSnapshot(arcSnap, splitAngle) {
    if (!arcSnap || !Number.isFinite(Number(splitAngle))) return null;
    const a1Old = autoTrimNormTau(Number(arcSnap.a1) || 0);
    const a2Old = autoTrimNormTau(Number(arcSnap.a2) || 0);
    const ccw = arcSnap.ccw !== false;
    const th = autoTrimNormTau(Number(splitAngle));
    const eps = 1e-5;
    const angDiff = (u, v) => Math.abs(autoTrimNormPi((Number(u) || 0) - (Number(v) || 0)));
    if (!isAngleOnArc(th, a1Old, a2Old, ccw)) return null;
    // Do not allow split angle to collapse to either endpoint.
    if (angDiff(th, a1Old) <= 1e-4 || angDiff(th, a2Old) <= 1e-4) return null;
    const oldSpan = autoTrimSpan(a1Old, a2Old, ccw);
    const span1 = autoTrimSpan(a1Old, th, ccw);
    const span2 = autoTrimSpan(th, a2Old, ccw);
    if (!(oldSpan > eps && oldSpan < AUTO_TRIM_TAU - eps)) return null;
    if (!(span1 > eps && span2 > eps)) return null;
    if (!(span1 < oldSpan - eps && span2 < oldSpan - eps)) return null;
    // Split verification and guard against near full-circle segments.
    if (Math.abs((span1 + span2) - oldSpan) > 1e-4) return null;
    if (span1 >= AUTO_TRIM_TAU - 1e-4 || span2 >= AUTO_TRIM_TAU - 1e-4) return null;
    return {
        seg1: { a1: a1Old, a2: th, ccw, span: span1 },
        seg2: { a1: th, a2: a2Old, ccw, span: span2 },
    };
}

function chooseKeepSegByIntersectionA(split, arcSnap, pointA) {
    if (!split || !arcSnap || !pointA) return null;
    const cx = Number(arcSnap.cx), cy = Number(arcSnap.cy);
    const thA = Math.atan2(Number(pointA.y) - cy, Number(pointA.x) - cx);
    if (!Number.isFinite(thA)) return null;
    const on1 = isAngleOnArc(thA, Number(split.seg1?.a1), Number(split.seg1?.a2), split.seg1?.ccw !== false);
    const on2 = isAngleOnArc(thA, Number(split.seg2?.a1), Number(split.seg2?.a2), split.seg2?.ccw !== false);
    if (on1 && !on2) return split.seg2; // remove seg1 (A-side), keep opposite.
    if (on2 && !on1) return split.seg1; // remove seg2 (A-side), keep opposite.
    // Fallback: keep longer side to avoid over-trim.
    return (Number(split.seg1?.span) >= Number(split.seg2?.span)) ? split.seg1 : split.seg2;
}
export function computeLineCircleAutoTrimPlan(state, sol, lineRef, circleRef, keepEnd, suppressShapeId = null, towardPoint = null) {
    const result = {
        okLine: false,
        okArc: (circleRef?.type !== "arc"),
        okAll: false,
        effectiveKeepEnd: resolveEffectiveKeepEnd(keepEnd, sol),
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
        const nearFullEps = 1e-4;
        const minSpanEps = 1e-5;
        const minShrinkEps = 1e-5;
        const maxRemovedSpan = Math.PI * 0.5 + 1e-4; // line-arc fillet should trim only a small side.
        const oldA1 = Number(circleRef.a1) || 0;
        const oldA2 = Number(circleRef.a2) || 0;
        const ccw = circleRef.ccw !== false;
        const oldSpan = autoTrimSpan(oldA1, oldA2, ccw);
        const th = Math.atan2(Number(sol?.tCircle?.y) - Number(circleRef.cy), Number(sol?.tCircle?.x) - Number(circleRef.cx));
        const angDiff = (u, v) => Math.abs(autoTrimNormPi((Number(u) || 0) - (Number(v) || 0)));
        const nearEq = (u, v, eps = 1e-4) => angDiff(u, v) <= eps;
        const validateArcCandidate = (cand) => {
            if (!cand) return false;
            const k1 = Number(cand.keepA1);
            const k2 = Number(cand.keepA2);
            if (![k1, k2].every(Number.isFinite)) return false;
            const span = autoTrimSpan(k1, k2, (cand.remCCW !== false));
            const removed = oldSpan - span;
            if (!(span > minSpanEps)) return false;
            if (span >= AUTO_TRIM_TAU - nearFullEps) return false;
            if (!(removed > minShrinkEps)) return false;
            if (removed > maxRemovedSpan) return false;
            // Tangent point on source arc must become one of new arc endpoints.
            if (!(nearEq(k1, th) || nearEq(k2, th))) return false;
            const cutKey = (cand.cutKey === "a1" || cand.cutKey === "a2") ? cand.cutKey : null;
            if (cutKey === "a1" && !(nearEq(k1, th) && nearEq(k2, oldA2))) return false;
            if (cutKey === "a2" && !(nearEq(k1, oldA1) && nearEq(k2, th))) return false;
            return true;
        };
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
                    cand.cutKey = cutKey;
                    if (!validateArcCandidate(cand)) continue;
                    return cand;
                }
                return null;
            });
            if (picked) return { candidate: picked, clicks };
            const det = buildDeterministicArcCandidate(cutKey);
            det.cutKey = cutKey;
            if (validateArcCandidate(det)) return { candidate: det, clicks };
            return { candidate: null, clicks };
        };

        const toward = (towardPoint && Number.isFinite(Number(towardPoint.x)) && Number.isFinite(Number(towardPoint.y)))
            ? { x: Number(towardPoint.x), y: Number(towardPoint.y) }
            : (sol.sharedIntersection || sol.arcMid || null);
        const initialCutKey = autoTrimPickArcCutKey(circleRef, sol.tCircle, toward);
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
    const lineSourceRefKey = (source) => {
        if (!source) return "";
        if (source.kind === "polyline") return `polyline:${Number(source.shape?.id)}:${Number(source.segIndex)}`;
        return `line:${Number(source.shape?.id ?? source.line?.id)}`;
    };
    const materializeLineLikeSource = (shape, segIndex = null) => {
        if (!shape) return null;
        if (shape.type === "line") {
            return {
                kind: "line",
                shape,
                line: createVirtualLineFromLineLikeSource({ kind: "line", shape }),
            };
        }
        if (shape.type === "polyline") {
            const pts = Array.isArray(shape.points) ? shape.points : null;
            const si = Number(segIndex);
            if (!pts || !Number.isInteger(si)) return null;
            const segCount = Math.max(0, pts.length - 1) + (shape.closed ? 1 : 0);
            if (si < 0 || si >= segCount) return null;
            const i1 = si;
            const i2 = (si + 1) % pts.length;
            const source = { kind: "polyline", shape, segIndex: si, i1, i2 };
            source.line = createVirtualLineFromLineLikeSource(source);
            return source.line ? source : null;
        }
        return null;
    };
    const findConnectedLineLikeAtPoint = (pt, excludeRefs = new Set()) => {
        let best = null;
        let bestD = Infinity;
        for (const s of (state.shapes || [])) {
            if (!s || (s.type !== "line" && s.type !== "polyline")) continue;
            if (s.type === "line") {
                const source = materializeLineLikeSource(s, null);
                const refKey = lineSourceRefKey(source);
                if (excludeRefs && excludeRefs.has(refKey)) continue;
                const p1 = { x: Number(s.x1), y: Number(s.y1) };
                const p2 = { x: Number(s.x2), y: Number(s.y2) };
                const d1 = Math.hypot(pt.x - p1.x, pt.y - p1.y);
                const d2 = Math.hypot(pt.x - p2.x, pt.y - p2.y);
                if (d1 <= eps && d1 < bestD) { bestD = d1; best = { source, key: "p1", refKey }; }
                if (d2 <= eps && d2 < bestD) { bestD = d2; best = { source, key: "p2", refKey }; }
                continue;
            }
            const pts = Array.isArray(s.points) ? s.points : [];
            const segCount = Math.max(0, pts.length - 1) + (s.closed ? 1 : 0);
            for (let si = 0; si < segCount; si++) {
                const source = materializeLineLikeSource(s, si);
                if (!source || !source.line) continue;
                const refKey = lineSourceRefKey(source);
                if (excludeRefs && excludeRefs.has(refKey)) continue;
                const p1 = { x: Number(source.line.x1), y: Number(source.line.y1) };
                const p2 = { x: Number(source.line.x2), y: Number(source.line.y2) };
                const d1 = Math.hypot(pt.x - p1.x, pt.y - p1.y);
                const d2 = Math.hypot(pt.x - p2.x, pt.y - p2.y);
                if (d1 <= eps && d1 < bestD) { bestD = d1; best = { source, key: "p1", refKey }; }
                if (d2 <= eps && d2 < bestD) { bestD = d2; best = { source, key: "p2", refKey }; }
            }
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
        const c1 = findConnectedLineLikeAtPoint(end1, new Set());
        const c2 = findConnectedLineLikeAtPoint(end2, new Set([c1?.refKey].filter(Boolean)));
        if (!c1 || !c2 || !c1.source?.line || !c2.source?.line) return false;
        const hint = arcMidHint(arcShape);
        const sol = solveLineLineFillet(c1.source.line, c2.source.line, nextR, hint);
        if (!sol || !sol.ok || !sol.arc) return false;
        const t1 = sol.t1, t2 = sol.t2;
        if (!t1 || !t2) return false;
        if (!applyLineLikeFilletTrim(c1.source, t1, c1.key === "p1" ? "p2" : "p1")) return false;
        if (!applyLineLikeFilletTrim(c2.source, t2, c2.key === "p1" ? "p2" : "p1")) return false;
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
        const hint = arcMidHint(arcShape);
        const applySolved = (lineSource, roundConn, forcedCutKey = null) => {
            const workingLine = createVirtualLineFromLineLikeSource(lineSource);
            if (!workingLine || !roundConn) return false;
            const sol = solveLineCircleFilletForSource(lineSource, roundConn, nextR, hint);
            if (!sol || !sol.ok || !sol.arc || !sol.tLine || !sol.tCircle) return false;
            const effectiveKeepEnd = resolveEffectiveKeepEnd(lineSource?.keepEnd, sol);
            const lineBeforeTrim = {
                type: "line",
                x1: Number(workingLine.x1), y1: Number(workingLine.y1),
                x2: Number(workingLine.x2), y2: Number(workingLine.y2),
            };
            if (roundConn.type === "arc") {
                const cutKey = (forcedCutKey === "a1" || forcedCutKey === "a2") ? forcedCutKey : sol.arcCutKey;
                const okArcTrim = (cutKey === "a1" || cutKey === "a2")
                    ? trimArcEndpointForFilletByKey(roundConn, sol.tCircle, cutKey)
                    : trimArcEndpointForFilletTowardPoint(roundConn, sol.tCircle, sol.sharedIntersection || sol.arcMid || null, lineBeforeTrim);
                if (!okArcTrim) return false;
            }
            if (!trimVirtualLineForFillet(workingLine, sol.tLine, effectiveKeepEnd)) return false;
            if (!writeVirtualLineBackToSource(lineSource, workingLine)) return false;
            arcShape.cx = Number(sol.arc.cx ?? sol.center?.x);
            arcShape.cy = Number(sol.arc.cy ?? sol.center?.y);
            arcShape.r = Number(sol.arc.r ?? sol.radius);
            arcShape.a1 = Number(sol.arc.a1);
            arcShape.a2 = Number(sol.arc.a2);
            arcShape.ccw = sol.arc.ccw !== false;
            arcShape.filletSource = buildLineCircleFilletMeta(lineSource, roundConn, effectiveKeepEnd, (forcedCutKey === "a1" || forcedCutKey === "a2") ? forcedCutKey : sol.arcCutKey);
            return [arcShape.cx, arcShape.cy, arcShape.r, arcShape.a1, arcShape.a2].every(Number.isFinite);
        };

        const meta = arcShape.filletSource;
        if (meta && meta.kind === "line-circle") {
            const lineSource = resolveLineLikeSourceFromMeta(state, meta.line);
            const roundConn = (state.shapes || []).find((s) => Number(s?.id) === Number(meta.round?.shapeId));
            if (lineSource && roundConn) return applySolved(lineSource, roundConn, meta.arcCutKey || null);
        }

        const end1 = getArcEndPoint(arcShape, "a1");
        const end2 = getArcEndPoint(arcShape, "a2");
        if (!end1 || !end2) return false;
        const tryFit = (endLinePt, endRoundPt) => {
            const lineConn = findConnectedLineLikeAtPoint(endLinePt, new Set());
            if (!lineConn || !lineConn.source?.line) return false;
            const exclude = new Set([Number(arcShape.id)]);
            const roundConn = findConnectedRoundAtPoint(endRoundPt, exclude);
            if (!roundConn) return false;
            const lineSource = {
                ...lineConn.source,
                keepEnd: lineConn.key === "p1" ? "p2" : "p1",
            };
            return applySolved(lineSource, roundConn, null);
        };
        if (tryFit(end1, end2)) return true;
        if (tryFit(end2, end1)) return true;
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

function restoreLineLikeShape(source, snapshotJson) {
    if (!source || !snapshotJson) return false;
    try {
        const snap = JSON.parse(String(snapshotJson));
        Object.assign(source.shape, snap);
        return true;
    } catch (_) {
        return false;
    }
}

export function applyPendingLineCircleFillet(state, helpers, keepEnd) {
    const { setStatus, draw, addShape, nextShapeId } = helpers;
    const ff = state.input.filletFlow;
    if (!ff || !ff.sol) return;
    const sol = ff.sol;
    const lineSource = normalizeFilletLineSource(state, { nextShapeId }, ff.lineSource || null);
    const lineShape = lineSource?.shape || state.shapes.find(s => Number(s.id) === Number(ff.line?.id));
    const circleRef = state.shapes.find(s => Number(s.id) === Number(ff.circle?.id));
    const lineRef = createVirtualLineFromLineLikeSource(lineSource);
    if (!lineShape || !circleRef || !lineRef) {
        if (setStatus) setStatus("Fillet failed: target object was not found");
        state.input.filletFlow = null;
        if (draw) draw();
        return;
    }
    const mode = state.filletSettings.lineMode || "trim";
    const doTrim = (mode === "trim");
    const effectiveKeepEnd = resolveEffectiveKeepEnd(keepEnd, sol);
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
    const arc = { id: nextShapeId(), type: "arc", cx: sol.center.x, cy: sol.center.y, r: sol.radius, a1: sol.arc.a1, a2: sol.arc.a2, ccw: sol.arc.ccw, layerId: state.activeLayerId };
    applyFilletSourceStyle(state, arc, [lineRef, circleRef]);
    arc.filletSource = buildLineCircleFilletMeta(lineSource, circleRef, effectiveKeepEnd, sol.arcCutKey);
    pushHistory(state);
    if (!commitNormalizedLineSources(state, helpers, [lineSource])) {
        if (setStatus) setStatus("Fillet failed: could not convert polyline target to lines.");
        state.input.filletFlow = null;
        if (draw) draw();
        return;
    }
    const targetGroupId = resolvePreferredFilletGroupId([lineSource?.sourceGroupId, findShapeGroupId(state, circleRef)]);
    if (Number.isFinite(Number(targetGroupId))) arc.groupId = Number(targetGroupId);
    addShape(arc);
    if (Number.isFinite(Number(targetGroupId))) attachShapesToGroup(state, Number(targetGroupId), [arc]);
    if (doTrim) {
        const lineSnap = JSON.stringify(lineShape);
        const arcSnap = (circleRef.type === "arc")
            ? { a1: Number(circleRef.a1), a2: Number(circleRef.a2), ccw: circleRef.ccw !== false }
            : null;
        const clickTowardPoint = (sol.sharedIntersection || sol.arcMid || null);
        const trimTowardPoint = (circleRef.type === "arc")
            ? pickLineArcIntersectionTowardPoint(lineRef, circleRef, sol, clickTowardPoint)
            : clickTowardPoint;
        const plan = computeLineCircleAutoTrimPlan(state, sol, lineRef, circleRef, effectiveKeepEnd, arc.id, trimTowardPoint);
        let okAll = !!plan?.okLine;
        if (!trimVirtualLineForFillet(lineRef, sol.tLine, effectiveKeepEnd)) okAll = false;
        if (okAll && !writeVirtualLineBackToSource(lineSource, lineRef)) okAll = false;
        if (okAll && circleRef.type === "arc") {
            const B = { x: Number(sol?.tCircle?.x), y: Number(sol?.tCircle?.y) };
            const th = Math.atan2(Number(B.y) - Number(circleRef.cy), Number(B.x) - Number(circleRef.cx));
            if (![B.x, B.y, th].every(Number.isFinite)) {
                okAll = false;
            } else {
                const split = splitArcAtAngleKeepEndpointsFromSnapshot(arcSnap, th);
                if (!split) {
                    okAll = false;
                } else {
                    let keepSeg = null;
                    if (sol.arcCutKey === "a1") keepSeg = split.seg2;
                    else if (sol.arcCutKey === "a2") keepSeg = split.seg1;
                    else {
                        const A = pickLineArcIntersectionTowardPoint(lineRef, circleRef, sol, trimTowardPoint);
                        keepSeg = chooseKeepSegByIntersectionA(split, {
                            cx: Number(circleRef.cx),
                            cy: Number(circleRef.cy),
                        }, A);
                    }
                    const keepSpan = Number(keepSeg?.span);
                    if (!Number.isFinite(keepSpan) || !(keepSpan > 1e-5 && keepSpan < AUTO_TRIM_TAU - 1e-4)) {
                        okAll = false;
                    } else {
                        circleRef.a1 = autoTrimNormTau(Number(keepSeg.a1));
                        circleRef.a2 = autoTrimNormTau(Number(keepSeg.a2));
                        circleRef.ccw = keepSeg.ccw !== false;
                    }
                }
            }
        }
        if (!okAll) {
            restoreLineLikeShape(lineSource, lineSnap);
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
    const targetGroupId = resolvePreferredFilletGroupId([findShapeGroupId(state, arc1Ref), findShapeGroupId(state, arc2Ref)]);
    if (Number.isFinite(Number(targetGroupId))) arc.groupId = Number(targetGroupId);
    addShape(arc);
    if (Number.isFinite(Number(targetGroupId))) attachShapesToGroup(state, Number(targetGroupId), [arc]);
    pruneEmptyGroups(state);
    state.input.filletFlow = null;
    if (setStatus) setStatus(trimWarning ? "Fillet created (trim skipped: arc would become full circle)" : "Fillet created");
    if (draw) draw();
}

