export function bindKeyboardInput(state, helpers, deps) {
    const {
        draw,
        setStatus,
        setTool,
        clearSelection,
        toggleDebugConsole,
        getLineCreateMode,
        toggleAdsVisible,
        finalizeBsplineDraft,
        commitFilletFromHover,
        isTypingTarget,
        findShortcutAction
    } = deps;
    const isEnterKey = (e) => e?.key === "Enter" || e?.code === "Enter" || Number(e?.keyCode) === 13;
    const isTouchDebugEnabled = (() => {
        try {
            if (new URLSearchParams(window.location.search).has("debugTouch")) return true;
            return window.localStorage?.getItem("s-cad:debug-touch") === "1";
        } catch (_) {
            return false;
        }
    })();
    const touchDebugLog = (msg) => {
        if (!isTouchDebugEnabled) return;
        try { console.log(`[touch-debug] ${msg}`); } catch (_) {}
    };
    const toggleVertexEditMode = () => {
        const cur = String(state.vertexEdit?.mode || "move").toLowerCase();
        state.vertexEdit.mode = (cur === "insert") ? "move" : "insert";
        if (state.vertexEdit.mode !== "insert") state.vertexEdit.insertCandidate = null;
        if (setStatus) setStatus(state.vertexEdit.mode === "insert" ? "Vertex mode: Insert" : "Vertex mode: Move");
        if (draw) draw();
    };

    const onKeyDown = (e) => {
        if (e?.key === "F9") {
            if (typeof toggleDebugConsole === "function") toggleDebugConsole();
            e.preventDefault();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && String(e.key).toLowerCase() === "a") {
            if (typeof toggleAdsVisible === "function") toggleAdsVisible();
            e.preventDefault();
            return;
        }
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
        if (!e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target) && !isEnterKey(e)) {
            const shortcutAction = findShortcutAction(state, e.key);
            if (shortcutAction) {
                if (shortcutAction === "delete") {
                    if (state.tool === "vertex") {
                        if (helpers.deleteSelectedVertices) helpers.deleteSelectedVertices();
                    } else {
                        if (helpers.delete) helpers.delete();
                    }
                } else if (shortcutAction === "vertex_mode_toggle") {
                    if (state.tool === "vertex") {
                        toggleVertexEditMode();
                    }
                } else if (setTool) {
                    setTool(shortcutAction);
                    if (setStatus) setStatus(`Tool changed: ${String(shortcutAction).toUpperCase()}`);
                } else {
                    state.tool = shortcutAction;
                    if (setStatus) setStatus(`Tool changed: ${String(shortcutAction).toUpperCase()}`);
                }
                if (draw) draw();
                e.preventDefault();
                return;
            }
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
                state.dlineTrimPending = false;
                state.dlineTrimPendingPreview = null;
                state.dlineTrimCandidates = null;
                state.dlineTrimIntersections = null;
                state.dlineTrimStepTargets = null;
                state.dlineTrimStepCreatedIds = null;
                state.dlineTrimStepTotal = 0;
                state.tool = "select";
                if (setStatus) setStatus("Tool changed: SELECT");
            }
            if (draw) draw();
            e.preventDefault();
            return;
        }
        if (e.key === "Delete") {
            if (state.tool === "vertex") {
                if (helpers.deleteSelectedVertices) helpers.deleteSelectedVertices();
            } else {
                if (helpers.delete) helpers.delete();
            }
        }
        if (isEnterKey(e)) {
            const d = state.polylineDraft;
            const hasLinearDraft =
                !!d &&
                d.kind !== "bspline" &&
                Array.isArray(d.points) &&
                d.points.length >= 2;
            touchDebugLog(`enter pressed tool=${String(state.tool || "")} lineMode=${String(state.lineSettings?.mode || "")} points=${Array.isArray(d?.points) ? d.points.length : 0} canFinalize=${hasLinearDraft}`);
            if (hasLinearDraft) {
                const ok = !!helpers.finalizePolylineDraft();
                touchDebugLog(`enter finalizePolylineDraft() => ${ok}`);
                if (setStatus) setStatus("Polyline finished");
                if (draw) draw();
                e.preventDefault();
                return;
            }
        }
        if (isEnterKey(e) && state.tool === "line" && getLineCreateMode() === "freehand") {
            const ok = finalizeBsplineDraft();
            if (ok && setStatus) setStatus("B-spline finished");
            if (draw) draw();
            e.preventDefault();
            return;
        }
        if (isEnterKey(e) && state.tool === "dim" && state.dimDraft) {
            if (state.dimDraft.type === "dimchain") {
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
            const hw = state.input?.hover?.world || state.input?.hoverWorld || null;
            if (!state.dimDraft.place && state.dimDraft.p1 && state.dimDraft.p2 && hw
                && Number.isFinite(Number(hw.x)) && Number.isFinite(Number(hw.y))) {
                state.dimDraft.place = { x: Number(hw.x), y: Number(hw.y) };
            }
            if ((state.dimDraft.type === "circleDim" || state.dimDraft.dimRef) && hw
                && Number.isFinite(Number(hw.x)) && Number.isFinite(Number(hw.y))) {
                if (!Number.isFinite(Number(state.dimDraft.tx)) || !Number.isFinite(Number(state.dimDraft.ty))) {
                    state.dimDraft.tx = Number(hw.x);
                    state.dimDraft.ty = Number(hw.y);
                }
            }
            const ok = !!helpers.finalizeDimDraft?.();
            if (setStatus) setStatus(ok ? "Dim finished" : "Dim not ready");
            if (draw) draw();
            e.preventDefault();
            return;
        }
        if (isEnterKey(e) && state.tool === "fillet") {
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
        if (isEnterKey(e) && state.tool === "doubleline") {
            const ok = !!helpers.executeDoubleLine?.();
            if (!ok && setStatus) {
                setStatus("Double line: select source lines first");
            }
            if (draw) draw();
            e.preventDefault();
            return;
        }
        if (e.key === " ") {
            e.preventDefault();
            if (state.tool !== "select") {
                state.dlineTrimPending = false;
                state.dlineTrimPendingPreview = null;
                state.dlineTrimCandidates = null;
                state.dlineTrimIntersections = null;
                state.dlineTrimStepTargets = null;
                state.dlineTrimStepCreatedIds = null;
                state.dlineTrimStepTotal = 0;
                state.tool = "select";
                if (setStatus) setStatus("Tool changed: SELECT");
                if (draw) draw();
                return;
            }
            if ((state.selection.ids.length === 0) && state.activeGroupId == null) {
                if (!state.ui) state.ui = {};
                const groupsPanelVisible = state.ui?.panelVisibility?.groupsPanel !== false;
                if (!groupsPanelVisible) {
                    state.ui.selectPickMode = "object";
                    if (setStatus) setStatus("Selection mode: OBJECT");
                    if (draw) draw();
                    return;
                }
                const cur = String(state.ui.selectPickMode || "object");
                state.ui.selectPickMode = (cur === "group") ? "object" : "group";
                if (setStatus) setStatus(state.ui.selectPickMode === "group" ? "Selection mode: GROUP" : "Selection mode: OBJECT");
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
    };
    const onKeyUp = (e) => {
        state.input.modifierKeys.shift = e.shiftKey;
        state.input.modifierKeys.ctrl = e.ctrlKey;
        state.input.modifierKeys.alt = e.altKey;
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
}


