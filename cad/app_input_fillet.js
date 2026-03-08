import { applyPendingLineCircleFillet, applyPendingArcArcFillet } from "./app_tools.js";

export function isFilletTargetShape(shape) {
    return !!shape && (shape.type === "line" || shape.type === "circle" || shape.type === "arc");
}

function getArcKeepSideByTangent(arcShape, tangentPoint) {
    const th = Math.atan2(Number(tangentPoint.y) - Number(arcShape.cy), Number(tangentPoint.x) - Number(arcShape.cx));
    const a1 = Number(arcShape.a1) || 0;
    const a2 = Number(arcShape.a2) || 0;
    const d1 = Math.abs(a1 - th);
    const d2 = Math.abs(a2 - th);
    return (d1 < d2) ? "a2" : "a1";
}

export function commitFilletFromHover(state, helpers, deps, worldRawHint = null) {
    const { nextShapeId, pushHistory, addShape, setSelection, setStatus } = deps;
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
        if (doTrim) {
            const s1 = sol.t1, s2 = sol.t2;
            if (!s1 || !s2) {
                if (setStatus) setStatus("Fillet failed: missing tangent points.");
                return false;
            }
            const e1 = helpers.chooseEndsForLineByKeepEnd(selLines[0], s1, sol.keepEnd1 || "p1");
            const e2 = helpers.chooseEndsForLineByKeepEnd(selLines[1], s2, sol.keepEnd2 || "p1");
            const n1x1 = Number(e1.keepPoint?.x), n1y1 = Number(e1.keepPoint?.y), n1x2 = Number(s1.x), n1y2 = Number(s1.y);
            const n2x1 = Number(e2.keepPoint?.x), n2y1 = Number(e2.keepPoint?.y), n2x2 = Number(s2.x), n2y2 = Number(s2.y);
            if ([n1x1, n1y1, n1x2, n1y2].every(Number.isFinite) && Math.hypot(n1x2 - n1x1, n1y2 - n1y1) > 1e-6) {
                selLines[0].x1 = n1x1; selLines[0].y1 = n1y1; selLines[0].x2 = n1x2; selLines[0].y2 = n1y2;
            }
            if ([n2x1, n2y1, n2x2, n2y2].every(Number.isFinite) && Math.hypot(n2x2 - n2x1, n2y2 - n2y1) > 1e-6) {
                selLines[1].x1 = n2x1; selLines[1].y1 = n2y1; selLines[1].x2 = n2x2; selLines[1].y2 = n2y2;
            }
        }
        addShape(arc);
        setSelection([arc.id]);
        if (setStatus) setStatus(`Fillet (R=${r.toFixed(2)}) created`);
        return true;
    }
    if (cand.mode === "line-circle") {
        state.input.filletFlow = {
            kind: "line-circle",
            stage: "confirm-line-side",
            sol: cand.sol,
            line: cand.sol.line,
            circle: cand.sol.circle,
            hoverKeepEnd: cand.sol.keepEnd || "p1",
        };
        applyPendingLineCircleFillet(state, helpers, state.input.filletFlow.hoverKeepEnd);
        return true;
    }
    if (cand.mode === "arc-arc") {
        const keep1 = getArcKeepSideByTangent(cand.sol.arc1, cand.sol.t1);
        const keep2 = getArcKeepSideByTangent(cand.sol.arc2, cand.sol.t2);
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
