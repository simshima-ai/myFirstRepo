export function bindInputTailEvents(state, dom, helpers, deps) {
    const {
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
    } = deps;

    dom.canvas.addEventListener("pointercancel", (e) => {
        touch.onPointerEnd(e);
    });
    dom.canvas.addEventListener("lostpointercapture", (e) => {
        touch.onPointerEnd(e);
    });

    dom.canvas.addEventListener("dblclick", (e) => {
        if (state.tool === "polyline" || (state.tool === "line" && getLineCreateMode() === "continuous")) {
            helpers.finalizePolylineDraft();
            if (setStatus) setStatus(state.tool === "line" ? "Continuous line finished" : "Polyline finished");
            if (draw) draw();
        }
        if (state.tool === "line" && getLineCreateMode() === "freehand") {
            const ok = finalizeBsplineDraft();
            if (ok && setStatus) setStatus("B-spline finished");
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

    // Hatch: double-click to auto-select connected chain from clicked line/arc/rect/bspline.
    dom.canvas.addEventListener("dblclick", (e) => {
        const tool = String(state.tool || "");
        if (tool !== "hatch") return;
        const worldRaw = getMouseWorld(state, dom, e, false);
        const hit = hitTestShapes(state, worldRaw, dom);
        if (!hit || (hit.type !== "line" && hit.type !== "arc" && hit.type !== "rect" && hit.type !== "polyline" && hit.type !== "bspline")) return;
        const id = Number(hit.id);
        const chain = findConnectedLinesChain(state, id).map(Number).filter(Number.isFinite);
        if (!state.hatchDraft.boundaryIds) state.hatchDraft.boundaryIds = [];
        if (e.shiftKey) {
            state.hatchDraft.boundaryIds = Array.from(new Set([...(state.hatchDraft.boundaryIds || []).map(Number), ...chain]));
        } else {
            state.hatchDraft.boundaryIds = chain;
        }
        if (setStatus) setStatus("Boundary chain selected");
        if (draw) draw();
        e.preventDefault();
    });

    // Select(object mode): double-click to select connected chain from clicked line/arc/rect/bspline.
    dom.canvas.addEventListener("dblclick", (e) => {
        const tool = String(state.tool || "");
        if (tool !== "select") return;
        const pickMode = String(state.ui?.selectPickMode || "object");
        if (pickMode !== "object") return;
        const worldRaw = getMouseWorld(state, dom, e, false);
        const hit = hitTestShapes(state, worldRaw, dom);
        if (!hit || (hit.type !== "line" && hit.type !== "arc" && hit.type !== "rect" && hit.type !== "bspline")) return;
        const id = Number(hit.id);
        const chain = findConnectedLinesChain(state, id).map(Number).filter(Number.isFinite);
        const base = e.shiftKey ? (state.selection?.ids || []).map(Number).filter(Number.isFinite) : [];
        setSelection(Array.from(new Set([...base, ...chain])));
        state.activeGroupId = null;
        if (setStatus) setStatus("Connected objects selected");
        if (draw) draw();
        e.preventDefault();
    });

    // Double line: double-click to select connected chain from clicked line/arc/rect/bspline.
    dom.canvas.addEventListener("dblclick", (e) => {
        const tool = String(state.tool || "");
        if (tool !== "doubleline") return;
        const worldRaw = getMouseWorld(state, dom, e, false);
        const hit = hitTestShapes(state, worldRaw, dom);
        if (!hit || (hit.type !== "line" && hit.type !== "arc" && hit.type !== "rect" && hit.type !== "bspline")) return;
        const id = Number(hit.id);
        const chain = findConnectedLinesChain(state, id).map(Number).filter(Number.isFinite);
        const base = e.shiftKey ? (state.selection?.ids || []).map(Number).filter(Number.isFinite) : [];
        setSelection(Array.from(new Set([...base, ...chain])));
        state.activeGroupId = null;
        if (setStatus) setStatus("Connected chain selected");
        if (draw) draw();
        e.preventDefault();
    });
}
