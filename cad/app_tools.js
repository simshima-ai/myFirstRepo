import {
    addShape, nextShapeId, pushHistory, pushHistorySnapshot,
    setSelection, clearSelection, snapshotModel, removeShapeById,
    getGroup, setActiveGroup, nextGroupId, addGroup, setActiveLayer
} from "./state.js";
import {
    solveLineLineFilletWithEnds, solveLineLineFillet, solveLineCircleFilletWithEnds,
    solveLineCircleFillet, solveArcArcFillet, isAngleOnArc, rotatePointAround,
    normalizeRad, arcParamAlong, angleDegFromOrigin, chooseTrimSideForIntersectionByT
} from "./solvers.js";
import { snapPoint, getEffectiveGridSize } from "./geom.js";
import {
    getSelectedShapes, collectGroupTreeShapeIds, collectGroupTreeGroupSnapshots,
    hitTestShapes, createAutoGroupForShapeIds, ensureUngroupedShapesHaveGroups
} from "./app_selection.js";
import { executeDoubleLine } from "./dline_geom.js";

export { executeDoubleLine };

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

export function tryCreateLineLineFillet(state, helpers, radiusInput, worldHint = null) {
    const { setStatus, draw, addShape, nextShapeId } = helpers;
    // addShape and nextShapeId from helpers are already bound to state — call without state arg
    const sel = getSelectedShapes(state).filter(s => s.type === "line");
    if (sel.length !== 2) return false;
    const r = Math.max(0, Number(radiusInput));
    const sol = solveLineLineFillet(sel[0], sel[1], r);
    if (!sol) return false;
    pushHistory(state);
    const mode = state.filletSettings.lineMode || "trim";
    if (mode === "trim") {
        const s1 = sol.p1, s2 = sol.p2;
        removeShapeById(state, sel[0].id);
        removeShapeById(state, sel[1].id);
        splitLineForFillet(sel[0], s1).forEach(l => { l.id = nextShapeId(); addShape(l); });
        splitLineForFillet(sel[1], s2).forEach(l => { l.id = nextShapeId(); addShape(l); });
    }
    const arc = {
        id: nextShapeId(),
        type: "arc",
        cx: sol.cx, cy: sol.cy, r: sol.r,
        a1: sol.a1, a2: sol.a2, ccw: sol.ccw,
        layerId: state.activeLayerId
    };
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

export function trimArcEndpointForFillet(arcShape, tangentPoint) {
    const r = Number(arcShape.r), cx = Number(arcShape.cx), cy = Number(arcShape.cy);
    const th = Math.atan2(tangentPoint.y - cy, tangentPoint.x - cx);
    const a1 = Number(arcShape.a1), a2 = Number(arcShape.a2);
    const d1 = Math.abs(normalizeRad(th - a1)), d2 = Math.abs(normalizeRad(th - a2));
    if (d1 < d2) arcShape.a1 = th; else arcShape.a2 = th;
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
    const th = Math.atan2(tangentPoint.y - arcShape.cy, tangentPoint.x - arcShape.cx);
    if (keepSide === "a1") arcShape.a2 = th; else arcShape.a1 = th;
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
        if (setStatus) setStatus("Hatch: 境界を選択してください");
        return;
    }
    const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, ids, state.view.scale);
    if (!parsed.ok) {
        if (setStatus) setStatus(`Hatch Error: ${parsed.error || "境界が閉じていません"}`);
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
        lineType: state.hatchSettings?.lineType ?? "solid",
        lineDashMm: Number(state.hatchSettings?.lineDashMm ?? 5),
        lineGapMm: Number(state.hatchSettings?.lineGapMm ?? 2),
        repetitionPaddingMm: Number(state.hatchSettings?.repetitionPaddingMm ?? 2),
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
        if (Number.isFinite(Number(data.grid.autoThreshold50))) state.grid.autoThreshold50 = Math.max(1, Math.min(1000, Math.round(Number(data.grid.autoThreshold50))));
        if (Number.isFinite(Number(data.grid.autoThreshold10))) state.grid.autoThreshold10 = Math.max(1, Math.min(1000, Math.round(Number(data.grid.autoThreshold10))));
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
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    if (setStatus) setStatus(`Saved ${name}`);
    if (draw) draw();
}

export function loadJsonFromFileDialog(state, dom) {
    if (!dom.jsonFileInput) return;
    dom.jsonFileInput.value = "";
    dom.jsonFileInput.click();
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
    return { id: 0, type: "dim", ...patch };
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
    pushHistory();
    for (const s of sel) {
        s.r = Math.max(0, r);
    }
    if (setStatus) setStatus(`Applied Circle/Arc Radius Input (R=${r})`);
    if (draw) draw();
}

export function applyFillet(state, helpers, radius) {
    return trimateFillet(state, helpers, radius);
}

