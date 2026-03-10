import { applyPendingLineCircleFillet, applyPendingArcArcFillet } from "./app_tools.js";
import { circleCircleIntersectionPoints, isAngleOnArc, solveLineCircleFillet } from "./solvers.js";

export function isFilletTargetShape(shape) {
    return !!shape && (shape.type === "line" || shape.type === "circle" || shape.type === "arc");
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
    const { nextShapeId, pushHistory, addShape, setSelection, setStatus } = deps;
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
        const selIdSet = new Set((state.selection.ids || []).map(Number));
        const selLines = (state.shapes || [])
            .filter((s) => selIdSet.has(Number(s.id)) && s.type === "line");
        if (selLines.length !== 2) {
            if (setStatus) setStatus("Fillet failed: select exactly 2 lines.");
            return false;
        }
        const sol = cand.sol;
        const arc = {
            id: nextShapeId(),
            type: "arc",
            cx: Number(sol.arc?.cx ?? sol.center?.x),
            cy: Number(sol.arc?.cy ?? sol.center?.y),
            r: Number(sol.arc?.r ?? sol.radius),
            a1: Number(sol.arc?.a1),
            a2: Number(sol.arc?.a2),
            ccw: sol.arc?.ccw !== false,
            layerId: selLines[0].layerId ?? state.activeLayerId
        };
        arc.lineWidthMm = Math.max(0.01, Number(selLines[0]?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        arc.lineType = String(selLines[0]?.lineType || "solid");
        if (![arc.cx, arc.cy, arc.r, arc.a1, arc.a2].every(Number.isFinite) || arc.r <= 0) {
            if (setStatus) setStatus("Fillet failed: invalid arc geometry.");
            return false;
        }
        pushHistory();
        const mode = state.filletSettings.lineMode || "trim";
        const doTrim = (mode === "trim") && !state.filletSettings?.noTrim;
        let trimWarning = false;
        // Always add fillet arc first (same behavior as no-trim), then trim source lines.
        addShape(arc);
        if (doTrim) {
            const line1Snap = { x1: Number(selLines[0].x1), y1: Number(selLines[0].y1), x2: Number(selLines[0].x2), y2: Number(selLines[0].y2) };
            const line2Snap = { x1: Number(selLines[1].x1), y1: Number(selLines[1].y1), x2: Number(selLines[1].x2), y2: Number(selLines[1].y2) };
            let okAll = true;
            const s1 = sol.t1, s2 = sol.t2;
            if (!s1 || !s2) {
                okAll = false;
            } else {
                const e1 = helpers.chooseEndsForLineByKeepEnd(selLines[0], s1, sol.keepEnd1 || "p1");
                const e2 = helpers.chooseEndsForLineByKeepEnd(selLines[1], s2, sol.keepEnd2 || "p1");
                const n1x1 = Number(e1.keepPoint?.x), n1y1 = Number(e1.keepPoint?.y), n1x2 = Number(s1.x), n1y2 = Number(s1.y);
                const n2x1 = Number(e2.keepPoint?.x), n2y1 = Number(e2.keepPoint?.y), n2x2 = Number(s2.x), n2y2 = Number(s2.y);
                if ([n1x1, n1y1, n1x2, n1y2].every(Number.isFinite) && Math.hypot(n1x2 - n1x1, n1y2 - n1y1) > 1e-6) {
                    selLines[0].x1 = n1x1; selLines[0].y1 = n1y1; selLines[0].x2 = n1x2; selLines[0].y2 = n1y2;
                } else okAll = false;
                if ([n2x1, n2y1, n2x2, n2y2].every(Number.isFinite) && Math.hypot(n2x2 - n2x1, n2y2 - n2y1) > 1e-6) {
                    selLines[1].x1 = n2x1; selLines[1].y1 = n2y1; selLines[1].x2 = n2x2; selLines[1].y2 = n2y2;
                } else okAll = false;
            }
            if (!okAll) {
                selLines[0].x1 = line1Snap.x1; selLines[0].y1 = line1Snap.y1; selLines[0].x2 = line1Snap.x2; selLines[0].y2 = line1Snap.y2;
                selLines[1].x1 = line2Snap.x1; selLines[1].y1 = line2Snap.y1; selLines[1].x2 = line2Snap.x2; selLines[1].y2 = line2Snap.y2;
                trimWarning = true;
            }
        }
        setSelection([arc.id]);
        if (setStatus) setStatus(trimWarning ? `Fillet (R=${r.toFixed(2)}) created (trim skipped)` : `Fillet (R=${r.toFixed(2)}) created`);
        return true;
    }
    if (cand.mode === "line-circle") {
        let fixedSol = cand.sol;
        // For line-arc fillet, avoid mouse-position-dependent solution choice at commit time.
        if (cand.sol?.circle?.type === "arc" && cand.sol?.line) {
            const recomputed = solveLineCircleFillet(cand.sol.line, cand.sol.circle, r, null);
            if (recomputed && recomputed.ok) fixedSol = recomputed;
        }
        state.input.filletFlow = {
            kind: "line-circle",
            stage: "confirm-line-side",
            sol: fixedSol,
            line: fixedSol.line,
            circle: fixedSol.circle,
            hoverKeepEnd: fixedSol.keepEnd || "p1",
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
