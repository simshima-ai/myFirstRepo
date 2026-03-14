import {
    clearSelection, setSelection, getGroup, pushHistorySnapshot
} from "./state.js";
import {
    panByScreenDelta, zoomAt, getMouseScreen, getMouseWorld
} from "./app_input_coords.js";
import {
    hitActiveGroupRotateHandle, hitActiveGroupOriginHandle, hitActiveGroupScaleHandle, hitTestVertexHandle,
    beginGroupRotateDrag, beginGroupOriginDrag, beginGroupScaleDrag, beginSelectionBox,
    hitTestShapes, hitTestDimHandle, beginDimHandleDrag, beginVertexDrag,
    beginSelectionDrag, beginImageScaleDrag, hitTestImageScaleHandle, toggleGroupSelectionById,
    findConnectedLinesChain,
    getVertexInsertCandidate, insertVertexAtCandidate,
    applyGroupRotateDrag, applyGroupOriginDrag, applyGroupScaleDrag, applyDimHandleDrag, applyVertexDrag,
    applySelectionDrag, updateSelectionBox,
    endGroupRotateDrag, endGroupOriginDrag, endGroupScaleDrag, endDimHandleDrag, endVertexDrag,
    endSelectionDrag, endSelectionBox,
    beginVertexSelectionBox, endVertexSelectionBox,
    beginGroupOriginPickDrag, applyGroupOriginPickDrag, endGroupOriginPickDrag,
    getTrimHoverCandidate, getTrimDeleteOnlyHoverCandidate, getFilletHoverCandidate,
    clearVertexSelection
} from "./app_selection.js";
import {
    trimClickedLineAtNearestIntersection
} from "./app_tools.js";
import { getObjectSnapPoint } from "./solvers.js";
import { buildDoubleLinePreview, buildDoubleLineLineTrimMarkers, expandDoubleLineBasesFromSelection } from "./dline_geom.js";
import { bindViewportResize } from "./app_input_viewport.js";
import { isTypingTarget, findShortcutAction } from "./app_input_shortcuts.js";
import { normalizeLineType, resolveCircleCreateMode, resolveLineCreateMode } from "./app_input_mode_utils.js";
import { createTouchInputController } from "./app_input_touch.js";
import { bindKeyboardInput } from "./app_input_keyboard.js";
import { createBsplineDraftController } from "./app_input_bspline.js";
import { getRectFromAnchor, getFixedLineFromAnchor } from "./app_input_anchor_utils.js";
import { isFilletTargetShape, getFilletTargetRef, commitFilletFromHover as commitFilletFromHoverImpl } from "./app_input_fillet.js";
import { resolvePolylineDraftEndpointSnap as resolvePolylineDraftEndpointSnapImpl } from "./app_input_snap.js";
import { bindInputTailEvents } from "./app_input_tail_events.js";
import { handlePointerDownSelectMode } from "./app_input_pointer_select.js";
import { handlePointerDownDrawMode } from "./app_input_pointer_draw.js";
import { collectGroupTreeShapeIds } from "./app_selection_group_tree.js";
import { isHatchBoundaryShape } from "./hatch_geom.js";