export function applyPendingLineCircleFillet(state, helpers, keepEnd) {
    const { setStatus, draw, addShape, nextShapeId, chooseEndsForLineByKeepEnd } = helpers;
    const ff = state.input.filletFlow;
    if (!ff || !ff.sol) return;
    const sol = ff.sol;
    pushHistory(state);
    const mode = state.filletSettings.lineMode || "trim";
    if (mode === "trim") {
        removeShapeById(state, ff.line.id);
        const e = chooseEndsForLineByKeepEnd(ff.line, sol.tLine, keepEnd);
        const line = { ...ff.line, id: nextShapeId(), x1: e.keepPoint.x, y1: e.keepPoint.y, x2: sol.tLine.x, y2: sol.tLine.y };
        addShape(line);
        removeShapeById(state, ff.circle.id);
        const circ = { ...ff.circle };
        trimArcEndpointForFillet(circ, sol.tCircle);
        circ.id = nextShapeId();
        addShape(circ);
    }
    const arc = { id: nextShapeId(), type: "arc", cx: sol.center.x, cy: sol.center.y, r: sol.radius, a1: sol.arc.a1, a2: sol.arc.a2, ccw: sol.arc.ccw, layerId: state.activeLayerId };
    addShape(arc);
    state.input.filletFlow = null;
    if (setStatus) setStatus("Fillet created");
    if (draw) draw();
}

export function applyPendingArcArcFillet(state, helpers, keep1, keep2) {
    const { setStatus, draw, addShape, nextShapeId } = helpers;
    const ff = state.input.filletFlow;
    if (!ff || !ff.sol) return;
    const sol = ff.sol;
    pushHistory(state);
    const mode = state.filletSettings.lineMode || "trim";
    if (mode === "trim") {
        removeShapeById(state, ff.arc1.id);
        const a1 = { ...ff.arc1 };
        trimArcForFilletKeepSide(a1, sol.t1, keep1);
        a1.id = nextShapeId();
        addShape(a1);
        removeShapeById(state, ff.arc2.id);
        const a2 = { ...ff.arc2 };
        trimArcForFilletKeepSide(a2, sol.t2, keep2);
        a2.id = nextShapeId();
        addShape(a2);
    }
    const arc = { id: nextShapeId(), type: "arc", cx: sol.center.x, cy: sol.center.y, r: sol.radius, a1: sol.arc.a1, a2: sol.arc.a2, ccw: sol.arc.ccw, layerId: state.activeLayerId };
    addShape(arc);
    state.input.filletFlow = null;
    if (setStatus) setStatus("Fillet created");
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
    const { linearMode, circleMode, snapMode } = state.dimSettings;

    if (!state.dimDraft) {
        if (snapMode === "object") {
            const hit = hitTestShapes(state, worldRaw);
            if (hit) {
                if (hit.type === 'circle' || hit.type === 'arc') {
                    state.dimDraft = {
                        kind: circleMode,
                        dimRef: { targetId: Number(hit.id) },
                        x2: world.x, y2: world.y
                    };
                    if (setStatus) setStatus("配置位置を指定してください");
                    return "circle-ref";
                }
                if (hit.type === 'line') {
                    state.dimDraft = {
                        p1: { x: Number(hit.x1), y: Number(hit.y1) },
                        p2: { x: Number(hit.x2), y: Number(hit.y2) },
                        place: { x: world.x, y: world.y }
                    };
                    if (setStatus) setStatus("配置位置を指定してください");
                    return "line-ref";
                }
            }
        }
        state.dimDraft = { p1: { x: world.x, y: world.y }, hover: { x: world.x, y: world.y } };
        return "p1";
    }

    if (state.dimDraft.dimRef) {
        state.dimDraft.x2 = world.x;
        state.dimDraft.y2 = world.y;
        return "place";
    }

    if (linearMode === "chain") {
        if (!state.dimDraft.p2) {
            if (Math.hypot(world.x - state.dimDraft.p1.x, world.y - state.dimDraft.p1.y) < 1e-9) return "noop";
            state.dimDraft.p2 = { x: world.x, y: world.y };
            state.dimDraft.place = { x: world.x, y: world.y };
            return "p2";
        }
        if (!state.dimDraft.points) {
            state.dimDraft.place = { x: world.x, y: world.y };
            state.dimDraft.points = [{ x: state.dimDraft.p1.x, y: state.dimDraft.p1.y }, { x: state.dimDraft.p2.x, y: state.dimDraft.p2.y }];
            return "chain-offset";
        }
        state.dimDraft.points.push({ x: world.x, y: world.y });
        return "chain-extend";
    }

    if (!state.dimDraft.p2) {
        if (Math.hypot(world.x - state.dimDraft.p1.x, world.y - state.dimDraft.p1.y) < 1e-9) return "noop";
        state.dimDraft.p2 = { x: world.x, y: world.y };
        state.dimDraft.place = { x: world.x, y: world.y };
        return "p2";
    }
    state.dimDraft.place = { x: world.x, y: world.y };
    return "place";
}

