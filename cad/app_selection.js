import {
    getGroup, setSelection, clearSelection,
    snapshotModel, pushHistory, pushHistorySnapshot,
    isLayerVisible, isLayerLocked, isGroupVisible
} from "./state.js";
import {
    normalizeRad, angleDegFromOrigin, rotatePointAround,
    segmentIntersectionPoint, segmentCircleIntersectionPoints,
    isAngleOnArc, getObjectSnapPoint, segmentIntersectionParamPoint,
    chooseTrimSideForIntersectionByT, arcParamAlong, circleCircleIntersectionPoints,
    distancePointToSegment, solveTangentSnapPoints
} from "./solvers.js";
import {
    screenToWorld, snapPoint, hitTestLine,
    getEffectiveGridSize, nearestPointOnSegment
} from "./geom.js";
import { getDimChainGeometry, getCircleDimGeometry, getDimAngleGeometry } from "./dim_geom.js";
import {
    buildHatchLoopsFromBoundaryIds, isPointInHatch, isHatchBoundaryShape
} from "./hatch_geom.js";
import { solveLineLineFillet, solveLineCircleFillet, solveArcArcFillet } from "./solvers.js";
import {
    collectDescendantGroupIds,
    collectGroupTreeShapeIds,
    collectGroupTreeGroupSnapshots,
    isHitInActiveGroup,
    selectGroupById,
    toggleGroupSelectionById
} from "./app_selection_group_tree.js";
import { sampleBSplinePoints } from "./bspline_utils.js";
import {
    hitTestDimHandle,
    beginDimHandleDrag,
    applyDimHandleDrag,
    endDimHandleDrag
} from "./app_selection_dim_handles.js";
import { createSelectionBoxOps } from "./app_selection_box_ops.js";
import { createTrimFilletHoverOps } from "./app_selection_trim_fillet_hover.js";
import { createSelectionVertexOps } from "./app_selection_vertex_ops.js";
import { createHitTestOps } from "./app_selection_hit_test.js";
import { createSelectionGroupTransformOps } from "./app_selection_group_transform_ops.js";
export {
    collectDescendantGroupIds,
    collectGroupTreeShapeIds,
    collectGroupTreeGroupSnapshots,
    isHitInActiveGroup,
    selectGroupById,
    toggleGroupSelectionById
} from "./app_selection_group_tree.js";
export {
    hitTestDimHandle,
    beginDimHandleDrag,
    applyDimHandleDrag,
    endDimHandleDrag
} from "./app_selection_dim_handles.js";

const selectionBoxOps = createSelectionBoxOps({
    screenToWorld,
    segmentIntersectionPoint,
    segmentCircleIntersectionPoints,
    buildHatchLoopsFromBoundaryIds,
    isHatchBoundaryShape,
    getDimChainGeometry,
    getCircleDimGeometry,
    getDimAngleGeometry,
    setSelection,
    collectGroupTreeShapeIds,
    isLayerVisible,
    isLayerLocked,
    sampleBSplinePoints,
    getImageCornersWorld
});
const trimFilletHoverOps = createTrimFilletHoverOps({
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
});
const selectionVertexOps = createSelectionVertexOps({
    setSelection,
    snapshotModel,
    pushHistory,
    isLayerVisible,
    segmentIntersectionPoint,
    isAngleOnArc,
    getObjectSnapPoint,
    solveTangentSnapPoints,
    getEffectiveGridSize,
    snapPoint
});
const hitTestOps = createHitTestOps({
    isGroupVisible,
    hitTestLine,
    distancePointToSegment,
    isAngleOnArc,
    getDimChainGeometry,
    getDimAngleGeometry,
    getCircleDimGeometry,
    isPointInHatch,
    sampleBSplinePoints
});
const groupTransformOps = createSelectionGroupTransformOps({
    collectGroupTreeShapeIds,
    collectGroupTreeGroupSnapshots,
    getGroup,
    snapshotModel,
    angleDegFromOrigin,
    getEffectiveGridSize,
    rotatePointAround,
    normalizeRad
});

/**
 * Selection & Group Logic extracted from app.js
 */


export function getSelectedShapes(state) {
    const ids = new Set(state.selection.ids.map(Number));
    const selected = state.shapes.filter((s) => ids.has(Number(s.id)));
    const activeLayerId = Number(state.activeLayerId);
    const lockByLayer = new Map((state.layers || []).map(l => [Number(l?.id), !!l?.locked]));
    return selected.filter((s) => {
        const lid = Number(s.layerId ?? activeLayerId);
        if (lockByLayer.get(lid) === true) return false;
        if (state.ui?.layerView?.editOnlyActive && lid !== activeLayerId) return false;
        return true;
    });
}


