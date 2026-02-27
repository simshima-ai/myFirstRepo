import {
    clearSelection, setSelection, getGroup
} from "./state.js";
import {
    screenToWorld, snapPoint, getEffectiveGridSize
} from "./geom.js";
import {
    hitActiveGroupRotateHandle, hitActiveGroupOriginHandle, hitTestVertexHandle,
    beginGroupRotateDrag, beginGroupOriginDrag, beginSelectionBox,
    hitTestShapes, hitTestDimHandle, beginDimHandleDrag, beginVertexDrag,
    beginSelectionDrag, selectGroupById,
    applyGroupRotateDrag, applyGroupOriginDrag, applyDimHandleDrag, applyVertexDrag,
    applySelectionDrag, updateSelectionBox,
    endGroupRotateDrag, endGroupOriginDrag, endDimHandleDrag, endVertexDrag,
    endSelectionDrag, endSelectionBox,
    beginVertexSelectionBox, endVertexSelectionBox,
    beginGroupOriginPickDrag, applyGroupOriginPickDrag, endGroupOriginPickDrag,
    getTrimHoverCandidate, getTrimDeleteOnlyHoverCandidate, getFilletHoverCandidate,
    clearVertexSelection
} from "./app_selection.js";
import {
    applyPendingLineCircleFillet, applyPendingArcArcFillet,
    trimClickedLineAtNearestIntersection
} from "./app_tools.js";
import { getObjectSnapPoint } from "./solvers.js";

/**
 * Input & Event Logic extracted from app.js
 */

export function panByScreenDelta(state, dx, dy) {
    state.view.offsetX += dx;
    state.view.offsetY += dy;
}

export function zoomAt(state, screen, factor) {
    const prevScale = state.view.scale;
    const nextScale = Math.max(state.view.minScale, Math.min(state.view.maxScale, prevScale * factor));
    if (Math.abs(nextScale - prevScale) < 1e-12) return;
    const wx = (screen.x - state.view.offsetX) / prevScale;
    const wy = (screen.y - state.view.offsetY) / prevScale;
    state.view.scale = nextScale;
    state.view.offsetX = screen.x - wx * nextScale;
    state.view.offsetY = screen.y - wy * nextScale;
}

