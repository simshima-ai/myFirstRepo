export function handlePointerDownDrawMode(state, dom, helpers, deps, ctx) {
    const { e, worldRaw, world } = ctx;
    const {
        draw,
        setStatus,
        hitTestShapes,
        beginSelectionDrag,
        getCircleCreateMode,
        isAppendSelect,
        setSelection,
        pushHistory,
        createCircle,
        createPosition,
        nextShapeId,
        applyToolStrokeToShape,
        addShape,
        addShapesAsGroup,
        clearSelection,
        beginOrExtendBsplineDraft,
        getLineCreateMode,
        getFixedLineFromAnchor,
        createLine,
        getRectFromAnchor,
        beginOrExtendPolyline
    } = deps;
    const buildRectLineShapes = (p1, p2) => ([
        { type: "line", x1: Number(p1.x), y1: Number(p1.y), x2: Number(p2.x), y2: Number(p1.y) },
        { type: "line", x1: Number(p2.x), y1: Number(p1.y), x2: Number(p2.x), y2: Number(p2.y) },
        { type: "line", x1: Number(p2.x), y1: Number(p2.y), x2: Number(p1.x), y2: Number(p2.y) },
        { type: "line", x1: Number(p1.x), y1: Number(p2.y), x2: Number(p1.x), y2: Number(p1.y) },
    ]);
    const buildRectShape = (p1, p2) => {
        if (state.rectSettings?.asPolyline) {
            return {
                type: "polyline",
                points: [
                    { x: Number(p1.x), y: Number(p1.y) },
                    { x: Number(p2.x), y: Number(p1.y) },
                    { x: Number(p2.x), y: Number(p2.y) },
                    { x: Number(p1.x), y: Number(p2.y) },
                ],
                closed: true,
            };
        }
        return null;
    };

    if (!(state.tool === "line" || state.tool === "rect" || state.tool === "circle")) return false;
    const isPrimaryPress = e.pointerType === "touch" || e.button === 0;
    if (!isPrimaryPress) return true;
    const isTouchRectFlow = (state.tool === "rect") && !!state.ui?.touchMode;
    if (isTouchRectFlow) {
        if (!state.input.touchRectDraft || typeof state.input.touchRectDraft !== "object") {
            state.input.touchRectDraft = { stage: 0, p1: null, candidateStart: null, candidateEnd: null };
        }
        const draft = state.input.touchRectDraft;
        if (draft.stage === 1 && draft.p1) {
            draft.candidateEnd = { x: world.x, y: world.y };
            state.preview = {
                type: "touchRectPlan",
                x1: Number(draft.p1.x),
                y1: Number(draft.p1.y),
                x2: Number(draft.candidateEnd.x),
                y2: Number(draft.candidateEnd.y),
            };
            if (setStatus) setStatus("RECT: tap Confirm to create from the 2 selected points");
        } else {
            draft.candidateStart = { x: world.x, y: world.y };
            state.preview = createPosition(world);
            state.preview.positionPreviewMode = "marker";
            if (setStatus) setStatus("RECT: tap Confirm after selecting the 1st point");
        }
        if (draw) draw();
        return true;
    }

    {
        const hitForDrag = hitTestShapes(state, worldRaw, dom);
        const pickMode = String(state.ui?.selectPickMode || "object");
        const selSet = new Set((state.selection?.ids || []).map(Number));
        const isSelectedHit = !!hitForDrag && selSet.has(Number(hitForDrag.id));
        if (pickMode === "object" && isSelectedHit) {
            beginSelectionDrag(state, worldRaw, helpers);
            if (draw) draw();
            return true;
        }
    }
    if (state.tool === "circle") {
        const circleMode = getCircleCreateMode();
        if (circleMode === "threepoint") {
            const hit = hitTestShapes(state, worldRaw, dom);
            const canSelect = !!hit && (hit.type === "position" || hit.type === "circle" || hit.type === "arc");
            if (!canSelect) {
                if (setStatus) setStatus("3-point circle: select a position, circle, or arc with a valid center");
                if (draw) draw();
                return true;
            }
            if (isAppendSelect(e)) {
                const cur = new Set((state.selection?.ids || []).map(Number));
                const hid = Number(hit.id);
                if (cur.has(hid)) cur.delete(hid); else cur.add(hid);
                setSelection(Array.from(cur));
            } else {
                setSelection([Number(hit.id)]);
            }
            state.activeGroupId = null;
            const label = (hit.type === "position") ? "Position" : ((hit.type === "circle") ? "Circle" : "Arc");
            const count = (state.selection?.ids || []).length;
            if (setStatus) setStatus(`3-point circle: selected ${label} #${Number(hit.id)} (selected: ${count})`);
            if (draw) draw();
            return true;
        }
        if (circleMode === "fixed") {
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
                if (setStatus) setStatus("CIRCLE created (fixed radius)");
                if (draw) draw();
            }
            return true;
        }
        if (circleMode === "drag" && !!state.ui?.touchMode) {
            if (!state.input.touchCircleDraft || typeof state.input.touchCircleDraft !== "object") {
                state.input.touchCircleDraft = { stage: 0, p1: null, candidatePoint: null };
            }
            const draft = state.input.touchCircleDraft;
            draft.candidatePoint = { x: world.x, y: world.y };
            state.preview = createPosition(world);
            state.preview.positionPreviewMode = "marker";
            if (setStatus) {
                setStatus(draft.stage === 0
                    ? "Circle: confirm center point"
                    : "Circle: confirm edge point");
            }
            if (draw) draw();
            return true;
        }
        // circleMode === "drag" now uses the same 2-click flow as rectangle.
        // Fall through to the common "first point / second point" creation block below.
    }
    const isTouchLineFlow = (state.tool === "line") && !!state.ui?.touchMode && !state.lineSettings?.sizeLocked;
    if (isTouchLineFlow) {
        if (!state.input.touchLineDraft || typeof state.input.touchLineDraft !== "object") {
            state.input.touchLineDraft = { stage: 0, p1: null, candidatePoint: null };
        }
        const draft = state.input.touchLineDraft;
        draft.candidatePoint = { x: world.x, y: world.y };
        state.preview = createPosition(world);
        state.preview.positionPreviewMode = "marker";
        const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
        const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
        if (setStatus) {
            if (lineMode === "segment") {
                setStatus(draft.stage === 0
                    ? "Line: confirm start point"
                    : "Line: confirm end point");
            } else if (lineMode === "freehand") {
                setStatus("B-Spline: confirm current position");
            } else {
                setStatus("Continuous line: confirm current position");
            }
        }
        if (draw) draw();
        return true;
    }
    if (state.tool === "line" && getLineCreateMode() === "freehand") {
        beginOrExtendBsplineDraft(world);
        if (setStatus) {
            const touchMode = !!state.ui?.touchMode;
            setStatus(touchMode
                ? "B-spline: tap Confirm to finish"
                : "B-spline: click to add points. Press Enter or double-click to finish");
        }
        if (draw) draw();
        return true;
    }
    if (state.tool === "line" && !!state.lineSettings?.sizeLocked && !state.input.dragStartWorld && getLineCreateMode() === "segment") {
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
            if (setStatus) setStatus("LINE created (size-locked)");
            if (draw) draw();
        }
        return true;
    }
    if (state.tool === "rect" && !!state.rectSettings?.sizeLocked && !state.input.dragStartWorld) {
        const ww = Math.max(0, Number(state.rectSettings?.width) || 0);
        const hh = Math.max(0, Number(state.rectSettings?.height) || 0);
        if (ww > 0 && hh > 0) {
            const anchorKey = String(state.rectSettings?.anchor || "c");
            const { p1, p2 } = getRectFromAnchor(world, ww, hh, anchorKey);
            const shape = buildRectShape(p1, p2);
            pushHistory();
            if (shape) {
                shape.id = nextShapeId();
                shape.layerId = state.activeLayerId;
                applyToolStrokeToShape(shape, "rect");
                addShape(shape);
            } else {
                const lines = buildRectLineShapes(p1, p2);
                for (const line of lines) {
                    line.id = nextShapeId();
                    line.layerId = state.activeLayerId;
                    applyToolStrokeToShape(line, "rect");
                }
                addShapesAsGroup?.(lines);
            }
            clearSelection();
            state.activeGroupId = null;
            if (setStatus) setStatus("RECT created (size-locked)");
            if (draw) draw();
        }
        return true;
    }
    if (state.tool === "line" && getLineCreateMode() === "continuous") {
        beginOrExtendPolyline(world);
        if (setStatus) {
            const touchMode = !!state.ui?.touchMode;
            setStatus(touchMode
                ? "Continuous line: tap Confirm to finish"
                : "Continuous line: press Enter to finish");
        }
        if (draw) draw();
        return true;
    }
    if (!state.input.dragStartWorld) {
        state.input.dragStartWorld = { x: world.x, y: world.y };
        if (setStatus) setStatus(`${state.tool.toUpperCase()}: Click second point`);
    } else {
        pushHistory();
        if (state.tool === "line") {
            let shape;
            if (state.tool === "line") shape = createLine(state.input.dragStartWorld, world);
            if (shape) {
                shape.id = nextShapeId();
                shape.layerId = state.activeLayerId;
                applyToolStrokeToShape(shape, state.tool);
                addShape(shape);
                clearSelection();
                state.activeGroupId = null;
            }
        } else if (state.tool === "circle") {
            const p1 = state.input.dragStartWorld;
            const p2 = world;
            if (Math.hypot(Number(p2.x) - Number(p1.x), Number(p2.y) - Number(p1.y)) > 1e-9) {
                const shape = createCircle(p1, p2);
                shape.showCenterMark = !!state.circleSettings?.showCenterMark;
                shape.id = nextShapeId();
                shape.layerId = state.activeLayerId;
                applyToolStrokeToShape(shape, "circle");
                addShape(shape);
                clearSelection();
                state.activeGroupId = null;
            }
        } else if (state.tool === "rect") {
            const p1 = state.input.dragStartWorld;
            const p2 = world;
            const shape = buildRectShape(p1, p2);
            if (shape) {
                shape.id = nextShapeId();
                shape.layerId = state.activeLayerId;
                applyToolStrokeToShape(shape, "rect");
                addShape(shape);
            } else {
                const lines = buildRectLineShapes(p1, p2);
                for (const line of lines) {
                    line.id = nextShapeId();
                    line.layerId = state.activeLayerId;
                    applyToolStrokeToShape(line, "rect");
                }
                addShapesAsGroup?.(lines);
            }
            clearSelection();
            state.activeGroupId = null;
        }
        state.input.dragStartWorld = null;
        if (setStatus) setStatus(`${state.tool.toUpperCase()} created`);
    }
    if (draw) draw();
    return true;
}
