export function createViewRuntime(config) {
  const {
    state,
    dom,
    ctx,
    getPageFrameWorldSize,
    draw
  } = config || {};

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

  function resetView() {
    const rect = dom.canvas.getBoundingClientRect();
    const vw = Math.max(1, rect?.width || 0);
    const vh = Math.max(1, rect?.height || 0);
    const canvasLeft = Number(rect?.left || 0);
    const canvasRight = Number(rect?.right || (canvasLeft + vw));
    const panelMargin = 8;
    let leftInset = 0;
    let rightInset = 0;
    const updateInsetsFromPanel = (el) => {
      if (!el) return;
      const st = window.getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return;
      const pr = el.getBoundingClientRect();
      if (!pr || pr.width <= 0 || pr.height <= 0) return;
      const panelMidX = (Number(pr.left) + Number(pr.right)) * 0.5;
      const canvasMidX = (canvasLeft + canvasRight) * 0.5;
      if (panelMidX <= canvasMidX) {
        const overlapL = Math.max(0, Number(pr.right) - canvasLeft);
        leftInset = Math.max(leftInset, overlapL);
      } else {
        const overlapR = Math.max(0, canvasRight - Number(pr.left));
        rightInset = Math.max(rightInset, overlapR);
      }
    };
    updateInsetsFromPanel(document.querySelector(".sidebar"));
    updateInsetsFromPanel(document.querySelector(".right-stack"));
    leftInset = Math.min(vw * 0.45, leftInset > 0 ? (leftInset + panelMargin) : 0);
    rightInset = Math.min(vw * 0.45, rightInset > 0 ? (rightInset + panelMargin) : 0);
    const fitW = Math.max(1, vw - leftInset - rightInset);
    const { cadW, cadH } = getPageFrameWorldSize(state.pageSetup);
    const fitScale = Math.max(0.0001, Math.min(fitW / Math.max(1e-9, cadW), vh / Math.max(1e-9, cadH)));
    state.view.scale = fitScale;
    // Center page within visible canvas area excluding side panels.
    state.view.offsetX = leftInset + (fitW * 0.5);
    state.view.offsetY = vh * 0.5;
    state.grid.autoBasePxAtReset = Math.max(1e-9, (Number(state.grid?.size) || 100) * state.view.scale);
    state.grid.autoLevel = 100;
    draw();
  }

  return { resizeCanvas, resetView };
}