export function hitActiveGroupOriginHandle(state, screen) {
    if (state.activeGroupId == null) return null;
    const g = getGroup(state, state.activeGroupId);
    if (!g) return null;
    const c = {
        x: (Number(g.originX) || 0) * state.view.scale + state.view.offsetX,
        y: (Number(g.originY) || 0) * state.view.scale + state.view.offsetY,
    };
    const tol = 14;
    if (Math.hypot(screen.x - c.x, screen.y - c.y) <= tol) return g;
    return null;
}

export function hitActiveGroupRotateHandle(state, screen) {
    if (state.activeGroupId == null) return null;
    const g = getGroup(state, state.activeGroupId);
    if (!g) return null;
    const c = {
        x: (Number(g.originX) || 0) * state.view.scale + state.view.offsetX,
        y: (Number(g.originY) || 0) * state.view.scale + state.view.offsetY,
    };
    const originR = 14;
    const handleDist = originR * 4.7;
    const ang = (Number(g.rotationDeg) || 0) * Math.PI / 180;
    const h = { x: c.x + Math.cos(ang) * handleDist, y: c.y + Math.sin(ang) * handleDist };
    return (Math.hypot(screen.x - h.x, screen.y - h.y) <= 12) ? g : null;
}

export function getVertexAtKey(shape, key) {
    return selectionVertexOps.getVertexAtKey(shape, key);
}

export function setVertexAtKey(shape, key, p) {
    return selectionVertexOps.setVertexAtKey(shape, key, p);
}

export function hitTestVertexHandle(state, world) {
    return selectionVertexOps.hitTestVertexHandle(state, world);
}

export function vertexKeyOf(v) {
    return selectionVertexOps.vertexKeyOf(v);
}

export function getCoincidentVertexGroup(state, hit) {
    return selectionVertexOps.getCoincidentVertexGroup(state, hit);
}

export function hasSelectedVertex(state, hit) {
    return selectionVertexOps.hasSelectedVertex(state, hit);
}

export function toggleVertexSelection(state, hit) {
    return selectionVertexOps.toggleVertexSelection(state, hit);
}

export function setSingleVertexSelection(state, hit) {
    return selectionVertexOps.setSingleVertexSelection(state, hit);
}

export function clearVertexSelection(state) {
    return selectionVertexOps.clearVertexSelection(state);
}

export function beginVertexSelectionBox(state, screen, additive) {
    return selectionVertexOps.beginVertexSelectionBox(state, screen, additive);
}

export function endVertexSelectionBox(state, helpers) {
    return selectionVertexOps.endVertexSelectionBox(state, helpers);
}

export function beginVertexDrag(state, hit, worldRaw, helpers, additive = false) {
    return selectionVertexOps.beginVertexDrag(state, hit, worldRaw, helpers, additive);
}

export function applyVertexDrag(state, worldRaw) {
    return selectionVertexOps.applyVertexDrag(state, worldRaw);
}

export function endVertexDrag(state) {
    return selectionVertexOps.endVertexDrag(state);
}

export function resolveVertexTangentAttribs(state, excludeShapeIds) {
    return selectionVertexOps.resolveVertexTangentAttribs(state, excludeShapeIds);
}

export function moveSelectedVerticesByDelta(state, dx, dy, helpers) {
    return selectionVertexOps.moveSelectedVerticesByDelta(state, dx, dy, helpers);
}

export function beginGroupOriginDrag(state, group, worldRaw) {
    return groupTransformOps.beginGroupOriginDrag(state, group, worldRaw);
}

export function beginGroupRotateDrag(state, group, worldRaw) {
    return groupTransformOps.beginGroupRotateDrag(state, group, worldRaw);
}

export function applyGroupOriginDrag(state, worldRaw) {
    return groupTransformOps.applyGroupOriginDrag(state, worldRaw);
}

