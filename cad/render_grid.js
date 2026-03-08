import { getEffectiveGridSize } from "./geom.js";

export function drawGrid(ctx, canvas, state) {
  if (!state.grid.show) return;
  const step = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
  const viewW = Math.max(1, Number(state.view?.viewportWidth) || Number(canvas?.clientWidth) || Number(canvas?.width) || 1);
  const viewH = Math.max(1, Number(state.view?.viewportHeight) || Number(canvas?.clientHeight) || Number(canvas?.height) || 1);
  const left = (0 - state.view.offsetX) / state.view.scale;
  const top = (0 - state.view.offsetY) / state.view.scale;
  const right = (viewW - state.view.offsetX) / state.view.scale;
  const bottom = (viewH - state.view.offsetY) / state.view.scale;
  ctx.save();
  const calcAdaptiveMinorStep = (gridStep) => {
    if (!(Number.isFinite(gridStep) && gridStep > 0)) return;
    let adaptiveStep = gridStep;
    const maxLinesPerAxis = 320;
    const minPixelSpacing = 4;
    while (adaptiveStep * state.view.scale < minPixelSpacing) {
      adaptiveStep *= 2;
      if (!(adaptiveStep > 0)) return;
    }
    const safeSpanX = Math.max(1e-9, Math.abs(right - left));
    const safeSpanY = Math.max(1e-9, Math.abs(bottom - top));
    while ((safeSpanX / adaptiveStep) > maxLinesPerAxis || (safeSpanY / adaptiveStep) > maxLinesPerAxis) {
      adaptiveStep *= 2;
      if (!(adaptiveStep > 0)) return;
    }
    return adaptiveStep;
  };
  const drawGridPass = (gridStep, color) => {
    if (!(Number.isFinite(gridStep) && gridStep > 0)) return;
    const gx0 = Math.floor(left / gridStep) * gridStep;
    const gy0 = Math.floor(top / gridStep) * gridStep;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gx0; x <= right; x += gridStep) {
      const sx = Math.round(x * state.view.scale + state.view.offsetX) + 0.5;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, viewH);
    }
    for (let y = gy0; y <= bottom; y += gridStep) {
      const sy = Math.round(y * state.view.scale + state.view.offsetY) + 0.5;
      ctx.moveTo(0, sy);
      ctx.lineTo(viewW, sy);
    }
    ctx.stroke();
  };
  const adaptiveMinorStep = calcAdaptiveMinorStep(step);
  if (!(Number.isFinite(adaptiveMinorStep) && adaptiveMinorStep > 0)) {
    ctx.restore();
    return;
  }
  const adaptiveMajorStep = adaptiveMinorStep * 5;
  drawGridPass(adaptiveMinorStep, "#e6ebf2");
  drawGridPass(adaptiveMajorStep, "#d4dbe5");
  ctx.restore();
}
