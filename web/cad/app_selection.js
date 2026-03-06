import {
    getGroup, setActiveGroup, setSelection, clearSelection,
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
    getEffectiveGridSize, nearestPointOnSegment, mmPerUnit
} from "./geom.js";
import { hitTestDimPart, getDimGeometry, getDimChainGeometry, getCircleDimGeometry, getDimAngleGeometry } from "./dim_geom.js";
import {
    buildHatchLoopsFromBoundaryIds, isPointInHatch, isHatchBoundaryShape
} from "./hatch_geom.js";
import { solveLineLineFillet, solveLineCircleFillet, solveArcArcFillet } from "./solvers.js";

/**
 * Selection & Group Logic extracted from app.js
 */

export function collectDescendantGroupIds(state, rootGroupId) {
    const rootId = Number(rootGroupId);
    if (!Number.isFinite(rootId)) return [];
    const childrenByParent = new Map();
    for (const g of (state.groups || [])) {
        const pid = (g.parentId == null) ? null : Number(g.parentId);
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid).push(Number(g.id));
    }
    const out = [];
    const seen = new Set();
    const walk = (gid) => {
        if (!Number.isFinite(gid) || seen.has(gid)) return;
        seen.add(gid);
        out.push(gid);
        for (const cid of (childrenByParent.get(gid) || [])) walk(Number(cid));
    };
    walk(rootId);
    return out;
}

export function collectGroupTreeShapeIds(state, rootGroupId) {
    const gids = collectDescendantGroupIds(state, rootGroupId);
    const gidSet = new Set(gids.map(Number));
    const ids = new Set();
    for (const g of (state.groups || [])) {
        if (!gidSet.has(Number(g.id))) continue;
        for (const sid of (g.shapeIds || [])) ids.add(Number(sid));
    }
    return Array.from(ids);
}

export function collectGroupTreeGroupSnapshots(state, rootGroupId) {
    const gids = new Set(collectDescendantGroupIds(state, rootGroupId).map(Number));
    const snaps = [];
    for (const g of (state.groups || [])) {
        if (!gids.has(Number(g.id))) continue;
        snaps.push({
            id: Number(g.id),
            originX: Number(g.originX) || 0,
            originY: Number(g.originY) || 0,
            rotationDeg: Number(g.rotationDeg) || 0,
        });
    }
    return snaps;
}

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

export function isHitInActiveGroup(state, shapeId) {
    if (state.activeGroupId == null) return false;
    const ids = new Set(collectGroupTreeShapeIds(state, state.activeGroupId).map(Number));
    return ids.has(Number(shapeId));
}

export function selectGroupById(state, groupId) {
    const g = getGroup(state, groupId);
    if (!g) return false;
    const activeLayerId = Number(state.activeLayerId);
    const lockByLayer = new Map((state.layers || []).map(l => [Number(l?.id), !!l?.locked]));
    const shapeById = new Map((state.shapes || []).map(s => [Number(s.id), s]));
    const inGroup = collectGroupTreeShapeIds(state, g.id);
    for (const sid of inGroup) {
        const s = shapeById.get(Number(sid));
        if (!s) continue;
        const lid = Number(s.layerId ?? activeLayerId);
        if (lockByLayer.get(lid) === true) return false;
        if (state.ui?.layerView?.editOnlyActive && lid !== activeLayerId) return false;
    }
    setActiveGroup(state, g.id);
    // Performance: avoid expanding huge group trees into selection.ids on group-pick.
    // Group operations are driven by groupIds/activeGroupId.
    state.selection.ids = [];
    state.selection.groupIds = [Number(g.id)];
    return true;
}