function resolveFollowPointFromAttrib(state, attrib) {
    const ref = state.shapes.find(s => Number(s.id) === Number(attrib?.shapeId));
    if (!ref) return null;
    if (attrib.refType === "line_endpoint" && ref.type === "line") {
        return (attrib.refKey === "p2")
            ? { x: Number(ref.x2), y: Number(ref.y2) }
            : { x: Number(ref.x1), y: Number(ref.y1) };
    }
    if (attrib.refType === "dim_endpoint" && ref.type === "dim") {
        return (attrib.refKey === "p2")
            ? { x: Number(ref.x2), y: Number(ref.y2) }
            : { x: Number(ref.x1), y: Number(ref.y1) };
    }
    if (attrib.refType === "rect_corner" && ref.type === "rect") {
        const x1 = Number(ref.x1), y1 = Number(ref.y1), x2 = Number(ref.x2), y2 = Number(ref.y2);
        if (attrib.refKey === "c2") return { x: x2, y: y1 };
        if (attrib.refKey === "c3") return { x: x2, y: y2 };
        if (attrib.refKey === "c4") return { x: x1, y: y2 };
        return { x: x1, y: y1 };
    }
    if (attrib.refType === "line_midpoint" && ref.type === "line") {
        return { x: (Number(ref.x1) + Number(ref.x2)) * 0.5, y: (Number(ref.y1) + Number(ref.y2)) * 0.5 };
    }
    if (attrib.refType === "rect_midpoint" && ref.type === "rect") {
        const x1 = Number(ref.x1), y1 = Number(ref.y1), x2 = Number(ref.x2), y2 = Number(ref.y2);
        if (attrib.refKey === "m2") return { x: x2, y: (y1 + y2) * 0.5 };
        if (attrib.refKey === "m3") return { x: (x1 + x2) * 0.5, y: y2 };
        if (attrib.refKey === "m4") return { x: x1, y: (y1 + y2) * 0.5 };
        return { x: (x1 + x2) * 0.5, y: y1 };
    }
    if (attrib.refType === "circle_center" && ref.type === "circle") return { x: Number(ref.cx), y: Number(ref.cy) };
    if (attrib.refType === "arc_center" && ref.type === "arc") return { x: Number(ref.cx), y: Number(ref.cy) };
    if (attrib.refType === "position_center" && ref.type === "position") return { x: Number(ref.x), y: Number(ref.y) };
    if (attrib.refType === "arc_endpoint" && ref.type === "arc") {
        const r = Math.abs(Number(ref.r) || 0);
        const cx = Number(ref.cx), cy = Number(ref.cy);
        const a = (attrib.refKey === "a2") ? (Number(ref.a2) || 0) : (Number(ref.a1) || 0);
        return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    }
    return null;
}

export function resolveDimensionSnapAttribs(state) {
    for (const shape of (state.shapes || [])) {
        if (!shape || shape.type !== "dim") continue;
        for (const [attrKey, xKey, yKey] of [["p1Attrib", "x1", "y1"], ["p2Attrib", "x2", "y2"]]) {
            const attrib = shape[attrKey];
            if (!attrib || typeof attrib !== "object") continue;
            if (attrib.type === "fixedPoint") {
                const fx = Number(attrib.x), fy = Number(attrib.y);
                if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
                    shape[attrKey] = null;
                    continue;
                }
                shape[xKey] = fx;
                shape[yKey] = fy;
                continue;
            }
            if (attrib.type === "followPoint") {
                const pt = resolveFollowPointFromAttrib(state, attrib);
                if (!pt || !Number.isFinite(Number(pt.x)) || !Number.isFinite(Number(pt.y))) {
                    shape[attrKey] = null;
                    continue;
                }
                shape[xKey] = Number(pt.x);
                shape[yKey] = Number(pt.y);
                continue;
            }
            if (attrib.type === "intersection") {
                const la = state.shapes.find(s => Number(s.id) === Number(attrib.lineAId));
                const lb = state.shapes.find(s => Number(s.id) === Number(attrib.lineBId));
                if (!la || !lb || la.type !== "line" || lb.type !== "line") {
                    shape[attrKey] = null;
                    continue;
                }
                const ip = segmentIntersectionPoint(
                    { x: Number(la.x1), y: Number(la.y1) }, { x: Number(la.x2), y: Number(la.y2) },
                    { x: Number(lb.x1), y: Number(lb.y1) }, { x: Number(lb.x2), y: Number(lb.y2) }
                );
                if (!ip) continue;
                shape[xKey] = Number(ip.x);
                shape[yKey] = Number(ip.y);
            }
        }
    }
}

export function applyGroupRotateDrag(state, worldRaw) {
    return groupTransformOps.applyGroupRotateDrag(state, worldRaw);
}

export function endGroupOriginDrag(state) {
    return groupTransformOps.endGroupOriginDrag(state);
}

export function endGroupRotateDrag(state) {
    return groupTransformOps.endGroupRotateDrag(state);
}

export function beginGroupOriginPickDrag(state, group, worldRaw) {
    return groupTransformOps.beginGroupOriginPickDrag(state, group, worldRaw);
}

export function applyGroupOriginPickDrag(state, world) {
    return groupTransformOps.applyGroupOriginPickDrag(state, world);
}

export function endGroupOriginPickDrag(state) {
    return groupTransformOps.endGroupOriginPickDrag(state);
}

