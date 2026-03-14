import { applyPendingLineCircleFillet, applyPendingArcArcFillet, normalizeFilletLineSource } from "./app_tools.js";
import { circleCircleIntersectionPoints, isAngleOnArc, solveLineLineFilletWithEnds } from "./solvers.js";
import { pruneEmptyGroups } from "./state.js";

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

export function getFilletTargetRef(shape, worldRaw = null) {
    if (!shape) return null;
    const t = String(shape.type || "").toLowerCase();
    if (t === "line" || t === "circle" || t === "arc") {
        return { shapeId: Number(shape.id), type: t };
    }
    if (t !== "polyline" || !Array.isArray(shape.points)) return null;
    const pts = shape.points;
    if (pts.length < 2) return null;
    const wx = Number(worldRaw?.x), wy = Number(worldRaw?.y);
    if (![wx, wy].every(Number.isFinite)) return { shapeId: Number(shape.id), type: "polyline", segIndex: 0, i1: 0, i2: 1 };
    let best = null;
    for (let si = 0; si < pts.length - 1 + (shape.closed ? 1 : 0); si++) {
        const i1 = si;
        const i2 = (si + 1) % pts.length;
        const a = pts[i1], b = pts[i2];
        const ax = Number(a?.x), ay = Number(a?.y), bx = Number(b?.x), by = Number(b?.y);
        if (![ax, ay, bx, by].every(Number.isFinite)) continue;
        const vx = bx - ax, vy = by - ay;
        const vv = vx * vx + vy * vy;
        if (vv <= 1e-12) continue;
        let tt = ((wx - ax) * vx + (wy - ay) * vy) / vv;
        if (tt < 0) tt = 0;
        if (tt > 1) tt = 1;
        const px = ax + vx * tt, py = ay + vy * tt;
        const d2 = (wx - px) * (wx - px) + (wy - py) * (wy - py);
        if (!best || d2 < best.d2) best = { segIndex: si, i1, i2, d2 };
    }
    if (!best) return null;
    return { shapeId: Number(shape.id), type: "polyline", segIndex: Number(best.segIndex), i1: Number(best.i1), i2: Number(best.i2) };
}
export function isFilletTargetShape(shape) {
    return !!shape && (shape.type === "line" || shape.type === "polyline" || shape.type === "circle" || shape.type === "arc");
}

function getArcKeepSideByTangent(arcShape, tangentPoint) {
    const th = Math.atan2(Number(tangentPoint.y) - Number(arcShape.cy), Number(tangentPoint.x) - Number(arcShape.cx));
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    const norm = (v) => Math.atan2(Math.sin(v), Math.cos(v));
    const d1 = Math.abs(norm(a1 - th));
    const d2 = Math.abs(norm(a2 - th));
    return (d1 < d2) ? "a2" : "a1";
}

const TAU = Math.PI * 2;

