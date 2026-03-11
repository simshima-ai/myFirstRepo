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
        clearSelection,
        beginOrExtendBsplineDraft,
        getLineCreateMode,
        getFixedLineFromAnchor,
        createLine,
        getRectFromAnchor,
        beginOrExtendPolyline
    } = deps;

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
            if (setStatus) setStatus("四角: 2点目候補を更新。左上の「決定」で作成");
        } else {
            draft.candidateStart = { x: world.x, y: world.y };
            state.preview = createPosition(world);
            state.preview.positionPreviewMode = "marker";
            if (setStatus) setStatus("四角: 1点目候補を更新。左上の「決定」で確定");
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
                if (setStatus) setStatus("三点指示: 位置/円/円弧をクリックしてターゲット選択してください");
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
            const label = (hit.type === "position") ? "位置" : ((hit.type === "circle") ? "円" : "円弧");
            const count = (state.selection?.ids || []).length;
            if (setStatus) setStatus(`三点指示: ${label} #${Number(hit.id)} を選択 (選択数:${count})。『ターゲットとして登録』を押してください`);
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
                if (setStatus) setStatus("CIRCLE created (半径固定)");
                if (draw) draw();
            }
            return true;
        }
        // circleMode === "drag" now uses the same 2-click flow as rectangle.
        // Fall through to the common "first point / second point" creation block below.
    }
    if (state.tool === "line" && getLineCreateMode() === "freehand") {
        beginOrExtendBsplineDraft(world);
        if (setStatus) {
            const touchMode = !!state.ui?.touchMode;
            setStatus(touchMode
                ? "Bスプライン: 制御点を追加（左上の「確定」で作成）"
                : "Bスプライン: 制御点を追加（Enter/ダブルクリックで確定）");
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
            if (setStatus) setStatus("LINE created (サイズ固定)");
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
            const lines = [
                { type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p1.y },
                { type: "line", x1: p2.x, y1: p1.y, x2: p2.x, y2: p2.y },
                { type: "line", x1: p2.x, y1: p2.y, x2: p1.x, y2: p2.y },
                { type: "line", x1: p1.x, y1: p2.y, x2: p1.x, y2: p1.y }
            ];
            lines.forEach((l) => {
                l.id = nextShapeId();
                l.layerId = state.activeLayerId;
                applyToolStrokeToShape(l, "rect");
            });
            pushHistory();
            helpers.addShapesAsGroup(lines);
            if (setStatus) setStatus("RECT created (サイズ固定)");
            if (draw) draw();
        }
        return true;
    }
    if (state.tool === "line" && getLineCreateMode() === "continuous") {
        beginOrExtendPolyline(world);
        if (setStatus) {
            const touchMode = !!state.ui?.touchMode;
            setStatus(touchMode
                ? "クリックで頂点追加  左上の「確定」で作成"
                : "クリックで頂点追加  Enterキーで決定");
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
            const lines = [
                { type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p1.y },
                { type: "line", x1: p2.x, y1: p1.y, x2: p2.x, y2: p2.y },
                { type: "line", x1: p2.x, y1: p2.y, x2: p1.x, y2: p2.y },
                { type: "line", x1: p1.x, y1: p2.y, x2: p1.x, y2: p1.y }
            ];
            lines.forEach((l) => {
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
    return true;
}
