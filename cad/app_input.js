import {
    clearSelection, setSelection, getGroup, pushHistorySnapshot
} from "./state.js";
import {
    screenToWorld, snapPoint, getEffectiveGridSize
} from "./geom.js";
import {
    hitActiveGroupRotateHandle, hitActiveGroupOriginHandle, hitTestVertexHandle,
    beginGroupRotateDrag, beginGroupOriginDrag, beginSelectionBox,
    hitTestShapes, hitTestDimHandle, beginDimHandleDrag, beginVertexDrag,
    beginSelectionDrag, toggleGroupSelectionById,
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
import { buildDoubleLinePreview } from "./dline_geom.js";

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
    const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
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
    const normalizeLineType = (v) => {
        const allowed = new Set(["solid", "dashed", "dotted", "dashdot", "longdash", "center", "hidden"]);
        const key = String(v || "solid").toLowerCase();
        return allowed.has(key) ? key : "solid";
    };
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
        shape.lineWidthMm = lw;
        shape.lineType = lt;
        return shape;
    };
    const getRectFromAnchor = (anchorWorld, width, height, anchorKey) => {
        const w = Math.max(0, Number(width) || 0);
        const h = Math.max(0, Number(height) || 0);
        const key = String(anchorKey || "c").toLowerCase();
        let ox = -w * 0.5;
        let oy = -h * 0.5;
        if (key === "tl") { ox = 0; oy = 0; }
        else if (key === "tc") { ox = -w * 0.5; oy = 0; }
        else if (key === "tr") { ox = -w; oy = 0; }
        else if (key === "cl") { ox = 0; oy = -h * 0.5; }
        else if (key === "cr") { ox = -w; oy = -h * 0.5; }
        else if (key === "bl") { ox = 0; oy = -h; }
        else if (key === "bc") { ox = -w * 0.5; oy = -h; }
        else if (key === "br") { ox = -w; oy = -h; }
        const p1 = { x: Number(anchorWorld.x) + ox, y: Number(anchorWorld.y) + oy };
        const p2 = { x: p1.x + w, y: p1.y + h };
        return { p1, p2 };
    };
    const getFixedLineFromAnchor = (anchorWorld, len, angleDeg, anchorKey) => {
        const L = Math.max(0, Number(len) || 0);
        const a = (Number(angleDeg) || 0) * Math.PI / 180;
        const vx = Math.cos(a) * L;
        const vy = Math.sin(a) * L;
        const key = String(anchorKey || "endpoint_a").toLowerCase();
        if (key === "center") {
            return {
                p1: { x: Number(anchorWorld.x) - vx * 0.5, y: Number(anchorWorld.y) - vy * 0.5 },
                p2: { x: Number(anchorWorld.x) + vx * 0.5, y: Number(anchorWorld.y) + vy * 0.5 },
            };
        }
        if (key === "endpoint_b") {
            return {
                p1: { x: Number(anchorWorld.x) - vx, y: Number(anchorWorld.y) - vy },
                p2: { x: Number(anchorWorld.x), y: Number(anchorWorld.y) },
            };
        }
        return {
            p1: { x: Number(anchorWorld.x), y: Number(anchorWorld.y) },
            p2: { x: Number(anchorWorld.x) + vx, y: Number(anchorWorld.y) + vy },
        };
    };

    const isFilletTargetShape = (s) => !!s && (s.type === "line" || s.type === "circle" || s.type === "arc");
    const getArcKeepSideByTangent = (arcShape, tangentPoint) => {
        const th = Math.atan2(Number(tangentPoint.y) - Number(arcShape.cy), Number(tangentPoint.x) - Number(arcShape.cx));
        const a1 = Number(arcShape.a1) || 0;
        const a2 = Number(arcShape.a2) || 0;
        const d1 = Math.abs(a1 - th);
        const d2 = Math.abs(a2 - th);
        // If a1 is closer to tangent point, trim a1 side and keep a2 side.
        return (d1 < d2) ? "a2" : "a1";
    };
    const commitFilletFromHover = (worldRawHint = null) => {
        const cand = state.input?.filletHover;
        if (!cand || !cand.sol) {
            if (setStatus) setStatus("Fillet: no candidate. Select two objects first.");
            return false;
        }
        const r = Number(state.filletSettings?.radius) || 20;
        if (cand.mode === "line-line") {
            // Keep the same ordering as getFilletHoverCandidate(getSelectedShapes),
            // which follows state.shapes order, not selection-click order.
            const selIdSet = new Set((state.selection.ids || []).map(Number));
            const selLines = (state.shapes || [])
                .filter(s => selIdSet.has(Number(s.id)) && s.type === "line");
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
        return false;
    };
    const resolvePolylineDraftEndpointSnap = (worldRaw, baseSnap = null) => {
        const isContinuousLine = state.tool === "line" && !!state.lineSettings?.continuous;
        const isPolylineTool = state.tool === "polyline";
        const pts = state.polylineDraft?.points;
        if ((!isContinuousLine && !isPolylineTool) || !Array.isArray(pts) || pts.length === 0) return baseSnap;
        const tol = 12 / Math.max(1e-9, state.view.scale);
        let best = baseSnap ? { ...baseSnap } : null;
        let bestD = baseSnap ? Math.hypot(worldRaw.x - baseSnap.x, worldRaw.y - baseSnap.y) : Infinity;
        for (const p of pts) {
            const x = Number(p?.x), y = Number(p?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
            const d = Math.hypot(worldRaw.x - x, worldRaw.y - y);
            if (d <= tol && d < bestD) {
                bestD = d;
                best = { x, y, kind: "endpoint" };
            }
        }
        return best;
    };

    dom.canvas.addEventListener("pointerdown", (e) => {
        dom.canvas.setPointerCapture(e.pointerId);
        const screen = getMouseScreen(dom, e);
        const worldRaw = getMouseWorld(state, dom, e, false);
        // Prioritize object snap point if available
        const snap = resolvePolylineDraftEndpointSnap(worldRaw, getObjectSnapPoint(state, worldRaw));
        const ignoreGridSnapForDim = (state.tool === "dim") && !!state.dimSettings?.ignoreGridSnap;
        const world = snap
            ? { x: snap.x, y: snap.y }
            : (ignoreGridSnapForDim ? worldRaw : getMouseWorld(state, dom, e, true));
        state.input.pointerDown = true;

        // 蝓ｺ貅也せ遘ｻ蜍輔Δ繝ｼ繝峨′繧｢繧ｯ繝・ぅ繝悶↑蝣ｴ蜷・
        if (state.input.groupOriginPick.active && e.button === 0) {
            const activeG = getGroup(state, state.activeGroupId);
            if (activeG) {
                // 繧ｹ繝翫ャ繝鈴←逕ｨ蠕後・蠎ｧ讓・world 繧剃ｽｿ逕ｨ縺吶ｋ
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
            const rotateHandleHit = hitActiveGroupRotateHandle(state, screen);
            if (rotateHandleHit && !e.shiftKey) {
                const hitGroupId = Number(rotateHandleHit.id);
                const selectedGroupIds = Array.isArray(state.selection?.groupIds)
                    ? state.selection.groupIds.map(Number).filter(Number.isFinite)
                    : [];
                const keepMultiGroupSelection = selectedGroupIds.length > 1 && selectedGroupIds.includes(hitGroupId);
                if (!keepMultiGroupSelection) {
                    setSelection((rotateHandleHit.shapeIds || []).slice());
                    state.selection.groupIds = [hitGroupId];
                }
                beginGroupRotateDrag(state, rotateHandleHit, worldRaw);
                if (draw) draw();
                return;
            }
            const groupHandleHit = hitActiveGroupOriginHandle(state, screen);
            if (groupHandleHit && !e.shiftKey) {
                const hitGroupId = Number(groupHandleHit.id);
                const selectedGroupIds = Array.isArray(state.selection?.groupIds)
                    ? state.selection.groupIds.map(Number).filter(Number.isFinite)
                    : [];
                const keepMultiGroupSelection = selectedGroupIds.length > 1 && selectedGroupIds.includes(hitGroupId);
                if (!keepMultiGroupSelection) {
                    setSelection((groupHandleHit.shapeIds || []).slice());
                    state.selection.groupIds = [hitGroupId];
                }
                beginGroupOriginDrag(state, groupHandleHit, worldRaw);
                if (draw) draw();
                return;
            }
            const dimHandleHit = hitTestDimHandle(state, worldRaw);
            if (dimHandleHit) {
                beginDimHandleDrag(state, dimHandleHit, worldRaw);
                if (draw) draw();
                return;
            }
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit) {
                const pickMode = String(state.ui?.selectPickMode || "object");
                if (pickMode === "group" && hit.groupId != null) {
                    toggleGroupSelectionById(state, hit.groupId);
                } else if (e.shiftKey) {
                    const cur = new Set(state.selection.ids.map(Number));
                    if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                    setSelection(Array.from(cur));
                } else {
                    setSelection([Number(hit.id)]);
                    state.activeGroupId = null;
                }
                beginSelectionDrag(state, worldRaw, helpers);
                if (draw) draw();
                return;
            } else {
                if (!e.shiftKey) {
                    clearSelection();
                    state.activeGroupId = null;
                }
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
            if (state.tool === "line" && !!state.lineSettings?.sizeLocked && !state.input.dragStartWorld && !state.lineSettings?.continuous) {
                const ll = Math.max(0, Number(state.lineSettings?.length) || 0);
                const aa = Number(state.lineSettings?.angleDeg ?? state.lineSettings?.angle ?? 0) || 0;
                if (ll > 0) {
                    const anchorKey = String(state.lineSettings?.anchor || "endpoint_a");
                    const { p1, p2 } = getFixedLineFromAnchor(world, ll, aa, anchorKey);
                    const shape = createLine(p1, p2);
                    pushHistory();
                    shape.id = nextShapeId();
                    shape.layerId = state.activeLayerId;
                    applyToolStrokeToShape(shape, "line");
                    addShape(shape);
                    clearSelection();
                    state.activeGroupId = null;
                    if (setStatus) setStatus("LINE created (サイズ固定)");
                    if (draw) draw();
                }
                return;
            }
            if (state.tool === "rect" && !!state.rectSettings?.sizeLocked && !state.input.dragStartWorld) {
                const ww = Math.max(0, Number(state.rectSettings?.width) || 0);
                const hh = Math.max(0, Number(state.rectSettings?.height) || 0);
                if (ww > 0 && hh > 0) {
                    const anchorKey = String(state.rectSettings?.anchor || "c");
                    const { p1, p2 } = getRectFromAnchor(world, ww, hh, anchorKey);
                    const lines = [
                        { type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p1.y },
                        { type: "line", x1: p2.x, y1: p1.y, x2: p2.x, y2: p2.y },
                        { type: "line", x1: p2.x, y1: p2.y, x2: p1.x, y2: p2.y },
                        { type: "line", x1: p1.x, y1: p2.y, x2: p1.x, y2: p1.y }
                    ];
                    lines.forEach(l => {
                        l.id = nextShapeId();
                        l.layerId = state.activeLayerId;
                        applyToolStrokeToShape(l, "rect");
                    });
                    pushHistory();
                    helpers.addShapesAsGroup(lines);
                    if (setStatus) setStatus("RECT created (サイズ固定)");
                    if (draw) draw();
                }
                return;
            }
            if (state.tool === "circle" && !!state.circleSettings?.radiusLocked && !state.input.dragStartWorld) {
                const rr = Math.max(0, Number(state.circleSettings?.radius) || 0);
                if (rr > 0) {
                    const edge = { x: world.x + rr, y: world.y };
                    pushHistory();
                    const shape = createCircle(world, edge);
                    shape.showCenterMark = !!state.circleSettings?.showCenterMark;
                    shape.id = nextShapeId();
                    shape.layerId = state.activeLayerId;
                    applyToolStrokeToShape(shape, "circle");
                    addShape(shape);
                    clearSelection();
                    state.activeGroupId = null;
                    if (setStatus) setStatus("CIRCLE created (半径固定)");
                    if (draw) draw();
                }
                return;
            }
            if (state.tool === "line" && state.lineSettings.continuous) {
                beginOrExtendPolyline(world);
                if (setStatus) setStatus("クリックで頂点追加  Enterキーで決定");
                if (draw) draw();
                return;
            }
            if (!state.input.dragStartWorld) {
                state.input.dragStartWorld = { x: world.x, y: world.y };
                if (setStatus) setStatus(`${state.tool.toUpperCase()}: Click second point`);
            } else {
                pushHistory();
                if (state.tool === "line" || state.tool === "circle") {
                    let shape;
                    if (state.tool === "line") shape = createLine(state.input.dragStartWorld, world);
                    else if (state.tool === "circle") {
                        shape = createCircle(state.input.dragStartWorld, world);
                        shape.showCenterMark = !!state.circleSettings?.showCenterMark;
                    }
                    if (shape) {
                        shape.id = nextShapeId();
                        shape.layerId = state.activeLayerId;
                        applyToolStrokeToShape(shape, state.tool);
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
                        applyToolStrokeToShape(l, "rect");
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
                const hoveredLine = (state.shapes || []).find(s => Number(s?.id) === hoveredId && s.type === "line");
                if (hoveredLine) {
                    state.dimDraft = {
                        p1: { x: Number(hoveredLine.x1), y: Number(hoveredLine.y1) },
                        p2: { x: Number(hoveredLine.x2), y: Number(hoveredLine.y2) },
                        place: { x: world.x, y: world.y },
                    };
                    state.input.dimLineDrag.active = true;
                    state.input.dimLineDrag.moved = false;
                    if (setStatus) setStatus("Dim: drag to place, release to create.");
                    if (draw) draw();
                    return;
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
            const ok = trimClickedLineAtNearestIntersection(state, worldRaw, helpers);
            if (!ok && setStatus) setStatus("Trim: Click a line near an intersection");
            if (draw) draw();
            return;
        }

        if (state.tool === "fillet") {
            if (e.button !== 0) return;
            if (state.selection.ids.length === 2) {
                const committed = commitFilletFromHover(worldRaw);
                if (committed) {
                    clearSelection();
                    state.activeGroupId = null;
                    state.input.filletFlow = null;
                    if (setStatus) setStatus("Fillet created");
                }
                if (draw) draw();
                return;
            }
            const hit = hitTestShapes(state, worldRaw, dom);
            if (hit && isFilletTargetShape(hit)) {
                const cur = state.selection.ids.map(Number);
                const hid = Number(hit.id);
                if (cur.includes(hid)) {
                    setSelection(cur.filter(id => id !== hid));
                } else if (cur.length === 0) {
                    setSelection([hid]);
                } else if (cur.length === 1) {
                    setSelection([cur[0], hid]);
                } else {
                    setSelection([cur[1], hid]);
                }
                if (setStatus) {
                    if (state.selection.ids.length >= 2) setStatus("Fillet: candidate ready. Click or press Enter to apply, Esc to cancel.");
                    else setStatus("Fillet: select 2 objects.");
                }
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
            if (hit && (hit.type === "line" || hit.type === "circle" || hit.type === "arc")) {
                const cur = new Set(state.selection.ids.map(Number));
                if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                setSelection(Array.from(cur));
            }
            state.dlinePreview = buildDoubleLinePreview(state, worldRaw);
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
                } else if (e.shiftKey) {
                    const cur = new Set(state.selection.ids.map(Number));
                    if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
                    setSelection(Array.from(cur));
                    state.activeGroupId = null;
                } else {
                    setSelection([Number(hit.id)]);
                    state.activeGroupId = null;
                }
            } else {
                if (!e.shiftKey) {
                    clearSelection();
                    state.activeGroupId = null;
                }
                beginSelectionBox(state, screen, e.shiftKey);
            }
            if (draw) draw();
            return;
        }
    });

    dom.canvas.addEventListener("pointermove", (e) => {
        const screen = getMouseScreen(dom, e);
        const worldRaw = getMouseWorld(state, dom, e, false);
        // Prioritize object snap point if available for creation/previews
        const snapMove = resolvePolylineDraftEndpointSnap(worldRaw, getObjectSnapPoint(state, worldRaw));
        const ignoreGridSnapForDim = (state.tool === "dim") && !!state.dimSettings?.ignoreGridSnap;
        const world = snapMove
            ? { x: snapMove.x, y: snapMove.y }
            : (ignoreGridSnapForDim ? worldRaw : getMouseWorld(state, dom, e, true));

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
        if (state.tool === "dim" && state.input.dimLineDrag.active && state.dimDraft?.p1 && state.dimDraft?.p2) {
            state.dimDraft.place = { x: world.x, y: world.y };
            state.input.dimLineDrag.moved = true;
            if (draw) draw();
            return;
        }
        if (state.vertexEdit.drag.active) {
            // 繝峨Λ繝・げ荳ｭ繧ゅせ繝翫ャ繝怜慍轤ｹ繧定ｨ育ｮ励＠縺ｦ繝帙ヰ繝ｼ諠・ｱ縺ｫ蜿肴丐縺輔○繧九◆繧・
            // worldRaw 繧剃ｽｿ縺｣縺ｦ繧ｹ繝翫ャ繝励・繧､繝ｳ繝医ｒ譏守､ｺ逧・↓譖ｴ譁ｰ・・pplyVertexDrag 蜀・〒繧り｡後ｏ繧後ｋ縺後｝ointermove 蛛ｴ縺ｧ縺ｮ荳雋ｫ諤ｧ縺ｮ縺溘ａ・・
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
        if (state.tool === "fillet" && state.selection.ids.length === 2 && !state.input.filletHover) {
            if (setStatus) setStatus("Fillet: no valid solution for current objects.");
        }
        state.input.hatchHover = (state.tool === "hatch") ? hitTestShapes(state, worldRaw, dom) : null;

        if (state.tool === "dim") {
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

        if (state.tool === "polyline" || (state.tool === "line" && state.lineSettings.continuous)) {
            helpers.updatePolylineHover(state.input.hoverWorld);
        }

        // Preview Shape
        state.preview = null;
        if (state.tool === "doubleline") {
            state.dlinePreview = buildDoubleLinePreview(state, worldRaw);
        }
        if (state.input.dragStartWorld) {
            const p1 = state.input.dragStartWorld;
            const p2 = state.input.hoverWorld;
            if (state.tool === "line") state.preview = helpers.createLine(p1, p2);
            else if (state.tool === "rect") state.preview = helpers.createRect(p1, p2);
            else if (state.tool === "circle") state.preview = helpers.createCircle(p1, p2);
        } else {
            // Before the first click: show hint or ghost
            const ph = state.input.hoverWorld;
            if (["line", "rect", "circle", "polyline", "polyline_continue", "position"].includes(state.tool)) {
                if (state.tool === "position") {
                    state.preview = helpers.createPosition(ph);
                    state.preview.size = Number(state.positionSettings?.size) || 20;
                    state.preview.positionPreviewMode = "actual";
                } else if (state.tool === "line" && !!state.lineSettings?.sizeLocked && !state.lineSettings?.continuous) {
                    const ll = Math.max(0, Number(state.lineSettings?.length) || 0);
                    const aa = Number(state.lineSettings?.angleDeg ?? state.lineSettings?.angle ?? 0) || 0;
                    const anchorKey = String(state.lineSettings?.anchor || "endpoint_a");
                    const { p1, p2 } = getFixedLineFromAnchor(ph, ll, aa, anchorKey);
                    state.preview = helpers.createLine(p1, p2);
                    state.preview.linePreviewMode = "fixed";
                    state.preview.lineAnchorWorld = { x: Number(ph.x), y: Number(ph.y) };
                } else if (state.tool === "rect" && !!state.rectSettings?.sizeLocked) {
                    const ww = Math.max(0, Number(state.rectSettings?.width) || 0);
                    const hh = Math.max(0, Number(state.rectSettings?.height) || 0);
                    const anchorKey = String(state.rectSettings?.anchor || "c");
                    const { p1, p2 } = getRectFromAnchor(ph, ww, hh, anchorKey);
                    state.preview = helpers.createRect(p1, p2);
                    state.preview.rectPreviewMode = "fixed";
                    state.preview.rectAnchorWorld = { x: Number(ph.x), y: Number(ph.y) };
                } else if (state.tool === "circle" && !!state.circleSettings?.radiusLocked) {
                    const rr = Math.max(0, Number(state.circleSettings?.radius) || 0);
                    const edge = { x: ph.x + rr, y: ph.y };
                    state.preview = helpers.createCircle(ph, edge);
                    state.preview.circlePreviewMode = "fixed";
                    state.preview.circleAnchorWorld = { x: Number(ph.x), y: Number(ph.y) };
                } else {
                    // Crosshair-like first-point hint for other creation tools.
                    state.preview = helpers.createPosition(ph);
                    state.preview.positionPreviewMode = "marker";
                }
            } else if (state.tool === "text") {
                state.preview = helpers.createText(ph, state.textSettings);
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
            const { moved, snapshot, anchorShapeId, anchorKey, lastTangentSnap, lastIntersectionSnap, lastObjectSnap } = endVertexDrag(state);
            if (moved) {
                const keepSnap = !!(state.objectSnap?.keepAttributes || state.objectSnap?.tangentKeep);
                let keepUsed = false;
                // Save tangent attribute if "螻樊ｧ繧剃ｿ晄戟" is enabled and tangent snap was used
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
                    if (!state.objectSnap) state.objectSnap = {};
                    state.objectSnap.keepAttributes = false;
                    state.objectSnap.tangentKeep = false; // legacy alias
                    if (dom.objSnapTangentKeepToggle) dom.objSnapTangentKeepToggle.checked = false;
                }
                pushHistorySnapshot(state, snapshot);
            }
        }
        if (state.selection.drag.active) {
            const moved = endSelectionDrag(state);
            if (moved) {
                // We should have a snapshot from beginSelectionDrag
                const snap = state.selection.drag.modelSnapshotBeforeMove;
                if (snap) pushHistorySnapshot(state, snap);
                else pushHistory(state); // fallback
            }
        }
        if (state.selection.box.active) {
            if (state.tool === "vertex") endVertexSelectionBox(state, helpers);
            else endSelectionBox(state, helpers);
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

        if (draw) draw();
    });

    dom.canvas.addEventListener("dblclick", (e) => {
        if (state.tool === "polyline" || (state.tool === "line" && state.lineSettings.continuous)) {
            helpers.finalizePolylineDraft();
            if (setStatus) setStatus(state.tool === "line" ? "Continuous line finished" : "Polyline finished");
            if (draw) draw();
        }
        if (state.tool === "dim") {
            if (state.dimDraft?.type === "dimchain" && !state.dimDraft.awaitingPlacement) {
                if ((state.dimDraft.points || []).length >= 2) {
                    state.dimDraft.awaitingPlacement = true;
                    if (setStatus) setStatus("Chain dim: click to place dimension line.");
                }
            } else {
                helpers.finalizeDimDraft();
                if (setStatus) setStatus("Dim finished");
            }
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
        if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === "z") {
            if (e.shiftKey) {
                if (helpers.redo) helpers.redo();
            } else {
                if (helpers.undo) helpers.undo();
            }
            e.preventDefault();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === "y") {
            if (helpers.redo) helpers.redo();
            e.preventDefault();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === "c") {
            if (helpers.copySelectionToClipboard) helpers.copySelectionToClipboard();
            e.preventDefault();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === "v") {
            if (helpers.pasteClipboard) helpers.pasteClipboard();
            e.preventDefault();
            return;
        }
        if (e.key === "Escape") {
            state.input.dragStartWorld = null;
            state.polylineDraft = null;
            state.dimDraft = null;
            state.input.filletFlow = null;
            state.input.filletHover = null;
            state.input.dimLineDrag.active = false;
            state.input.dimLineDrag.moved = false;
            if (state.tool !== "select") {
                state.tool = "select";
                if (setStatus) setStatus("Tool changed: SELECT");
            }
            if (draw) draw();
            e.preventDefault();
            return;
        }
        if (e.key === "Delete") {
            if (helpers.delete) helpers.delete();
        }
        if (e.key === "Enter" && (state.tool === "polyline" || (state.tool === "line" && state.lineSettings.continuous))) {
            helpers.finalizePolylineDraft();
            if (setStatus) setStatus(state.tool === "line" ? "Continuous line finished" : "Polyline finished");
            if (draw) draw();
            e.preventDefault();
            return;
        }
        if (e.key === "Enter" && state.tool === "dim" && state.dimDraft?.type === "dimchain") {
            if (!state.dimDraft.awaitingPlacement && (state.dimDraft.points || []).length >= 2) {
                state.dimDraft.awaitingPlacement = true;
                if (setStatus) setStatus("Chain dim: click to place dimension line.");
                if (draw) draw();
            } else if (state.dimDraft.awaitingPlacement && state.dimDraft.place) {
                helpers.finalizeDimDraft();
                if (setStatus) setStatus("Dim finished");
                if (draw) draw();
            }
            e.preventDefault();
            return;
        }
        if (e.key === "Enter" && state.tool === "fillet") {
            if (state.selection.ids.length === 2) {
                const committed = commitFilletFromHover(state.input?.hover?.world || null);
                if (committed) {
                    clearSelection();
                    state.activeGroupId = null;
                    state.input.filletFlow = null;
                    if (setStatus) setStatus("Fillet created");
                    if (draw) draw();
                }
            }
            e.preventDefault();
            return;
        }
        if (e.key === "Enter" && state.tool === "doubleline") {
            const ok = !!helpers.executeDoubleLine?.();
            if (setStatus) setStatus(ok ? "Double line created" : "Double line: select line(s) first");
            if (draw) draw();
            e.preventDefault();
            return;
        }
        if (e.key === " ") {
            e.preventDefault();
            if (state.tool !== "select") {
                state.tool = "select";
                if (setStatus) setStatus("Tool changed: SELECT");
                if (draw) draw();
                return;
            }
            if ((state.selection.ids.length === 0) && state.activeGroupId == null) {
                if (!state.ui) state.ui = {};
                const cur = String(state.ui.selectPickMode || "object");
                state.ui.selectPickMode = (cur === "group") ? "object" : "group";
                if (setStatus) setStatus(`選択モード: ${state.ui.selectPickMode === "group" ? "グループ選択" : "オブジェクト選択"}`);
                if (draw) draw();
                return;
            }
            if (state.selection.ids.length > 0 || state.activeGroupId != null) {
                clearSelection();
                state.activeGroupId = null;
                if (setStatus) setStatus("Selection cleared");
                if (draw) draw();
            }
            return;
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