export function toggleGroupSelectionById(state, groupId) {
    const g = getGroup(state, groupId);
    if (!g) return false;
    const activeLayerId = Number(state.activeLayerId);
    const lockByLayer = new Map((state.layers || []).map(l => [Number(l?.id), !!l?.locked]));
    const shapeById = new Map((state.shapes || []).map(s => [Number(s.id), s]));
    const inGroup = collectGroupTreeShapeIds(state, g.id);
    for (const sid of inGroup) {
        const s = shapeById.get(Number(sid));
        if (!s) continue;
        const lid = Number(s.layerId ?? activeLayerId);
        if (lockByLayer.get(lid) === true) return false;
        if (state.ui?.layerView?.editOnlyActive && lid !== activeLayerId) return false;
    }
    const gid = Number(g.id);
    const current = Array.isArray(state.selection?.groupIds)
        ? state.selection.groupIds.map(Number).filter(Number.isFinite)
        : [];
    const exists = current.includes(gid);
    const nextGroupIds = exists ? current.filter((id) => id !== gid) : current.concat([gid]);
    state.selection.groupIds = Array.from(new Set(nextGroupIds.map(Number)));
    if (!state.selection.groupIds.length) {
        state.selection.ids = [];
        state.activeGroupId = null;
        return true;
    }
    // Performance: keep object selection separate; group selection does not materialize all shape ids.
    state.selection.ids = [];
    if (exists) {
        if (!state.selection.groupIds.includes(Number(state.activeGroupId))) {
            state.activeGroupId = Number(state.selection.groupIds[state.selection.groupIds.length - 1]);
        }
    } else {
        state.activeGroupId = gid;
    }
    return true;
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
    if (!shape) return null;
    if (key === "p1" && (shape.type === "line" || shape.type === "rect")) return { x: shape.x1, y: shape.y1 };
    if (key === "p2" && (shape.type === "line" || shape.type === "rect")) return { x: shape.x2, y: shape.y2 };
    if (shape.type === "bspline") {
        const m = /^cp(\d+)$/.exec(String(key || ""));
        if (!m) return null;
        const idx = Number(m[1]);
        const cp = Array.isArray(shape.controlPoints) ? shape.controlPoints[idx] : null;
        if (!cp) return null;
        const x = Number(cp.x), y = Number(cp.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { x, y };
    }
    if (shape.type === "arc" && key === "a1") {
        const cx = Number(shape.cx), cy = Number(shape.cy), r = Number(shape.r), a1 = Number(shape.a1);
        if (![cx, cy, r, a1].every(Number.isFinite)) return null;
        return { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
    }
    if (shape.type === "arc" && key === "a2") {
        const cx = Number(shape.cx), cy = Number(shape.cy), r = Number(shape.r), a2 = Number(shape.a2);
        if (![cx, cy, r, a2].every(Number.isFinite)) return null;
        return { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
    }
    return null;
}

export function setVertexAtKey(shape, key, p) {
    if (!shape || !p) return false;
    if (key === "p1" && (shape.type === "line" || shape.type === "rect")) {
        shape.x1 = p.x; shape.y1 = p.y; return true;
    }
    if (key === "p2" && (shape.type === "line" || shape.type === "rect")) {
        shape.x2 = p.x; shape.y2 = p.y; return true;
    }
    if (shape.type === "arc" && (key === "a1" || key === "a2")) {
        const cx = Number(shape.cx), cy = Number(shape.cy);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return false;
        const ang = Math.atan2(Number(p.y) - cy, Number(p.x) - cx);
        if (key === "a1") shape.a1 = ang;
        else shape.a2 = ang;
        return true;
    }
    if (shape.type === "bspline") {
        const m = /^cp(\d+)$/.exec(String(key || ""));
        if (!m) return false;
        const idx = Number(m[1]);
        if (!Array.isArray(shape.controlPoints) || !shape.controlPoints[idx]) return false;
        shape.controlPoints[idx].x = Number(p.x);
        shape.controlPoints[idx].y = Number(p.y);
        return Number.isFinite(shape.controlPoints[idx].x) && Number.isFinite(shape.controlPoints[idx].y);
    }
    return false;
}

export function hitTestVertexHandle(state, world) {
    const tol = 10 / Math.max(1e-9, state.view.scale);
    const filterShapeId = state.vertexEdit?.filterShapeId != null ? Number(state.vertexEdit.filterShapeId) : null;
    const visibleLayerSet = new Set((state.layers || []).filter(l => l?.visible !== false).map(l => Number(l.id)).filter(Number.isFinite));
    const isLayerVisibleFast = (layerId) => (visibleLayerSet.size ? visibleLayerSet.has(Number(layerId)) : true);
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const s = state.shapes[i];
        if (!isLayerVisibleFast(s.layerId)) continue;
        if (!(s.type === "line" || s.type === "rect" || s.type === "arc" || s.type === "bspline")) continue;
        if (filterShapeId !== null && Number(s.id) !== filterShapeId) continue;
        if (s.type === "line" || s.type === "rect") {
            const p1d = Math.hypot(world.x - s.x1, world.y - s.y1);
            if (p1d <= tol) return { shapeId: s.id, key: "p1" };
            const p2d = Math.hypot(world.x - s.x2, world.y - s.y2);
            if (p2d <= tol) return { shapeId: s.id, key: "p2" };
        } else if (s.type === "arc") {
            const pA1 = getVertexAtKey(s, "a1");
            const pA2 = getVertexAtKey(s, "a2");
            if (pA1 && Math.hypot(world.x - pA1.x, world.y - pA1.y) <= tol) return { shapeId: s.id, key: "a1" };
            if (pA2 && Math.hypot(world.x - pA2.x, world.y - pA2.y) <= tol) return { shapeId: s.id, key: "a2" };
        } else if (s.type === "bspline" && Array.isArray(s.controlPoints)) {
            for (let ci = 0; ci < s.controlPoints.length; ci++) {
                const cp = s.controlPoints[ci];
                const x = Number(cp?.x), y = Number(cp?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                if (Math.hypot(world.x - x, world.y - y) <= tol) return { shapeId: s.id, key: `cp${ci}` };
            }
        }
    }
    return null;
}

export function vertexKeyOf(v) {
    return `${Number(v.shapeId)}:${v.key}`;
}

export function getCoincidentVertexGroup(state, hit) {
    if (state.vertexEdit?.linkCoincident === false) {
        return [{ shapeId: Number(hit.shapeId), key: hit.key }];
    }
    const baseShape = state.shapes.find(s => Number(s.id) === Number(hit.shapeId));
    const base = getVertexAtKey(baseShape, hit.key);
    if (!base) return [{ shapeId: Number(hit.shapeId), key: hit.key }];
    const eps = 1e-9;
    const out = [];
    for (const s of state.shapes) {
        if (!s || !isLayerVisible(state, s.layerId)) continue;
        if (!(s.type === "line" || s.type === "rect" || s.type === "arc" || s.type === "bspline")) continue;
        const keys = (s.type === "arc")
            ? ["a1", "a2"]
            : (s.type === "bspline"
                ? (Array.isArray(s.controlPoints) ? s.controlPoints.map((_, i) => `cp${i}`) : [])
                : ["p1", "p2"]);
        for (const k of keys) {
            const p = getVertexAtKey(s, k);
            if (!p) continue;
            if (Math.hypot(Number(p.x) - base.x, Number(p.y) - base.y) <= eps) {
                out.push({ shapeId: Number(s.id), key: k });
            }
        }
    }
    if (!out.length) out.push({ shapeId: Number(hit.shapeId), key: hit.key });
    return out;
}

export function hasSelectedVertex(state, hit) {
    const group = getCoincidentVertexGroup(state, hit);
    const set = new Set((state.vertexEdit.selectedVertices || []).map(vertexKeyOf));
    return group.some(v => set.has(vertexKeyOf(v)));
}

export function toggleVertexSelection(state, hit) {
    const arr = Array.isArray(state.vertexEdit.selectedVertices) ? state.vertexEdit.selectedVertices.slice() : [];
    const group = getCoincidentVertexGroup(state, hit);
    const keySet = new Set(arr.map(vertexKeyOf));
    const groupKeys = group.map(vertexKeyOf);
    const anySelected = groupKeys.some(k => keySet.has(k));
    if (anySelected) {
        const remove = new Set(groupKeys);
        state.vertexEdit.selectedVertices = arr.filter(v => !remove.has(vertexKeyOf(v)));
    } else {
        for (const v of group) if (!keySet.has(vertexKeyOf(v))) arr.push(v);
        state.vertexEdit.selectedVertices = arr;
    }
    const fin = state.vertexEdit.selectedVertices || [];
    state.vertexEdit.activeVertex = fin.length ? { shapeId: Number(hit.shapeId), key: hit.key } : null;
}

export function setSingleVertexSelection(state, hit) {
    state.vertexEdit.selectedVertices = getCoincidentVertexGroup(state, hit);
    state.vertexEdit.activeVertex = { shapeId: Number(hit.shapeId), key: hit.key };
}

export function clearVertexSelection(state) {
    state.vertexEdit.selectedVertices = [];
    state.vertexEdit.activeVertex = null;
}

export function beginVertexSelectionBox(state, screen, additive) {
    beginSelectionBox(state, screen, additive);
}

export function endVertexSelectionBox(state, helpers) {
    const { setStatus, draw } = helpers;
    const box = state.selection.box;
    if (!box.active || !box.startScreen || !box.currentScreen) {
        state.selection.box.active = false;
        state.selection.box.startScreen = null;
        state.selection.box.currentScreen = null;
        return false;
    }
    const xMin = Math.min(box.startScreen.x, box.currentScreen.x);
    const xMax = Math.max(box.startScreen.x, box.currentScreen.x);
    const yMin = Math.min(box.startScreen.y, box.currentScreen.y);
    const yMax = Math.max(box.startScreen.y, box.currentScreen.y);
    const dragged = ((xMax - xMin) > 4 || (yMax - yMin) > 4);
    if (dragged) {
        const picked = [];
        for (const s of state.shapes) {
            if (!isLayerVisible(state, s.layerId)) continue;
            if (!(s.type === "line" || s.type === "rect" || s.type === "arc" || s.type === "bspline")) continue;
            const pts = (s.type === "arc")
                ? [
                    (() => { const p = getVertexAtKey(s, "a1"); return p ? { shapeId: Number(s.id), key: "a1", x: p.x, y: p.y } : null; })(),
                    (() => { const p = getVertexAtKey(s, "a2"); return p ? { shapeId: Number(s.id), key: "a2", x: p.x, y: p.y } : null; })(),
                ].filter(Boolean)
                : (s.type === "bspline"
                    ? (Array.isArray(s.controlPoints)
                        ? s.controlPoints.map((cp, idx) => {
                            const x = Number(cp?.x), y = Number(cp?.y);
                            if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                            return { shapeId: Number(s.id), key: `cp${idx}`, x, y };
                        }).filter(Boolean)
                        : [])
                    : [
                    { shapeId: Number(s.id), key: "p1", x: s.x1, y: s.y1 },
                    { shapeId: Number(s.id), key: "p2", x: s.x2, y: s.y2 },
                ]);
            for (const p of pts) {
                const sx = p.x * state.view.scale + state.view.offsetX;
                const sy = p.y * state.view.scale + state.view.offsetY;
                if (sx >= xMin && sx <= xMax && sy >= yMin && sy <= yMax) {
                    for (const cv of getCoincidentVertexGroup(state, { shapeId: p.shapeId, key: p.key })) picked.push(cv);
                }
            }
        }
        const pickedUnique = Array.from(new Map(picked.map(v => [vertexKeyOf(v), v])).values());
        if (box.additive) {
            const cur = new Map((state.vertexEdit.selectedVertices || []).map(v => [vertexKeyOf(v), v]));
            for (const v of pickedUnique) {
                const k = vertexKeyOf(v);
                if (cur.has(k)) cur.delete(k); else cur.set(k, v);
            }
            state.vertexEdit.selectedVertices = Array.from(cur.values());
        } else {
            state.vertexEdit.selectedVertices = pickedUnique;
        }
        state.vertexEdit.activeVertex = state.vertexEdit.selectedVertices.length
            ? state.vertexEdit.selectedVertices[state.vertexEdit.selectedVertices.length - 1]
            : null;
        if (setStatus) setStatus(state.vertexEdit.selectedVertices.length ? `Vertex box selected ${state.vertexEdit.selectedVertices.length} ` : "No vertex");
    } else {
        // 蜊倅ｸ繧ｯ繝ｪ繝・け縺九▽ Shift 辟｡縺励・蝣ｴ蜷医・鬆らせ驕ｸ謚櫁ｧ｣髯､
        if (!box.additive) {
            state.vertexEdit.selectedVertices = [];
            state.vertexEdit.activeVertex = null;
            state.activeGroupId = null; // 閭梧勹繧ｯ繝ｪ繝・け縺ｧ繧ｰ繝ｫ繝ｼ繝励・繧｢繧ｯ繝・ぅ繝也憾諷九ｂ隗｣髯､
            setSelection(state, []);
        }
    }
    state.selection.box.active = false;
    state.selection.box.additive = false;
    state.selection.box.startScreen = null;
    state.selection.box.currentScreen = null;
    return dragged;
}

export function beginVertexDrag(state, hit, worldRaw, helpers, additive = false) {
    const { cloneShapeForDrag } = helpers;
    const shape = state.shapes.find(s => Number(s.id) === Number(hit.shapeId));
    if (!shape) return false;
    if (additive) {
        toggleVertexSelection(state, hit);
    } else {
        if (!hasSelectedVertex(state, hit)) setSingleVertexSelection(state, hit);
        else state.vertexEdit.activeVertex = { shapeId: Number(hit.shapeId), key: hit.key };
    }
    const selected = (state.vertexEdit.selectedVertices || []);
    if (!selected.length) return false;
    const keySet = new Set(selected.map(vertexKeyOf));
    const shapeIdSet = new Set(selected.map(v => Number(v.shapeId)));
    const baseSnaps = [];
    for (const s of state.shapes) {
        if (shapeIdSet.has(Number(s.id))) baseSnaps.push({ id: Number(s.id), shape: cloneShapeForDrag(s) });
    }
    state.vertexEdit.drag.active = true;
    state.vertexEdit.drag.anchorShapeId = Number(hit.shapeId);
    state.vertexEdit.drag.anchorKey = hit.key;
    state.vertexEdit.drag.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    state.vertexEdit.drag.selectedVertexKeys = Array.from(keySet);
    state.vertexEdit.drag.baseShapeSnapshots = baseSnaps;
    state.vertexEdit.drag.modelSnapshotBeforeMove = snapshotModel(state);
    state.vertexEdit.drag.moved = false;
    state.vertexEdit.drag.lastTangentSnap = null;
    state.vertexEdit.drag.lastIntersectionSnap = null;
    state.vertexEdit.drag.lastObjectSnap = null;
    setSelection(state, Array.from(new Set(selected.map(v => Number(v.shapeId)))));
    return true;
}

export function applyVertexDrag(state, worldRaw) {
    const vd = state.vertexEdit.drag;
    if (!vd.active || !vd.baseShapeSnapshots || !vd.startWorldRaw) return;
    const baseMap = new Map((vd.baseShapeSnapshots || []).map(it => [Number(it.id), it.shape]));
    const anchorBaseShape = baseMap.get(Number(vd.anchorShapeId));
    if (!anchorBaseShape) return;
    const baseV = getVertexAtKey(anchorBaseShape, vd.anchorKey);
    if (!baseV) return;
    const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    const draggingShapeIds = new Set((vd.baseShapeSnapshots || []).map(it => Number(it.id)));
    // Respect current snap panel settings in vertex edit as well.
    // Keep excluding dragged shapes to avoid self-generated snap candidates.
    const objectSnap = getObjectSnapPoint(state, worldRaw, null, draggingShapeIds);

    state.input.objectSnapHover = objectSnap;
    vd.lastObjectSnap = objectSnap ? { ...objectSnap } : null;

    let target = objectSnap
        ? { x: objectSnap.x, y: objectSnap.y }
        : (state.grid.snap ? snapPoint(worldRaw, gridStep) : worldRaw);

    // --- Tangent snap: only for line vertices ---
    let tangentSnapResult = null;
    let intersectionSnapResult = null;
    if (objectSnap && objectSnap.kind === "intersection") {
        const lineAId = Number(objectSnap.lineAId);
        const lineBId = Number(objectSnap.lineBId);
        if (Number.isFinite(lineAId) && Number.isFinite(lineBId)) {
            intersectionSnapResult = { x: Number(objectSnap.x), y: Number(objectSnap.y), lineAId, lineBId };
        }
    }
    if (state.objectSnap?.tangent && anchorBaseShape.type === "line") {
        const fixedKey = vd.anchorKey === "p1" ? "p2" : "p1";
        const fixedPt = getVertexAtKey(anchorBaseShape, fixedKey);
        if (fixedPt) {
            const tol = 12 / Math.max(1e-9, state.view.scale);
            let bestD = Infinity;
            let bestPt = null;
            let bestCircleId = null;
            for (const s of state.shapes) {
                if (!s || !isLayerVisible(state, s.layerId)) continue;
                if (s.type !== "circle" && s.type !== "arc") continue;
                const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
                if (r <= 1e-9) continue;
                const pts = solveTangentSnapPoints(fixedPt, cx, cy, r);
                for (const pt of pts) {
                    if (s.type === "arc") {
                        const th = Math.atan2(pt.y - cy, pt.x - cx);
                        if (!isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) continue;
                    }
                    const d = Math.hypot(worldRaw.x - pt.x, worldRaw.y - pt.y);
                    if (d <= tol && d < bestD) {
                        bestD = d;
                        bestPt = pt;
                        bestCircleId = Number(s.id);
                    }
                }
            }
            if (bestPt) {
                target = bestPt;
                tangentSnapResult = { x: bestPt.x, y: bestPt.y, circleId: bestCircleId };
                state.input.objectSnapHover = { x: bestPt.x, y: bestPt.y, kind: "tangent" };
                vd.lastObjectSnap = { x: bestPt.x, y: bestPt.y, kind: "tangent", circleId: bestCircleId };
            }
        }
    }
    vd.lastTangentSnap = tangentSnapResult;
    vd.lastIntersectionSnap = tangentSnapResult ? null : intersectionSnapResult;

    // --- Vector snap: constrain to original line direction (only if no tangent snap) ---
    if (!tangentSnapResult && state.objectSnap?.vector && anchorBaseShape.type === "line") {
        const fixedKey = vd.anchorKey === "p1" ? "p2" : "p1";
        const fixedPt = getVertexAtKey(anchorBaseShape, fixedKey);
        if (fixedPt) {
            const dirX = baseV.x - fixedPt.x;
            const dirY = baseV.y - fixedPt.y;
            const lenSq = dirX * dirX + dirY * dirY;
            if (lenSq > 1e-18) {
                // When 邱壻ｸ・snap is also ON: find intersections of the vector axis with other shapes.
                // If cursor is within tolerance of any intersection, snap to it precisely.
                let axisIntersectionSnap = null;
                if (state.objectSnap?.enabled !== false) {
                    const tol = 12 / Math.max(1e-9, state.view.scale);
                    let bestD = Infinity;
                    for (const s of state.shapes) {
                        if (!s || !isLayerVisible(state, s.layerId)) continue;
                        if (draggingShapeIds.has(Number(s.id))) continue;
                        for (const ip of getVectorAxisIntersections(fixedPt, dirX, dirY, s)) {
                            const d = Math.hypot(worldRaw.x - ip.x, worldRaw.y - ip.y);
                            if (d <= tol && d < bestD) {
                                bestD = d;
                                axisIntersectionSnap = ip;
                            }
                        }
                    }
                }
                if (axisIntersectionSnap) {
                    target = axisIntersectionSnap;
                    state.input.objectSnapHover = { x: axisIntersectionSnap.x, y: axisIntersectionSnap.y, kind: "vector" };
                    vd.lastObjectSnap = { x: axisIntersectionSnap.x, y: axisIntersectionSnap.y, kind: "vector" };
                } else {
                    // Regular projection onto vector axis
                    const t = ((target.x - fixedPt.x) * dirX + (target.y - fixedPt.y) * dirY) / lenSq;
                    target = { x: fixedPt.x + t * dirX, y: fixedPt.y + t * dirY };
                }
            }
        }
    }

    const dx = target.x - baseV.x;
    const dy = target.y - baseV.y;
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) vd.moved = true;
    const byId = new Map(state.shapes.map(s => [Number(s.id), s]));
    for (const key of (vd.selectedVertexKeys || [])) {
        const [shapeIdStr, vkey] = String(key).split(":");
        const sid = Number(shapeIdStr);
        const curShape = byId.get(sid);
        const baseShape = baseMap.get(sid);
        if (!curShape || !baseShape) continue;
        const pBase = getVertexAtKey(baseShape, vkey);
        if (!pBase) continue;
        setVertexAtKey(curShape, vkey, { x: pBase.x + dx, y: pBase.y + dy });
    }

}

export function endVertexDrag(state) {
    const vd = state.vertexEdit.drag;
    const moved = !!vd.moved;
    const snapshot = vd.modelSnapshotBeforeMove;
    const anchorShapeId = vd.anchorShapeId;
    const anchorKey = vd.anchorKey;
    const lastTangentSnap = vd.lastTangentSnap || null;
    const lastIntersectionSnap = vd.lastIntersectionSnap || null;
    const lastObjectSnap = vd.lastObjectSnap || null;
    vd.active = false;
    vd.anchorShapeId = null;
    vd.anchorKey = null;
    vd.startWorldRaw = null;
    vd.selectedVertexKeys = null;
    vd.baseShapeSnapshots = null;
    vd.modelSnapshotBeforeMove = null;
    vd.moved = false;
    vd.lastTangentSnap = null;
    vd.lastIntersectionSnap = null;
    vd.lastObjectSnap = null;
    return { moved, snapshot, anchorShapeId, anchorKey, lastTangentSnap, lastIntersectionSnap, lastObjectSnap };
}

/**
 * Find all intersections of an infinite line (fixedPt + t*(dirX, dirY)) with a shape.
 * Used for vector-axis intersection snap.
 */
function getVectorAxisIntersections(fixedPt, dirX, dirY, shape) {
    const result = [];
    const fx = fixedPt.x, fy = fixedPt.y;

    const tryLineSeg = (ax, ay, bx, by) => {
        const d2x = bx - ax, d2y = by - ay;
        const cross = dirX * d2y - dirY * d2x;
        if (Math.abs(cross) < 1e-12) return;
        const t2 = ((ax - fx) * dirY - (ay - fy) * dirX) / cross;
        if (t2 < -1e-7 || t2 > 1 + 1e-7) return; // outside segment
        const t1 = ((ax - fx) * d2y - (ay - fy) * d2x) / cross;
        result.push({ x: fx + t1 * dirX, y: fy + t1 * dirY });
    };

    if (shape.type === "line") {
        tryLineSeg(Number(shape.x1), Number(shape.y1), Number(shape.x2), Number(shape.y2));
    } else if (shape.type === "rect") {
        const x1 = Number(shape.x1), y1 = Number(shape.y1);
        const x2 = Number(shape.x2), y2 = Number(shape.y2);
        tryLineSeg(x1, y1, x2, y1);
        tryLineSeg(x2, y1, x2, y2);
        tryLineSeg(x2, y2, x1, y2);
        tryLineSeg(x1, y2, x1, y1);
    } else if (shape.type === "circle" || shape.type === "arc") {
        const cx = Number(shape.cx), cy = Number(shape.cy), r = Math.abs(Number(shape.r) || 0);
        if (r <= 1e-9) return result;
        const ux = fx - cx, uy = fy - cy;
        const a = dirX * dirX + dirY * dirY;
        if (a < 1e-18) return result;
        const b = 2 * (ux * dirX + uy * dirY);
        const c = ux * ux + uy * uy - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return result;
        const sqrtDisc = Math.sqrt(Math.max(0, disc));
        for (const t of [(-b + sqrtDisc) / (2 * a), (-b - sqrtDisc) / (2 * a)]) {
            const ix = fx + t * dirX, iy = fy + t * dirY;
            if (shape.type === "arc") {
                const th = Math.atan2(iy - cy, ix - cx);
                if (!isAngleOnArc(th, Number(shape.a1) || 0, Number(shape.a2) || 0, shape.ccw !== false)) continue;
            }
            result.push({ x: ix, y: iy });
        }
    }
    return result;
}

/**
 * Resolve tangent vertex attributes: for each line vertex with a tangent attrib,
 * recompute its position to be tangent to the referenced circle/arc.
 * excludeShapeIds: Set of shape IDs to skip (shapes currently being interactively edited).
 */
export function resolveVertexTangentAttribs(state, excludeShapeIds) {
    const excludeSet = excludeShapeIds instanceof Set ? excludeShapeIds : null;
    for (const shape of state.shapes) {
        if (shape.type !== "line") continue;
        if (excludeSet && excludeSet.has(Number(shape.id))) continue;
        for (const key of ["p1", "p2"]) {
            const attrib = key === "p1" ? shape.p1Attrib : shape.p2Attrib;
            if (!attrib) continue;
            if (attrib.type === "fixedPoint") {
                const fx = Number(attrib.x), fy = Number(attrib.y);
                if (!Number.isFinite(fx) || !Number.isFinite(fy)) {
                    if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
                    continue;
                }
                if (key === "p1") { shape.x1 = fx; shape.y1 = fy; }
                else { shape.x2 = fx; shape.y2 = fy; }
                continue;
            }
            if (attrib.type === "followPoint") {
                const ref = state.shapes.find(s => Number(s.id) === Number(attrib.shapeId));
                if (!ref) {
                    if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
                    continue;
                }
                let pt = null;
                if (attrib.refType === "line_endpoint" && ref.type === "line") {
                    pt = (attrib.refKey === "p2")
                        ? { x: Number(ref.x2), y: Number(ref.y2) }
                        : { x: Number(ref.x1), y: Number(ref.y1) };
                } else if (attrib.refType === "dim_endpoint" && ref.type === "dim") {
                    pt = (attrib.refKey === "p2")
                        ? { x: Number(ref.x2), y: Number(ref.y2) }
                        : { x: Number(ref.x1), y: Number(ref.y1) };
                } else if (attrib.refType === "rect_corner" && ref.type === "rect") {
                    const x1 = Number(ref.x1), y1 = Number(ref.y1), x2 = Number(ref.x2), y2 = Number(ref.y2);
                    if (attrib.refKey === "c2") pt = { x: x2, y: y1 };
                    else if (attrib.refKey === "c3") pt = { x: x2, y: y2 };
                    else if (attrib.refKey === "c4") pt = { x: x1, y: y2 };
                    else pt = { x: x1, y: y1 };
                } else if (attrib.refType === "line_midpoint" && ref.type === "line") {
                    pt = {
                        x: (Number(ref.x1) + Number(ref.x2)) * 0.5,
                        y: (Number(ref.y1) + Number(ref.y2)) * 0.5
                    };
                } else if (attrib.refType === "rect_midpoint" && ref.type === "rect") {
                    const x1 = Number(ref.x1), y1 = Number(ref.y1), x2 = Number(ref.x2), y2 = Number(ref.y2);
                    if (attrib.refKey === "m2") pt = { x: x2, y: (y1 + y2) * 0.5 };
                    else if (attrib.refKey === "m3") pt = { x: (x1 + x2) * 0.5, y: y2 };
                    else if (attrib.refKey === "m4") pt = { x: x1, y: (y1 + y2) * 0.5 };
                    else pt = { x: (x1 + x2) * 0.5, y: y1 };
                } else if (attrib.refType === "circle_center" && ref.type === "circle") {
                    pt = { x: Number(ref.cx), y: Number(ref.cy) };
                } else if (attrib.refType === "arc_center" && ref.type === "arc") {
                    pt = { x: Number(ref.cx), y: Number(ref.cy) };
                } else if (attrib.refType === "position_center" && ref.type === "position") {
                    pt = { x: Number(ref.x), y: Number(ref.y) };
                } else if (attrib.refType === "arc_endpoint" && ref.type === "arc") {
                    const r = Math.abs(Number(ref.r) || 0);
                    const cx = Number(ref.cx), cy = Number(ref.cy);
                    const a = (attrib.refKey === "a2") ? (Number(ref.a2) || 0) : (Number(ref.a1) || 0);
                    pt = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
                }
                if (!pt || !Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
                    if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
                    continue;
                }
                if (key === "p1") { shape.x1 = pt.x; shape.y1 = pt.y; }
                else { shape.x2 = pt.x; shape.y2 = pt.y; }
                continue;
            }
            if (attrib.type === "intersection") {
                const la = state.shapes.find(s => Number(s.id) === Number(attrib.lineAId));
                const lb = state.shapes.find(s => Number(s.id) === Number(attrib.lineBId));
                if (!la || !lb || la.type !== "line" || lb.type !== "line") {
                    if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
                    continue;
                }
                const ip = segmentIntersectionPoint(
                    { x: Number(la.x1), y: Number(la.y1) }, { x: Number(la.x2), y: Number(la.y2) },
                    { x: Number(lb.x1), y: Number(lb.y1) }, { x: Number(lb.x2), y: Number(lb.y2) }
                );
                if (!ip) continue;
                if (key === "p1") { shape.x1 = ip.x; shape.y1 = ip.y; }
                else { shape.x2 = ip.x; shape.y2 = ip.y; }
                continue;
            }
            if (attrib.type !== "tangent") continue;
            const circle = state.shapes.find(s => Number(s.id) === attrib.circleId);
            if (!circle || (circle.type !== "circle" && circle.type !== "arc")) {
                // Referenced circle no longer exists 窶・clear the attribute
                if (key === "p1") shape.p1Attrib = null; else shape.p2Attrib = null;
                continue;
            }
            const fixedKey = key === "p1" ? "p2" : "p1";
            const fixedPt = fixedKey === "p1"
                ? { x: Number(shape.x1), y: Number(shape.y1) }
                : { x: Number(shape.x2), y: Number(shape.y2) };
            const cx = Number(circle.cx), cy = Number(circle.cy), r = Math.abs(Number(circle.r) || 0);
            const pts = solveTangentSnapPoints(fixedPt, cx, cy, r);
            if (!pts.length) continue;
            // Select the candidate matching the stored side
            let best = pts[0];
            if (pts.length > 1) {
                const cross0 = (cx - fixedPt.x) * (pts[0].y - fixedPt.y) - (cy - fixedPt.y) * (pts[0].x - fixedPt.x);
                if ((cross0 >= 0 ? 1 : -1) !== attrib.side) best = pts[1];
            }
            // Update line vertex position
            if (key === "p1") { shape.x1 = best.x; shape.y1 = best.y; }
            else { shape.x2 = best.x; shape.y2 = best.y; }

            // If referenced shape is an arc, also update the arc endpoint that is
            // at the tangent point (a1 or a2 窶・whichever is angularly closer).
            if (circle.type === "arc") {
                const newTheta = Math.atan2(best.y - cy, best.x - cx);
                const angDist = (th, a) => Math.abs(Math.atan2(Math.sin(th - a), Math.cos(th - a)));
                const a1 = Number(circle.a1), a2 = Number(circle.a2);
                if (angDist(newTheta, a1) <= angDist(newTheta, a2)) {
                    circle.a1 = newTheta;
                } else {
                    circle.a2 = newTheta;
                }
            }
        }
    }
}

export function moveSelectedVerticesByDelta(state, dx, dy, helpers) {
    const { setStatus, draw } = helpers;
    dx = Number(dx) || 0;
    dy = Number(dy) || 0;
    if (Math.abs(dx) < 1e-12 && Math.abs(dy) < 1e-12) {
        if (setStatus) setStatus("No vertex move");
        if (draw) draw();
        return;
    }
    const selected = state.vertexEdit.selectedVertices || [];
    if (!selected.length) {
        if (setStatus) setStatus("No vertices selected");
        if (draw) draw();
        return;
    }
    pushHistory(state);
    const byId = new Map(state.shapes.map(s => [Number(s.id), s]));
    const seen = new Set();
    for (const v of selected) {
        const sid = Number(v.shapeId);
        const key = String(v.key || "");
        const uniq = `${sid}:${key} `;
        if (seen.has(uniq)) continue;
        seen.add(uniq);
        const shape = byId.get(sid);
        if (!shape) continue;
        const p = getVertexAtKey(shape, key);
        if (!p) continue;
        const next = { x: p.x + dx, y: p.y + dy };
        if (state.grid.snap) {
            const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
            const snapped = snapPoint(next, gridStep);
            setVertexAtKey(shape, key, snapped);
        } else {
            setVertexAtKey(shape, key, next);
        }
    }
    state.vertexEdit.moveDx = dx;
    state.vertexEdit.moveDy = dy;
    setSelection(state, Array.from(new Set(selected.map(v => Number(v.shapeId)))));
    if (setStatus) setStatus(`Moved ${selected.length} vertices by ${dx}, ${dy} `);
    if (draw) draw();
}

export function beginGroupOriginDrag(state, group, worldRaw) {
    const pickedGroupId = Number(group.id);
    const selectedGroupIds = Array.isArray(state.selection?.groupIds)
        ? state.selection.groupIds.map(Number).filter(Number.isFinite)
        : [];
    const dragRootGroupIds = (selectedGroupIds.length > 1 && selectedGroupIds.includes(pickedGroupId))
        ? selectedGroupIds
        : [pickedGroupId];
    const dragRootSet = new Set(dragRootGroupIds.map(Number));
    const idSet = new Set();
    const dragGroupSnapshotIds = new Set();
    for (const rootGroupId of dragRootSet) {
        for (const sid of collectGroupTreeShapeIds(state, rootGroupId)) idSet.add(Number(sid));
        for (const gs of collectGroupTreeGroupSnapshots(state, rootGroupId)) dragGroupSnapshotIds.add(Number(gs.id));
    }
    const snaps = [];
    for (const s of state.shapes) {
        if (!idSet.has(Number(s.id))) continue;
        snaps.push({ id: s.id, shape: JSON.parse(JSON.stringify(s)) });
    }
    const groupSnapshots = [];
    for (const gs of (state.groups || [])) {
        const gid = Number(gs.id);
        if (!dragGroupSnapshotIds.has(gid)) continue;
        groupSnapshots.push({
            id: gid,
            originX: Number(gs.originX) || 0,
            originY: Number(gs.originY) || 0,
            rotationDeg: Number(gs.rotationDeg) || 0,
        });
    }
    state.input.groupDrag.active = true;
    state.input.groupDrag.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    state.input.groupDrag.groupId = pickedGroupId;
    state.input.groupDrag.groupIds = Array.from(dragRootSet);
    state.input.groupDrag.groupOrigin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    state.input.groupDrag.anchorGroupId = pickedGroupId;
    state.input.groupDrag.anchorGroupOrigin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    state.input.groupDrag.shapeSnapshots = snaps;
    state.input.groupDrag.groupSnapshots = groupSnapshots;
    state.input.groupDrag.modelSnapshotBeforeMove = snapshotModel(state);
    state.input.groupDrag.moved = false;
}

export function beginGroupRotateDrag(state, group, worldRaw) {
    const idSet = new Set(collectGroupTreeShapeIds(state, group.id).map(Number));
    const snaps = [];
    for (const s of state.shapes) {
        if (!idSet.has(Number(s.id))) continue;
        snaps.push({ id: s.id, shape: JSON.parse(JSON.stringify(s)) });
    }
    const origin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    state.input.groupRotate.active = true;
    state.input.groupRotate.groupId = Number(group.id);
    state.input.groupRotate.startAngleDeg = Number(group.rotationDeg) || 0;
    state.input.groupRotate.startPointerAngleDeg = angleDegFromOrigin(origin, worldRaw);
    state.input.groupRotate.groupOrigin = origin;
    state.input.groupRotate.shapeSnapshots = snaps;
    state.input.groupRotate.groupSnapshots = collectGroupTreeGroupSnapshots(state, group.id);
    state.input.groupRotate.modelSnapshotBeforeRotate = snapshotModel(state);
    state.input.groupRotate.moved = false;
}

export function applyGroupOriginDrag(state, worldRaw) {
    const gd = state.input.groupDrag;
    if (!gd.active || !gd.startWorldRaw) return;
    const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    const anchorOrigin = gd.anchorGroupOrigin || gd.groupOrigin || { x: 0, y: 0 };

    // 迴ｾ蝨ｨ縺ｮ繝槭え繧ｹ・医Ρ繝ｼ繝ｫ繝牙ｺｧ讓呻ｼ峨°繧牙渕貅也せ縺ｮ譁ｰ縺励＞菴咲ｽｮ繧定ｨ育ｮ・
    const rawDx = worldRaw.x - gd.startWorldRaw.x;
    const rawDy = worldRaw.y - gd.startWorldRaw.y;
    const rawTargetX = anchorOrigin.x + rawDx;
    const rawTargetY = anchorOrigin.y + rawDy;

    // 繧ｹ繝翫ャ繝励′譛牙柑縺ｪ蝣ｴ蜷医∫ｧｻ蜍募ｾ後・邨ｶ蟇ｾ蠎ｧ讓吶ｒ繧ｰ繝ｪ繝・ラ縺ｫ荵励○繧・
    const targetX = state.grid.snap ? Math.round(rawTargetX / gridStep) * gridStep : rawTargetX;
    const targetY = state.grid.snap ? Math.round(rawTargetY / gridStep) * gridStep : rawTargetY;

    const dx = targetX - anchorOrigin.x;
    const dy = targetY - anchorOrigin.y;

    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) gd.moved = true;
    const g = getGroup(state, gd.anchorGroupId ?? gd.groupId);
    if (g) {
        g.originX = anchorOrigin.x + dx;
        g.originY = anchorOrigin.y + dy;
    }
    const groupById = new Map((state.groups || []).map((gg) => [Number(gg.id), gg]));
    for (const gs of (gd.groupSnapshots || [])) {
        const tg = groupById.get(Number(gs.id));
        if (!tg) continue;
        tg.originX = (Number(gs.originX) || 0) + dx;
        tg.originY = (Number(gs.originY) || 0) + dy;
    }
    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    for (const it of gd.shapeSnapshots || []) {
        const t = byId.get(Number(it.id));
        if (!t) continue;
        const b = it.shape;
        if (t.type === "line" || t.type === "rect") {
            t.x1 = b.x1 + dx; t.y1 = b.y1 + dy;
            t.x2 = b.x2 + dx; t.y2 = b.y2 + dy;
        } else if (t.type === "circle") {
            t.cx = b.cx + dx; t.cy = b.cy + dy;
            t.r = b.r;
        } else if (t.type === "arc") {
            t.cx = b.cx + dx; t.cy = b.cy + dy;
            t.r = b.r; t.a1 = b.a1; t.a2 = b.a2; t.ccw = b.ccw;
        } else if (t.type === "position") {
            t.x = b.x + dx; t.y = b.y + dy; t.size = b.size;
        } else if (t.type === "dim") {
            t.x1 = b.x1 + dx; t.y1 = b.y1 + dy;
            t.x2 = b.x2 + dx; t.y2 = b.y2 + dy;
            t.px = b.px + dx; t.py = b.py + dy;
            if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
                t.tx = Number(b.tx) + dx;
                t.ty = Number(b.ty) + dy;
            }
        } else if (t.type === "dimchain") {
            if (Array.isArray(b.points) && Array.isArray(t.points)) {
                t.points = b.points.map(pt => ({ x: Number(pt.x) + dx, y: Number(pt.y) + dy }));
            }
            if (Number.isFinite(Number(b.px)) && Number.isFinite(Number(b.py))) {
                t.px = Number(b.px) + dx;
                t.py = Number(b.py) + dy;
            }
            if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
                t.tx = Number(b.tx) + dx;
                t.ty = Number(b.ty) + dy;
            }
        } else if (t.type === "circleDim") {
            // circleDim follows referenced circle/arc geometry; move explicit absolute text anchor if present.
            if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
                t.tx = Number(b.tx) + dx;
                t.ty = Number(b.ty) + dy;
            }
        } else if (t.type === "text") {
            t.x1 = b.x1 + dx; t.y1 = b.y1 + dy;
        } else if (t.type === "bspline") {
            if (Array.isArray(b.controlPoints)) {
                t.controlPoints = b.controlPoints.map((cp) => ({
                    x: Number(cp?.x) + dx,
                    y: Number(cp?.y) + dy,
                }));
            }
        }
    }
}

