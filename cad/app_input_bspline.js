export function createBsplineDraftController(state, deps) {
    const {
        nextShapeId,
        pushHistory,
        addShape,
        clearSelection,
        applyToolStrokeToShape
    } = deps;

    return {
        beginOrExtend(world) {
            const x = Number(world?.x), y = Number(world?.y);
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            if (!state.polylineDraft || state.polylineDraft.kind !== "bspline") {
                state.polylineDraft = { kind: "bspline", points: [], hoverPoint: null };
            }
            const pts = state.polylineDraft.points;
            const prev = pts.length ? pts[pts.length - 1] : null;
            if (prev && Math.hypot(x - Number(prev.x), y - Number(prev.y)) < 1e-9) return;
            pts.push({ x, y });
            state.polylineDraft.hoverPoint = { x, y };
        },
        updateHover(world) {
            if (!state.polylineDraft || state.polylineDraft.kind !== "bspline") return;
            state.polylineDraft.hoverPoint = { x: Number(world?.x) || 0, y: Number(world?.y) || 0 };
        },
        finalize() {
            const d = state.polylineDraft;
            if (!d || d.kind !== "bspline" || !Array.isArray(d.points) || d.points.length < 2) {
                state.polylineDraft = null;
                return false;
            }
            const controlPoints = d.points
                .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
                .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
            state.polylineDraft = null;
            if (controlPoints.length < 2) return false;
            const shape = {
                type: "bspline",
                controlPoints,
                degree: Math.max(1, Math.min(3, controlPoints.length - 1)),
            };
            shape.id = nextShapeId();
            shape.layerId = state.activeLayerId;
            applyToolStrokeToShape(shape, "line");
            pushHistory();
            addShape(shape);
            clearSelection();
            state.activeGroupId = null;
            return true;
        }
    };
}
