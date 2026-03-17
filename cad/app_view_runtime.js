import { createRenderBoundsOps } from "./render_bounds.js";
import { sampleBSplinePoints } from "./bspline_utils.js";
import { applyViewTarget, computeViewFitToBoundsTarget, computeViewFitToPageTarget, resetGridAutoScale, updateAdaptiveViewScaleBounds } from "./view_fit.js";

export function createViewRuntime(config) {
  const {
    state,
    dom,
    ctx,
    getPageFrameWorldSize,
    draw
  } = config || {};
  const boundsOps = createRenderBoundsOps({ sampleBSplinePoints });
  let resetViewRafId = 0;

  function getPanelInsets(rect) {
    const vw = Math.max(1, Number(rect?.width) || 1);
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
    return { leftInset, rightInset };
  }

  function collectActiveGroupShapeIds() {
    const rootId = Number(state.activeGroupId);
    if (!Number.isFinite(rootId)) return [];
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const byParent = new Map();
    for (const g of groups) {
      const pid = (g?.parentId == null) ? null : Number(g.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(g);
    }
    const out = new Set();
    const seen = new Set();
    const walk = (gid) => {
      const n = Number(gid);
      if (!Number.isFinite(n) || seen.has(n)) return;
      seen.add(n);
      const g = groups.find(x => Number(x?.id) === n);
      if (g && Array.isArray(g.shapeIds)) {
        for (const sid of g.shapeIds) {
          const sNum = Number(sid);
          if (Number.isFinite(sNum)) out.add(sNum);
        }
      }
      for (const child of (byParent.get(n) || [])) walk(Number(child?.id));
    };
    walk(rootId);
    return Array.from(out);
  }

  function collectShapeIdsFromGroupIds(groupIds) {
    const roots = (groupIds || []).map(Number).filter(Number.isFinite);
    if (!roots.length) return [];
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const byParent = new Map();
    for (const g of groups) {
      const pid = (g?.parentId == null) ? null : Number(g.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(g);
    }
    const out = new Set();
    const seen = new Set();
    const walk = (gid) => {
      const n = Number(gid);
      if (!Number.isFinite(n) || seen.has(n)) return;
      seen.add(n);
      const g = groups.find(x => Number(x?.id) === n);
      if (g && Array.isArray(g.shapeIds)) {
        for (const sid of g.shapeIds) {
          const sNum = Number(sid);
          if (Number.isFinite(sNum)) out.add(sNum);
        }
      }
      for (const child of (byParent.get(n) || [])) walk(Number(child?.id));
    };
    for (const gid of roots) walk(gid);
    return Array.from(out);
  }

  function collectSelectionBounds() {
    const selectedIds = new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite));
    const groupIds = (state.selection?.groupIds || []).map(Number).filter(Number.isFinite);
    for (const sid of collectShapeIdsFromGroupIds(groupIds)) selectedIds.add(Number(sid));
    if (selectedIds.size === 0 && state.activeGroupId != null) {
      for (const sid of collectActiveGroupShapeIds()) selectedIds.add(Number(sid));
    }
    if (selectedIds.size === 0) return null;
    const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    let out = null;
    const expand = (b) => {
      if (!b) return;
      if (!out) {
        out = { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
        return;
      }
      out.minX = Math.min(out.minX, b.minX);
      out.minY = Math.min(out.minY, b.minY);
      out.maxX = Math.max(out.maxX, b.maxX);
      out.maxY = Math.max(out.maxY, b.maxY);
    };
    for (const sid of selectedIds) {
      const s = shapeById.get(Number(sid));
      if (!s) continue;
      const b = boundsOps.getShapeWorldBounds(s, shapeById);
      expand(b);
    }
    if (!out) return null;
    if (![out.minX, out.minY, out.maxX, out.maxY].every(Number.isFinite)) return null;
    return out;
  }

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
    const vw = Math.max(1, rect?.width || 0);
    const vh = Math.max(1, rect?.height || 0);
    const { leftInset, rightInset } = getPanelInsets(rect);
    const selBounds = collectSelectionBounds();
    let target = null;
    if (selBounds) {
      if (String(state.ui?.displayMode || "").toLowerCase() === "viewer") {
        updateAdaptiveViewScaleBounds(state, selBounds, {
          viewportWidth: vw,
          viewportHeight: vh,
          leftInset,
          rightInset,
          paddingPx: 28,
          minFactor: 200,
          maxFactor: 2000,
        });
      }
      target = computeViewFitToBoundsTarget(state, selBounds, {
        viewportWidth: vw,
        viewportHeight: vh,
        leftInset,
        rightInset,
        paddingPx: 28,
      });
    } else {
      target = computeViewFitToPageTarget(state, getPageFrameWorldSize(state.pageSetup), {
        viewportWidth: vw,
        viewportHeight: vh,
        leftInset,
        rightInset,
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