export function applyGroupRotateDrag(state, worldRaw) {
    const gr = state.input.groupRotate;
    if (!gr.active || !gr.groupOrigin) return;
    const g = getGroup(state, gr.groupId);
    if (!g) return;
    const curPointerDeg = angleDegFromOrigin(gr.groupOrigin, worldRaw);
    let delta = curPointerDeg - gr.startPointerAngleDeg;
    const snapDeg = Math.max(0.1, Number(gr.snapDeg) || 5);
    delta = Math.round(delta / snapDeg) * snapDeg;
    if (Math.abs(delta) > 1e-9) gr.moved = true;
    g.rotationDeg = gr.startAngleDeg + delta;
    const ox = gr.groupOrigin.x, oy = gr.groupOrigin.y;
    const groupById = new Map((state.groups || []).map((gg) => [Number(gg.id), gg]));
    const d = (delta * Math.PI) / 180;
    for (const gs of (gr.groupSnapshots || [])) {
        const tg = groupById.get(Number(gs.id));
        if (!tg) continue;
        if (Number(gs.id) !== Number(gr.groupId)) {
            const rp = rotatePointAround(Number(gs.originX) || 0, Number(gs.originY) || 0, ox, oy, delta);
            tg.originX = rp.x;
            tg.originY = rp.y;
        }
        tg.rotationDeg = (Number(gs.rotationDeg) || 0) + delta;
    }
    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    for (const it of gr.shapeSnapshots || []) {
        const t = byId.get(Number(it.id));
        if (!t) continue;
        const b = it.shape;
        if (t.type === "line" || t.type === "rect") {
            const p1 = rotatePointAround(b.x1, b.y1, ox, oy, delta);
            const p2 = rotatePointAround(b.x2, b.y2, ox, oy, delta);
            t.x1 = p1.x; t.y1 = p1.y; t.x2 = p2.x; t.y2 = p2.y;
        } else if (t.type === "circle") {
            const c = rotatePointAround(b.cx, b.cy, ox, oy, delta);
            t.cx = c.x; t.cy = c.y; t.r = b.r;
        } else if (t.type === "arc") {
            const c = rotatePointAround(b.cx, b.cy, ox, oy, delta);
            t.cx = c.x; t.cy = c.y; t.r = b.r;
            t.a1 = normalizeRad((Number(b.a1) || 0) + d);
            t.a2 = normalizeRad((Number(b.a2) || 0) + d);
            t.ccw = (b.ccw !== false);
        } else if (t.type === "position") {
            const p = rotatePointAround(b.x, b.y, ox, oy, delta);
            t.x = p.x; t.y = p.y; t.size = b.size;
        } else if (t.type === "dim") {
            const p1 = rotatePointAround(b.x1, b.y1, ox, oy, delta);
            const p2 = rotatePointAround(b.x2, b.y2, ox, oy, delta);
            const pp = rotatePointAround(b.px, b.py, ox, oy, delta);
            t.x1 = p1.x; t.y1 = p1.y;
            t.x2 = p2.x; t.y2 = p2.y;
            t.px = pp.x; t.py = pp.y;
            if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
                const tp = rotatePointAround(Number(b.tx), Number(b.ty), ox, oy, delta);
                t.tx = tp.x; t.ty = tp.y;
            }
        } else if (t.type === "dimchain") {
            if (Array.isArray(b.points) && Array.isArray(t.points)) {
                t.points = b.points.map(pt => rotatePointAround(Number(pt.x), Number(pt.y), ox, oy, delta));
            }
            if (Number.isFinite(Number(b.px)) && Number.isFinite(Number(b.py))) {
                const pp = rotatePointAround(Number(b.px), Number(b.py), ox, oy, delta);
                t.px = pp.x; t.py = pp.y;
            }
            if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
                const tp = rotatePointAround(Number(b.tx), Number(b.ty), ox, oy, delta);
                t.tx = tp.x; t.ty = tp.y;
            }
        } else if (t.type === "circleDim") {
            t.ang = normalizeRad((Number(b.ang) || 0) + d);
            if (Number.isFinite(Number(b.tdx)) && Number.isFinite(Number(b.tdy))) {
                const c = Math.cos(d), s = Math.sin(d);
                t.tdx = Number(b.tdx) * c - Number(b.tdy) * s;
                t.tdy = Number(b.tdx) * s + Number(b.tdy) * c;
            }
            if (Number.isFinite(Number(b.tx)) && Number.isFinite(Number(b.ty))) {
                const tp = rotatePointAround(Number(b.tx), Number(b.ty), ox, oy, delta);
                t.tx = tp.x; t.ty = tp.y;
            }
        } else if (t.type === "text") {
            const p = rotatePointAround(b.x1, b.y1, ox, oy, delta);
            t.x1 = p.x; t.y1 = p.y;
            t.textRotate = (Number(b.textRotate) || 0) + delta;
        } else if (t.type === "image") {
            const p = rotatePointAround(Number(b.x), Number(b.y), ox, oy, delta);
            t.x = p.x; t.y = p.y;
            t.rotationDeg = (Number(b.rotationDeg) || 0) + delta;
        } else if (t.type === "bspline") {
            if (Array.isArray(b.controlPoints)) {
                t.controlPoints = b.controlPoints.map((cp) => rotatePointAround(Number(cp?.x), Number(cp?.y), ox, oy, delta));
            }
        }
    }
}