export function getMouseScreen(dom, e) {
    const rect = dom.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function getMouseWorld(state, dom, e, snapped = false) {
    const screen = getMouseScreen(dom, e);
    const world = screenToWorld(state.view, screen);
    if (!snapped || !state.grid.snap) return world;
    const gridStep = getEffectiveGridSize(state.grid, state.view);
    return snapPoint(world, gridStep);
}

export function setupInputListeners(state, dom, helpers) {
    const {
        draw, setStatus, pushHistory, snapshotModel, addShape, nextShapeId,
        clearSelection, setSelection, finalizeDimDraft, trimClickedLineAtNearestIntersection,
        createLine, createRect, createCircle, createPosition, createText, createArc,
        beginOrExtendPolyline, updatePolylineHover, finalizePolylineDraft,
        beginOrAdvanceDim, updateDimHover, executeHatch, executeDoubleLine
    } = helpers;

    dom.canvas.addEventListener("pointerdown", (e) => {
        dom.canvas.setPointerCapture(e.pointerId);
        const screen = getMouseScreen(dom, e);
        const worldRaw = getMouseWorld(state, dom, e, false);
        // Prioritize object snap point if available
        const snap = getObjectSnapPoint(state, worldRaw, () => state.objectSnap?.enabled !== false);
        const world = snap ? { x: snap.x, y: snap.y } : getMouseWorld(state, dom, e, true);
        state.input.pointerDown = true;

        // 基準点移動モードがアクティブな場合
        if (state.input.groupOriginPick.active && e.button === 0) {
            const activeG = getGroup(state, state.activeGroupId);
            if (activeG) {
                // スナップ適用後の座標 world を使用する
                beginGroupOriginPickDrag(state, activeG, world);
                applyGroupOriginPickDrag(state, world);
                if (draw) draw();
            }
            return;
        }

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            state.input.panning = true;
            state.input.panAnchor = { x: screen.x, y: screen.y, ox: state.view.offsetX, oy: state.view.offsetY };
            if (setStatus) setStatus("Panning");
            if (draw) draw();
            return;
        }

        if (state.tool === "select") {
            const rotateHandleHit = hitActiveGroupRotateHandle(state, screen);
            if (rotateHandleHit && !e.shiftKey) {
                setSelection((rotateHandleHit.shapeIds || []).slice());
                beginGroupRotateDrag(state, rotateHandleHit, worldRaw);
                if (draw) draw();
                return;
            }
            const groupHandleHit = hitActiveGroupOriginHandle(state, screen);
            if (groupHandleHit && !e.shiftKey) {
                setSelection((groupHandleHit.shapeIds || []).slice());
                beginGroupOriginDrag(state, groupHandleHit, worldRaw);
                if (draw) draw();
                return;
            }
            const dimHandleHit = hitTestDimHandle(state, worldRaw);
            if (dimHandleHit) {
                beginDimHandleDrag(state, dimHandleHit);
                if (draw) draw();
                return;
            }
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit) {
                if (e.shiftKey) {
                    const cur = new Set(state.selection.ids.map(Number));
                    if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                    setSelection(Array.from(cur));
                } else {
                    if (hit.groupId != null && !e.ctrlKey) {
                        selectGroupById(state, hit.groupId);
                    } else {
                        setSelection([Number(hit.id)]);
                        state.activeGroupId = null;
                    }
                }
                beginSelectionDrag(state, worldRaw, helpers);
                if (draw) draw();
                return;
            } else {
                beginSelectionBox(state, screen, e.shiftKey);
                if (draw) draw();
            }
            return;
        }

        if (state.tool === "vertex") {
            if (e.button !== 0) return;
            const vhit = hitTestVertexHandle(state, worldRaw);
            if (vhit) {
                // Vertex clicked: clear line filter, begin drag
                state.vertexEdit.filterShapeId = null;
                beginVertexDrag(state, vhit, worldRaw, helpers, e.shiftKey);
            } else {
                // No vertex hit: check if a line was clicked to set filter
                const shapeHit = hitTestShapes(state, worldRaw);
                if (shapeHit && (shapeHit.type === "line" || shapeHit.type === "rect")) {
                    state.vertexEdit.filterShapeId = Number(shapeHit.id);
                    clearVertexSelection(state);
                } else {
                    // Empty area: clear filter and start selection box
                    state.vertexEdit.filterShapeId = null;
                    beginSelectionBox(state, screen, e.shiftKey);
                }
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "line" || state.tool === "rect" || state.tool === "circle") {
            if (e.button !== 0) return;
            if (!state.input.dragStartWorld) {
                state.input.dragStartWorld = { x: world.x, y: world.y };
                if (setStatus) setStatus(`${state.tool.toUpperCase()}: Click second point`);
            } else {
                pushHistory();
                if (state.tool === "line" || state.tool === "circle") {
                    let shape;
                    if (state.tool === "line") shape = createLine(state.input.dragStartWorld, world);
                    else if (state.tool === "circle") shape = createCircle(state.input.dragStartWorld, world);
                    if (shape) {
                        shape.id = nextShapeId();
                        shape.layerId = state.activeLayerId;
                        addShape(shape);
                        clearSelection();
                        state.activeGroupId = null;
                    }
                }
                else if (state.tool === "rect") {
                    const p1 = state.input.dragStartWorld;
                    const p2 = world;
                    const lines = [
                        { type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p1.y },
                        { type: "line", x1: p2.x, y1: p1.y, x2: p2.x, y2: p2.y },
                        { type: "line", x1: p2.x, y1: p2.y, x2: p1.x, y2: p2.y },
                        { type: "line", x1: p1.x, y1: p2.y, x2: p1.x, y2: p1.y }
                    ];
                    lines.forEach(l => {
                        l.id = nextShapeId();
                        l.layerId = state.activeLayerId;
                    });
                    helpers.addShapesAsGroup(lines);
                }
                state.input.dragStartWorld = null;
                if (setStatus) setStatus(`${state.tool.toUpperCase()} created`);
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "polyline") {
            if (e.button !== 0) return;
            beginOrExtendPolyline(world);
            if (setStatus) setStatus("Polyline: Click point (Double click to finish)");
            if (draw) draw();
            return;
        }

        if (state.tool === "position" || state.tool === "text") {
            if (e.button !== 0) return;
            pushHistory();
            let shape;
            if (state.tool === "position") {
                shape = createPosition(world);
                shape.size = state.positionSettings?.size || 20;
            } else {
                shape = createText(world, state.textSettings);
            }
            shape.id = nextShapeId();
            shape.layerId = state.activeLayerId;
            addShape(shape);
            if (setStatus) setStatus(`${state.tool.toUpperCase()} created`);
            if (draw) draw();
            return;
        }

        if (state.tool === "dim") {
            if (e.button !== 0) return;
            helpers.beginOrAdvanceDim(worldRaw);
            if (draw) draw();
            return;
        }

        if (state.tool === "trim") {
            if (e.button !== 0) return;
            const ok = trimClickedLineAtNearestIntersection(state, worldRaw, helpers);
            if (!ok && setStatus) setStatus("Trim: Click a line near an intersection");
            if (draw) draw();
            return;
        }

        if (state.tool === "fillet") {
            if (e.button !== 0) return;
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit && (hit.type === "line" || hit.type === "circle" || hit.type === "arc")) {
                const cur = new Set(state.selection.ids.map(Number));
                if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                setSelection(Array.from(cur));
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "hatch") {
            if (e.button !== 0) return;
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit) {
                const id = Number(hit.id);
                if (!state.hatchDraft.boundaryIds) state.hatchDraft.boundaryIds = [];
                const idx = state.hatchDraft.boundaryIds.indexOf(id);
                if (idx >= 0) state.hatchDraft.boundaryIds.splice(idx, 1);
                else state.hatchDraft.boundaryIds.push(id);
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "doubleline") {
            if (e.button !== 0) return;
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit && hit.type === "line") {
                const cur = new Set(state.selection.ids.map(Number));
                if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                setSelection(Array.from(cur));
            }
            if (draw) draw();
            return;
        }
    });

    dom.canvas.addEventListener("pointermove", (e) => {
        const screen = getMouseScreen(dom, e);
        const worldRaw = getMouseWorld(state, dom, e, false);
        // Prioritize object snap point if available for creation/previews
        const snapMove = getObjectSnapPoint(state, worldRaw, () => state.objectSnap?.enabled !== false);
        const world = snapMove ? { x: snapMove.x, y: snapMove.y } : getMouseWorld(state, dom, e, true);

        if (state.input.panning) {
            const dx = screen.x - state.input.panAnchor.x;
            const dy = screen.y - state.input.panAnchor.y;
            state.view.offsetX = state.input.panAnchor.ox + dx;
            state.view.offsetY = state.input.panAnchor.oy + dy;
            if (draw) draw();
            return;
        }

        if (state.input.groupRotate.active) {
            applyGroupRotateDrag(state, worldRaw);
            if (draw) draw();
            return;
        }
        if (state.input.groupDrag.active) {
            applyGroupOriginDrag(state, worldRaw);
            if (draw) draw();
            return;
        }
        if (state.input.groupOriginPick.dragging) {
            applyGroupOriginPickDrag(state, world);
            if (draw) draw();
            return;
        }
        if (state.input.dimHandleDrag.active) {
            applyDimHandleDrag(state, worldRaw);
            if (draw) draw();
            return;
        }
        if (state.vertexEdit.drag.active) {
            // ドラッグ中もスナップ地点を計算してホバー情報に反映させるため
            // worldRaw を使ってスナップポイントを明示的に更新（applyVertexDrag 内でも行われるが、pointermove 側での一貫性のため）
            applyVertexDrag(state, worldRaw);
            if (draw) draw();
            return;
        }
        if (state.selection.drag.active) {
            applySelectionDrag(state, worldRaw);
            if (draw) draw();
            return;
        }
        if (state.selection.box.active) {
            updateSelectionBox(state, screen);
            if (draw) draw();
            return;
        }

        state.input.hover.world = world;
        state.input.hover.screen = screen;
        state.input.hover.shape = hitTestShapes(state, worldRaw, dom);
        state.input.hover.vertex = hitTestVertexHandle(state, worldRaw);
        state.input.hover.groupRotate = hitActiveGroupRotateHandle(state, screen);
        state.input.hover.groupOrigin = hitActiveGroupOriginHandle(state, screen);
        state.input.hover.dimHandle = hitTestDimHandle(state, worldRaw);

        // Snap and Hover Candidates for render.js
        state.input.objectSnapHover = snapMove;
        state.input.hoverWorld = world;

        state.input.trimHover = (state.tool === "trim") ? (state.input.modifierKeys.alt ? getTrimDeleteOnlyHoverCandidate(state, worldRaw, dom) : getTrimHoverCandidate(state, worldRaw, dom)) : null;
        state.input.filletHover = (state.tool === "fillet") ? getFilletHoverCandidate(state, worldRaw) : null;
        state.input.hatchHover = (state.tool === "hatch") ? hitTestShapes(state, worldRaw, dom) : null;

        if (state.tool === "polyline") {
            helpers.updatePolylineHover(state.input.hoverWorld);
        }
        if (state.tool === "dim") {
            helpers.updateDimHover(worldRaw);
        }

        // Preview Shape
        state.preview = null;
        if (state.input.dragStartWorld) {
            const p1 = state.input.dragStartWorld;
            const p2 = state.input.hoverWorld;
            if (state.tool === "line") state.preview = createLine(p1, p2);
            else if (state.tool === "rect") state.preview = createRect(p1, p2);
            else if (state.tool === "circle") state.preview = createCircle(p1, p2);
        } else {
            // Before the first click: show hint or ghost
            const ph = state.input.hoverWorld;
            if (["line", "rect", "circle", "polyline", "polyline_continue", "position"].includes(state.tool)) {
                state.preview = createPosition(ph); // Crosshair as first point hint
            } else if (state.tool === "text") {
                state.preview = createText(ph, state.textSettings);
            }
        }

        if (draw) draw();
    });

    dom.canvas.addEventListener("pointerup", (e) => {
        dom.canvas.releasePointerCapture(e.pointerId);
        state.input.pointerDown = false;
        state.input.panning = false;

        if (state.input.groupRotate.active) {
            const { moved, snapshot } = endGroupRotateDrag(state);
            if (moved) pushHistorySnapshot(state, snapshot);
        }
        if (state.input.groupDrag.active) {
            const { moved, snapshot } = endGroupOriginDrag(state);
            if (moved) pushHistorySnapshot(state, snapshot);
        }
        if (state.input.groupOriginPick.dragging) {
            const { moved, snapshot } = endGroupOriginPickDrag(state);
            if (moved) pushHistorySnapshot(state, snapshot);
        }
        if (state.input.dimHandleDrag.active) {
            const { moved, snapshot } = endDimHandleDrag(state);
            if (moved) pushHistorySnapshot(state, snapshot);
        }
        if (state.vertexEdit.drag.active) {
            const { moved, snapshot, anchorShapeId, anchorKey, lastTangentSnap } = endVertexDrag(state);
            if (moved) {
                // Save tangent attribute if "属性を保持" is enabled and tangent snap was used
                if (lastTangentSnap && state.objectSnap?.tangentKeep) {
                    const anchorShape = state.shapes.find(s => Number(s.id) === Number(anchorShapeId));
                    if (anchorShape?.type === "line") {
                        const fixedKey = anchorKey === "p1" ? "p2" : "p1";
                        const fixedPt = fixedKey === "p1"
                            ? { x: Number(anchorShape.x1), y: Number(anchorShape.y1) }
                            : { x: Number(anchorShape.x2), y: Number(anchorShape.y2) };
                        const circle = state.shapes.find(s => Number(s.id) === lastTangentSnap.circleId);
                        if (fixedPt && circle) {
                            const cx = Number(circle.cx), cy = Number(circle.cy);
                            const crossZ = (cx - fixedPt.x) * (lastTangentSnap.y - fixedPt.y)
                                         - (cy - fixedPt.y) * (lastTangentSnap.x - fixedPt.x);
                            const side = crossZ >= 0 ? 1 : -1;
                            const attrib = { type: "tangent", circleId: lastTangentSnap.circleId, side };
                            if (anchorKey === "p1") anchorShape.p1Attrib = attrib;
                            else                    anchorShape.p2Attrib = attrib;
                        }
                    }
                }
                pushHistorySnapshot(state, snapshot);
            }
        }
        if (state.selection.drag.active) {
            if (endSelectionDrag(state)) pushHistory();
        }
        if (state.selection.box.active) {
            if (state.tool === "vertex") endVertexSelectionBox(state, helpers);
            else endSelectionBox(state, helpers);
        }

        if (draw) draw();
    });

    dom.canvas.addEventListener("dblclick", (e) => {
        if (state.tool === "polyline") {
            helpers.finalizePolylineDraft();
            if (setStatus) setStatus("Polyline finished");
            if (draw) draw();
        }
        if (state.tool === "dim") {
            helpers.finalizeDimDraft();
            if (setStatus) setStatus("Dim finished");
            if (draw) draw();
        }
    });

    dom.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        zoomAt(state, getMouseScreen(dom, e), factor);
        if (draw) draw();
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
        state.input.modifierKeys.shift = e.shiftKey;
        state.input.modifierKeys.ctrl = e.ctrlKey;
        state.input.modifierKeys.alt = e.altKey;
        if (e.key === "Escape") {
            state.input.dragStartWorld = null;
            clearSelection();
            state.activeGroupId = null;
            state.polylineDraft = null;
            state.dimDraft = null;
            if (draw) draw();
        }
        if (e.key === "Delete") {
            if (helpers.delete) helpers.delete();
        }
        if (e.key === " ") {
            if (state.selection.ids.length > 0 || state.activeGroupId != null) {
                clearSelection();
                state.activeGroupId = null;
                if (setStatus) setStatus("Selection cleared");
                if (draw) draw();
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        state.input.modifierKeys.shift = e.shiftKey;
        state.input.modifierKeys.ctrl = e.ctrlKey;
        state.input.modifierKeys.alt = e.altKey;
    });

    window.addEventListener("resize", () => {
        if (helpers.resizeCanvas) helpers.resizeCanvas();
        if (draw) draw();
    });
}