export function beginSelectionDrag(state, worldRaw, helpers) {
    const { cloneShapeForDrag } = helpers;
    const selected = getSelectedShapes(state);
    if (!selected.length) return false;
    state.selection.drag.active = true;
    state.selection.drag.moved = false;
    state.selection.drag.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    state.selection.drag.shapeSnapshots = selected.map((s) => ({ id: s.id, shape: cloneShapeForDrag(s) }));
    state.selection.drag.modelSnapshotBeforeMove = snapshotModel(state);
    state.selection.drag.mode = "move";
    state.selection.drag.resizeShapeId = null;
    state.selection.drag.resizeCorner = null;
    state.selection.drag.resizeAnchor = null;
    return true;
}

function getImageCornersWorld(shape) {
    const x = Number(shape?.x), y = Number(shape?.y);
    const w = Math.max(1e-9, Number(shape?.width) || 0);
    const h = Math.max(1e-9, Number(shape?.height) || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(h > 0)) return null;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const rotDeg = Number(shape?.rotationDeg) || 0;
    const rotPt = (px, py) => rotatePointAround(px, py, cx, cy, rotDeg);
    return {
        tl: rotPt(x, y),
        tr: rotPt(x + w, y),
        br: rotPt(x + w, y + h),
        bl: rotPt(x, y + h),
    };
}

function inverseRotatePointAround(p, cx, cy, rotDeg) {
    return rotatePointAround(Number(p?.x), Number(p?.y), Number(cx), Number(cy), -Number(rotDeg || 0));
}

export function hitTestImageScaleHandle(state, worldRaw) {
    const selectedIds = new Set((state.selection?.ids || []).map(Number));
    if (!selectedIds.size) return null;
    const images = (state.shapes || []).filter((s) => selectedIds.has(Number(s.id)) && String(s.type || "") === "image");
    if (images.length !== 1) return null;
    const s = images[0];
    if (!isLayerVisible(state, s.layerId) || isLayerLocked(state, s.layerId)) return null;
    const corners = getImageCornersWorld(s);
    if (!corners) return null;
    const tol = 9 / Math.max(1e-9, Number(state.view?.scale) || 1);
    const dTl = Math.hypot(Number(worldRaw.x) - Number(corners.tl.x), Number(worldRaw.y) - Number(corners.tl.y));
    const dBr = Math.hypot(Number(worldRaw.x) - Number(corners.br.x), Number(worldRaw.y) - Number(corners.br.y));
    if (dTl <= tol) return { shapeId: Number(s.id), corner: "tl" };
    if (dBr <= tol) return { shapeId: Number(s.id), corner: "br" };
    return null;
}

export function beginImageScaleDrag(state, handleHit, worldRaw) {
    const sid = Number(handleHit?.shapeId);
    if (!Number.isFinite(sid)) return false;
    const shape = (state.shapes || []).find((s) => Number(s.id) === sid && String(s.type || "") === "image");
    if (!shape) return false;
    if (!!shape.lockTransform) return false;
    const corners = getImageCornersWorld(shape);
    if (!corners) return false;
    const anchor = (String(handleHit.corner || "") === "tl") ? corners.br : corners.tl;
    state.selection.drag.active = true;
    state.selection.drag.moved = false;
    state.selection.drag.mode = "resize-image";
    state.selection.drag.startWorldRaw = { x: Number(worldRaw.x), y: Number(worldRaw.y) };
    state.selection.drag.shapeSnapshots = [{ id: Number(shape.id), shape: JSON.parse(JSON.stringify(shape)) }];
    state.selection.drag.modelSnapshotBeforeMove = snapshotModel(state);
    state.selection.drag.resizeShapeId = Number(shape.id);
    state.selection.drag.resizeCorner = (String(handleHit.corner || "") === "tl") ? "tl" : "br";
    state.selection.drag.resizeAnchor = { x: Number(anchor.x), y: Number(anchor.y) };
    return true;
}

const SEL_SHIFT_KEYS_X = new Set(["x", "x1", "x2", "cx", "px", "tx", "originX"]);
const SEL_SHIFT_KEYS_Y = new Set(["y", "y1", "y2", "cy", "py", "ty", "originY"]);