export function endGroupOriginDrag(state) {
    const moved = !!state.input.groupDrag.moved;
    const snap = state.input.groupDrag.modelSnapshotBeforeMove;
    state.input.groupDrag.active = false;
    state.input.groupDrag.startWorldRaw = null;
    state.input.groupDrag.groupId = null;
    state.input.groupDrag.groupIds = null;
    state.input.groupDrag.groupOrigin = null;
    state.input.groupDrag.anchorGroupId = null;
    state.input.groupDrag.anchorGroupOrigin = null;
    state.input.groupDrag.shapeSnapshots = null;
    state.input.groupDrag.groupSnapshots = null;
    state.input.groupDrag.modelSnapshotBeforeMove = null;
    state.input.groupDrag.moved = false;
    return { moved, snapshot: snap };
}

export function endGroupRotateDrag(state) {
    const moved = !!state.input.groupRotate.moved;
    const snap = state.input.groupRotate.modelSnapshotBeforeRotate;
    state.input.groupRotate.active = false;
    state.input.groupRotate.groupId = null;
    state.input.groupRotate.startAngleDeg = 0;
    state.input.groupRotate.startPointerAngleDeg = 0;
    state.input.groupRotate.groupOrigin = null;
    state.input.groupRotate.shapeSnapshots = null;
    state.input.groupRotate.groupSnapshots = null;
    state.input.groupRotate.modelSnapshotBeforeRotate = null;
    state.input.groupRotate.moved = false;
    return { moved, snapshot: snap };
}

