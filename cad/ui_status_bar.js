export function refreshStatusBar(state, dom) {
  if (!dom?.statusText) return;
  const toolText = `Tool: ${state.tool ? state.tool.toUpperCase() : "NONE"}`;
  const zoomScale = Math.max(0, Number(state.view?.scale) || 0);
  const fps = Number(state.ui?.perfStats?.fps || 0);
  const objects = Array.isArray(state.shapes) ? state.shapes.length : 0;
  const baseGrid = Math.max(1e-9, Number(state.grid?.size) || 100);
  let effGrid = baseGrid;
  if (state.grid?.auto) {
    const currentPx = baseGrid * zoomScale;
    const basePx = Math.max(1e-9, Number(state.grid?.autoBasePxAtReset) || currentPx);
    const z = currentPx / basePx;
    const h = 0.85;
    const e50 = Math.max(1.01, Number(state.grid?.autoThreshold50 || 130) / 100);
    const e10 = Math.max(e50, Number(state.grid?.autoThreshold10 || 180) / 100);
    const e5 = Math.max(e10, (Number(state.grid?.autoThreshold5 || 240) / 100) * 1.2);
    const e1 = Math.max(e5, (Number(state.grid?.autoThreshold1 || 320) / 100) * 2.5);
    const r50 = e50 * h;
    const r10 = e10 * h;
    const r5 = e5 * h;
    const r1 = e1 * h;
    let level = Number(state.grid?.autoLevel);
    if (![100, 50, 10, 5, 1].includes(level)) level = 100;
    effGrid = Math.max(1e-9, baseGrid * (level / 100));

    if (dom.gridAutoDebugText) {
      const stage = `${level}%`;
      dom.gridAutoDebugText.textContent =
        `AutoGrid: ON` +
        `\nBaseGrid: ${Number(baseGrid.toFixed(4)).toString()}` +
        `\nZoom: ${(zoomScale * 100).toFixed(1)}%` +
        `\nCurrentPx: ${currentPx.toFixed(3)} px` +
        `\nResetBasePx: ${basePx.toFixed(3)} px` +
        `\nz(current/reset): ${z.toFixed(3)}` +
        `\nEnter: 50=${e50.toFixed(2)} 10=${e10.toFixed(2)} 5=${e5.toFixed(2)} 1=${e1.toFixed(2)}` +
        `\nReturn: 100<=${r50.toFixed(2)} 50<=${r10.toFixed(2)} 10<=${r5.toFixed(2)} 5<=${r1.toFixed(2)}` +
        `\nAutoLevel: ${level}%` +
        `\nStage: ${stage}` +
        `\nEffectiveGrid: ${Number(effGrid.toFixed(4)).toString()}`;
    }
  } else if (dom.gridAutoDebugText) {
    dom.gridAutoDebugText.textContent =
      `AutoGrid: OFF` +
      `\nBaseGrid: ${Number(baseGrid.toFixed(4)).toString()}` +
      `\nZoom: ${(zoomScale * 100).toFixed(1)}%` +
      `\nEffectiveGrid: ${Number(baseGrid.toFixed(4)).toString()}`;
  }
  const unit = String(state.pageSetup?.unit || "mm").toLowerCase();
  const unitLabel = (unit === "in") ? "inch" : unit;
  const gridModelText = Number.isFinite(effGrid) ? Number(effGrid.toFixed(3)).toString() : "-";
  dom.statusText.textContent = `${toolText} | FPS: ${fps.toFixed(1)} | Objects: ${objects} | Zoom: ${(zoomScale * 100).toFixed(0)}% | 1 grid = ${gridModelText} ${unitLabel}`;

  if (dom.gridScaleIndicator && dom.gridScaleBar && dom.gridScaleText) {
    const unit = String(state.pageSetup?.unit || "mm").toLowerCase();
    const unitMm = (unit === "cm") ? 10 : (unit === "m") ? 1000 : ((unit === "inch" || unit === "in") ? 25.4 : (unit === "ft" ? 304.8 : 1));
    const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
    const gridModelUnit = effGrid;
    const gridPaperMm = (effGrid * unitMm) / pageScale;
    const gridPx = effGrid * zoomScale;
    const viewportW = Math.max(1, Number(state.view?.viewportWidth) || 1);
    const maxBarPx = Math.max(120, Math.min(900, viewportW * 0.45));
    const barPx = Math.max(1, Math.min(maxBarPx, Number.isFinite(gridPx) ? gridPx : 1));
    dom.gridScaleIndicator.style.display = "none";
    dom.gridScaleBar.style.width = `${barPx.toFixed(1)}px`;
    const unitLabel = (unit === "in") ? "inch" : unit;
    const modelTxt = Number.isFinite(gridModelUnit) ? Number(gridModelUnit.toFixed(3)).toString() : "-";
    dom.gridScaleText.textContent = `1 grid = ${modelTxt} ${unitLabel}`;
  }
}
