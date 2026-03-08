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

  return {
    drawActiveGroupHint,
    drawActiveGroupOriginHandle,
    drawActiveGroupRotateHandle,
  };
}