export function beginGroupOriginPickDrag(state, group, worldRaw) {
    const gp = state.input.groupOriginPick;
    gp.dragging = true;
    gp.groupId = Number(group.id);
    gp.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    gp.startOrigin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    gp.moved = false;
    gp.modelSnapshotBeforeMove = snapshotModel(state);
}

export function applyGroupOriginPickDrag(state, world) {
    const gp = state.input.groupOriginPick;
    if (!gp.active || !gp.dragging || !gp.startWorldRaw || !gp.startOrigin) return;
    const g = getGroup(state, gp.groupId);
    if (!g) return;

    // app_input 蛛ｴ縺ｧ譌｢縺ｫ繧ｹ繝翫ャ繝励＆繧後◆ world 縺梧ｸ｡縺輔ｌ縺ｦ縺・ｋ蜑肴署
    const targetX = world.x;
    const targetY = world.y;

    if (Math.abs(g.originX - targetX) > 1e-9 || Math.abs(g.originY - targetY) > 1e-9) {
        gp.moved = true;
        g.originX = targetX;
        g.originY = targetY;
    }
}

export function endGroupOriginPickDrag(state) {
    const gp = state.input.groupOriginPick;
    const moved = !!gp.moved;
    const snap = gp.modelSnapshotBeforeMove;
    gp.active = false; // 驟咲ｽｮ螳御ｺ・＠縺溘ｉ繝｢繝ｼ繝臥ｵゆｺ・
    gp.dragging = false;
    gp.groupId = null;
    gp.startWorldRaw = null;
    gp.startOrigin = null;
    gp.moved = false;
    gp.modelSnapshotBeforeMove = null;
    return { moved, snapshot: snap };
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

function sampleBSplinePoints(controlPoints, degreeRaw = 3) {
    const cps = Array.isArray(controlPoints) ? controlPoints
        .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [];
    if (cps.length < 2) return [];
    const degree = Math.max(1, Math.min(Number(degreeRaw) || 3, cps.length - 1));
    const n = cps.length - 1;
    const m = n + degree + 1;
    const knots = new Array(m + 1).fill(0);
    for (let i = 0; i <= m; i++) {
        if (i <= degree) knots[i] = 0;
        else if (i >= m - degree) knots[i] = 1;
        else knots[i] = (i - degree) / (m - 2 * degree);
    }
    const basis = (i, p, u) => {
        if (p === 0) {
            if (u === 1) return i === n ? 1 : 0;
            return (knots[i] <= u && u < knots[i + 1]) ? 1 : 0;
        }
        const d1 = knots[i + p] - knots[i];
        const d2 = knots[i + p + 1] - knots[i + 1];
        const a = d1 > 1e-12 ? ((u - knots[i]) / d1) * basis(i, p - 1, u) : 0;
        const b = d2 > 1e-12 ? ((knots[i + p + 1] - u) / d2) * basis(i + 1, p - 1, u) : 0;
        return a + b;
    };
    const spans = Math.max(1, n - degree + 1);
    const sampleCount = Math.max(24, Math.min(720, spans * 32));
    const out = [];
    for (let s = 0; s <= sampleCount; s++) {
        const u = s / sampleCount;
        let x = 0;
        let y = 0;
        for (let i = 0; i <= n; i++) {
            const w = basis(i, degree, u);
            if (!w) continue;
            x += cps[i].x * w;
            y += cps[i].y * w;
        }
        out.push({ x, y });
    }
    return out;
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
    const tol = 8 / Math.max(1e-9, state.view.scale);
    const pointInImageBounds = (shape, point, margin = 0) => {
        const x = Number(shape?.x), y = Number(shape?.y);
        const w = Math.max(1e-9, Number(shape?.width) || 0);
        const h = Math.max(1e-9, Number(shape?.height) || 0);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(h > 0)) return false;
        const cx = x + w * 0.5;
        const cy = y + h * 0.5;
        const rot = (Number(shape?.rotationDeg) || 0) * Math.PI / 180;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const dx = Number(point.x) - cx;
        const dy = Number(point.y) - cy;
        const lx = dx * cos - dy * sin;
        const ly = dx * sin + dy * cos;
        return (
            lx >= (-w * 0.5 - margin) &&
            lx <= (w * 0.5 + margin) &&
            ly >= (-h * 0.5 - margin) &&
            ly <= (h * 0.5 + margin)
        );
    };
    const visibleLayerSet = new Set((state.layers || []).filter(l => l?.visible !== false).map(l => Number(l.id)).filter(Number.isFinite));
    const lockedLayerSet = new Set((state.layers || []).filter(l => l?.locked === true).map(l => Number(l.id)).filter(Number.isFinite));
    const isLayerVisibleFast = (layerId) => (visibleLayerSet.size ? visibleLayerSet.has(Number(layerId)) : true);
    const isLayerLockedFast = (layerId) => lockedLayerSet.has(Number(layerId));
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
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const s = state.shapes[i];
        if (!isLayerVisibleFast(s.layerId)) continue;
        if (isLayerLockedFast(s.layerId)) continue;
        if (!isGroupVisible(state, resolveGroupId(s))) continue;
        if (state.ui?.layerView?.editOnlyActive && Number(s.layerId ?? state.activeLayerId) !== Number(state.activeLayerId)) continue;
        if (s.type === "line" && hitTestLine(world, s, tol)) return s;
        if (s.type === "bspline") {
            const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
            for (let pi = 1; pi < sampled.length; pi++) {
                const a = sampled[pi - 1];
                const b = sampled[pi];
                if (distancePointToSegment(world, a, b) <= tol) return s;
            }
        }
        if (s.type === "rect") {
            const xMin = Math.min(Number(s.x1), Number(s.x2)), xMax = Math.max(Number(s.x1), Number(s.x2));
            const yMin = Math.min(Number(s.y1), Number(s.y2)), yMax = Math.max(Number(s.y1), Number(s.y2));
            if (hitTestLine(world, { x1: xMin, y1: yMin, x2: xMax, y2: yMin }, tol) ||
                hitTestLine(world, { x1: xMax, y1: yMin, x2: xMax, y2: yMax }, tol) ||
                hitTestLine(world, { x1: xMax, y1: yMax, x2: xMin, y2: yMax }, tol) ||
                hitTestLine(world, { x1: xMin, y1: yMax, x2: xMin, y2: yMin }, tol)) return s;
        }
        if (s.type === "circle") {
            const d = Math.hypot(world.x - Number(s.cx), world.y - Number(s.cy));
            const r = Math.abs(Number(s.r) || 0);
            if (Math.abs(d - r) <= tol) return s;
            if (s.showCenterMark) {
                if (d <= Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
            }
        }
        if (s.type === "arc") {
            const dx = Number(world.x) - Number(s.cx);
            const dy = Number(world.y) - Number(s.cy);
            const d = Math.hypot(dx, dy);
            if (s.showCenterMark) {
                if (d <= Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
            }
            const r = Math.abs(Number(s.r) || 0);
            if (r > 1e-9 && Math.abs(d - r) <= tol) {
                const th = Math.atan2(dy, dx);
                if (isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) return s;
            }
        }
        if (s.type === "position") {
            const d = Math.hypot(world.x - s.x, world.y - s.y);
            if (d <= Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
        }
        if (s.type === "dim") {
            const vx = s.x2 - s.x1, vy = s.y2 - s.y1;
            const len = Math.hypot(vx, vy);
            if (len > 1e-9) {
                const tx = vx / len, ty = vy / len;
                const nx = -ty, ny = tx;
                const off = (Number(s.px) - s.x1) * nx + (Number(s.py) - s.y1) * ny;
                const d1 = { x: s.x1 + nx * off, y: s.y1 + ny * off };
                const d2 = { x: s.x2 + nx * off, y: s.y2 + ny * off };
                if (hitTestLine(world, { x1: s.x1, y1: s.y1, x2: d1.x, y2: d1.y }, tol)) return s;
                if (hitTestLine(world, { x1: s.x2, y1: s.y2, x2: d2.x, y2: d2.y }, tol)) return s;
                if (hitTestLine(world, { x1: d1.x, y1: d1.y, x2: d2.x, y2: d2.y }, tol)) return s;
            }
        }
        if (s.type === "dimchain") {
            const geom = getDimChainGeometry(s);
            if (geom) {
                for (const seg of geom.segments) {
                    if (hitTestLine(world, { x1: seg.x1, y1: seg.y1, x2: seg.d1.x, y2: seg.d1.y }, tol)) return s;
                    if (hitTestLine(world, { x1: seg.x2, y1: seg.y2, x2: seg.d2.x, y2: seg.d2.y }, tol)) return s;
                    if (hitTestLine(world, { x1: seg.d1.x, y1: seg.d1.y, x2: seg.d2.x, y2: seg.d2.y }, tol)) return s;
                }
            }
        }
        if (s.type === "dimangle") {
            const g = getDimAngleGeometry(s, state.shapes);
            const cx = Number(g?.cx), cy = Number(g?.cy), r = Number(g?.r);
            if (r > 0) {
                const d = Math.hypot(world.x - cx, world.y - cy);
                if (Math.abs(d - r) < tol) return s;
            }
        }
        if (s.type === "circleDim") {
            const g = getCircleDimGeometry(s, state.shapes);
            if (g) {
                if (hitTestLine(world, { x1: g.p1.x, y1: g.p1.y, x2: g.p2.x, y2: g.p2.y }, tol)) return s;
                if (Math.hypot(world.x - g.tx, world.y - g.ty) < Math.max(tol, 12 / Math.max(1e-9, state.view.scale))) return s;
            }
        }
        if (s.type === "text") {
            const p1 = { x: Number(s.x1), y: Number(s.y1) };
            const txt = String(s.text || "");
            const sizePx = (Number(s.textSizePt) || 12) * 1.33;
            const rDeg = Number(s.textRotate) || 0;
            const tctx = dom?.canvas?.getContext?.("2d");
            if (!tctx) continue;
            tctx.save();
            const isBold = !!s.textBold;
            const isItalic = !!s.textItalic;
            const fontFamily = s.textFontFamily || "Yu Gothic UI";
            tctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${sizePx}px "${fontFamily}"`;
            const w = tctx.measureText(txt).width;
            tctx.restore();
            const h = sizePx;
            const rRad = rDeg * Math.PI / 180;
            const cos = Math.cos(rRad), sin = Math.sin(rRad);
            // Hit-test in screen space so tiny text remains easy to pick at any zoom.
            const scale = Math.max(1e-9, Number(state.view?.scale) || 1);
            const p1sx = p1.x * scale + Number(state.view?.offsetX || 0);
            const p1sy = p1.y * scale + Number(state.view?.offsetY || 0);
            const wsx = world.x * scale + Number(state.view?.offsetX || 0);
            const wsy = world.y * scale + Number(state.view?.offsetY || 0);
            const dx = wsx - p1sx, dy = wsy - p1sy;
            const rx = dx * cos + dy * sin;
            const ry = -dx * sin + dy * cos;
            const pickPadPx = 10;
            const minPickWpx = 28;
            const minPickHpx = 22;
            const wPx = Math.max(minPickWpx, Number(w) || 0);
            const hHalfPx = Math.max(minPickHpx * 0.5, Number(h) * 0.5 || 0);
            if (
                rx >= -pickPadPx &&
                rx <= (wPx + pickPadPx) &&
                ry >= (-hHalfPx - pickPadPx) &&
                ry <= (hHalfPx + pickPadPx)
            ) return s;
        }
        if (s.type === "image") {
            if (pointInImageBounds(s, world, tol)) return s;
        }
        if (s.type === "hatch") {
            if (isPointInHatch(state.shapes, s, world, state.view.scale)) return s;
        }
    }
    return null;
}

export function hitTestDimHandle(state, worldRaw) {
    if (state.tool !== "select") return null;
    const tol = 10 / Math.max(1e-9, state.view.scale);
    const dimMmToWorld = (mm) => {
        const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
        const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
        return Math.max(0, Number(mm) || 0) * pageScale / Math.max(1e-9, unitMm);
    };
    const selectedIds = new Set((state.selection.ids || []).map(Number));
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const s = state.shapes[i];
        if (!s || (s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim")) continue;
        if (!selectedIds.has(Number(s.id))) continue;
        if (!isLayerVisible(state, s.layerId)) continue;
        const part = hitTestDimPart(s, worldRaw.x, worldRaw.y, state.shapes, state.view.scale);
        if (part) return { id: Number(s.id), dim: s, part };
        if (s.type === "dim") {
            const g = getDimGeometry(s);
            if (g) {
                const extOffWorld = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
                const defaultVisWorld = Math.max(0, Math.abs(Number(g.off) || 0) - extOffWorld);
                const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
                const sign = Math.sign(Number(g.off) || 0) || 1;
                const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
                const vis1 = Number.isFinite(Number(visLens[0])) ? Math.max(0, Number(visLens[0])) : defaultVisWorld;
                const vis2 = Number.isFinite(Number(visLens[1])) ? Math.max(0, Number(visLens[1])) : defaultVisWorld;
                const hp1 = { x: Number(g.d1.x) - enx * vis1, y: Number(g.d1.y) - eny * vis1 };
                const hp2 = { x: Number(g.d2.x) - enx * vis2, y: Number(g.d2.y) - eny * vis2 };
                if (Math.hypot(worldRaw.x - hp1.x, worldRaw.y - hp1.y) < tol) return { id: Number(s.id), dim: s, part: "extVisDim:0" };
                if (Math.hypot(worldRaw.x - hp2.x, worldRaw.y - hp2.y) < tol) return { id: Number(s.id), dim: s, part: "extVisDim:1" };
            }
        }
        if (s.type === "dimchain") {
            const g = getDimChainGeometry(s);
            if (g && Array.isArray(g.dimPoints) && Array.isArray(s.points) && g.dimPoints.length === s.points.length) {
                const extOffWorld = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
                const defaultVisWorld = Math.max(0, Math.abs(Number(g.off) || 0) - extOffWorld);
                const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
                const sign = Math.sign(Number(g.off) || 0) || 1;
                const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
                for (let i = 0; i < g.dimPoints.length; i++) {
                    const dpt = g.dimPoints[i];
                    const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVisWorld;
                    const hp = { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis };
                    if (Math.hypot(worldRaw.x - hp.x, worldRaw.y - hp.y) < tol) return { id: Number(s.id), dim: s, part: `extVis:${i}` };
                }
            }
        }
    }
    return null;
}

export function beginDimHandleDrag(state, hit, worldRaw = null) {
    const dim = hit?.dim || hit;
    state.input.dimHandleDrag.active = true;
    state.input.dimHandleDrag.dimId = Number(dim.id);
    state.input.dimHandleDrag.part = String(hit?.part || "line");
    state.input.dimHandleDrag.modelSnapshotBeforeMove = snapshotModel(state);
    state.input.dimHandleDrag.moved = false;
    state.input.dimHandleDrag.lastWorld = worldRaw ? { x: Number(worldRaw.x) || 0, y: Number(worldRaw.y) || 0 } : null;
}

export function applyDimHandleDrag(state, worldRaw) {
    const dd = state.input.dimHandleDrag;
    if (!dd.active) return;
    const dim = state.shapes.find(s => s && (s.id === dd.dimId || Number(s.id) === Number(dd.dimId)));
    if (!dim) return;
    const p = state.grid.snap ? snapPoint(worldRaw, getEffectiveGridSize(state.grid, state.view, state.pageSetup)) : worldRaw;
    const objectSnapPoint = getObjectSnapPoint(state, worldRaw, () => state.objectSnap?.enabled !== false);
    const pSnap = objectSnapPoint || p;
    const projectPointToAxis = (base, axis, point) => {
        const ax = Number(axis?.x) || 0;
        const ay = Number(axis?.y) || 0;
        const alen = Math.hypot(ax, ay);
        if (alen < 1e-9) return { x: Number(base?.x) || 0, y: Number(base?.y) || 0 };
        const ux = ax / alen, uy = ay / alen;
        const bx = Number(base?.x) || 0, by = Number(base?.y) || 0;
        const t = (point.x - bx) * ux + (point.y - by) * uy;
        return { x: bx + ux * t, y: by + uy * t };
    };
    const dimPtToWorld = (pt) => {
        const mm = Math.max(0, Number(pt) || 0) * (25.4 / 72);
        const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
        const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
        return mm * pageScale / Math.max(1e-9, unitMm);
    };
    const alignDimChainTargets = (d) => {
        if (!d || !Array.isArray(d.points) || d.points.length < 2) return;
        const p0 = d.points[0];
        const pN = d.points[d.points.length - 1];
        const uxRaw = Number(pN.x) - Number(p0.x);
        const uyRaw = Number(pN.y) - Number(p0.y);
        const uLen = Math.hypot(uxRaw, uyRaw);
        if (uLen < 1e-9) return;
        const ux = uxRaw / uLen, uy = uyRaw / uLen;
        const bx = Number(p0.x), by = Number(p0.y);
        for (let i = 1; i < d.points.length - 1; i++) {
            const pt = d.points[i];
            const t = (Number(pt.x) - bx) * ux + (Number(pt.y) - by) * uy;
            pt.x = bx + ux * t;
            pt.y = by + uy * t;
        }
    };

    if (dim.type === 'dim') {
        if (dd.part === 'text') {
            const g0 = getDimGeometry(dim);
            if (g0) {
                const nx = Number(g0.nx), ny = Number(g0.ny);
                const mx = Number(g0.allCtrl.x);
                const my = Number(g0.allCtrl.y);
                const base = {
                    x: (Number.isFinite(Number(dim.tdx)) && Number.isFinite(Number(dim.tdy)))
                        ? (mx + Number(dim.tdx))
                        : (Number.isFinite(Number(dim.tx)) ? Number(dim.tx) : mx),
                    y: (Number.isFinite(Number(dim.tdx)) && Number.isFinite(Number(dim.tdy)))
                        ? (my + Number(dim.tdy))
                        : (Number.isFinite(Number(dim.ty)) ? Number(dim.ty) : my)
                };
                const constrained = projectPointToAxis(base, { x: nx, y: ny }, p);
                dim.tx = constrained.x;
                dim.ty = constrained.y;
                dim.tdx = constrained.x - mx;
                dim.tdy = constrained.y - my;
            } else {
                dim.tx = p.x; dim.ty = p.y;
            }
        }
        else if (dd.part === 'p1') { dim.x1 = p.x; dim.y1 = p.y; }
        else if (dd.part === 'p2') { dim.x2 = p.x; dim.y2 = p.y; }
        else if (dd.part === 'all') {
            const prev = dd.lastWorld || pSnap;
            const dx = pSnap.x - Number(prev.x || 0);
            const dy = pSnap.y - Number(prev.y || 0);
            if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                dim.x1 = Number(dim.x1) + dx; dim.y1 = Number(dim.y1) + dy;
                dim.x2 = Number(dim.x2) + dx; dim.y2 = Number(dim.y2) + dy;
                dim.px = Number(dim.px) + dx; dim.py = Number(dim.py) + dy;
                if (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))) {
                    dim.tx = Number(dim.tx) + dx;
                    dim.ty = Number(dim.ty) + dy;
                }
            }
        }
        else if (dd.part === 'target1' || dd.part === 'target2') {
            const os = getObjectSnapPoint(state, worldRaw, () => true);
            const tp = os || p;
            if (dd.part === 'target1') { dim.x1 = tp.x; dim.y1 = tp.y; }
            else { dim.x2 = tp.x; dim.y2 = tp.y; }
        }
        else if (dd.part === 'place') {
            dim.px = pSnap.x; dim.py = pSnap.y;
        }
        else if (dd.part.startsWith("extVisDim:")) {
            const idx = parseInt(dd.part.substring(10), 10);
            const g = getDimGeometry(dim);
            if (!isNaN(idx) && g && (idx === 0 || idx === 1)) {
                const sign = Math.sign(Number(g.off) || 0) || 1;
                const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
                const anchor = (idx === 0) ? g.d1 : g.d2;
                const dist = Math.max(0, (Number(anchor.x) - pSnap.x) * enx + (Number(anchor.y) - pSnap.y) * eny);
                if (!Array.isArray(dim.extVisLens)) dim.extVisLens = [];
                dim.extVisLens[idx] = dist;
            }
        }
        else if (dd.part === 'edge') { dim.x2 = p.x; dim.y2 = p.y; }
        else { dim.px = p.x; dim.py = p.y; }
    } else if (dim.type === 'dimchain') {
        if (dd.part === 'text') {
            const g = getDimChainGeometry(dim);
            if (g) {
                const chainMid = g.chainMid || { x: 0, y: 0 };
                const defaultOff = dimPtToWorld(Math.max(1, Number(dim.fontSize ?? 12) || 12));
                const mx = Number(chainMid.x) + Number(g.nx) * defaultOff;
                const my = Number(chainMid.y) + Number(g.ny) * defaultOff;
                const base = {
                    x: Number.isFinite(Number(dim.tx)) ? Number(dim.tx) : mx,
                    y: Number.isFinite(Number(dim.ty)) ? Number(dim.ty) : my
                };
                const constrained = projectPointToAxis(base, { x: Number(g.nx), y: Number(g.ny) }, p);
                dim.tx = constrained.x;
                dim.ty = constrained.y;
            } else {
                dim.tx = p.x; dim.ty = p.y;
            }
        }
        else if (dd.part.startsWith('p:')) {
            const idx = parseInt(dd.part.substring(2), 10);
            if (!isNaN(idx) && dim.points && dim.points[idx]) {
                dim.points[idx].x = pSnap.x; dim.points[idx].y = pSnap.y;
                alignDimChainTargets(dim);
            }
        }
        else if (dd.part.startsWith('target:')) {
            const idx = parseInt(dd.part.substring(7), 10);
            if (!isNaN(idx) && dim.points && dim.points[idx]) {
                dim.points[idx].x = pSnap.x; dim.points[idx].y = pSnap.y;
                alignDimChainTargets(dim);
            }
        }
        else if (dd.part === "all") {
            const prev = dd.lastWorld || pSnap;
            const dx = pSnap.x - Number(prev.x || 0);
            const dy = pSnap.y - Number(prev.y || 0);
            if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                for (const pt of (dim.points || [])) {
                    pt.x = Number(pt.x) + dx;
                    pt.y = Number(pt.y) + dy;
                }
                dim.px = Number(dim.px || 0) + dx;
                dim.py = Number(dim.py || 0) + dy;
                if (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))) {
                    dim.tx = Number(dim.tx) + dx;
                    dim.ty = Number(dim.ty) + dy;
                }
            }
        }
        else if (dd.part.startsWith("extVis:")) {
            const idx = parseInt(dd.part.substring(7), 10);
            const g = getDimChainGeometry(dim);
            if (!isNaN(idx) && g && Array.isArray(g.dimPoints) && g.dimPoints[idx]) {
                const sign = Math.sign(Number(g.off) || 0) || 1;
                const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
                const anchor = g.dimPoints[idx];
                const dist = Math.max(0, (Number(anchor.x) - pSnap.x) * enx + (Number(anchor.y) - pSnap.y) * eny);
                if (!Array.isArray(dim.extVisLens)) dim.extVisLens = [];
                dim.extVisLens[idx] = dist;
            }
        }
        else if (dd.part === "line" || dd.part === "place") { dim.px = pSnap.x; dim.py = pSnap.y; }
        else { dim.px = pSnap.x; dim.py = pSnap.y; }
    } else if (dim.type === 'dimangle') {
        const g = getDimAngleGeometry(dim, state.shapes);
        if (g) {
            if (dd.part === 'text') {
                const off = Math.max(Number(g.r) + 1e-6, (pSnap.x - Number(g.cx)) * Number(g.ux) + (pSnap.y - Number(g.cy)) * Number(g.uy));
                dim.textOffset = off;
                dim.tx = Number(g.cx) + Number(g.ux) * off;
                dim.ty = Number(g.cy) + Number(g.uy) * off;
            } else if (dd.part === "radius" || dd.part === "line" || dd.part === "place") {
                const nr = Math.max(1e-6, (pSnap.x - Number(g.cx)) * Number(g.ux) + (pSnap.y - Number(g.cy)) * Number(g.uy));
                dim.r = nr;
                if (Number.isFinite(Number(dim.textOffset))) {
                    dim.textOffset = Math.max(nr + 1e-6, Number(dim.textOffset));
                }
            }
        }
    } else if (dim.type === 'circleDim') {
        const g = getCircleDimGeometry(dim, state.shapes);
        if (g) {
            if (dd.part === 'pArc') {
                // pArc is on the circle, so it determines the angle.
                // Constraint: Ignore snap panel for this handle as requested.
                // worldRaw is the unsnapped point.
                const ang = Math.atan2(worldRaw.y - g.cy, worldRaw.x - g.cx);
                dim.ang = ang;
            } else if (dd.part === 'centerCtrl') {
                // Follow-target-center controller is driven by the target circle and is not freely draggable.
                return;
            } else if (dd.part === 'off1' || dd.part === 'off2') {
                // Project p onto the line defined by ang
                const ux = Math.cos(g.ang), uy = Math.sin(g.ang);
                const dist = (p.x - g.cx) * ux + (p.y - g.cy) * uy;
                if (dd.part === 'off1') dim.off1 = dist;
                else dim.off2 = dist;
            } else if (dd.part === 'text') {
                // circleDim text position: free 2D move (no axis lock).
                dim.tdx = Number(p.x) - Number(g.cx);
                dim.tdy = Number(p.y) - Number(g.cy);
                dim.tx = Number(p.x);
                dim.ty = Number(p.y);
            }
        }
    }
    dd.lastWorld = { x: pSnap.x, y: pSnap.y };
    dd.moved = true;
}

export function endDimHandleDrag(state) {
    const dd = state.input.dimHandleDrag;
    const moved = !!dd.moved;
    const snapshot = dd.modelSnapshotBeforeMove;
    dd.active = false;
    dd.dimId = null;
    dd.part = null;
    dd.modelSnapshotBeforeMove = null;
    dd.moved = false;
    dd.lastWorld = null;
    return { moved, snapshot };
}

export function beginSelectionBox(state, screen, additive) {
    state.selection.box.active = true;
    state.selection.box.additive = !!additive;
    state.selection.box.startScreen = { x: screen.x, y: screen.y };
    state.selection.box.currentScreen = { x: screen.x, y: screen.y };
}

export function updateSelectionBox(state, screen) {
    if (!state.selection.box.active) return;
    state.selection.box.currentScreen = { x: screen.x, y: screen.y };
}

export function endSelectionBox(state, helpers) {
    const { setStatus } = helpers;
    const box = state.selection.box;
    if (!box.active || !box.startScreen || !box.currentScreen) {
        box.active = false;
        return false;
    }
    const xMin = Math.min(box.startScreen.x, box.currentScreen.x);
    const xMax = Math.max(box.startScreen.x, box.currentScreen.x);
    const yMin = Math.min(box.startScreen.y, box.currentScreen.y);
    const yMax = Math.max(box.startScreen.y, box.currentScreen.y);
    const dragged = (xMax - xMin > 4 || yMax - yMin > 4);

    if (dragged) {
        const leftToRight = box.currentScreen.x >= box.startScreen.x;
        const pMin = screenToWorld(state.view, { x: xMin, y: yMin });
        const pMax = screenToWorld(state.view, { x: xMax, y: yMax });
        const wx1 = pMin.x, wy1 = pMin.y, wx2 = pMax.x, wy2 = pMax.y;

        const aabbFromPoints = (pts) => {
            const valid = (pts || []).filter(p => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
            if (!valid.length) return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of valid) {
                const x = Number(p.x), y = Number(p.y);
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
            return { minX, minY, maxX, maxY };
        };
        const getImageCorners = (s) => {
            const corners = getImageCornersWorld(s);
            if (!corners) return [];
            return [corners.tl, corners.tr, corners.br, corners.bl];
        };
        const boxCorners = [
            { x: wx1, y: wy1 },
            { x: wx2, y: wy1 },
            { x: wx2, y: wy2 },
            { x: wx1, y: wy2 },
        ];
        const boxEdges = [
            [boxCorners[0], boxCorners[1]],
            [boxCorners[1], boxCorners[2]],
            [boxCorners[2], boxCorners[3]],
            [boxCorners[3], boxCorners[0]],
        ];
        const pointInRect = (p) => Number(p.x) >= wx1 && Number(p.x) <= wx2 && Number(p.y) >= wy1 && Number(p.y) <= wy2;
        const pointInPolygon = (p, poly) => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = Number(poly[i]?.x), yi = Number(poly[i]?.y);
                const xj = Number(poly[j]?.x), yj = Number(poly[j]?.y);
                const intersects = ((yi > p.y) !== (yj > p.y))
                    && (p.x < ((xj - xi) * (p.y - yi)) / Math.max(1e-12, (yj - yi)) + xi);
                if (intersects) inside = !inside;
            }
            return inside;
        };

        const getDimLikeBounds = (s) => {
            if (!s) return null;
            if (s.type === "dim") {
                return aabbFromPoints([
                    { x: Number(s.x1), y: Number(s.y1) },
                    { x: Number(s.x2), y: Number(s.y2) },
                    { x: Number(s.px), y: Number(s.py) },
                    (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) ? { x: Number(s.tx), y: Number(s.ty) } : null
                ]);
            }
            if (s.type === "dimchain") {
                const g = getDimChainGeometry(s);
                if (!g) return null;
                const pts = []
                    .concat(Array.isArray(s.points) ? s.points : [])
                    .concat(Array.isArray(g.dimPoints) ? g.dimPoints : [])
                    .concat(Array.isArray(g.segments) ? g.segments.flatMap(seg => [seg?.d1, seg?.d2]) : [])
                    .concat((Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) ? [{ x: Number(s.tx), y: Number(s.ty) }] : []);
                return aabbFromPoints(pts);
            }
            if (s.type === "circleDim") {
                const g = getCircleDimGeometry(s, state.shapes || []);
                if (!g) return null;
                const c1 = { x: Number(g.cx) + Number(g.ux) * Number(g.r), y: Number(g.cy) + Number(g.uy) * Number(g.r) };
                const c2 = { x: Number(g.cx) - Number(g.ux) * Number(g.r), y: Number(g.cy) - Number(g.uy) * Number(g.r) };
                return aabbFromPoints([g.p1, g.p2, c1, c2, { x: Number(g.tx), y: Number(g.ty) }]);
            }
            if (s.type === "dimangle") {
                const g = getDimAngleGeometry(s, state.shapes || []);
                if (!g) return null;
                const p1 = { x: Number(g.cx) + Math.cos(Number(g.a1)) * Number(g.r), y: Number(g.cy) + Math.sin(Number(g.a1)) * Number(g.r) };
                const p2 = { x: Number(g.cx) + Math.cos(Number(g.a2)) * Number(g.r), y: Number(g.cy) + Math.sin(Number(g.a2)) * Number(g.r) };
                return aabbFromPoints([p1, p2, { x: Number(g.cx), y: Number(g.cy) }, { x: Number(g.tx), y: Number(g.ty) }]);
            }
            return null;
        };

        const isInside = (s) => {
            const dimBounds = getDimLikeBounds(s);
            if (dimBounds) {
                return (dimBounds.minX >= wx1 && dimBounds.maxX <= wx2 && dimBounds.minY >= wy1 && dimBounds.maxY <= wy2);
            }
            if (s.type === "line") {
                return (s.x1 >= wx1 && s.x1 <= wx2 && s.y1 >= wy1 && s.y1 <= wy2) &&
                    (s.x2 >= wx1 && s.x2 <= wx2 && s.y2 >= wy1 && s.y2 <= wy2);
            }
            if (s.type === "rect") {
                const sxMin = Math.min(s.x1, s.x2), sxMax = Math.max(s.x1, s.x2);
                const syMin = Math.min(s.y1, s.y2), syMax = Math.max(s.y1, s.y2);
                return (sxMin >= wx1 && sxMax <= wx2 && syMin >= wy1 && syMax <= wy2);
            }
            if (s.type === "circle" || s.type === "arc") {
                return (s.cx - s.r >= wx1 && s.cx + s.r <= wx2 && s.cy - s.r >= wy1 && s.cy + s.r <= wy2);
            }
            if (s.type === "position") {
                return (s.x >= wx1 && s.x <= wx2 && s.y >= wy1 && s.y <= wy2);
            }
            if (s.type === "text") {
                return (s.x1 >= wx1 && s.x1 <= wx2 && s.y1 >= wy1 && s.y1 <= wy2);
            }
            if (s.type === "image") {
                const corners = getImageCorners(s);
                if (!corners.length) return false;
                return corners.every(pointInRect);
            }
            if (s.type === "bspline") {
                const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
                if (!sampled.length) return false;
                return sampled.every((p) => Number(p.x) >= wx1 && Number(p.x) <= wx2 && Number(p.y) >= wy1 && Number(p.y) <= wy2);
            }
            return false;
        };

        const isCrossing = (s) => {
            const dimBounds = getDimLikeBounds(s);
            if (dimBounds) {
                return !(dimBounds.maxX < wx1 || dimBounds.minX > wx2 || dimBounds.maxY < wy1 || dimBounds.minY > wy2);
            }
            if (s.type === "line") {
                const lxMin = Math.min(s.x1, s.x2), lxMax = Math.max(s.x1, s.x2);
                const lyMin = Math.min(s.y1, s.y2), lyMax = Math.max(s.y1, s.y2);
                if (lxMax < wx1 || lxMin > wx2 || lyMax < wy1 || lyMin > wy2) return false;
                const boxEdges = [
                    [{ x: wx1, y: wy1 }, { x: wx2, y: wy1 }],
                    [{ x: wx2, y: wy1 }, { x: wx2, y: wy2 }],
                    [{ x: wx2, y: wy2 }, { x: wx1, y: wy2 }],
                    [{ x: wx1, y: wy2 }, { x: wx1, y: wy1 }]
                ];
                const p1 = { x: s.x1, y: s.y1 }, p2 = { x: s.x2, y: s.y2 };
                if (isInside(s)) return true;
                return boxEdges.some(edge => segmentIntersectionPoint(p1, p2, edge[0], edge[1]));
            }
            if (s.type === "rect") {
                const sxMin = Math.min(s.x1, s.x2), sxMax = Math.max(s.x1, s.x2);
                const syMin = Math.min(s.y1, s.y2), syMax = Math.max(s.y1, s.y2);
                return !(sxMax < wx1 || sxMin > wx2 || syMax < wy1 || syMin > wy2);
            }
            if (s.type === "circle") {
                const distSq = (px, py) => (px - s.cx) ** 2 + (py - s.cy) ** 2;
                const rSq = s.r ** 2;
                if (s.cx + s.r < wx1 || s.cx - s.r > wx2 || s.cy + s.r < wy1 || s.cy - s.r > wy2) return false;
                if (s.cx >= wx1 && s.cx <= wx2 && s.cy >= wy1 && s.cy <= wy2) return true;
                if (distSq(wx1, wy1) <= rSq || distSq(wx2, wy1) <= rSq || distSq(wx2, wy2) <= rSq || distSq(wx1, wy2) <= rSq) return true;
                const edges = [
                    { a: { x: wx1, y: wy1 }, b: { x: wx2, y: wy1 } },
                    { a: { x: wx2, y: wy1 }, b: { x: wx2, y: wy2 } },
                    { a: { x: wx2, y: wy2 }, b: { x: wx1, y: wy2 } },
                    { a: { x: wx1, y: wy2 }, b: { x: wx1, y: wy1 } }
                ];
                return edges.some(e => segmentCircleIntersectionPoints(e.a, e.b, s).length > 0);
            }
            if (s.type === "arc") {
                return !(s.cx + s.r < wx1 || s.cx - s.r > wx2 || s.cy + s.r < wy1 || s.cy - s.r > wy2);
            }
            if (s.type === "position") { return s.x >= wx1 && s.x <= wx2 && s.y >= wy1 && s.y <= wy2; }
            if (s.type === "text") { return !(s.x1 > wx2 || s.x1 < wx1 || s.y1 > wy2 || s.y1 < wy1); }
            if (s.type === "image") {
                const corners = getImageCorners(s);
                if (!corners.length) return false;
                const aabb = aabbFromPoints(corners);
                if (!aabb || aabb.maxX < wx1 || aabb.minX > wx2 || aabb.maxY < wy1 || aabb.minY > wy2) return false;
                if (corners.some(pointInRect)) return true;
                if (boxCorners.some((p) => pointInPolygon(p, corners))) return true;
                const imgEdges = [
                    [corners[0], corners[1]],
                    [corners[1], corners[2]],
                    [corners[2], corners[3]],
                    [corners[3], corners[0]],
                ];
                for (const ie of imgEdges) {
                    for (const be of boxEdges) {
                        if (segmentIntersectionPoint(ie[0], ie[1], be[0], be[1])) return true;
                    }
                }
                return false;
            }
            if (s.type === "bspline") {
                const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
                if (sampled.length < 2) return false;
                const edges = [
                    [{ x: wx1, y: wy1 }, { x: wx2, y: wy1 }],
                    [{ x: wx2, y: wy1 }, { x: wx2, y: wy2 }],
                    [{ x: wx2, y: wy2 }, { x: wx1, y: wy2 }],
                    [{ x: wx1, y: wy2 }, { x: wx1, y: wy1 }]
                ];
                for (let i = 1; i < sampled.length; i++) {
                    const p1 = sampled[i - 1];
                    const p2 = sampled[i];
                    const minX = Math.min(Number(p1.x), Number(p2.x));
                    const maxX = Math.max(Number(p1.x), Number(p2.x));
                    const minY = Math.min(Number(p1.y), Number(p2.y));
                    const maxY = Math.max(Number(p1.y), Number(p2.y));
                    if (maxX < wx1 || minX > wx2 || maxY < wy1 || minY > wy2) continue;
                    if ((Number(p1.x) >= wx1 && Number(p1.x) <= wx2 && Number(p1.y) >= wy1 && Number(p1.y) <= wy2)
                        || (Number(p2.x) >= wx1 && Number(p2.x) <= wx2 && Number(p2.y) >= wy1 && Number(p2.y) <= wy2)) return true;
                    if (edges.some((e) => segmentIntersectionPoint(p1, p2, e[0], e[1]))) return true;
                }
                return false;
            }
            if (s.type === "hatch") {
                const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, s.boundaryIds || [], state.view.scale);
                if (parsed.ok && parsed.bounds) {
                    const b = parsed.bounds;
                    return !(b.maxX < wx1 || b.minX > wx2 || b.maxY < wy1 || b.minY > wy2);
                }
            }
            return false;
        };

        const picked = [];
        for (const s of state.shapes) {
            if (!isLayerVisible(state, s.layerId)) continue;
            if (isLayerLocked(state, s.layerId)) continue;
            if (state.ui?.layerView?.editOnlyActive && Number(s.layerId ?? state.activeLayerId) !== Number(state.activeLayerId)) continue;
            if (leftToRight ? isInside(s) : isCrossing(s)) {
                picked.push(Number(s.id));
            }
        }

        if (state.tool === "hatch") {
            const valid = picked.filter(id => isHatchBoundaryShape(state.shapes.find(sh => sh.id === id)));
            if (box.additive) state.hatchDraft.boundaryIds = Array.from(new Set([...state.hatchDraft.boundaryIds, ...valid]));
            else state.hatchDraft.boundaryIds = valid;
            if (setStatus) setStatus(`Hatch: 蠅・阜繧・${state.hatchDraft.boundaryIds.length} 蛟矩∈謚樔ｸｭ`);
        } else {
            const pickMode = String(state.ui?.selectPickMode || "object");
            if (pickMode === "group") {
                const byId = new Map((state.shapes || []).map(s => [Number(s.id), s]));
                const pickedGroupIds = new Set();
                for (const sid of picked) {
                    const s = byId.get(Number(sid));
                    const gid = Number(s?.groupId);
                    if (Number.isFinite(gid)) pickedGroupIds.add(gid);
                }
                const nextGroupIds = box.additive
                    ? Array.from(new Set([...(state.selection?.groupIds || []).map(Number), ...pickedGroupIds]))
                    : Array.from(pickedGroupIds);
                const nextShapeIds = new Set();
                for (const gid of nextGroupIds) {
                    for (const sid of collectGroupTreeShapeIds(state, gid)) nextShapeIds.add(Number(sid));
                }
                setSelection(state, Array.from(nextShapeIds));
                state.selection.groupIds = nextGroupIds.map(Number).filter(Number.isFinite);
                state.activeGroupId = state.selection.groupIds.length
                    ? Number(state.selection.groupIds[state.selection.groupIds.length - 1])
                    : null;
                if (setStatus) setStatus(`Selected ${state.selection.groupIds.length} group(s) (${leftToRight ? "Window" : "Crossing"})`);
            } else {
                if (box.additive) {
                    const cur = new Set(state.selection.ids.map(Number));
                    for (const id of picked) cur.add(id);
                    setSelection(state, Array.from(cur));
                } else {
                    setSelection(state, picked);
                }
                if (setStatus) setStatus(`Selected ${picked.length} object(s) (${leftToRight ? "Window" : "Crossing"})`);
            }
        }
    } else {
        // 蜊倅ｸ繧ｯ繝ｪ繝・け縺九▽ Shift 辟｡縺励・蝣ｴ蜷医・驕ｸ謚櫁ｧ｣髯､
        if (!box.additive) {
            setSelection(state, []);
            state.activeGroupId = null; // 閭梧勹繧ｯ繝ｪ繝・け縺ｧ繧ｰ繝ｫ繝ｼ繝励・繧｢繧ｯ繝・ぅ繝也憾諷九ｂ隗｣髯､
        }
    }

    box.active = false;
    box.additive = false;
    box.startScreen = null;
    box.currentScreen = null;
    return dragged;
}

export function getTrimHoverCandidate(state, worldRaw, dom) {
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

export function getTrimHoverCandidateForArc(state, worldRaw, arc) {
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

    const angleAtParam = (u) => ccwArc ? normalizeRad(a1Arc + u / r) : normalizeRad(a1Arc - u / r);
    // Note: arcParamAlong used r internally or just radians?
    // Actually simplicity: arcParamAlong(ang, a1, a2, ccw) follows the arc.
    // Let's use a more robust way to get ang from u:
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

export function getTrimHoverCandidateForCircle(state, worldRaw, circle) {
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
            // Wrap-around aware dedup: treat angles near 0 and near 2ﾏ as the same
            if (Math.min(diff, Math.PI * 2 - diff) <= 1e-7) continue;
        }
        dedup.push(p);
    }
    // Also check wrap-around between first and last (circular list)
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
    // Guard: same point (direct or wrap-around)
    const angDiff = Math.abs(prev.ang - next.ang);
    if (Math.min(angDiff, Math.PI * 2 - angDiff) <= 1e-7) return null;
    // Guard: removed arc must be large enough to be meaningful (matches arc trim threshold)
    const removedSpan = ((next.ang - prev.ang) + Math.PI * 2) % (Math.PI * 2);
    if (removedSpan < 1e-5) return null;
    return { targetType: "circle", circle, mode: "arc-remove-arc", x1: prev.x, y1: prev.y, x2: next.x, y2: next.y, remA1: prev.ang, remA2: next.ang, keepA1: next.ang, keepA2: prev.ang };
}

export function getTrimDeleteOnlyHoverCandidate(state, worldRaw, dom) {
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

export function getFilletHoverCandidate(state, worldRaw) {
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