export function updateDimHover(state, worldRaw, helpers) {
    const { setStatus } = helpers;
    const world = { x: worldRaw.x, y: worldRaw.y };
    const { snapMode } = state.dimSettings;

    if (!state.dimDraft) {
        if (snapMode === "object") {
            const hit = hitTestShapes(state, worldRaw);
            if (hit && (hit.type === "line" || hit.type === "circle" || hit.type === "arc")) {
                state.input.dimHoveredShapeId = Number(hit.id);
                if (setStatus) setStatus("クリック又はEnterキーで確定");
            } else {
                state.input.dimHoveredShapeId = null;
                if (setStatus) setStatus("寸法：対象を選択するか1点目をクリック");
            }
        } else {
            state.input.dimHoveredShapeId = null;
            if (setStatus) setStatus("寸法：1点目をクリック");
        }
        return;
    }

    state.input.dimHoveredShapeId = null;
    if (state.dimDraft.dimRef) {
        state.dimDraft.x2 = world.x;
        state.dimDraft.y2 = world.y;
        if (setStatus) setStatus("配置位置をクリックで確定");
    } else if (!state.dimDraft.p2) {
        state.dimDraft.hover = { x: world.x, y: world.y };
        if (setStatus) setStatus("2点目をクリック");
    } else {
        state.dimDraft.place = { x: world.x, y: world.y };
        if (setStatus) setStatus("配置位置をクリックで確定");
    }
}

export function cancelDimDraft(state) {
    state.dimDraft = null;
}

export function finalizeDimDraft(state, helpers) {
    const { pushHistory, addShape, setSelection } = helpers;
    const d = state.dimDraft;
    if (!d) return false;

    let dim = null;
    if (d.dimRef) {
        dim = createDim({
            type: 'dim',
            kind: d.kind,
            dimRef: d.dimRef,
            x2: d.x2, y2: d.y2,
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

    if (dim) {
        if (pushHistory) pushHistory();
        addShape(dim);
        createAutoGroupForShapeIds(state, [dim.id], "Dim");
        setSelection([dim.id]);
        state.dimDraft = null;
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
    const { pushHistory, addShape, setSelection } = helpers;
    const d = state.polylineDraft;
    if (!d || !Array.isArray(d.points) || d.points.length < 2) {
        state.polylineDraft = null;
        return false;
    }
    const createdIds = [];
    if (pushHistory) pushHistory();
    for (let i = 0; i < d.points.length - 1; i++) {
        const a = d.points[i], b = d.points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
        const line = createLine(a, b);
        line.layerId = state.activeLayerId;
        addShape(line);
        createdIds.push(line.id);
    }
    state.polylineDraft = null;
    if (createdIds.length) {
        createAutoGroupForShapeIds(state, createdIds, "Polyline");
        setSelection(createdIds);
    }
    return createdIds.length > 0;
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
    state.grid.size = Math.max(1, size);
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
export function setGridAutoThresholds(state, t50, t10) {
    state.grid.autoThreshold50 = t50;
    state.grid.autoThreshold10 = t10;
}
export function setLayerColorize(state, helpers, val) {
    state.layerColorize = !!val;
    if (helpers.draw) helpers.draw();
}
export function setEditOnlyActiveLayer(state, helpers, val) {
    state.editOnlyActiveLayer = !!val;
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
    if (ang !== null) state.lineSettings.angle = ang;
}
export function setRectInputs(state, w, h) {
    if (w !== null) state.rectSettings.width = w;
    if (h !== null) state.rectSettings.height = h;
}
export function setCircleRadiusInput(state, r) {
    state.circleSettings.radius = r;
}
export function setSelectionCircleCenterMark(state, helpers, on) {
    const sel = getSelectedShapes(state).filter(s => s.type === "circle");
    if (sel.length) {
        helpers.pushHistory();
        for (const s of sel) s.showCenterMark = on;
        helpers.draw();
    }
}
export function setFilletRadius(state, v) {
    state.filletSettings.radius = v;
}
export function setFilletLineMode(state, mode) {
    state.filletSettings.lineMode = mode;
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
        }
    }
    helpers.draw();
}

export function cycleLayerMode(state, helpers, layerId) {
    const l = state.layers.find(ly => ly.id === layerId);
    if (!l) return;
    if (!l.visible) { l.visible = true; l.locked = true; }
    else if (l.locked) { l.visible = false; l.locked = false; }
    else { l.visible = true; l.locked = false; }
    if (helpers.draw) helpers.draw();
}

export function renameActiveLayer(state, helpers, name) {
    const l = state.layers.find(ly => ly.id === state.activeLayerId);
    if (l && name.trim()) {
        l.name = name.trim();
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