function applyLineLikeFilletTrim(source, tangentPoint, keepEnd) {
    if (!source || !tangentPoint || source.kind !== "line") return false;
    const tx = Number(tangentPoint.x), ty = Number(tangentPoint.y);
    if (![tx, ty].every(Number.isFinite)) return false;
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
const normAng = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const spanCCW = (aFrom, aTo) => ((aTo - aFrom) + TAU) % TAU;

function pickArcArcIntersectionA(sol, worldRawHint = null) {
    const a1 = sol?.arc1;
    const a2 = sol?.arc2;
    if (!a1 || !a2) return null;
    const ips = circleCircleIntersectionPoints(a1, Number(a1.r), a2, Number(a2.r));
    const valid = [];
    for (const p of ips) {
        const th1 = Math.atan2(Number(p.y) - Number(a1.cy), Number(p.x) - Number(a1.cx));
        const th2 = Math.atan2(Number(p.y) - Number(a2.cy), Number(p.x) - Number(a2.cx));
        if (!isAngleOnArc(th1, Number(a1.a1) || 0, Number(a1.a2) || 0, a1.ccw !== false)) continue;
        if (!isAngleOnArc(th2, Number(a2.a1) || 0, Number(a2.a2) || 0, a2.ccw !== false)) continue;
        valid.push({ x: Number(p.x), y: Number(p.y) });
    }
    if (!valid.length) return null;
    if (valid.length === 1) return valid[0];
    const c3 = sol?.arcMid || {
        x: (Number(sol?.t1?.x) + Number(sol?.t2?.x)) * 0.5,
        y: (Number(sol?.t1?.y) + Number(sol?.t2?.y)) * 0.5
    };
    const hint = (worldRawHint && Number.isFinite(Number(worldRawHint.x)) && Number.isFinite(Number(worldRawHint.y)))
        ? worldRawHint
        : c3;
    valid.sort((p, q) =>
        Math.hypot(Number(p.x) - Number(hint.x), Number(p.y) - Number(hint.y))
        - Math.hypot(Number(q.x) - Number(hint.x), Number(q.y) - Number(hint.y))
    );
    return valid[0];
}

function pickArcKeepSideByABCMid(arcShape, tangentPointB, intersectionA, c3Point) {
    if (!arcShape || !tangentPointB || !intersectionA || !c3Point) return null;
    const cx = Number(arcShape.cx), cy = Number(arcShape.cy), r = Math.abs(Number(arcShape.r) || 0);
    if (![cx, cy, r].every(Number.isFinite) || !(r > 1e-9)) return null;
    const aA = Math.atan2(Number(intersectionA.y) - cy, Number(intersectionA.x) - cx);
    const aB = Math.atan2(Number(tangentPointB.y) - cy, Number(tangentPointB.x) - cx);
    if (![aA, aB].every(Number.isFinite)) return null;

    const s1 = spanCCW(aA, aB);
    const m1 = normAng(aA + s1 * 0.5);
    const s2 = spanCCW(aB, aA);
    const m2 = normAng(aB + s2 * 0.5);
    const c1 = { x: cx + Math.cos(m1) * r, y: cy + Math.sin(m1) * r };
    const c2 = { x: cx + Math.cos(m2) * r, y: cy + Math.sin(m2) * r };
    const d13 = Math.hypot(Number(c1.x) - Number(c3Point.x), Number(c1.y) - Number(c3Point.y));
    const d23 = Math.hypot(Number(c2.x) - Number(c3Point.x), Number(c2.y) - Number(c3Point.y));
    const targetMidAng = (d13 <= d23) ? m1 : m2;

    const th = aB;
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    const ccw = arcShape.ccw !== false;
    const removedIfKeepA1 = isAngleOnArc(targetMidAng, th, a2, ccw);
    const removedIfKeepA2 = isAngleOnArc(targetMidAng, a1, th, ccw);
    if (removedIfKeepA1 && !removedIfKeepA2) return "a1";
    if (removedIfKeepA2 && !removedIfKeepA1) return "a2";
    return null;
}

export function commitFilletFromHover(state, helpers, deps, worldRawHint = null) {
    const { nextShapeId, pushHistory, addShape, removeShapeById, setSelection, setStatus } = deps;
    if (state.input?.filletFlow?.kind === "line-circle" && state.input?.filletFlow?.debugStepActive) {
        applyPendingLineCircleFillet(state, helpers, state.input.filletFlow.hoverKeepEnd);
        return true;
    }
    const cand = state.input?.filletHover;
    if (!cand || !cand.sol) {
        if (setStatus) setStatus("Fillet: no candidate. Select two objects first.");
        return false;
    }
    const r = Number(state.filletSettings?.radius) || 20;
    if (cand.mode === "line-line") {
        const sources = Array.isArray(cand.sources) && cand.sources.length === 2 ? cand.sources : null;
        const selIdSet = new Set((state.selection.ids || []).map(Number));
        const selLines = sources || (state.shapes || [])
            .filter((s) => selIdSet.has(Number(s.id)) && s.type === "line")
            .map((shape) => ({ kind: "line", shape, line: shape }));
        if (selLines.length !== 2) {
            if (setStatus) setStatus("Fillet failed: select exactly 2 line/polyline targets.");
            return false;
        }
        const sol = cand.sol;
        const normalizedPolylineCache = new Map();
        const activeLines = selLines.map((source) => {
            if (source?.kind !== "polyline") return normalizeFilletLineSource(state, { nextShapeId }, source);
            const key = Number(source.shape?.id);
            const cached = normalizedPolylineCache.get(key);
            if (!cached) {
                const normalized = normalizeFilletLineSource(state, { nextShapeId }, source);
                if (normalized) normalizedPolylineCache.set(key, normalized);
                return normalized;
            }
            const targetLine = Array.isArray(cached.normalizedShapes) ? cached.normalizedShapes[Number(source.segIndex)] : null;
            if (!targetLine) return null;
            return {
                ...cached,
                keepEnd: source.keepEnd,
                shape: targetLine,
                line: targetLine,
                pendingAddShapes: [],
                pendingRemoveShapeIds: [],
            };
        });
        if (activeLines.length !== 2 || activeLines.some((source) => !source || source.kind !== "line" || !source.shape)) {
            if (setStatus) setStatus("Fillet failed: could not convert polyline target to lines.");
            return false;
        }
        const finalSol = solveLineLineFilletWithEnds(activeLines[0].line, activeLines[1].line, r, sol.keepEnd1 || "p1", sol.keepEnd2 || "p1");
        const useSol = finalSol?.ok ? finalSol : sol;
        const arc = {
            id: nextShapeId(),
            type: "arc",
            cx: Number(useSol.arc?.cx ?? useSol.center?.x),
            cy: Number(useSol.arc?.cy ?? useSol.center?.y),
            r: Number(useSol.arc?.r ?? useSol.radius),
            a1: Number(useSol.arc?.a1),
            a2: Number(useSol.arc?.a2),
            ccw: useSol.arc?.ccw !== false,
            layerId: activeLines[0].line?.layerId ?? state.activeLayerId
        };
        arc.lineWidthMm = Math.max(0.01, Number(activeLines[0]?.line?.lineWidthMm ?? activeLines[0]?.shape?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        arc.lineType = String(activeLines[0]?.line?.lineType || activeLines[0]?.shape?.lineType || "solid");
        if (![arc.cx, arc.cy, arc.r, arc.a1, arc.a2].every(Number.isFinite) || arc.r <= 0) {
            if (setStatus) setStatus("Fillet failed: invalid arc geometry.");
            return false;
        }
        pushHistory();
        for (const source of activeLines) {
            const gid = Number(source?.sourceGroupId);
            const shapes = Array.isArray(source.pendingAddShapes) ? source.pendingAddShapes.filter(Boolean) : [];
            if (Number.isFinite(gid)) {
                for (const shape of shapes) shape.groupId = gid;
                attachShapesToGroup(state, gid, shapes);
            }
            for (const shape of shapes) addShape(shape);
        }
        const removeIds = Array.from(new Set(activeLines.flatMap((source) => Array.isArray(source.pendingRemoveShapeIds) ? source.pendingRemoveShapeIds : []).map(Number).filter(Number.isFinite)));
        for (const id of removeIds) {
            if (!removeShapeById?.(id)) {
                if (setStatus) setStatus("Fillet failed: could not convert polyline target to lines.");
                return false;
            }
        }
        const targetGroupId = resolvePreferredFilletGroupId(activeLines.map((source) => source?.sourceGroupId));
        if (Number.isFinite(Number(targetGroupId))) arc.groupId = Number(targetGroupId);
        addShape(arc);
        if (Number.isFinite(Number(targetGroupId))) attachShapesToGroup(state, Number(targetGroupId), [arc]);
        pruneEmptyGroups(state);
        const mode = state.filletSettings.lineMode || "trim";
        const doTrim = (mode === "trim") && !state.filletSettings?.noTrim;
        let trimWarning = false;
        if (doTrim) {
            const line1Snap = JSON.stringify(activeLines[0].shape);
            const line2Snap = JSON.stringify(activeLines[1].shape);
            let okAll = true;
            const s1 = useSol.t1, s2 = useSol.t2;
            if (!s1 || !s2) {
                okAll = false;
            } else {
                okAll = applyLineLikeFilletTrim(activeLines[0], s1, useSol.keepEnd1 || "p1")
                    && applyLineLikeFilletTrim(activeLines[1], s2, useSol.keepEnd2 || "p1");
            }
            if (!okAll) {
                Object.assign(activeLines[0].shape, JSON.parse(line1Snap));
                Object.assign(activeLines[1].shape, JSON.parse(line2Snap));
                trimWarning = true;
            }
        }
        setSelection([arc.id]);
        if (setStatus) setStatus(trimWarning ? `Fillet (R=${r.toFixed(2)}) created (trim skipped)` : `Fillet (R=${r.toFixed(2)}) created`);
        return true;
    }
    if (cand.mode === "line-circle") {
        const fixedSol = cand.sol;
        state.input.filletFlow = {
            kind: "line-circle",
            stage: "confirm-line-side",
            sol: fixedSol,
            line: fixedSol.line,
            circle: fixedSol.circle,
            lineSource: cand.lineSource || null,
            hoverKeepEnd: fixedSol.desiredKeepEnd || fixedSol.keepEnd || "p1",
            clickWorld: (worldRawHint && Number.isFinite(Number(worldRawHint.x)) && Number.isFinite(Number(worldRawHint.y)))
                ? { x: Number(worldRawHint.x), y: Number(worldRawHint.y) }
                : null,
            debugStepActive: true,
            debugPhase: 0,
        };
        applyPendingLineCircleFillet(state, helpers, state.input.filletFlow.hoverKeepEnd);
        return true;
    }
    if (cand.mode === "arc-arc") {
        const c3 = cand.sol?.arcMid || {
            x: (Number(cand.sol?.t1?.x) + Number(cand.sol?.t2?.x)) * 0.5,
            y: (Number(cand.sol?.t1?.y) + Number(cand.sol?.t2?.y)) * 0.5,
        };
        const A = pickArcArcIntersectionA(cand.sol, worldRawHint);
        const keep1 = pickArcKeepSideByABCMid(cand.sol.arc1, cand.sol.t1, A, c3)
            || getArcKeepSideByTangent(cand.sol.arc1, cand.sol.t1);
        const keep2 = pickArcKeepSideByABCMid(cand.sol.arc2, cand.sol.t2, A, c3)
            || getArcKeepSideByTangent(cand.sol.arc2, cand.sol.t2);
        state.input.filletFlow = {
            kind: "arc-arc",
            stage: "confirm-arc-sides",
            sol: cand.sol,
            hoverKeep1: keep1,
            hoverKeep2: keep2,
        };
        applyPendingArcArcFillet(state, helpers, keep1, keep2);
        return true;
    }
    if (setStatus) setStatus("Fillet: unsupported pair.");
    void worldRawHint;
    return false;
}