function shiftShapeDeepForSelection(node, dx, dy) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) shiftShapeDeepForSelection(item, dx, dy);
        return;
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "number" && Number.isFinite(v)) {
            if (SEL_SHIFT_KEYS_X.has(k)) node[k] = v + Number(dx || 0);
            else if (SEL_SHIFT_KEYS_Y.has(k)) node[k] = v + Number(dy || 0);
            continue;
        }
        if (v && typeof v === "object") shiftShapeDeepForSelection(v, dx, dy);
    }
}
export function applySelectionDrag(state, worldRaw) {
    const drag = state.selection.drag;
    if (!drag.active || !drag.startWorldRaw || !drag.shapeSnapshots) return;
    if (drag.mode === "resize-image") {
        const sid = Number(drag.resizeShapeId);
        const anchor = drag.resizeAnchor;
        const base = drag.shapeSnapshots[0]?.shape || null;
        const target = (state.shapes || []).find((s) => Number(s.id) === sid && String(s.type || "") === "image");
        if (!base || !target || !anchor) return;
        if (!!base.lockTransform) return;
        const rotDeg = Number(base.rotationDeg) || 0;
        const centerBase = {
            x: Number(base.x) + Number(base.width) * 0.5,
            y: Number(base.y) + Number(base.height) * 0.5,
        };
        const localA = inverseRotatePointAround(anchor, centerBase.x, centerBase.y, rotDeg);
        const localM = inverseRotatePointAround(worldRaw, centerBase.x, centerBase.y, rotDeg);
        const corner = String(drag.resizeCorner || "br");
        const baseW = Math.max(1, Number(base.width) || 1);
        const baseH = Math.max(1, Number(base.height) || 1);
        let rawW = (corner === "tl")
            ? (Number(localA.x) - Number(localM.x))
            : (Number(localM.x) - Number(localA.x));
        let rawH = (corner === "tl")
            ? (Number(localA.y) - Number(localM.y))
            : (Number(localM.y) - Number(localA.y));
        const minSize = 1;
        const lock = !!base.lockAspect;
        const aspect = (() => {
            const nw = Number(base.naturalWidth), nh = Number(base.naturalHeight);
            if (nw > 0 && nh > 0) return nw / nh;
            const bw = Math.max(1e-9, Number(base.width) || 1);
            const bh = Math.max(1e-9, Number(base.height) || 1);
            return bw / bh;
        })();
        rawW = Math.max(minSize, Number(rawW) || 0);
        rawH = Math.max(minSize, Number(rawH) || 0);
        let w = rawW;
        let h = rawH;
        if (lock && Number.isFinite(aspect) && aspect > 0) {
            const opt1W = rawW;
            const opt1H = Math.max(minSize, rawW / aspect);
            const opt2H = rawH;
            const opt2W = Math.max(minSize, rawH * aspect);
            const d1 = Math.abs(opt1H - rawH);
            const d2 = Math.abs(opt2W - rawW);
            if (d1 <= d2) {
                w = opt1W;
                h = opt1H;
            } else {
                w = opt2W;
                h = opt2H;
            }
        }
        let tlLocalX = Number(localA.x);
        let tlLocalY = Number(localA.y);
        if (corner === "tl") {
            tlLocalX = Number(localA.x) - w;
            tlLocalY = Number(localA.y) - h;
        }
        const worldTopLeft = rotatePointAround(tlLocalX, tlLocalY, centerBase.x, centerBase.y, rotDeg);
        target.x = Number(worldTopLeft.x);
        target.y = Number(worldTopLeft.y);
        target.width = w;
        target.height = h;
        target.rotationDeg = rotDeg;
        if (Math.abs(w - Number(base.width)) > 1e-9 || Math.abs(h - Number(base.height)) > 1e-9 || Math.abs(Number(worldTopLeft.x) - Number(base.x)) > 1e-9 || Math.abs(Number(worldTopLeft.y) - Number(base.y)) > 1e-9) {
            drag.moved = true;
        }
        return;
    }
    const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    const draggingShapeIds = new Set((drag.shapeSnapshots || []).map(it => Number(it.id)));

    const objSnapCur = getObjectSnapPoint(state, worldRaw, () => true, draggingShapeIds);
    const curRaw = objSnapCur
        ? { x: objSnapCur.x, y: objSnapCur.y }
        : worldRaw;
    const cur = objSnapCur
        ? { x: objSnapCur.x, y: objSnapCur.y }
        : (state.grid.snap ? snapPoint(worldRaw, gridStep) : worldRaw);

    const objSnapStart = getObjectSnapPoint(state, drag.startWorldRaw, () => true, draggingShapeIds);
    const startRaw = objSnapStart
        ? { x: objSnapStart.x, y: objSnapStart.y }
        : drag.startWorldRaw;
    const start = objSnapStart
        ? { x: objSnapStart.x, y: objSnapStart.y }
        : (state.grid.snap ? snapPoint(drag.startWorldRaw, gridStep) : drag.startWorldRaw);

    const dx = cur.x - start.x;
    const dy = cur.y - start.y;
    const dxRaw = curRaw.x - startRaw.x;
    const dyRaw = curRaw.y - startRaw.y;
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) drag.moved = true;
    if (Math.abs(dxRaw) > 1e-9 || Math.abs(dyRaw) > 1e-9) drag.moved = true;
    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    for (const it of drag.shapeSnapshots) {
        const target = byId.get(Number(it.id));
        if (!target) continue;
        const base = it.shape;
        if (target.type === "line" || target.type === "rect" || target.type === "dim") {
            let tx = dxRaw;
            let ty = dyRaw;
            if (state.grid.snap) {
                const p = snapPoint({ x: base.x1 + dxRaw, y: base.y1 + dyRaw }, gridStep);
                tx = p.x - base.x1;
                ty = p.y - base.y1;
            }
            target.x1 = base.x1 + tx; target.y1 = base.y1 + ty;
            target.x2 = base.x2 + tx; target.y2 = base.y2 + ty;
            if (target.type === "dim") {
                target.px = base.px + tx; target.py = base.py + ty;
                if (Number.isFinite(base.tx) && Number.isFinite(base.ty)) {
                    target.tx = base.tx + tx; target.ty = base.ty + ty;
                }
            }
        } else if (target.type === "circle") {
            let nx = base.cx + dxRaw;
            let ny = base.cy + dyRaw;
            if (state.grid.snap) {
                const p = snapPoint({ x: nx, y: ny }, gridStep);
                nx = p.x; ny = p.y;
            }
            target.cx = nx; target.cy = ny;
            target.r = base.r;
        } else if (target.type === "arc") {
            let nx = base.cx + dxRaw;
            let ny = base.cy + dyRaw;
            if (state.grid.snap) {
                const p = snapPoint({ x: nx, y: ny }, gridStep);
                nx = p.x; ny = p.y;
            }
            target.cx = nx; target.cy = ny;
            target.r = base.r; target.a1 = base.a1; target.a2 = base.a2; target.ccw = base.ccw;
        } else if (target.type === "position") {
            let nx = base.x + dxRaw;
            let ny = base.y + dyRaw;
            if (state.grid.snap) {
                const p = snapPoint({ x: nx, y: ny }, gridStep);
                nx = p.x; ny = p.y;
            }
            target.x = nx; target.y = ny; target.size = base.size;
        } else if (target.type === "text") {
            target.x1 = base.x1 + dx; target.y1 = base.y1 + dy;
        } else if (target.type === "image") {
            if (!!base.lockTransform) continue;
            let nx = Number(base.x) + dxRaw;
            let ny = Number(base.y) + dyRaw;
            if (state.grid.snap) {
                const p = snapPoint({ x: nx, y: ny }, gridStep);
                nx = p.x; ny = p.y;
            }
            target.x = nx; target.y = ny;
            target.width = Number(base.width);
            target.height = Number(base.height);
            target.rotationDeg = Number(base.rotationDeg) || 0;
        } else if (target.type === "bspline") {
            if (Array.isArray(base.controlPoints)) {
                let tx = dxRaw;
                let ty = dyRaw;
                const first = base.controlPoints[0];
                if (state.grid.snap && first) {
                    const p = snapPoint({ x: Number(first.x) + dxRaw, y: Number(first.y) + dyRaw }, gridStep);
                    tx = p.x - Number(first.x);
                    ty = p.y - Number(first.y);
                }
                target.controlPoints = base.controlPoints.map((cp) => ({
                    x: Number(cp?.x) + tx,
                    y: Number(cp?.y) + ty,
                }));
            }
        }
    }
}

