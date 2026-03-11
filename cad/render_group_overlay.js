export function createRenderGroupOverlayOps(deps) {
  const { worldToScreen } = deps;

  function drawActiveGroupHint(_ctx, _state) {
    return;
  }

  function drawActiveGroupOriginHandle(ctx, state) {
    if (state.activeGroupId == null) return;
    const g = (state.groups || []).find((gg) => Number(gg.id) === Number(state.activeGroupId));
    if (!g) return;
    const c = worldToScreen(state.view, { x: Number(g.originX) || 0, y: Number(g.originY) || 0 });
    const r = 12;
    ctx.save();
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(c.x - r * 0.55, c.y);
    ctx.lineTo(c.x + r * 0.55, c.y);
    ctx.moveTo(c.x, c.y - r * 0.55);
    ctx.lineTo(c.x, c.y + r * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  function drawActiveGroupRotateHandle(ctx, state) {
    if (state.activeGroupId == null) return;
    const g = (state.groups || []).find((gg) => Number(gg.id) === Number(state.activeGroupId));
    if (!g) return;
    const c = worldToScreen(state.view, { x: Number(g.originX) || 0, y: Number(g.originY) || 0 });
    const originR = 12;
    const handleDist = originR * 4.7;
    const ang = (Number(g.rotationDeg) || 0) * Math.PI / 180;
    const rp = { x: c.x + Math.cos(ang) * handleDist, y: c.y + Math.sin(ang) * handleDist };
    ctx.save();
    ctx.strokeStyle = "#7c3aed";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(rp.x, rp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#7c3aed";
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    const ra = Math.atan2(rp.y - c.y, rp.x - c.x);
    ctx.beginPath();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#7c3aed";
    ctx.arc(c.x, c.y, handleDist, ra - 0.325, ra + 0.325);
    ctx.stroke();
    ctx.restore();
  }

  function drawActiveGroupScaleHandle(ctx, state) {
    if (state.activeGroupId == null) return;
    const g = (state.groups || []).find((gg) => Number(gg.id) === Number(state.activeGroupId));
    if (!g) return;
    const scOpt = (g.scaleOptions && typeof g.scaleOptions === "object")
      ? g.scaleOptions
      : { allowScale: false };
    if (!scOpt.allowScale) return;
    const c = worldToScreen(state.view, { x: Number(g.originX) || 0, y: Number(g.originY) || 0 });
    const originR = 12;
    const handleDist = originR * 6.6;
    const ang = ((Number(g.rotationDeg) || 0) + 45) * Math.PI / 180;
    const hp = { x: c.x + Math.cos(ang) * handleDist, y: c.y + Math.sin(ang) * handleDist };
    const hover = !!(state.input?.hover?.groupScale) && Number(state.input?.hover?.groupScale?.id) === Number(g.id);
    const stroke = hover ? "#f59e0b" : "#0ea5e9";
    const fill = hover ? "#fbbf24" : "#38bdf8";
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = hover ? 2.2 : 1.8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(hp.x, hp.y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Outer ring to make hit-point obvious
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14,165,233,0.12)";
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = fill;
    ctx.moveTo(hp.x, hp.y - 8);
    ctx.lineTo(hp.x + 8, hp.y + 8);
    ctx.lineTo(hp.x - 8, hp.y + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.fillStyle = hover ? "#92400e" : "#0369a1";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Scale", hp.x, hp.y - 14);
    ctx.restore();
    ctx.restore();
  }

  return {
    drawActiveGroupHint,
    drawActiveGroupOriginHandle,
    drawActiveGroupRotateHandle,
    drawActiveGroupScaleHandle,
  };
}
