import { createRenderBoundsOps } from "./render_bounds.js";
import { sampleBSplinePoints } from "./bspline_utils.js";

export function createViewRuntime(config) {
  const {
    state,
    dom,
    ctx,
    getPageFrameWorldSize,
    draw
  } = config || {};
  const boundsOps = createRenderBoundsOps({ sampleBSplinePoints });

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

  function resetView() {
    const rect = dom.canvas.getBoundingClientRect();
    const vw = Math.max(1, rect?.width || 0);
    const vh = Math.max(1, rect?.height || 0);
    const { leftInset, rightInset } = getPanelInsets(rect);
    const fitW = Math.max(1, vw - leftInset - rightInset);
    const selBounds = collectSelectionBounds();
    if (selBounds) {
      const padPx = 28;
      const availW = Math.max(1, fitW - padPx * 2);
      const availH = Math.max(1, vh - padPx * 2);
      const bw = Math.max(1e-9, Number(selBounds.maxX) - Number(selBounds.minX));
      const bh = Math.max(1e-9, Number(selBounds.maxY) - Number(selBounds.minY));
      const fitScale = Math.max(
        Number(state.view?.minScale ?? 0.0001),
        Math.min(
          Number(state.view?.maxScale ?? 192),
          Math.min(availW / bw, availH / bh)
        )
      );
      state.view.scale = fitScale;
      const cx = (Number(selBounds.minX) + Number(selBounds.maxX)) * 0.5;
      const cy = (Number(selBounds.minY) + Number(selBounds.maxY)) * 0.5;
      state.view.offsetX = leftInset + (fitW * 0.5) - cx * fitScale;
      state.view.offsetY = (vh * 0.5) - cy * fitScale;
    } else {
      const { cadW, cadH } = getPageFrameWorldSize(state.pageSetup);
      const fitScale = Math.max(0.0001, Math.min(fitW / Math.max(1e-9, cadW), vh / Math.max(1e-9, cadH)));
      state.view.scale = fitScale;
      // Center page within visible canvas area excluding side panels.
      state.view.offsetX = leftInset + (fitW * 0.5);
      state.view.offsetY = vh * 0.5;
    }
    state.grid.autoBasePxAtReset = Math.max(1e-9, (Number(state.grid?.size) || 100) * state.view.scale);
    state.grid.autoLevel = 100;
    draw();
  }

  return { resizeCanvas, resetView };
}