export function endSelectionDrag(state) {
    const moved = !!state.selection.drag.moved;
    const snapshot = state.selection.drag.modelSnapshotBeforeMove;
    state.selection.drag.active = false;
    state.selection.drag.moved = false;
    state.selection.drag.startWorldRaw = null;
    state.selection.drag.shapeSnapshots = null;
    state.selection.drag.modelSnapshotBeforeMove = null;
    state.selection.drag.mode = null;
    state.selection.drag.resizeShapeId = null;
    state.selection.drag.resizeCorner = null;
    state.selection.drag.resizeAnchor = null;
    return { moved, snapshot };
}

export function moveSelectedShapesByDelta(state, dx, dy, helpers) {
    const { setStatus, draw, cloneShapeForDrag } = helpers;
    dx = Number(dx) || 0;
    dy = Number(dy) || 0;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return false;
    const selected = getSelectedShapes(state);
    if (!selected.length) return false;
    const snap = snapshotModel(state);
    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    const baseSnaps = selected.map((s) => ({ id: Number(s.id), shape: cloneShapeForDrag(s) }));
    for (const it of baseSnaps) {
        const target = byId.get(Number(it.id));
        if (!target) continue;
        const base = it.shape;
        if (target.type === "line" || target.type === "rect") {
            target.x1 = base.x1 + dx; target.y1 = base.y1 + dy;
            target.x2 = base.x2 + dx; target.y2 = base.y2 + dy;
        } else if (target.type === "circle") {
            target.cx = base.cx + dx; target.cy = base.cy + dy;
            target.r = base.r;
        } else if (target.type === "arc") {
            target.cx = base.cx + dx; target.cy = base.cy + dy;
            target.r = base.r; target.a1 = base.a1; target.a2 = base.a2; target.ccw = base.ccw;
        } else if (target.type === "position") {
            target.x = base.x + dx; target.y = base.y + dy; target.size = base.size;
        } else if (target.type === "dim") {
            target.x1 = base.x1 + dx; target.y1 = base.y1 + dy;
            target.x2 = base.x2 + dx; target.y2 = base.y2 + dy;
            target.px = base.px + dx; target.py = base.py + dy;
            if (Number.isFinite(base.tx) && Number.isFinite(base.ty)) {
                target.tx = base.tx + dx; target.ty = base.ty + dy;
            }
        } else if (target.type === "image") {
            if (!!base.lockTransform) continue;
            target.x = Number(base.x) + dx;
            target.y = Number(base.y) + dy;
            target.width = Number(base.width);
            target.height = Number(base.height);
            target.rotationDeg = Number(base.rotationDeg) || 0;
        } else if (target.type === "bspline") {
            if (Array.isArray(base.controlPoints)) {
                target.controlPoints = base.controlPoints.map((cp) => ({
                    x: Number(cp?.x) + dx,
                    y: Number(cp?.y) + dy,
                }));
            }
        }
    }
    pushHistorySnapshot(state, snap);
    if (setStatus) setStatus(selected.length === 1 ? "Moved object" : `Moved ${selected.length} objects`);
    if (draw) draw();
    return true;
}

