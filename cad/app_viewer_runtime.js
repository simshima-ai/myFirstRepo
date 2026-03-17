import { computeShapesBounds } from "./import_analysis.js";
import { applyViewTarget, computeViewFitToBoundsTarget, computeViewFitToPageTarget, resetGridAutoScale, updateAdaptiveViewScaleBounds } from "./view_fit.js";

export function createViewerViewRuntime(config) {
  const { state, dom, ctx, getPageFrameWorldSize, draw } = config || {};
  let resetViewRafId = 0;

  function resizeCanvas() {
    const rect = dom.canvas.getBoundingClientRect();
    if (!rect) return;
    state.view.viewportWidth = Math.max(1, Number(rect.width) || 1);
    state.view.viewportHeight = Math.max(1, Number(rect.height) || 1);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    dom.canvas.width = Math.round(rect.width * dpr);
    dom.canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function stopResetViewAnimation() {
    if (resetViewRafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(resetViewRafId);
    }
    resetViewRafId = 0;
  }

  function animateToTarget(target, durationMs = 1000) {
    if (!target) return false;
    stopResetViewAnimation();
    if (typeof requestAnimationFrame !== "function") {
      applyViewTarget(state, target);
      resetGridAutoScale(state);
      draw();
      return true;
    }
    const start = {
      scale: Number(state.view?.scale) || 1,
      offsetX: Number(state.view?.offsetX) || 0,
      offsetY: Number(state.view?.offsetY) || 0,
    };
    const begunAt = performance.now();
    const tick = (now) => {
      const t = Math.max(0, Math.min(1, (now - begunAt) / Math.max(1, durationMs)));
      const eased = 1 - Math.pow(1 - t, 3);
      applyViewTarget(state, {
        scale: start.scale + (Number(target.scale) - start.scale) * eased,
        offsetX: start.offsetX + (Number(target.offsetX) - start.offsetX) * eased,
        offsetY: start.offsetY + (Number(target.offsetY) - start.offsetY) * eased,
      });
      resetGridAutoScale(state);
      draw();
      if (t >= 1) {
        resetViewRafId = 0;
        return;
      }
      resetViewRafId = requestAnimationFrame(tick);
    };
    resetViewRafId = requestAnimationFrame(tick);
    return true;
  }

  function resetView(options = {}) {
    const rect = dom.canvas.getBoundingClientRect();
    const vw = Math.max(1, Number(rect?.width) || 1);
    const vh = Math.max(1, Number(rect?.height) || 1);
    const bounds = computeShapesBounds(state.shapes || []);
    let target = null;
    if (bounds) {
      updateAdaptiveViewScaleBounds(state, bounds, {
        viewportWidth: vw,
        viewportHeight: vh,
        paddingPx: 28,
        minFactor: 200,
        maxFactor: 2000,
      });
      target = computeViewFitToBoundsTarget(state, bounds, {
        viewportWidth: vw,
        viewportHeight: vh,
        paddingPx: 28,
      });
    } else {
      target = computeViewFitToPageTarget(state, getPageFrameWorldSize(state.pageSetup), {
        viewportWidth: vw,
        viewportHeight: vh,
      });
    }
    if (options?.animate) return animateToTarget(target, Number(options.durationMs) || 1000);
    stopResetViewAnimation();
    applyViewTarget(state, target);
    resetGridAutoScale(state);
    draw();
    return true;
  }

  return { resizeCanvas, resetView, animateResetView: (options = {}) => resetView({ ...options, animate: true }) };
}
