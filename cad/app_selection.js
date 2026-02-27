import {
    getGroup, setActiveGroup, setSelection, clearSelection,
    snapshotModel, pushHistory, pushHistorySnapshot,
    isLayerVisible, isLayerLocked
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
import { hitTestDimPart } from "./dim_geom.js";
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
    return state.shapes.filter((s) => ids.has(Number(s.id)));
}

export function isHitInActiveGroup(state, shapeId) {
    if (state.activeGroupId == null) return false;
    const ids = new Set(collectGroupTreeShapeIds(state, state.activeGroupId).map(Number));
    return ids.has(Number(shapeId));
}

export function selectGroupById(state, groupId) {
    const g = getGroup(state, groupId);
    if (!g) return false;
    setActiveGroup(state, g.id);
    setSelection(state, collectGroupTreeShapeIds(state, g.id));
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
    return false;
}

export function hitTestVertexHandle(state, world) {
    const tol = 10 / Math.max(1e-9, state.view.scale);
    const filterShapeId = state.vertexEdit?.filterShapeId != null ? Number(state.vertexEdit.filterShapeId) : null;
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const s = state.shapes[i];
        if (!isLayerVisible(state, s.layerId)) continue;
        if (!(s.type === "line" || s.type === "rect")) continue;
        if (filterShapeId !== null && Number(s.id) !== filterShapeId) continue;
        const p1d = Math.hypot(world.x - s.x1, world.y - s.y1);
        if (p1d <= tol) return { shapeId: s.id, key: "p1" };
        const p2d = Math.hypot(world.x - s.x2, world.y - s.y2);
        if (p2d <= tol) return { shapeId: s.id, key: "p2" };
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
        if (!(s.type === "line" || s.type === "rect")) continue;
        const p1 = { x: Number(s.x1), y: Number(s.y1) };
        const p2 = { x: Number(s.x2), y: Number(s.y2) };
        if (Math.hypot(p1.x - base.x, p1.y - base.y) <= eps) out.push({ shapeId: Number(s.id), key: "p1" });
        if (Math.hypot(p2.x - base.x, p2.y - base.y) <= eps) out.push({ shapeId: Number(s.id), key: "p2" });
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
            if (!(s.type === "line" || s.type === "rect")) continue;
            const pts = [
                { shapeId: Number(s.id), key: "p1", x: s.x1, y: s.y1 },
                { shapeId: Number(s.id), key: "p2", x: s.x2, y: s.y2 },
            ];
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
        // 単一クリックかつ Shift 無しの場合は頂点選択解除
        if (!box.additive) {
            state.vertexEdit.selectedVertices = [];
            state.vertexEdit.activeVertex = null;
            state.activeGroupId = null; // 背景クリックでグループのアクティブ状態も解除
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
    const gridStep = getEffectiveGridSize(state.grid, state.view);
    // Exclude the shapes being dragged so their own endpoints don't interfere with snap
    const draggingShapeIds = new Set((vd.baseShapeSnapshots || []).map(it => Number(it.id)));
    const objectSnap = getObjectSnapPoint(state, worldRaw, () => state.objectSnap?.enabled !== false, draggingShapeIds);

    state.input.objectSnapHover = objectSnap;

    let target = objectSnap
        ? { x: objectSnap.x, y: objectSnap.y }
        : (state.grid.snap ? snapPoint(worldRaw, gridStep) : worldRaw);

    // --- Tangent snap: only for line vertices ---
    let tangentSnapResult = null;
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
            }
        }
    }
    vd.lastTangentSnap = tangentSnapResult;

    // --- Vector snap: constrain to original line direction (only if no tangent snap) ---
    if (!tangentSnapResult && state.objectSnap?.vector && anchorBaseShape.type === "line") {
        const fixedKey = vd.anchorKey === "p1" ? "p2" : "p1";
        const fixedPt = getVertexAtKey(anchorBaseShape, fixedKey);
        if (fixedPt) {
            const dirX = baseV.x - fixedPt.x;
            const dirY = baseV.y - fixedPt.y;
            const lenSq = dirX * dirX + dirY * dirY;
            if (lenSq > 1e-18) {
                // When 線上 snap is also ON: find intersections of the vector axis with other shapes.
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
                    state.input.objectSnapHover = { x: axisIntersectionSnap.x, y: axisIntersectionSnap.y, kind: "intersection" };
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
    vd.active = false;
    vd.anchorShapeId = null;
    vd.anchorKey = null;
    vd.startWorldRaw = null;
    vd.selectedVertexKeys = null;
    vd.baseShapeSnapshots = null;
    vd.modelSnapshotBeforeMove = null;
    vd.moved = false;
    vd.lastTangentSnap = null;
    return { moved, snapshot, anchorShapeId, anchorKey, lastTangentSnap };
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
            if (!attrib || attrib.type !== "tangent") continue;
            const circle = state.shapes.find(s => Number(s.id) === attrib.circleId);
            if (!circle || (circle.type !== "circle" && circle.type !== "arc")) {
                // Referenced circle no longer exists — clear the attribute
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
            else              { shape.x2 = best.x; shape.y2 = best.y; }

            // If referenced shape is an arc, also update the arc endpoint that is
            // at the tangent point (a1 or a2 — whichever is angularly closer).
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
            const gridStep = getEffectiveGridSize(state.grid, state.view);
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
    const idSet = new Set(collectGroupTreeShapeIds(state, group.id).map(Number));
    const snaps = [];
    for (const s of state.shapes) {
        if (!idSet.has(Number(s.id))) continue;
        snaps.push({ id: s.id, shape: JSON.parse(JSON.stringify(s)) });
    }
    state.input.groupDrag.active = true;
    state.input.groupDrag.startWorldRaw = { x: worldRaw.x, y: worldRaw.y };
    state.input.groupDrag.groupId = Number(group.id);
    state.input.groupDrag.groupOrigin = { x: Number(group.originX) || 0, y: Number(group.originY) || 0 };
    state.input.groupDrag.shapeSnapshots = snaps;
    state.input.groupDrag.groupSnapshots = collectGroupTreeGroupSnapshots(state, group.id);
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
    const gridStep = getEffectiveGridSize(state.grid, state.view);

    // 現在のマウス（ワールド座標）から基準点の新しい位置を計算
    const rawDx = worldRaw.x - gd.startWorldRaw.x;
    const rawDy = worldRaw.y - gd.startWorldRaw.y;
    const rawTargetX = gd.groupOrigin.x + rawDx;
    const rawTargetY = gd.groupOrigin.y + rawDy;

    // スナップが有効な場合、移動後の絶対座標をグリッドに乗せる
    const targetX = state.grid.snap ? Math.round(rawTargetX / gridStep) * gridStep : rawTargetX;
    const targetY = state.grid.snap ? Math.round(rawTargetY / gridStep) * gridStep : rawTargetY;

    const dx = targetX - gd.groupOrigin.x;
    const dy = targetY - gd.groupOrigin.y;

    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) gd.moved = true;
    const g = getGroup(state, gd.groupId);
    if (g) {
        g.originX = gd.groupOrigin.x + dx;
        g.originY = gd.groupOrigin.y + dy;
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
        } else if (t.type === "text") {
            t.x1 = b.x1 + dx; t.y1 = b.y1 + dy;
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
        } else if (t.type === "text") {
            const p = rotatePointAround(b.x1, b.y1, ox, oy, delta);
            t.x1 = p.x; t.y1 = p.y;
        }
    }
}

export function endGroupOriginDrag(state) {
    const moved = !!state.input.groupDrag.moved;
    const snap = state.input.groupDrag.modelSnapshotBeforeMove;
    state.input.groupDrag.active = false;
    state.input.groupDrag.startWorldRaw = null;
    state.input.groupDrag.groupId = null;
    state.input.groupDrag.groupOrigin = null;
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

    // app_input 側で既にスナップされた world が渡されている前提
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
    gp.active = false; // 配置完了したらモード終了
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
    return true;
}

export function applySelectionDrag(state, worldRaw) {
    const drag = state.selection.drag;
    if (!drag.active || !drag.startWorldRaw || !drag.shapeSnapshots) return;
    const gridStep = getEffectiveGridSize(state.grid, state.view);

    const objSnapCur = getObjectSnapPoint(state, worldRaw, () => true);
    const cur = objSnapCur
        ? { x: objSnapCur.x, y: objSnapCur.y }
        : (state.grid.snap ? snapPoint(worldRaw, gridStep) : worldRaw);

    const objSnapStart = getObjectSnapPoint(state, drag.startWorldRaw, () => true);
    const start = objSnapStart
        ? { x: objSnapStart.x, y: objSnapStart.y }
        : (state.grid.snap ? snapPoint(drag.startWorldRaw, gridStep) : drag.startWorldRaw);

    const dx = cur.x - start.x;
    const dy = cur.y - start.y;
    if (Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9) drag.moved = true;
    const byId = new Map(state.shapes.map((s) => [Number(s.id), s]));
    for (const it of drag.shapeSnapshots) {
        const target = byId.get(Number(it.id));
        if (!target) continue;
        const base = it.shape;
        if (target.type === "line" || target.type === "rect" || target.type === "dim") {
            // 線、矩形、寸法線は個別ドラッグでは動かさない（頂点編集かグループ移動のみ）
            continue;
        } else if (target.type === "circle") {
            target.cx = base.cx + dx; target.cy = base.cy + dy;
            target.r = base.r;
        } else if (target.type === "arc") {
            target.cx = base.cx + dx; target.cy = base.cy + dy;
            target.r = base.r; target.a1 = base.a1; target.a2 = base.a2; target.ccw = base.ccw;
        } else if (target.type === "position") {
            target.x = base.x + dx; target.y = base.y + dy; target.size = base.size;
        } else if (target.type === "text") {
            target.x1 = base.x1 + dx; target.y1 = base.y1 + dy;
        }
    }
}

export function endSelectionDrag(state) {
    const moved = !!state.selection.drag.moved;
    state.selection.drag.active = false;
    state.selection.drag.moved = false;
    state.selection.drag.startWorldRaw = null;
    state.selection.drag.shapeSnapshots = null;
    state.selection.drag.modelSnapshotBeforeMove = null;
    return moved;
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
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const s = state.shapes[i];
        if (!isLayerVisible(state, s.layerId)) continue;
        if (isLayerLocked(state, s.layerId)) continue;
        if (state.ui?.layerView?.editOnlyActive && Number(s.layerId ?? state.activeLayerId) !== Number(state.activeLayerId)) continue;
        if (s.type === "line" && hitTestLine(world, s, tol)) return s;
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
                const off = (s.px - s.x1) * nx + (s.py - s.y1) * ny;
                const d1 = { x: s.x1 + nx * off, y: s.y1 + ny * off };
                const d2 = { x: s.x2 + nx * off, y: s.y2 + ny * off };
                if (hitTestLine(world, { x1: s.x1, y1: s.y1, x2: d1.x, y2: d1.y }, tol)) return s;
                if (hitTestLine(world, { x1: s.x2, y1: s.y2, x2: d2.x, y2: d2.y }, tol)) return s;
                if (hitTestLine(world, { x1: d1.x, y1: d1.y, x2: d2.x, y2: d2.y }, tol)) return s;
            }
        }
        if (s.type === "text") {
            const p1 = { x: Number(s.x1), y: Number(s.y1) };
            const txt = String(s.text || "");
            const sizePx = (Number(s.textSizePt) || 12) * 1.33;
            const rDeg = Number(s.textRotate) || 0;
            const tctx = dom.canvas.getContext("2d");
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
            const dx = world.x - p1.x, dy = world.y - p1.y;
            const rx = dx * cos + dy * sin;
            const ry = -dx * sin + dy * cos;
            if (rx >= 0 && rx <= w / state.view.scale && ry >= -h * 0.5 / state.view.scale && ry <= h * 0.5 / state.view.scale) return s;
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
    const selectedIds = new Set((state.selection.ids || []).map(Number));
    for (let i = state.shapes.length - 1; i >= 0; i--) {
        const s = state.shapes[i];
        if (!s || (s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle")) continue;
        if (!selectedIds.has(Number(s.id))) continue;
        if (!isLayerVisible(state, s.layerId)) continue;
        const part = hitTestDimPart(s, worldRaw.x, worldRaw.y, state.shapes, state.view.scale);
        if (part) return { id: Number(s.id), dim: s, part };
    }
    return null;
}

export function beginDimHandleDrag(state, hit) {
    const dim = hit?.dim || hit;
    state.input.dimHandleDrag.active = true;
    state.input.dimHandleDrag.dimId = Number(dim.id);
    state.input.dimHandleDrag.part = String(hit?.part || "line");
    state.input.dimHandleDrag.modelSnapshotBeforeMove = snapshotModel(state);
    state.input.dimHandleDrag.moved = false;
}

export function applyDimHandleDrag(state, worldRaw) {
    const dd = state.input.dimHandleDrag;
    if (!dd.active) return;
    const dim = state.shapes.find(s => s && (s.id === dd.dimId || Number(s.id) === Number(dd.dimId)));
    if (!dim) return;
    const p = state.grid.snap ? snapPoint(worldRaw, getEffectiveGridSize(state.grid, state.view)) : worldRaw;

    if (dim.type === 'dim') {
        if (dd.part === 'text') { dim.tx = p.x; dim.ty = p.y; }
        else if (dd.part === 'p1') { dim.x1 = p.x; dim.y1 = p.y; }
        else if (dd.part === 'p2') { dim.x2 = p.x; dim.y2 = p.y; }
        else if (dd.part === 'target1' || dd.part === 'target2') {
            const os = getObjectSnapPoint(state, worldRaw, () => true);
            const tp = os || p;
            if (dd.part === 'target1') { dim.x1 = tp.x; dim.y1 = tp.y; }
            else { dim.x2 = tp.x; dim.y2 = tp.y; }
        }
        else if (dd.part === 'edge') { dim.x2 = p.x; dim.y2 = p.y; }
        else { dim.px = p.x; dim.py = p.y; }
    } else if (dim.type === 'dimchain') {
        if (dd.part === 'text') { dim.tx = p.x; dim.ty = p.y; }
        else if (dd.part.startsWith('p')) {
            const idx = parseInt(dd.part.substring(1));
            if (!isNaN(idx) && dim.points && dim.points[idx]) {
                dim.points[idx].x = p.x; dim.points[idx].y = p.y;
            }
        }
        else { dim.px = p.x; dim.py = p.y; }
    } else if (dim.type === 'dimangle') {
        if (dd.part === 'text') { dim.tx = p.x; dim.ty = p.y; }
        else if (dd.part === 'p1') { dim.x1 = p.x; dim.y1 = p.y; }
        else if (dd.part === 'p2') { dim.x2 = p.x; dim.y2 = p.y; }
        else if (dd.part === 'p3') { dim.x3 = p.x; dim.y3 = p.y; }
        else if (dd.part === 'p4') { dim.x4 = p.x; dim.y4 = p.y; }
        else { dim.px = p.x; dim.py = p.y; }
    }
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

        const isInside = (s) => {
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
            if (s.type === "dim") {
                return (s.x1 >= wx1 && s.x1 <= wx2 && s.y1 >= wy1 && s.y1 <= wy2) &&
                    (s.x2 >= wx1 && s.x2 <= wx2 && s.y2 >= wy1 && s.y2 <= wy2) &&
                    (s.px >= wx1 && s.px <= wx2 && s.py >= wy1 && s.py <= wy2);
            }
            return false;
        };

        const isCrossing = (s) => {
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
            if (s.type === "dim") {
                const lxMin = Math.min(s.x1, s.x2, s.px), lxMax = Math.max(s.x1, s.x2, s.px);
                const lyMin = Math.min(s.y1, s.y2, s.py), lyMax = Math.max(s.y1, s.y2, s.py);
                return !(lxMax < wx1 || lxMin > wx2 || lyMax < wy1 || lyMin > wy2);
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
            if (leftToRight ? isInside(s) : isCrossing(s)) {
                picked.push(Number(s.id));
            }
        }

        if (state.tool === "hatch") {
            const valid = picked.filter(id => isHatchBoundaryShape(state.shapes.find(sh => sh.id === id)));
            if (box.additive) state.hatchDraft.boundaryIds = Array.from(new Set([...state.hatchDraft.boundaryIds, ...valid]));
            else state.hatchDraft.boundaryIds = valid;
            if (setStatus) setStatus(`Hatch: 境界を ${state.hatchDraft.boundaryIds.length} 個選択中`);
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
    } else {
        // 単一クリックかつ Shift 無しの場合は選択解除
        if (!box.additive) {
            setSelection(state, []);
            state.activeGroupId = null; // 背景クリックでグループのアクティブ状態も解除
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
        if (last && Math.abs(last.ang - p.ang) <= 1e-7) continue;
        dedup.push(p);
    }
    if (dedup.length < 1) return null;
    let prev = dedup[dedup.length - 1], next = dedup[0];
    for (const p of dedup) {
        if (p.ang <= thetaClick + 1e-9) prev = p;
        if (p.ang >= thetaClick - 1e-9) { next = p; break; }
    }
    if (Math.abs(prev.ang - next.ang) <= 1e-7) return null;
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
    const group = {
        id: gid,
        name: `${namePrefix} ${gid}`,
        shapeIds: targetIds.slice(),
        parentId: null,
        originX: Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0,
        originY: Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0,
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
