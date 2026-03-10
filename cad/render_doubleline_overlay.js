export function createRenderDoubleLineOverlayOps(deps) {
  const { worldToScreen } = deps;

  function drawDoubleLinePreview(ctx, state) {
    if (!state.dlinePreview || state.tool !== "doubleline") return;
    if (state.dlineTrimPending) return;
    ctx.save();
    ctx.strokeStyle = state.dlineTrimPending ? "#8b5cf6" : "#ef4444";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([6, 4]);
    for (const o of state.dlinePreview) {
      if (o.type === "circle") {
        const c = worldToScreen(state.view, { x: Number(o.cx), y: Number(o.cy) });
        const rr = Math.max(0, Number(o.r) * state.view.scale);
        ctx.beginPath();
        ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (o.type === "arc") {
        const c = worldToScreen(state.view, { x: Number(o.cx), y: Number(o.cy) });
        const rr = Math.max(0, Number(o.r) * state.view.scale);
        const a1 = Number(o.a1) || 0;
        const a2 = Number(o.a2) || 0;
        const ccw = !!o.ccw;
        ctx.beginPath();
        ctx.arc(c.x, c.y, rr, a1, a2, !ccw);
        ctx.stroke();
        continue;
      }
      const x1 = Number.isFinite(Number(o.fullX1)) ? Number(o.fullX1) : Number(o.x1);
      const y1 = Number.isFinite(Number(o.fullY1)) ? Number(o.fullY1) : Number(o.y1);
      const x2 = Number.isFinite(Number(o.fullX2)) ? Number(o.fullX2) : Number(o.x2);
      const y2 = Number.isFinite(Number(o.fullY2)) ? Number(o.fullY2) : Number(o.y2);
      const p1 = worldToScreen(state.view, { x: x1, y: y1 });
      const p2 = worldToScreen(state.view, { x: x2, y: y2 });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDoubleLineTrimCandidates(ctx, state) {
    if (state.tool !== "doubleline" || !state.dlineTrimPending) return;
    return;
    const candidates = Array.isArray(state.dlineTrimCandidates) ? state.dlineTrimCandidates : [];
    if (!candidates.length) return;
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.0;
    ctx.setLineDash([8, 4]);
    for (const o of candidates) {
      if (!o || o.type !== "line") continue;
      const p1 = worldToScreen(state.view, { x: Number(o.x1), y: Number(o.y1) });
      const p2 = worldToScreen(state.view, { x: Number(o.x2), y: Number(o.y2) });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDoubleLineTrimIntersections(ctx, state) {
    return;
    const points = Array.isArray(state.dlineTrimIntersections) ? state.dlineTrimIntersections : [];
    if (!points.length) return;
    ctx.save();
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 1.2;
    for (const p of points) {
      const s = worldToScreen(state.view, { x: Number(p.x), y: Number(p.y) });
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    drawDoubleLinePreview,
    drawDoubleLineTrimCandidates,
    drawDoubleLineTrimIntersections,
  };
}