export function getShapeEndpoints(s) {
    if (s.type === "line") {
        return [{ x: Number(s.x1), y: Number(s.y1) }, { x: Number(s.x2), y: Number(s.y2) }];
    }
    if (s.type === "arc") {
        const r = Number(s.r) || 0;
        const cx = Number(s.cx) || 0;
        const cy = Number(s.cy) || 0;
        const a1 = Number(s.a1) || 0;
        const a2 = Number(s.a2) || 0;
        return [
            { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r },
            { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r }
        ];
    }
    if (s.type === "rect") {
        const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
        return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
    }
    return [];
}

export function findConnectedLinesChain(state, startShapeId) {
    const startShape = state.shapes.find(s => Number(s.id) === Number(startShapeId));
    if (!startShape || (startShape.type !== "line" && startShape.type !== "arc" && startShape.type !== "rect")) return [Number(startShapeId)];

    const visited = new Set([Number(startShapeId)]);
    const queue = [Number(startShapeId)];
    const eps = 1e-4;
    const shapeGroupMap = new Map();
    for (const g of (state.groups || [])) {
        const gid = Number(g?.id);
        if (!Number.isFinite(gid)) continue;
        for (const sid of (g?.shapeIds || [])) {
            const sidNum = Number(sid);
            if (!Number.isFinite(sidNum)) continue;
            shapeGroupMap.set(sidNum, gid);
        }
    }
    const resolveGroupId = (shape) => {
        const sid = Number(shape?.id);
        const gidFromMap = shapeGroupMap.has(sid) ? Number(shapeGroupMap.get(sid)) : NaN;
        return Number.isFinite(gidFromMap) ? gidFromMap : Number(shape?.groupId);
    };

    while (queue.length > 0) {
        const curId = queue.shift();
        const curShape = state.shapes.find(s => Number(s.id) === curId);
        if (!curShape) continue;

        const endpoints = getShapeEndpoints(curShape);
        for (const p of endpoints) {
            for (const other of state.shapes) {
                const oid = Number(other.id);
                if (visited.has(oid)) continue;
                if (other.type !== "line" && other.type !== "arc" && other.type !== "rect") continue;
                if (!isLayerVisible(state, other.layerId) || isLayerLocked(state, other.layerId)) continue;
                if (!isGroupVisible(state, resolveGroupId(other))) continue;

                const oEndpoints = getShapeEndpoints(other);
                const connected = oEndpoints.some(op => Math.hypot(p.x - op.x, p.y - op.y) < eps);
                if (connected) {
                    visited.add(oid);
                    queue.push(oid);
                }
            }
        }
    }
    return Array.from(visited);
}

export function hitTestShapes(state, world, dom) {
    return hitTestOps.hitTestShapes(state, world, dom);
}

