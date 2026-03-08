export function resolvePolylineDraftEndpointSnap(state, getLineCreateMode, worldRaw, baseSnap = null) {
    const isContinuousLine = state.tool === "line" && getLineCreateMode() === "continuous";
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
}
