export function handlePointerDownSelectMode(state, dom, helpers, deps, ctx) {
    const {
        e,
        screen,
        worldRaw
    } = ctx;
    const {
        isAppendSelect,
        setSelection,
        setStatus,
        draw,
        hitTestShapes,
        findConnectedLinesChain,
        hitActiveGroupRotateHandle,
        beginGroupRotateDrag,
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
    } = deps;

    if (e.button === 0 && Number(e.detail) >= 2) {
        const pickMode = String(state.ui?.selectPickMode || "object");
        if (pickMode === "object") {
            const hitForChain = hitTestShapes(state, worldRaw, dom);
            const canChain = !!hitForChain && (hitForChain.type === "line" || hitForChain.type === "arc" || hitForChain.type === "rect" || hitForChain.type === "bspline");
            if (canChain) {
                const id = Number(hitForChain.id);
                const chain = findConnectedLinesChain(state, id).map(Number).filter(Number.isFinite);
                const base = isAppendSelect(e) ? (state.selection?.ids || []).map(Number) : [];
                setSelection(Array.from(new Set([...base, ...chain])));
                state.activeGroupId = null;
                if (setStatus) setStatus("オブジェクトをダブルクリックで連続選択");
                if (draw) draw();
                e.preventDefault();
                return true;
            }
        }
    }
    const rotateHandleHit = hitActiveGroupRotateHandle(state, screen);
    if (rotateHandleHit && !isAppendSelect(e)) {
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
        return true;
    }
    const groupHandleHit = hitActiveGroupOriginHandle(state, screen);
    if (groupHandleHit && !isAppendSelect(e)) {
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
        return true;
    }
    const dimHandleHit = hitTestDimHandle(state, worldRaw);
    if (dimHandleHit) {
        beginDimHandleDrag(state, dimHandleHit, worldRaw);
        if (draw) draw();
        return true;
    }
    const imageHandleHit = hitTestImageScaleHandle(state, worldRaw);
    if (imageHandleHit) {
        beginImageScaleDrag(state, imageHandleHit, worldRaw);
        if (draw) draw();
        return true;
    }
    const hit = hitTestShapes(state, worldRaw, dom);
    if (hit) {
        const pickMode = String(state.ui?.selectPickMode || "object");
        const touchMultiToggleMode = !!(
            state.ui?.touchMode &&
            state.ui?.touchMultiSelect &&
            pickMode === "object"
        );
        if (touchMultiToggleMode) {
            const cur = new Set((state.selection?.ids || []).map(Number));
            const hid = Number(hit.id);
            if (cur.has(hid)) cur.delete(hid);
            else cur.add(hid);
            setSelection(Array.from(cur));
            state.activeGroupId = null;
            if (draw) draw();
            return true;
        }
        if (pickMode === "group" && hit.groupId != null) {
            toggleGroupSelectionById(state, hit.groupId);
        } else if (isAppendSelect(e)) {
            const cur = new Set(state.selection.ids.map(Number));
            if (cur.has(Number(hit.id))) cur.delete(Number(hit.id)); else cur.add(Number(hit.id));
            setSelection(Array.from(cur));
        } else {
            const selectedIds = new Set((state.selection?.ids || []).map(Number));
            const isHitSelected = selectedIds.has(Number(hit.id));
            if (!(isHitSelected && selectedIds.size > 1)) {
                setSelection([Number(hit.id)]);
                state.activeGroupId = null;
            }
        }
        let dragStarted = beginSelectionDrag(state, worldRaw, helpers);
        if (!dragStarted && hit.type === "line") {
            setSelection([Number(hit.id)]);
            state.activeGroupId = null;
            dragStarted = beginSelectionDrag(state, worldRaw, helpers);
        }
        void dragStarted;
        if (draw) draw();
        return true;
    }

    if (!isAppendSelect(e)) {
        clearSelection();
        state.activeGroupId = null;
    }
    beginSelectionBox(state, screen, isAppendSelect(e));
    if (draw) draw();
    return true;
}