export function beginSelectionBox(state, screen, additive) {
    return selectionBoxOps.beginSelectionBox(state, screen, additive);
}

export function updateSelectionBox(state, screen) {
    return selectionBoxOps.updateSelectionBox(state, screen);
}

export function endSelectionBox(state, helpers) {
    return selectionBoxOps.endSelectionBox(state, helpers);
}

export function getTrimHoverCandidate(state, worldRaw, dom) {
    return trimFilletHoverOps.getTrimHoverCandidate(state, worldRaw, dom);
}

export function getTrimHoverCandidateForArc(state, worldRaw, arc) {
    return trimFilletHoverOps.getTrimHoverCandidateForArc(state, worldRaw, arc);
}

export function getTrimHoverCandidateForCircle(state, worldRaw, circle) {
    return trimFilletHoverOps.getTrimHoverCandidateForCircle(state, worldRaw, circle);
}

export function getTrimDeleteOnlyHoverCandidate(state, worldRaw, dom) {
    return trimFilletHoverOps.getTrimDeleteOnlyHoverCandidate(state, worldRaw, dom);
}

export function getFilletHoverCandidate(state, worldRaw) {
    return trimFilletHoverOps.getFilletHoverCandidate(state, worldRaw);
}

export function getShapeBoundsForAutoGroup(s) {
    if (!s) return null;
    if (s.type === "line" || s.type === "rect") {
        const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
        return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
    }
    if (s.type === "circle" || s.type === "arc") {
        const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
        return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
    }
    if (s.type === "position") {
        const x = Number(s.x), y = Number(s.y);
        return { minX: x, minY: y, maxX: x, maxY: y };
    }
    if (s.type === "dim") {
        const xs = [Number(s.x1), Number(s.x2), Number(s.px)];
        const ys = [Number(s.y1), Number(s.y2), Number(s.py)];
        return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    if (s.type === "text") {
        const x = Number(s.x), y = Number(s.y);
        // Approximation for bounds if no actual w/h stored
        return { minX: x, minY: y - 5, maxX: x + 20, maxY: y + 5 };
    }
    if (s.type === "bspline") {
        const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
        if (!sampled.length) return null;
        const xs = sampled.map((p) => Number(p.x)).filter(Number.isFinite);
        const ys = sampled.map((p) => Number(p.y)).filter(Number.isFinite);
        if (!xs.length || !ys.length) return null;
        return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    if (s.type === "circleDim") {
        const g = getCircleDimGeometry(s, state.shapes || []);
        if (!g) return null;
        const cx = Number(g.cx), cy = Number(g.cy), r = Math.abs(Number(g.r) || 0);
        const tx = Number(g.tx ?? cx), ty = Number(g.ty ?? cy);
        return {
            minX: Math.min(cx - r, tx),
            minY: Math.min(cy - r, ty),
            maxX: Math.max(cx + r, tx),
            maxY: Math.max(cy + r, ty)
        };
    }
    return null;
}

export function createAutoGroupForShapeIds(state, ids, namePrefix = "Group") {
    const shapeIds = Array.from(new Set((ids || []).map(Number))).filter(Number.isFinite);
    if (!shapeIds.length) return null;
    const inAnyGroup = new Set();
    for (const g of (state.groups || [])) for (const sid of (g.shapeIds || [])) inAnyGroup.add(Number(sid));
    const targetIds = shapeIds.filter((id) => !inAnyGroup.has(id));
    if (!targetIds.length) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const targetSet = new Set(targetIds);
    for (const s of (state.shapes || [])) {
        if (!targetSet.has(Number(s.id))) continue;
        const b = getShapeBoundsForAutoGroup(s);
        if (!b) continue;
        minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    const gid = Number(state.nextGroupId) || 1;
    state.nextGroupId = gid + 1;
    const originX = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
    const originY = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;
    const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
    const group = {
        id: gid,
        name: `${namePrefix} ${gid}`,
        shapeIds: targetIds.slice(),
        parentId: null,
        originX: Math.round(originX / gridStep) * gridStep,
        originY: Math.round(originY / gridStep) * gridStep,
        rotationDeg: 0,
    };
    state.groups.push(group);
    return group;
}

export function ensureUngroupedShapesHaveGroups(state) {
    const grouped = new Set();
    for (const g of (state.groups || [])) {
        for (const sid of (g.shapeIds || [])) {
            grouped.add(Number(sid));
        }
    }
    let created = 0;
    for (const s of (state.shapes || [])) {
        const sid = Number(s?.id);
        if (!Number.isFinite(sid) || grouped.has(sid)) continue;
        if (createAutoGroupForShapeIds(state, [sid])) {
            grouped.add(sid);
            created++;
        }
    }
    return created;
}