export function setupInputListenersImpl(state, dom, helpers) {
    const {
        draw, setStatus, pushHistory, snapshotModel, addShape, nextShapeId,
        clearSelection, setSelection, finalizeDimDraft, trimClickedLineAtNearestIntersection,
        createLine, createRect, createCircle, createPosition, createText, createArc,
        beginOrExtendPolyline, updatePolylineHover, finalizePolylineDraft,
        beginOrAdvanceDim, updateDimHover, executeHatch, executeDoubleLine, buildDoubleLinePreviewForSelection, buildDoubleLineTrimMarkersForSelection, refreshDoubleLineCandidateMarkers, setTool
    } = helpers;
    const getCircleCreateMode = () => resolveCircleCreateMode(state);
    const getLineCreateMode = () => resolveLineCreateMode(state);
    const isVertexEditableShapeType = (shapeTypeRaw) => {
        const t = String(shapeTypeRaw || "").toLowerCase();
        return t === "line" || t === "rect" || t === "arc" || t === "polyline" || t === "bspline";
    };
    const hitTestVertexEditableShape = (worldRaw) => {
        const pickState = {
            ...state,
            shapes: (state.shapes || []).filter((s) => isVertexEditableShapeType(s?.type)),
        };
        return hitTestShapes(pickState, worldRaw, dom);
    };
    const collectVertexTargetShapeIdsFromCurrentSelection = () => {
        const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
        const out = new Set();
        for (const sidRaw of (state.selection?.ids || [])) {
            const sid = Number(sidRaw);
            if (!Number.isFinite(sid)) continue;
            const s = shapeById.get(sid);
            if (!s || !isVertexEditableShapeType(s.type)) continue;
            out.add(sid);
        }
        const gidSet = new Set();
        for (const gidRaw of (state.selection?.groupIds || [])) {
            const gid = Number(gidRaw);
            if (Number.isFinite(gid)) gidSet.add(gid);
        }
        if (state.activeGroupId != null && Number.isFinite(Number(state.activeGroupId))) {
            gidSet.add(Number(state.activeGroupId));
        }
        for (const gid of gidSet) {
            const ids = collectGroupTreeShapeIds(state, Number(gid));
            for (const sidRaw of ids) {
                const sid = Number(sidRaw);
                if (!Number.isFinite(sid)) continue;
                const s = shapeById.get(sid);
                if (!s || !isVertexEditableShapeType(s.type)) continue;
                out.add(sid);
            }
        }
        return Array.from(out);
    };
    const syncVertexTargetsFromSelection = (force = false) => {
        if (!state.vertexEdit) return [];
        const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
        const current = Array.isArray(state.vertexEdit.targetShapeIds) ? state.vertexEdit.targetShapeIds : [];
        const validCurrent = current
            .map(Number)
            .filter((sid) => {
                if (!Number.isFinite(sid)) return false;
                const s = shapeById.get(sid);
                return !!s && isVertexEditableShapeType(s.type);
            });
        let targetIds = validCurrent;
        if (force || !targetIds.length) {
            targetIds = collectVertexTargetShapeIdsFromCurrentSelection();
        }
        state.vertexEdit.targetShapeIds = Array.from(new Set(targetIds.map(Number).filter(Number.isFinite)));
        if (state.vertexEdit.filterShapeId != null) {
            const fid = Number(state.vertexEdit.filterShapeId);
            if (!state.vertexEdit.targetShapeIds.includes(fid)) state.vertexEdit.filterShapeId = null;
        }
        return state.vertexEdit.targetShapeIds;
    };
    const selectVertexConnectedChainFromLine = (lineId) => {
        const chain = findConnectedLinesChain(state, Number(lineId))
            .map(Number)
            .filter(Number.isFinite);
        if (!chain.length) return false;
        const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
        const editableChain = chain.filter((sid) => {
            const s = shapeById.get(Number(sid));
            return !!s && isVertexEditableShapeType(s.type);
        });
        if (!editableChain.length) return false;
        setSelection(editableChain);
        state.activeGroupId = null;
        state.vertexEdit.targetShapeIds = editableChain;
        state.vertexEdit.filterShapeId = null;
        state.vertexEdit.insertCandidate = null;
        clearVertexSelection(state);
        return true;
    };

    const touch = createTouchInputController(state, dom, {
        getMouseScreen,
        panByScreenDelta,
        zoomAt
    });
    const isAppendSelect = (e) => touch.isAppendSelect(e);
    const applyToolStrokeToShape = (shape, toolKey = state.tool) => {
        if (!shape) return shape;
        const t = String(toolKey || "").toLowerCase();
        const getCfg = () => {
            if (t === "line") return state.lineSettings;
            if (t === "rect") return state.rectSettings;
            if (t === "circle") return state.circleSettings;
            if (t === "position") return state.positionSettings;
            if (t === "text") return state.textSettings;
            if (t === "dim") return state.dimSettings;
            if (t === "hatch") return state.hatchSettings;
            if (t === "doubleline") return state.dlineSettings;
            if (t === "fillet") return state.filletSettings;
            return null;
        };
        const cfg = getCfg();
        const lw = Math.max(0.01, Number(cfg?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        const lt = normalizeLineType(cfg?.lineType ?? "solid");
        const rawColor = String(cfg?.color || "#0f172a").trim();
        const color = /^#[0-9a-fA-F]{6}$/.test(rawColor) ? rawColor.toLowerCase() : "#0f172a";
        shape.lineWidthMm = lw;
        shape.lineType = lt;
        if (Object.prototype.hasOwnProperty.call(shape, "color")) shape.color = color;
        return shape;
    };
    const bspline = createBsplineDraftController(state, {
        nextShapeId,
        pushHistory,
        addShape,
        clearSelection,
        applyToolStrokeToShape
    });
    const beginOrExtendBsplineDraft = (world) => bspline.beginOrExtend(world);
    const updateBsplineDraftHover = (world) => bspline.updateHover(world);
    const finalizeBsplineDraft = () => bspline.finalize();
    const getExpandedDoubleLineBases = () => {
        const expanded = expandDoubleLineBasesFromSelection(state);
        return Array.isArray(expanded?.bases) ? expanded.bases.filter(Boolean) : [];
    };
    const syncFilletSelectionFromTargets = (targets) => {
        const arr = Array.isArray(targets) ? targets.filter(Boolean) : [];
        state.input.filletTargets = arr;
        setSelection(Array.from(new Set(arr.filter((t) => String(t?.type || "").toLowerCase() !== "polyline").map((t) => Number(t?.shapeId)).filter(Number.isFinite))));
    };
    const filletTargetKey = (target) => {
        if (!target) return "";
        const sid = Number(target.shapeId);
        const type = String(target.type || "").toLowerCase();
        if (type === "polyline") return `${sid}:seg:${Number(target.segIndex)}`;
        return `${sid}:${type}`;
    };
    const commitFilletFromHover = (worldRawHint = null) => {
        if (!state.input?.filletHover) {
            const hoverHint = worldRawHint || state.input?.hover?.world || state.input?.hoverWorld || null;
            if (hoverHint && (Array.isArray(state.input?.filletTargets) ? state.input.filletTargets.filter(Boolean).length : 0) === 2) {
                state.input.filletHover = getFilletHoverCandidate(state, hoverHint);
            }
        }
        return commitFilletFromHoverImpl(state, helpers, {
            nextShapeId,
            pushHistory,
            addShape,
            removeShapeById: helpers.removeShapeById,
            setSelection,
            setStatus
        }, worldRawHint);
    };
    const resolvePolylineDraftEndpointSnap = (worldRaw, baseSnap = null) =>
        resolvePolylineDraftEndpointSnapImpl(state, getLineCreateMode, worldRaw, baseSnap);

    dom.canvas.addEventListener("pointerdown", (e) => {
        dom.canvas.setPointerCapture(e.pointerId);
        if (touch.onPointerDown(e)) return;
        const screen = getMouseScreen(dom, e);
        const worldRaw = getMouseWorld(state, dom, e, false);
        // Prioritize object snap point if available
        const snap = resolvePolylineDraftEndpointSnap(worldRaw, getObjectSnapPoint(state, worldRaw));
        const ignoreGridSnapForDim = (state.tool === "dim") && !!state.dimSettings?.ignoreGridSnap;
        const world = snap
            ? { x: snap.x, y: snap.y }
            : (ignoreGridSnapForDim ? worldRaw : getMouseWorld(state, dom, e, true));
        state.input.pointerDown = true;

        // Keep raw world coordinates for drag flows that should ignore snapped coordinates.
        if (state.input.groupOriginPick.active && e.button === 0) {
            const activeG = getGroup(state, state.activeGroupId);
            if (activeG) {
                // Start dragging the active group origin marker immediately on pointer down.
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

        if (state.tool === "settings" && e.button === 0) {
            const hit = hitTestShapes(state, worldRaw, dom);
            if (!hit) {
                state.tool = "select";
                if (setStatus) setStatus("Settings closed");
                if (draw) draw();
                return;
            }
        }

        if (state.tool === "select") {
            const consumed = handlePointerDownSelectMode(state, dom, helpers, {
                isAppendSelect,
                setSelection,
                setStatus,
                draw,
                hitTestShapes,
                findConnectedLinesChain,
                hitActiveGroupRotateHandle,
                beginGroupRotateDrag,
                hitActiveGroupScaleHandle,
                beginGroupScaleDrag,
                hitActiveGroupOriginHandle,
                beginGroupOriginDrag,
                hitTestDimHandle,
                beginDimHandleDrag,
                hitTestImageScaleHandle,
                beginImageScaleDrag,
                toggleGroupSelectionById,
                beginSelectionDrag,
                clearSelection,
                beginSelectionBox
            }, { e, screen, worldRaw });
            if (consumed) return;
        }

        if (state.tool === "vertex") {
            const isPrimaryPress = (e.pointerType === "touch") || (e.button === 0);
            if (!isPrimaryPress) return;
            const targetIds = syncVertexTargetsFromSelection(false);
            if (!targetIds.length) {
                const hit = hitTestVertexEditableShape(worldRaw);
                if (hit && isVertexEditableShapeType(hit.type)) {
                    if (hit.type === "line" && selectVertexConnectedChainFromLine(Number(hit.id))) {
                        if (setStatus) setStatus("Connected lines selected for vertex edit");
                    } else {
                        setSelection([Number(hit.id)]);
                        state.activeGroupId = null;
                        state.vertexEdit.targetShapeIds = [Number(hit.id)];
                        state.vertexEdit.filterShapeId = Number(hit.id);
                        state.vertexEdit.insertCandidate = null;
                        clearVertexSelection(state);
                        if (setStatus) setStatus("Vertex target selected");
                    }
                } else {
                    // No current target: allow drag-box to pick vertices after target is chosen.
                    beginVertexSelectionBox(state, screen, e.shiftKey);
                    if (setStatus) setStatus("Drag to select vertices");
                }
                if (draw) draw();
                return;
            }
            const targetSet = new Set(targetIds.map(Number).filter(Number.isFinite));
            const vertexMode = String(state.vertexEdit?.mode || "move").toLowerCase();
            if (vertexMode === "insert") {
                const cand = getVertexInsertCandidate(state, worldRaw);
                state.vertexEdit.insertCandidate = cand;
                if (cand) {
                    const ok = insertVertexAtCandidate(state, cand, helpers);
                    if (ok && setStatus) setStatus("Vertex inserted");
                } else {
                    const shapeHit = hitTestVertexEditableShape(worldRaw);
                    if (shapeHit && isVertexEditableShapeType(shapeHit.type)) {
                        if (shapeHit.type === "line" && selectVertexConnectedChainFromLine(Number(shapeHit.id))) {
                            if (setStatus) setStatus("Connected lines selected for vertex edit");
                        } else if (targetSet.has(Number(shapeHit.id))) {
                            state.vertexEdit.filterShapeId = Number(shapeHit.id);
                            clearVertexSelection(state);
                        } else {
                            setSelection([Number(shapeHit.id)]);
                            state.activeGroupId = null;
                            state.vertexEdit.targetShapeIds = [Number(shapeHit.id)];
                            state.vertexEdit.filterShapeId = Number(shapeHit.id);
                            state.vertexEdit.insertCandidate = null;
                            clearVertexSelection(state);
                            if (setStatus) setStatus("Vertex target selected");
                        }
                    } else {
                        clearSelection(state);
                        state.vertexEdit.targetShapeIds = [];
                        state.vertexEdit.filterShapeId = null;
                        state.vertexEdit.insertCandidate = null;
                        clearVertexSelection(state);
                        if (setStatus) setStatus("Selection cleared");
                    }
                }
            } else {
                const vhit = hitTestVertexHandle(state, worldRaw);
                if (vhit) {
                    // Vertex clicked: clear line filter, begin drag
                    state.vertexEdit.filterShapeId = null;
                    beginVertexDrag(state, vhit, worldRaw, helpers, e.shiftKey);
                } else {
                    // No vertex hit: check if a line was clicked to set filter
                    const shapeHit = hitTestVertexEditableShape(worldRaw);
                    if (shapeHit && isVertexEditableShapeType(shapeHit.type)) {
                        if (shapeHit.type === "line" && selectVertexConnectedChainFromLine(Number(shapeHit.id))) {
                            if (setStatus) setStatus("Connected lines selected for vertex edit");
                        } else if (targetSet.has(Number(shapeHit.id))) {
                            state.vertexEdit.filterShapeId = Number(shapeHit.id);
                            clearVertexSelection(state);
                        } else {
                            setSelection([Number(shapeHit.id)]);
                            state.activeGroupId = null;
                            state.vertexEdit.targetShapeIds = [Number(shapeHit.id)];
                            state.vertexEdit.filterShapeId = Number(shapeHit.id);
                            state.vertexEdit.insertCandidate = null;
                            clearVertexSelection(state);
                            if (setStatus) setStatus("Vertex target selected");
                        }
                    } else {
                        // Empty area: start vertex box selection (drag-select).
                        beginVertexSelectionBox(state, screen, e.shiftKey);
                        if (setStatus) setStatus("Drag to select vertices");
                    }
                }
            }
            if (draw) draw();
            return;
        }

        {
            const consumedDraw = handlePointerDownDrawMode(state, dom, helpers, {
                draw,
                setStatus,
                hitTestShapes,
                beginSelectionDrag,
                getCircleCreateMode,
                isAppendSelect,
                setSelection,
                pushHistory,
                createCircle,
                createRect,
                createPosition,
                nextShapeId,
                applyToolStrokeToShape,
                addShape,
                clearSelection,
                beginOrExtendBsplineDraft,
                getLineCreateMode,
                getFixedLineFromAnchor,
                createLine,
                getRectFromAnchor,
                beginOrExtendPolyline
            }, { e, worldRaw, world });
            if (consumedDraw) return;
        }

        if (state.tool === "polyline") {
            const isPrimaryPress = e.pointerType === "touch" || e.button === 0;
            if (!isPrimaryPress) return;
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
            applyToolStrokeToShape(shape, state.tool);
            addShape(shape);
            if (setStatus) setStatus(`${state.tool.toUpperCase()} created`);
            if (draw) draw();
            return;
        }

        if (state.tool === "dim") {
            if (e.button !== 0) return;
            const dimHandleHit = hitTestDimHandle(state, worldRaw);
            if (dimHandleHit) {
                beginDimHandleDrag(state, dimHandleHit, worldRaw);
                if (draw) draw();
                return;
            }
            const linearMode = state.dimSettings?.linearMode || "single";
            const hit = hitTestShapes(state, worldRaw, dom);
            // Empty click in dim tool: clear current selection and keep dim tool active.
            if (!state.dimDraft && !hit && ((state.selection?.ids?.length || 0) > 0 || state.activeGroupId != null)) {
                clearSelection();
                state.activeGroupId = null;
                if (setStatus) setStatus("Selection cleared (Dim tool)");
                if (draw) draw();
                return;
            }
            // In single mode, drag from a hovered line candidate to place dimension at mouse-up.
            if (!state.dimDraft && linearMode === "single") {
                const hoveredId = Number(state.input?.dimHoveredShapeId);
                const hoveredShape = (state.shapes || []).find(s => Number(s?.id) === hoveredId);
                if (hoveredShape && hoveredShape.type === "line") {
                    state.dimDraft = {
                        p1: { x: Number(hoveredShape.x1), y: Number(hoveredShape.y1) },
                        p2: { x: Number(hoveredShape.x2), y: Number(hoveredShape.y2) },
                        place: { x: world.x, y: world.y },
                        sourceLineId: Number(hoveredShape.id),
                        sourceRefType: "line_endpoint",
                        sourceRefKey1: "p1",
                        sourceRefKey2: "p2",
                    };
                    state.input.dimLineDrag.active = true;
                    state.input.dimLineDrag.moved = false;
                    if (setStatus) setStatus("Dim: drag to place, release to create.");
                    if (draw) draw();
                    return;
                }
                if (hoveredShape && hoveredShape.type === "polyline") {
                    const pts = Array.isArray(hoveredShape.points) ? hoveredShape.points : [];
                    const segIdx = Number(state.input?.dimHoveredSegmentIndex);
                    if (pts.length >= 2 && Number.isFinite(segIdx)) {
                        const segCount = pts.length - 1 + (hoveredShape.closed ? 1 : 0);
                        if (segIdx >= 0 && segIdx < segCount) {
                            const i1 = segIdx;
                            const i2 = (segIdx + 1) % pts.length;
                            const p1 = pts[i1];
                            const p2 = pts[i2];
                            state.dimDraft = {
                                p1: { x: Number(p1.x), y: Number(p1.y) },
                                p2: { x: Number(p2.x), y: Number(p2.y) },
                                place: { x: world.x, y: world.y },
                                sourceLineId: Number(hoveredShape.id),
                                sourceRefType: "polyline_vertex",
                                sourceRefKey1: `v${Number(i1)}`,
                                sourceRefKey2: `v${Number(i2)}`,
                            };
                            state.input.dimLineDrag.active = true;
                            state.input.dimLineDrag.moved = false;
                            if (setStatus) setStatus("Dim: drag to place, release to create.");
                            if (draw) draw();
                            return;
                        }
                    }
                }
            }
            let finalWorld = world; // object-snapped world
            // Circle perimeter snap for p1 and p2 placement (not for place/line-offset click)
            const d = state.dimDraft;
            if (!d || (d.p1 && !d.p2)) {
                const hit = hitTestShapes(state, worldRaw);
                if (hit && (hit.type === "circle" || hit.type === "arc")) {
                    const angle = Math.atan2(worldRaw.y - hit.cy, worldRaw.x - hit.cx);
                    finalWorld = { x: hit.cx + Math.cos(angle) * hit.r, y: hit.cy + Math.sin(angle) * hit.r };
                }
            }
            const res = helpers.beginOrAdvanceDim(finalWorld);
            if (res === "circle-ref") {
                helpers.finalizeDimDraft();
            } else if (res === "place" && (linearMode !== "chain" || state.dimDraft?.type === "dimchain")) {
                helpers.finalizeDimDraft();
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "trim") {
            if (e.button !== 0) return;
            const trimHover = state.input.modifierKeys.alt
                ? getTrimDeleteOnlyHoverCandidate(state, worldRaw, dom)
                : getTrimHoverCandidate(state, worldRaw, dom, { fast: true });
            const hit = hitTestShapes(state, worldRaw, dom);
            const trimClickableTypes = new Set(["line", "circle", "arc", "polyline", "bspline"]);
            const hasDirectTrimTarget = !!trimHover || trimClickableTypes.has(String(hit?.type || "").toLowerCase());
            if (hasDirectTrimTarget) {
                const ok = trimClickedLineAtNearestIntersection(state, worldRaw, helpers);
                if (!ok && setStatus) setStatus("Trim: Click a line near an intersection");
            } else {
                beginSelectionBox(state, screen, false);
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "fillet") {
            if (e.button !== 0) return;
            const curTargets = Array.isArray(state.input?.filletTargets) ? state.input.filletTargets.filter(Boolean) : [];
            if (curTargets.length === 2) {
                const committed = commitFilletFromHover(worldRaw);
                if (committed) {
                    clearSelection();
                    state.input.filletTargets = [];
                    state.activeGroupId = null;
                    state.input.filletFlow = null;
                    if (setStatus) setStatus("Fillet created");
                }
                if (draw) draw();
                return;
            }
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit && isFilletTargetShape(hit)) {
                const nextTarget = getFilletTargetRef(hit, worldRaw);
                if (nextTarget) {
                    const cur = Array.isArray(state.input?.filletTargets) ? state.input.filletTargets.filter(Boolean) : [];
                    const nextKey = filletTargetKey(nextTarget);
                    const existingIndex = cur.findIndex((t) => filletTargetKey(t) === nextKey);
                    let next = cur.slice();
                    if (existingIndex >= 0) next.splice(existingIndex, 1);
                    else if (next.length === 0) next = [nextTarget];
                    else if (next.length === 1) next = [next[0], nextTarget];
                    else next = [next[1], nextTarget];
                    syncFilletSelectionFromTargets(next);
                    if (setStatus) {
                        if (next.length >= 2) {
                            const touchMode = !!state.ui?.touchMode;
                            setStatus(touchMode
                                ? "Fillet: candidate ready. Tap the top-left Confirm button to apply."
                                : "Fillet: candidate ready. Click or press Enter to apply, Esc to cancel.");
                        } else {
                            setStatus("Fillet: select 2 edges/arcs.");
                        }
                    }
                }
            }
            if (draw) draw();
            return;
        }
        if (state.tool === "hatch") {
            if (e.button !== 0) return;
            const hatchPickState = {
                ...state,
                shapes: (state.shapes || []).filter((s) => isHatchBoundaryShape(s)),
            };
            const hit = hitTestShapes(hatchPickState, worldRaw, dom);
            if (hit) {
                if (!isHatchBoundaryShape(hit)) {
                    if (setStatus) setStatus("Hatch: line/arc/circle/rect/polyline/B-spline only");
                    if (draw) draw();
                    return;
                }
                const id = Number(hit.id);
                if (!state.hatchDraft.boundaryIds) state.hatchDraft.boundaryIds = [];
                const idx = state.hatchDraft.boundaryIds.indexOf(id);
                if (idx >= 0) state.hatchDraft.boundaryIds.splice(idx, 1);
                else state.hatchDraft.boundaryIds.push(id);
                if (state.input) state.input.hatchValidation = null;
            } else {
                // Empty-click in hatch tool should clear current boundary selection.
                state.hatchDraft.boundaryIds = [];
                clearSelection();
                state.activeGroupId = null;
                if (state.input) state.input.hatchValidation = null;
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "doubleline") {
            if (e.button !== 0) return;
            if (state.dlineTrimPending) {
                if (draw) draw();
                return;
            }
            const hit = hitTestShapes(state, worldRaw, dom);
            const isSingleMode = String(state.dlineSettings?.mode || "both") === "single";
            const hasSelection = Array.isArray(state.selection?.ids) && state.selection.ids.length > 0;
            const hitId = Number(hit?.id);
            const hitIsSelected = Number.isFinite(hitId) && state.selection.ids.some((id) => Number(id) === hitId);
            if (isSingleMode && hasSelection && !isAppendSelect(e) && (!hit || hitIsSelected)) {
                // In single mode, one click locks inside/outside side until execute/cancel.
                state.dlineSingleSidePickPoint = { x: Number(worldRaw.x), y: Number(worldRaw.y) };
                state.dlinePreview = buildDoubleLinePreviewForSelection(state.dlineSingleSidePickPoint);
                refreshDoubleLineCandidateMarkers?.();
                if (draw) draw();
                return;
            }
            if (hit && (hit.type === "line" || hit.type === "circle" || hit.type === "arc" || hit.type === "polyline" || hit.type === "bspline")) {
                const cur = new Set(state.selection.ids.map(Number));
                if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                setSelection(Array.from(cur));
            } else {
                if (!isAppendSelect(e)) {
                    clearSelection();
                    state.activeGroupId = null;
                }
                beginSelectionBox(state, screen, isAppendSelect(e));
            }
            const sidePt = state.dlineSingleSidePickPoint || worldRaw;
            state.dlinePreview = buildDoubleLinePreviewForSelection(sidePt);
            refreshDoubleLineCandidateMarkers?.();
            if (state.dlineSettings?.noTrim) {
                state.dlineTrimIntersections = null;
            } else {
                state.dlineTrimIntersections = buildDoubleLineTrimMarkersForSelection(state.dlinePreview || []);
            }
            if (draw) draw();
            return;
        }

        if (state.tool === "patterncopy") {
            if (e.button !== 0) return;
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit) {
                const pickMode = String(state.ui?.selectPickMode || "object");
                if (pickMode === "group" && hit.groupId != null) {
                    toggleGroupSelectionById(state, hit.groupId);
                } else if (isAppendSelect(e)) {
                    const cur = new Set(state.selection.ids.map(Number));
                    if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                    setSelection(Array.from(cur));
                    state.activeGroupId = null;
                } else {
                    setSelection([Number(hit.id)]);
                    state.activeGroupId = null;
                }
            } else {
                if (!isAppendSelect(e)) {
                    clearSelection();
                    state.activeGroupId = null;
                }
                beginSelectionBox(state, screen, isAppendSelect(e));
            }
            if (draw) draw();
            return;
        }
    });

    const hasAnyVisibleLayer = () => {
        const layers = state.layers || [];
        if (!layers.length) return true;
        for (const l of layers) {
            if (l?.visible !== false) return true;
        }
        return false;
    };
    dom.canvas.addEventListener("pointermove", (e) => {
        const drawFast = () => { if (draw) draw({ skipUi: true }); };
        if (touch.onPointerMove(e, drawFast)) return;
        const screen = getMouseScreen(dom, e);
        const worldRaw = getMouseWorld(state, dom, e, false);

        // Fast-path: operations that don't need object snap. Moving these before snap/hit-test
        // avoids iterating all shapes on every mousemove event during pan/drag.
        if (state.input.panning) {
            const dx = screen.x - state.input.panAnchor.x;
            const dy = screen.y - state.input.panAnchor.y;
            state.view.offsetX = state.input.panAnchor.ox + dx;
            state.view.offsetY = state.input.panAnchor.oy + dy;
            drawFast();
            return;
        }
        if (state.input.groupRotate.active) {
            applyGroupRotateDrag(state, worldRaw);
            drawFast();
            return;
        }
        if (state.input.groupScale.active) {
            applyGroupScaleDrag(state, worldRaw);
            drawFast();
            return;
        }
        if (state.input.groupDrag.active) {
            applyGroupOriginDrag(state, worldRaw);
            drawFast();
            return;
        }
        if (state.input.dimHandleDrag.active) {
            applyDimHandleDrag(state, worldRaw);
            drawFast();
            return;
        }
        if (state.selection.drag.active) {
            applySelectionDrag(state, worldRaw);
            drawFast();
            return;
        }
        if (state.selection.box.active) {
            updateSelectionBox(state, screen);
            drawFast();
            return;
        }

        // Object snap computation ? only runs for hover/tool-preview states (not pan/drag).
        const hasVisibleLayer = hasAnyVisibleLayer();
        // Prioritize object snap point if available for creation/previews
        const snapMove = resolvePolylineDraftEndpointSnap(
            worldRaw,
            hasVisibleLayer ? getObjectSnapPoint(state, worldRaw) : null
        );
        const ignoreGridSnapForDim = (state.tool === "dim") && !!state.dimSettings?.ignoreGridSnap;
        const world = snapMove
            ? { x: snapMove.x, y: snapMove.y }
            : (ignoreGridSnapForDim ? worldRaw : getMouseWorld(state, dom, e, true));

        if (state.input.groupOriginPick.dragging) {
            applyGroupOriginPickDrag(state, world);
            drawFast();
            return;
        }
        if (state.tool === "dim" && state.input.dimLineDrag.active && state.dimDraft?.p1 && state.dimDraft?.p2) {
            state.dimDraft.place = { x: world.x, y: world.y };
            state.input.dimLineDrag.moved = true;
            drawFast();
            return;
        }
        if (state.vertexEdit.drag.active) {
            // Vertex dragging uses raw coordinates so snap adjustments do not accumulate during drag.
            // worldRaw keeps the unsnapped pointer position for stable delta calculation.
            applyVertexDrag(state, worldRaw);
            drawFast();
            return;
        }

        state.input.hover.world = world;
        state.input.hover.screen = screen;
        state.input.hover.shape = hasVisibleLayer ? hitTestShapes(state, worldRaw, dom) : null;
        const vertexInsertMode = (state.tool === "vertex") && (String(state.vertexEdit?.mode || "move").toLowerCase() === "insert");
        state.input.hover.vertex = (!vertexInsertMode && hasVisibleLayer) ? hitTestVertexHandle(state, worldRaw) : null;
        if (vertexInsertMode && hasVisibleLayer) {
            state.vertexEdit.insertCandidate = getVertexInsertCandidate(state, worldRaw);
        } else if (state.vertexEdit) {
            state.vertexEdit.insertCandidate = null;
        }
        state.input.hover.groupRotate = hitActiveGroupRotateHandle(state, screen);
        state.input.hover.groupScale = hitActiveGroupScaleHandle(state, screen);
        state.input.hover.groupOrigin = hitActiveGroupOriginHandle(state, screen);
        state.input.hover.dimHandle = hasVisibleLayer ? hitTestDimHandle(state, worldRaw) : null;

        // Snap and Hover Candidates for render.js
        state.input.objectSnapHover = snapMove;
        state.input.hoverWorld = world;

        state.input.trimHover = (hasVisibleLayer && state.tool === "trim")
            ? (state.input.modifierKeys.alt ? getTrimDeleteOnlyHoverCandidate(state, worldRaw, dom) : getTrimHoverCandidate(state, worldRaw, dom, { fast: true }))
            : null;
        state.input.filletHover = (hasVisibleLayer && state.tool === "fillet") ? getFilletHoverCandidate(state, worldRaw) : null;
        if (state.tool === "fillet" && (Array.isArray(state.input?.filletTargets) ? state.input.filletTargets.filter(Boolean).length : 0) === 2 && !state.input.filletHover) {
            if (setStatus) setStatus("Fillet: no valid solution for current objects.");
        }
        state.input.hatchHover = (hasVisibleLayer && state.tool === "hatch") ? hitTestShapes(state, worldRaw, dom) : null;

        if (state.tool === "dim" && hasVisibleLayer) {
            let dimWorld = world; // object-snapped world as default
            // Circle perimeter snap for p1 and p2 hover (not when placing dim line offset)
            const d = state.dimDraft;
            if (!d || (d.p1 && !d.p2)) {
                const hit = hitTestShapes(state, worldRaw);
                if (hit && (hit.type === "circle" || hit.type === "arc")) {
                    const angle = Math.atan2(worldRaw.y - hit.cy, worldRaw.x - hit.cx);
                    dimWorld = { x: hit.cx + Math.cos(angle) * hit.r, y: hit.cy + Math.sin(angle) * hit.r };
                }
            }
            helpers.updateDimHover(worldRaw, dimWorld);
        }

        if (state.tool === "polyline" || (state.tool === "line" && getLineCreateMode() === "continuous")) {
            helpers.updatePolylineHover(state.input.hoverWorld);
        }
        if (state.tool === "line" && getLineCreateMode() === "freehand") {
            updateBsplineDraftHover(state.input.hoverWorld);
        }

        // Preview Shape
        state.preview = null;
        if (state.tool === "doubleline") {
            if (state.dlineTrimPending) {
                drawFast();
                return;
            }
            const sidePt = state.dlineSingleSidePickPoint || worldRaw;
            state.dlinePreview = buildDoubleLinePreviewForSelection(sidePt);
            refreshDoubleLineCandidateMarkers?.();
            if (state.dlineSettings?.noTrim) {
                state.dlineTrimIntersections = null;
            } else {
                state.dlineTrimIntersections = buildDoubleLineTrimMarkersForSelection(state.dlinePreview || []);
            }
        }
        const touchRectDraft = state.input?.touchRectDraft;
        const isTouchRectFlow = (state.tool === "rect") && !!state.ui?.touchMode;
        if (isTouchRectFlow && touchRectDraft) {
            if (Number(touchRectDraft.stage) === 1 && touchRectDraft.p1 && touchRectDraft.candidateEnd) {
                state.preview = {
                    type: "touchRectPlan",
                    x1: Number(touchRectDraft.p1.x),
                    y1: Number(touchRectDraft.p1.y),
                    x2: Number(touchRectDraft.candidateEnd.x),
                    y2: Number(touchRectDraft.candidateEnd.y),
                };
            } else if (Number(touchRectDraft.stage) === 1 && touchRectDraft.p1) {
                const ph = state.input.hoverWorld || world;
                state.preview = {
                    type: "touchRectCandidates",
                    x1: Number(touchRectDraft.p1.x),
                    y1: Number(touchRectDraft.p1.y),
                    x2: Number(ph.x),
                    y2: Number(ph.y),
                };
            } else if (touchRectDraft.candidateStart) {
                state.preview = helpers.createPosition(touchRectDraft.candidateStart);
                state.preview.positionPreviewMode = "marker";
            } else {
                const ph = state.input.hoverWorld || world;
                state.preview = helpers.createPosition(ph);
                state.preview.positionPreviewMode = "marker";
            }
            drawFast();
            return;
        }
        if (state.input.dragStartWorld) {
            const p1 = state.input.dragStartWorld;
            const p2 = state.input.hoverWorld;
            if (state.tool === "line") state.preview = helpers.createLine(p1, p2);
            else if (state.tool === "rect") state.preview = helpers.createRect(p1, p2);
            else if (state.tool === "circle" && getCircleCreateMode() === "drag") state.preview = helpers.createCircle(p1, p2);
        } else {
            // Before the first click: show hint or ghost
            const ph = state.input.hoverWorld;
            if (["line", "rect", "circle", "polyline", "polyline_continue", "position"].includes(state.tool)) {
                if (state.tool === "position") {
                    state.preview = helpers.createPosition(ph);
                    state.preview.size = Number(state.positionSettings?.size) || 20;
                    state.preview.positionPreviewMode = "actual";
                } else if (state.tool === "line" && !!state.lineSettings?.sizeLocked && getLineCreateMode() === "segment") {
                    const ll = Math.max(0, Number(state.lineSettings?.length) || 0);
                    const aa = Number(state.lineSettings?.angleDeg ?? state.lineSettings?.angle ?? 0) || 0;
                    const anchorKey = String(state.lineSettings?.anchor || "endpoint_a");
                    const { p1, p2 } = getFixedLineFromAnchor(ph, ll, aa, anchorKey);
                    state.preview = helpers.createLine(p1, p2);
                    state.preview.linePreviewMode = "fixed";
                    state.preview.lineAnchorWorld = { x: Number(ph.x), y: Number(ph.y) };
                } else if (state.tool === "line" && getLineCreateMode() === "freehand") {
                    state.preview = helpers.createPosition(ph);
                    state.preview.positionPreviewMode = "marker";
                } else if (state.tool === "rect" && !!state.rectSettings?.sizeLocked) {
                    const ww = Math.max(0, Number(state.rectSettings?.width) || 0);
                    const hh = Math.max(0, Number(state.rectSettings?.height) || 0);
                    const anchorKey = String(state.rectSettings?.anchor || "c");
                    const { p1, p2 } = getRectFromAnchor(ph, ww, hh, anchorKey);
                    state.preview = helpers.createRect(p1, p2);
                    state.preview.rectPreviewMode = "fixed";
                    state.preview.rectAnchorWorld = { x: Number(ph.x), y: Number(ph.y) };
                } else if (state.tool === "circle" && getCircleCreateMode() === "fixed") {
                    const rr = Math.max(0, Number(state.circleSettings?.radius) || 0);
                    const edge = { x: ph.x + rr, y: ph.y };
                    state.preview = helpers.createCircle(ph, edge);
                    state.preview.circlePreviewMode = "fixed";
                    state.preview.circleAnchorWorld = { x: Number(ph.x), y: Number(ph.y) };
                } else if (state.tool === "circle" && getCircleCreateMode() === "threepoint") {
                    // No target candidate marker in 3-point mode.
                } else {
                    // Crosshair-like first-point hint for other creation tools.
                    state.preview = helpers.createPosition(ph);
                    state.preview.positionPreviewMode = "marker";
                }
            } else if (state.tool === "text") {
                state.preview = helpers.createText(ph, state.textSettings);
            }
        }

        drawFast();
    });

    dom.canvas.addEventListener("pointerup", (e) => {
        dom.canvas.releasePointerCapture(e.pointerId);
        touch.onPointerEnd(e);
        state.input.pointerDown = false;
        state.input.panning = false;

        if (state.input.groupRotate.active) {
            const { moved, snapshot } = endGroupRotateDrag(state);
            if (moved) pushHistorySnapshot(state, snapshot);
        }
        if (state.input.groupScale.active) {
            const { moved, snapshot } = endGroupScaleDrag(state);
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
            const { moved, snapshot, anchorShapeId, anchorKey, lastTangentSnap, lastIntersectionSnap, lastObjectSnap } = endVertexDrag(state);
            if (moved) {
                const keepSnap = !!(state.objectSnap?.keepAttributes || state.objectSnap?.tangentKeep);
                let keepUsed = false;
                // Preserve tangent relation when keep-attributes mode is enabled and tangent snap was used.
                if (lastTangentSnap && keepSnap) {
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
                            else anchorShape.p2Attrib = attrib;
                            if (!Array.isArray(anchorShape.attributes)) anchorShape.attributes = [];
                            const target = `vertex:${anchorKey}`;
                            const keepValue = `tangent:circle:${Number(lastTangentSnap.circleId)}:side:${side}`;
                            const existing = anchorShape.attributes.find(a => a && String(a.name || "") === "keep_snap" && String(a.target || "") === target);
                            if (existing) existing.value = keepValue;
                            else anchorShape.attributes.push({
                                id: `attr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
                                name: "keep_snap",
                                value: keepValue,
                                target
                            });
                            keepUsed = true;
                        }
                    }
                }
                if (lastIntersectionSnap && keepSnap) {
                    const anchorShape = state.shapes.find(s => Number(s.id) === Number(anchorShapeId));
                    if (anchorShape?.type === "line" && (anchorKey === "p1" || anchorKey === "p2")) {
                        const attrib = {
                            type: "intersection",
                            lineAId: Number(lastIntersectionSnap.lineAId),
                            lineBId: Number(lastIntersectionSnap.lineBId),
                        };
                        if (anchorKey === "p1") anchorShape.p1Attrib = attrib;
                        else anchorShape.p2Attrib = attrib;
                        if (!Array.isArray(anchorShape.attributes)) anchorShape.attributes = [];
                        const target = `vertex:${anchorKey}`;
                        const keepSnapAttr = anchorShape.attributes.find(a => a && String(a.name || "") === "keep_snap" && String(a.target || "") === target);
                        if (keepSnapAttr) keepSnapAttr.value = `intersection:line:${attrib.lineAId}-${attrib.lineBId}`;
                        else anchorShape.attributes.push({
                            id: `attr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
                            name: "keep_snap",
                            value: `intersection:line:${attrib.lineAId}-${attrib.lineBId}`,
                            target
                        });
                        anchorShape.attributes = anchorShape.attributes.filter(a => !(String(a?.target || "") === target && String(a?.name || "") === "keep_intersection"));
                        keepUsed = true;
                    }
                }
                if (!keepUsed && keepSnap && lastObjectSnap && Number.isFinite(Number(lastObjectSnap.x)) && Number.isFinite(Number(lastObjectSnap.y))) {
                    const anchorShape = state.shapes.find(s => Number(s.id) === Number(anchorShapeId));
                    if (anchorShape?.type === "line" && (anchorKey === "p1" || anchorKey === "p2")) {
                        let attrib = null;
                        if ((lastObjectSnap.kind === "endpoint" || lastObjectSnap.kind === "center" || lastObjectSnap.kind === "midpoint")
                            && Number.isFinite(Number(lastObjectSnap.shapeId))
                            && String(lastObjectSnap.refType || "").length > 0) {
                            attrib = {
                                type: "followPoint",
                                shapeId: Number(lastObjectSnap.shapeId),
                                refType: String(lastObjectSnap.refType),
                                refKey: String(lastObjectSnap.refKey || "")
                            };
                        } else {
                            attrib = { type: "fixedPoint", x: Number(lastObjectSnap.x), y: Number(lastObjectSnap.y) };
                        }
                        if (anchorKey === "p1") anchorShape.p1Attrib = attrib;
                        else anchorShape.p2Attrib = attrib;
                        if (!Array.isArray(anchorShape.attributes)) anchorShape.attributes = [];
                        const target = `vertex:${anchorKey}`;
                        const keepValue = attrib.type === "followPoint"
                            ? `follow:${attrib.refType}:${attrib.shapeId}:${attrib.refKey}`
                            : `fixed:${Number(lastObjectSnap.x).toFixed(3)},${Number(lastObjectSnap.y).toFixed(3)}`;
                        const existing = anchorShape.attributes.find(a => a && String(a.name || "") === "keep_snap" && String(a.target || "") === target);
                        if (existing) {
                            existing.value = keepValue;
                        } else {
                            anchorShape.attributes.push({
                                id: `attr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
                                name: "keep_snap",
                                value: keepValue,
                                target
                            });
                        }
                        keepUsed = true;
                    }
                }
                if (keepUsed) {
                    // Keep the tangent-attribute toggle state after applying it once.
                }
                pushHistorySnapshot(state, snapshot);
            }
        }
        if (state.selection.drag.active) {
            const { moved, snapshot } = endSelectionDrag(state);
            if (moved) {
                // Snapshot captured at beginSelectionDrag.
                if (snapshot) pushHistorySnapshot(state, snapshot);
                else pushHistory(state); // fallback
            }
        }
        if (state.selection.box.active) {
            if (state.tool === "vertex" && String(state.vertexEdit?.mode || "move").toLowerCase() !== "insert") {
                endVertexSelectionBox(state, helpers);
            } else {
                const dragged = endSelectionBox(state, helpers);
                if (state.tool === "trim" && dragged) {
                    const trimDeleteTypes = new Set(["line", "circle", "arc", "polyline", "bspline"]);
                    const targetIds = (state.selection?.ids || [])
                        .map(Number)
                        .filter((id) => {
                            const shape = (state.shapes || []).find((s) => Number(s.id) === id);
                            return trimDeleteTypes.has(String(shape?.type || "").toLowerCase());
                        });
                    if (targetIds.length > 0) {
                        if (state.trimSettings?.noDelete) {
                            if (setStatus) setStatus("Trim: drag delete is unavailable in split-only mode");
                        } else {
                            pushHistory();
                            for (const id of targetIds) removeShapeById(id);
                            clearSelection();
                            if (setStatus) setStatus(`Trim deleted ${targetIds.length} object(s)`);
                        }
                    }
                }
            }
        }
        if (state.tool === "dim" && state.input.dimLineDrag.active) {
            if (state.dimDraft?.p1 && state.dimDraft?.p2 && state.dimDraft?.place) {
                helpers.finalizeDimDraft();
            } else {
                state.dimDraft = null;
            }
            state.input.dimLineDrag.active = false;
            state.input.dimLineDrag.moved = false;
        }
        // Circle drag-finalize was removed; circle(mode=drag) now uses 2-click finalize
        // in handlePointerDownDrawMode, same as rectangle.

        if (draw) draw();
    });
    bindInputTailEvents(state, dom, helpers, {
        touch,
        draw,
        setStatus,
        getLineCreateMode,
        finalizeBsplineDraft,
        zoomAt,
        getMouseScreen,
        getMouseWorld,
        hitTestShapes,
        findConnectedLinesChain,
        setSelection
    });

    bindKeyboardInput(state, helpers, {
        draw,
        setStatus,
        setTool,
        clearSelection,
        toggleDebugConsole: helpers.toggleDebugConsole,
        getLineCreateMode,
        toggleAdsVisible: helpers.toggleAdsVisible,
        setTouchMode: helpers.setTouchMode,
        finalizeBsplineDraft,
        commitFilletFromHover,
        isTypingTarget,
        findShortcutAction
    });
    bindViewportResize(helpers, draw);
}





















