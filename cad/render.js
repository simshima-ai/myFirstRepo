import {
  worldToScreen, screenToWorld, getEffectiveGridSize, mmPerUnit,
  getHatchPitchWorld, getHatchLineShiftWorld, getHatchPaddingWorld, getHatchDashWorld, getHatchGapWorld
} from "./geom.js";
import { getDimGeometry, getDimChainGeometry, getDimAngleGeometry, getSpecialDimGeometry, getCircleDimGeometry, circleDimHasCenterFollowAttribute } from "./dim_geom.js";
import { buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";
import { computeLineCircleAutoTrimPlan } from "./app_tools.js";
import { drawGrid } from "./render_grid.js";
import { drawPageFrame, drawAxes } from "./render_view_helpers.js";
import { createRenderPreviewOps } from "./render_preview.js";
import { createRenderDimensionOps, dimMmToWorld, dimPtToWorld } from "./render_dimension.js";
import { createRenderOverlayOps } from "./render_overlay.js";
import { createRenderHandlesOps } from "./render_handles.js";
import { createRenderHatchOps } from "./render_hatch.js";
import { createRenderDoubleLineOverlayOps } from "./render_doubleline_overlay.js";
import { createRenderBoundsOps } from "./render_bounds.js";
import { createRenderGroupOverlayOps } from "./render_group_overlay.js";
import { sampleBSplinePoints } from "./bspline_utils.js";

function normalizeRad(a) {
  let x = Number(a) || 0;
  while (x < 0) x += Math.PI * 2;
  while (x >= Math.PI * 2) x -= Math.PI * 2;
  return x;
}

function isAngleOnArc(theta, a1, a2, ccw) {
  theta = normalizeRad(theta); a1 = normalizeRad(a1); a2 = normalizeRad(a2);
  if (ccw) {
    const span = ((a2 - a1) + Math.PI * 2) % (Math.PI * 2);
    const rel = ((theta - a1) + Math.PI * 2) % (Math.PI * 2);
    return rel <= span + 1e-9;
  }
  const span = ((a1 - a2) + Math.PI * 2) % (Math.PI * 2);
  const rel = ((a1 - theta) + Math.PI * 2) % (Math.PI * 2);
  return rel <= span + 1e-9;
}

function isLayerVisible(state, layerId, cache = null) {
  const lid = Number(layerId);
  if (cache?.visibleLayerSet instanceof Set) {
    return cache.visibleLayerSet.has(lid);
  }
  const layers = state.layers || [];
  const layer = layers.find((l) => Number(l.id) === lid);
  return !layer || layer.visible !== false;
}

function isLayerLocked(state, layerId, cache = null) {
  const lid = Number(layerId);
  if (cache?.lockedLayerSet instanceof Set) {
    return cache.lockedLayerSet.has(lid);
  }
  const layers = state.layers || [];
  const layer = layers.find((l) => Number(l.id) === lid);
  return !!(layer && layer.locked === true);
}

function getLayerColorById(state, layerId) {
  const mapped = state?.ui?.layerView?.colorMap?.[Number(layerId)];
  if (typeof mapped === "string" && mapped) return mapped;
  const palette = ["#0f172a", "#1d4ed8", "#059669", "#b45309", "#7c3aed", "#be123c", "#0f766e", "#334155"];
  const n = Math.abs(Number(layerId) || 0);
  return palette[n % palette.length];
}

function getGroupColorById(state, groupId) {
  const mapped = state?.ui?.groupView?.colorMap?.[Number(groupId)];
  if (typeof mapped === "string" && mapped) return mapped;
  const palette = ["#0f172a", "#7c3aed", "#db2777", "#2563eb", "#059669", "#d97706", "#dc2626", "#0e7490"];
  const n = Math.abs(Number(groupId) || 0);
  return palette[n % palette.length];
}

function buildCurrentShapeGroupMap(state) {
  const map = new Map();
  for (const g of (state.groups || [])) {
    const gid = Number(g?.id);
    if (!Number.isFinite(gid)) continue;
    for (const sid of (g?.shapeIds || [])) {
      const sidNum = Number(sid);
      if (!Number.isFinite(sidNum)) continue;
      map.set(sidNum, gid);
    }
  }
  return map;
}

function isVisibleByCurrentLayerFilter(state, shape) {
  if (!state?.ui?.groupView?.currentLayerOnly) return true;
  const activeLayerId = Number(state?.activeLayerId);
  const lid = Number(shape?.layerId ?? activeLayerId);
  if (!Number.isFinite(activeLayerId)) return true;
  return lid === activeLayerId;
}

function isGroupVisibleWithCache(groupById, groupId, memo) {
  const gid = Number(groupId);
  if (!Number.isFinite(gid)) return true;
  if (memo.has(gid)) return memo.get(gid);
  const g = groupById.get(gid);
  if (!g) {
    memo.set(gid, true);
    return true;
  }
  if (g.visible === false) {
    memo.set(gid, false);
    return false;
  }
  if (g.parentId == null) {
    memo.set(gid, true);
    return true;
  }
  const v = isGroupVisibleWithCache(groupById, Number(g.parentId), memo);
  memo.set(gid, v);
  return v;
}

function isShapeGroupVisible(state, shape, shapeGroupMap = null, groupById = null, memo = null) {
  const sid = Number(shape?.id);
  const gidFromMap = (shapeGroupMap && Number.isFinite(sid)) ? Number(shapeGroupMap.get(sid)) : NaN;
  const gid = Number.isFinite(gidFromMap) ? gidFromMap : Number(shape?.groupId);
  if (!Number.isFinite(gid)) return true;
  if (groupById && memo) return isGroupVisibleWithCache(groupById, gid, memo);
  const map = new Map((state.groups || []).map((g) => [Number(g.id), g]));
  const mm = new Map();
  return isGroupVisibleWithCache(map, gid, mm);
}

function collectGroupTreeShapeIdSet(state, rootGroupId) {
  const rootId = Number(rootGroupId);
  if (!Number.isFinite(rootId)) return new Set();
  const childrenByParent = new Map();
  for (const g of (state.groups || [])) {
    const pid = (g.parentId == null) ? null : Number(g.parentId);
    if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
    childrenByParent.get(pid).push(Number(g.id));
  }
  const gidSet = new Set();
  const seen = new Set();
  const walk = (gid) => {
    gid = Number(gid);
    if (!Number.isFinite(gid) || seen.has(gid)) return;
    seen.add(gid);
    gidSet.add(gid);
    for (const cid of (childrenByParent.get(gid) || [])) walk(cid);
  };
  walk(rootId);
  const shapeIds = new Set();
  for (const g of (state.groups || [])) {
    if (!gidSet.has(Number(g.id))) continue;
    for (const sid of (g.shapeIds || [])) shapeIds.add(Number(sid));
  }
  return shapeIds;
}

function collectHighlightedGroupShapeIdSet(state) {
  const groupIds = new Set();
  for (const gidRaw of (state.selection?.groupIds || [])) {
    const gid = Number(gidRaw);
    if (Number.isFinite(gid)) groupIds.add(gid);
  }
  if (state.activeGroupId != null) {
    const gid = Number(state.activeGroupId);
    if (Number.isFinite(gid)) groupIds.add(gid);
  }
  if (!groupIds.size) return null;
  const shapeIds = new Set();
  for (const gid of groupIds) {
    for (const sid of collectGroupTreeShapeIdSet(state, gid)) shapeIds.add(Number(sid));
  }
  return shapeIds;
}

function isInActiveGroup(state, shapeId) {
  const ids = collectHighlightedGroupShapeIdSet(state);
  return !!ids && ids.has(Number(shapeId));
}


function getShapeLineWidthMm(state, shape) {
  return Math.max(0.01, Number(shape?.lineWidthMm ?? state?.lineWidthMm ?? 0.25) || 0.25);
}

function getShapeLineType(shape) {
  const v = String(shape?.lineType || "solid").toLowerCase();
  if (v === "dashed" || v === "dotted" || v === "dashdot" || v === "longdash" || v === "center" || v === "hidden") return v;
  return "solid";
}

function applyShapeLineDash(ctx, lineType, strokePx = 1) {
  const base = Math.max(1, Number(strokePx) || 1);
  if (lineType === "dashed") { ctx.setLineDash([base * 6, base * 3]); return; }
  if (lineType === "dotted") { ctx.setLineDash([base * 1, base * 2.5]); return; }
  if (lineType === "dashdot") { ctx.setLineDash([base * 6, base * 3, base * 1.2, base * 3]); return; }
  if (lineType === "longdash") { ctx.setLineDash([base * 10, base * 4]); return; }
  if (lineType === "center") { ctx.setLineDash([base * 12, base * 3, base * 2, base * 3]); return; }
  if (lineType === "hidden") { ctx.setLineDash([base * 4, base * 2.5]); return; }
  ctx.setLineDash([]);
}

function lineWidthMmToScreenPx(state, lineWidthMm) {
  const mm = Math.max(0.01, Number(lineWidthMm) || 0.25);
  const pageScale = Math.max(0.0001, Number(state?.pageSetup?.scale ?? 1) || 1);
  const unitMm = mmPerUnit(state?.pageSetup?.unit || "mm");
  const world = (mm * pageScale) / Math.max(1e-9, unitMm);
  return Math.max(0.5, world * Math.max(1e-9, Number(state?.view?.scale) || 1));
}

const dimensionOps = createRenderDimensionOps({
  getGroupColorById,
  getLayerColorById,
  lineWidthMmToScreenPx,
  getShapeLineWidthMm,
});

function drawDimensionCommon(ctx, state, dim, geom, selected, groupActive) {
  return dimensionOps.drawDimensionCommon(ctx, state, dim, geom, selected, groupActive);
}

function getImageCache(state) {
  if (!state.ui) state.ui = {};
  if (!state.ui._imageCache || typeof state.ui._imageCache !== "object") {
    state.ui._imageCache = {};
  }
  return state.ui._imageCache;
}

function getImageResource(state, src) {
  const key = String(src || "");
  if (!key) return null;
  const cache = getImageCache(state);
  if (cache[key]) return cache[key];
  const img = new Image();
  const rec = { img, loaded: false, error: false };
  img.onload = () => { rec.loaded = true; rec.error = false; };
  img.onerror = () => { rec.loaded = false; rec.error = true; };
  img.src = key;
  cache[key] = rec;
  return rec;
}

function drawShape(ctx, state, shape, currentShapeGroupMap = null, selectedSet = null, activeGroupShapeSet = null, layerCache = null, groupById = null, groupVisibleMemo = null) {
  if (!isLayerVisible(state, shape.layerId, layerCache)) return;
  if (!isVisibleByCurrentLayerFilter(state, shape)) return;
  if (!isShapeGroupVisible(state, shape, currentShapeGroupMap, groupById, groupVisibleMemo)) return;
  ctx.save();
  if (isLayerLocked(state, shape.layerId, layerCache)) {
    ctx.globalAlpha *= 0.5;
  }
  const sid = Number(shape.id);
  const selected = selectedSet ? selectedSet.has(sid) : state.selection.ids.includes(sid);
  const selectedVisual = selected && !state.ui?.suppressSelectionHighlight;
  const isHatchBoundary = state.tool === "hatch" && state.hatchDraft?.boundaryIds?.includes(Number(shape.id));
  const isPatternCopyReference = state.tool === "patterncopy" && (
    Number(shape.id) === state.input.patternCopyFlow.centerPositionId ||
    Number(shape.id) === state.input.patternCopyFlow.axisLineId
  );
  const groupActive = !selectedVisual && (activeGroupShapeSet ? activeGroupShapeSet.has(sid) : isInActiveGroup(state, shape.id));
  const layerColorize = !!state.ui?.layerView?.colorize;
  const groupColorize = !!state.ui?.groupView?.colorize;
  const resolvedGroupId = currentShapeGroupMap?.get?.(Number(shape.id));
  const effectiveGroupId = Number.isFinite(resolvedGroupId) ? resolvedGroupId : shape.groupId;
  const shapeColor = (typeof shape?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(shape.color))
    ? shape.color
    : "#0f172a";
  const baseStroke = groupColorize
    ? getGroupColorById(state, effectiveGroupId)
    : (layerColorize ? getLayerColorById(state, shape.layerId) : shapeColor);

  const isHovered = (state.tool === "vertex" || state.tool === "select" || state.tool === "fillet")
    && state.input.hover?.shape && Number(state.input.hover.shape.id) === Number(shape.id);

  ctx.strokeStyle = (selectedVisual || isHatchBoundary) ? "#f59e0b" : (isPatternCopyReference ? "#22c55e" : (groupActive ? "#2563eb" : (isHovered ? "#94a3b8" : baseStroke)));
  const shapeStrokePx = lineWidthMmToScreenPx(state, getShapeLineWidthMm(state, shape));
  ctx.lineWidth = (selectedVisual || isHatchBoundary || isPatternCopyReference)
    ? Math.max(2, shapeStrokePx)
    : (isHovered ? Math.max(2, shapeStrokePx) : shapeStrokePx);
  if (shape.type !== "hatch" && shape.type !== "text" && shape.type !== "image") {
    applyShapeLineDash(ctx, getShapeLineType(shape), ctx.lineWidth);
  } else {
    ctx.setLineDash([]);
  }

  if (shape.type === "hatch") {
    drawHatchFill(ctx, state, shape);
    if (selectedVisual) {
      // Draw a bounding box while the hatch is selected.
      const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, shape.boundaryIds || [], state.view.scale);
      if (parsed.ok && parsed.bounds) {
        const b = parsed.bounds;
        const p1 = worldToScreen(state.view, { x: b.minX, y: b.minY });
        const p2 = worldToScreen(state.view, { x: b.maxX, y: b.maxY });
        ctx.save();
        ctx.strokeStyle = "#f59e0b";
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        ctx.restore();
      }
    }
  }
  if (shape.type === "line") {
    const p1 = worldToScreen(state.view, { x: shape.x1, y: shape.y1 });
    const p2 = worldToScreen(state.view, { x: shape.x2, y: shape.y2 });
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  if (shape.type === "polyline") {
    const pts = Array.isArray(shape.points) ? shape.points : [];
    if (pts.length >= 2) {
      const p0 = worldToScreen(state.view, { x: Number(pts[0].x), y: Number(pts[0].y) });
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i++) {
        const p = worldToScreen(state.view, { x: Number(pts[i].x), y: Number(pts[i].y) });
        ctx.lineTo(p.x, p.y);
      }
      if (shape.closed) ctx.closePath();
      ctx.stroke();
    }
  }
  if (shape.type === "bspline") {
    const sampled = sampleBSplinePoints(shape.controlPoints, Number(shape.degree) || 3);
    if (sampled.length >= 2) {
      const p0 = worldToScreen(state.view, sampled[0]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < sampled.length; i++) {
        const p = worldToScreen(state.view, sampled[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  }
  if (shape.type === "text") {
    const p1 = worldToScreen(state.view, { x: shape.x1, y: shape.y1 });
    ctx.save();
    ctx.translate(p1.x, p1.y);
    const rDeg = Number(shape.textRotate) || 0;
    ctx.rotate(rDeg * Math.PI / 180);
    ctx.fillStyle = selectedVisual ? "#f59e0b" : (groupActive ? "#2563eb" : (shape.textColor || baseStroke));
    const isBold = !!shape.textBold;
    const isItalic = !!shape.textItalic;
    const sizePt = Number(shape.textSizePt) || 12;
    const fontFamily = shape.textFontFamily || "Yu Gothic UI";
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${(sizePt * state.view.scale * 1.33)}px "${fontFamily}"`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.text || "", 0, 0);
    ctx.restore();
  }
  if (shape.type === "image") {
    const x = Number(shape.x), y = Number(shape.y);
    const w = Math.max(1e-9, Number(shape.width) || 0);
    const h = Math.max(1e-9, Number(shape.height) || 0);
    if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
      const p1 = worldToScreen(state.view, { x, y });
      const p2 = worldToScreen(state.view, { x: x + w, y: y + h });
      const sw = Number(p2.x) - Number(p1.x);
      const sh = Number(p2.y) - Number(p1.y);
      const cx = Number(p1.x) + sw * 0.5;
      const cy = Number(p1.y) + sh * 0.5;
      const rot = (Number(shape.rotationDeg) || 0) * Math.PI / 180;
      const res = getImageResource(state, shape.src);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      if (res?.loaded && res.img) {
        ctx.drawImage(res.img, -sw * 0.5, -sh * 0.5, sw, sh);
      } else {
        ctx.fillStyle = "rgba(148,163,184,0.14)";
        ctx.fillRect(-sw * 0.5, -sh * 0.5, sw, sh);
      }
      if (selected || groupActive || isHovered) {
        ctx.strokeRect(-sw * 0.5, -sh * 0.5, sw, sh);
      }
      ctx.restore();
    }
  }
  if (shape.type === "imagetrace") {
    const segs = Array.isArray(shape.segments) ? shape.segments : [];
    if (segs.length > 0) {
      ctx.beginPath();
      for (const seg of segs) {
        const p1 = worldToScreen(state.view, { x: Number(seg.x1), y: Number(seg.y1) });
        const p2 = worldToScreen(state.view, { x: Number(seg.x2), y: Number(seg.y2) });
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      }
      ctx.stroke();
      if (selected || groupActive || isHovered) {
        const x = Number(shape.x), y = Number(shape.y);
        const w = Number(shape.width), h = Number(shape.height);
        if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
          const p1 = worldToScreen(state.view, { x, y });
          const p2 = worldToScreen(state.view, { x: x + w, y: y + h });
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
          ctx.restore();
        }
      }
    }
  }
  if (shape.type === "rect") {
    const p1 = worldToScreen(state.view, { x: shape.x1, y: shape.y1 });
    const p2 = worldToScreen(state.view, { x: shape.x2, y: shape.y2 });
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    ctx.strokeRect(x, y, w, h);
  }
  if (shape.type === "circle") {
    const c = worldToScreen(state.view, { x: shape.cx, y: shape.cy });
    const r = Math.max(1, shape.r * state.view.scale);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    if (shape.showCenterMark) {
      const half = 6;
      ctx.beginPath();
      ctx.moveTo(c.x - half, c.y); ctx.lineTo(c.x + half, c.y);
      ctx.moveTo(c.x, c.y - half); ctx.lineTo(c.x, c.y + half);
      ctx.stroke();
    }
  }
  if (shape.type === "arc") {
    const c = worldToScreen(state.view, { x: shape.cx, y: shape.cy });
    const r = Math.max(1, Number(shape.r) * state.view.scale);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, Number(shape.a1) || 0, Number(shape.a2) || 0, !(shape.ccw !== false));
    ctx.stroke();
    if (shape.showCenterMark) {
      const half = 6;
      ctx.beginPath();
      ctx.moveTo(c.x - half, c.y); ctx.lineTo(c.x + half, c.y);
      ctx.moveTo(c.x, c.y - half); ctx.lineTo(c.x, c.y + half);
      ctx.stroke();
    }
  }
  if (shape.type === "position") {
    const c = worldToScreen(state.view, { x: shape.x, y: shape.y });
    const isMarker = String(shape.positionPreviewMode || "") === "marker";
    if (isMarker) {
      const half = 5;
      ctx.save();
      ctx.strokeStyle = "#7c3aed";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x - half, c.y);
      ctx.lineTo(c.x + half, c.y);
      ctx.moveTo(c.x, c.y - half);
      ctx.lineTo(c.x, c.y + half);
      ctx.stroke();
      ctx.restore();
    } else {
      const size = Math.max(1.5, (shape.size ?? 20) * state.view.scale);
      ctx.beginPath();
      ctx.arc(c.x, c.y, size * 0.28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(c.x - size, c.y);
      ctx.lineTo(c.x + size, c.y);
      ctx.moveTo(c.x, c.y - size);
      ctx.lineTo(c.x, c.y + size);
      ctx.stroke();
    }
  }
  if (shape.type === "dim" || shape.type === "dimchain" || shape.type === "dimangle" || shape.type === "circleDim") {
    // Determine geometry based on type
    let geom = null;
    if (shape.type === "dim") {
      if (shape.dimRef) geom = getSpecialDimGeometry(shape, state.shapes);
      else geom = getDimGeometry(shape);
    } else if (shape.type === "dimchain") {
      geom = getDimChainGeometry(shape);
    } else if (shape.type === "dimangle") {
      geom = getDimAngleGeometry(shape, state.shapes);
    } else if (shape.type === "circleDim") {
      geom = getCircleDimGeometry(shape, state.shapes);
    }

    if (geom) {
      drawDimensionCommon(ctx, state, shape, geom, selected, groupActive);
    }
  }
  ctx.restore();
}
const previewOps = createRenderPreviewOps({
  worldToScreen,
  drawShape,
  drawDimensionCommon,
  getCircleDimGeometry,
  getSpecialDimGeometry,
  getDimChainGeometry,
  getDimGeometry,
  isLayerVisible,
  isVisibleByCurrentLayerFilter,
  sampleBSplinePoints,
});

function drawPreview(ctx, state, preview) {
  return previewOps.drawPreview(ctx, state, preview);
}

function drawPreviewLabel(ctx, x, y, text) {
  return previewOps.drawPreviewLabel(ctx, x, y, text);
}

function drawPreviewMetrics(ctx, state, preview) {
  return previewOps.drawPreviewMetrics(ctx, state, preview);
}

function drawPolylineDraft(ctx, state) {
  return previewOps.drawPolylineDraft(ctx, state);
}

function drawDimDraft(ctx, state) {
  return previewOps.drawDimDraft(ctx, state);
}

function drawDimHoveredShape(ctx, state) {
  return previewOps.drawDimHoveredShape(ctx, state);
}
const overlayOps = createRenderOverlayOps({
  worldToScreen,
  drawShape,
  isLayerVisible,
  isVisibleByCurrentLayerFilter,
  normalizeRad,
  computeLineCircleAutoTrimPlan,
});

function drawSelectionBox(ctx, state) {
  return overlayOps.drawSelectionBox(ctx, state);
}

function drawObjectSnapHover(ctx, state) {
  return overlayOps.drawObjectSnapHover(ctx, state);
}

function drawTrimHover(ctx, state) {
  return overlayOps.drawTrimHover(ctx, state);
}

function drawFilletHover(ctx, state) {
  return overlayOps.drawFilletHover(ctx, state);
}

function drawFilletFlow(ctx, state) {
  return overlayOps.drawFilletFlow(ctx, state);
}

function drawHatchHover(ctx, state) {
  return overlayOps.drawHatchHover(ctx, state);
}
const handlesOps = createRenderHandlesOps({
  worldToScreen,
  isLayerVisible,
  isVisibleByCurrentLayerFilter,
  getDimChainGeometry,
  getDimAngleGeometry,
  getCircleDimGeometry,
  circleDimHasCenterFollowAttribute,
  dimMmToWorld,
  dimPtToWorld,
});
function drawVertexHandles(ctx, state) {
  return handlesOps.drawVertexHandles(ctx, state);
}
const groupOverlayOps = createRenderGroupOverlayOps({
  worldToScreen,
});
function drawActiveGroupHint(ctx, state) {
  return groupOverlayOps.drawActiveGroupHint(ctx, state);
}

function drawActiveGroupOriginHandle(ctx, state) {
  return groupOverlayOps.drawActiveGroupOriginHandle(ctx, state);
}

function drawActiveGroupRotateHandle(ctx, state) {
  return groupOverlayOps.drawActiveGroupRotateHandle(ctx, state);
}

function drawActiveGroupScaleHandle(ctx, state) {
  return groupOverlayOps.drawActiveGroupScaleHandle(ctx, state);
}

function drawDimEditHandles(ctx, state) {
  return handlesOps.drawDimEditHandles(ctx, state);
}

function drawImageScaleHandles(ctx, state) {
  return handlesOps.drawImageScaleHandles(ctx, state);
}
const hatchOps = createRenderHatchOps({
  worldToScreen,
  buildHatchLoopsFromBoundaryIds,
  getHatchPitchWorld,
  getHatchLineShiftWorld,
  getHatchPaddingWorld,
  getHatchDashWorld,
  getHatchGapWorld,
});

function drawHatchFill(ctx, state, s) {
  return hatchOps.drawHatchFill(ctx, state, s);
}
const doubleLineOverlayOps = createRenderDoubleLineOverlayOps({
  worldToScreen,
});
function drawDoubleLinePreview(ctx, state) {
  return doubleLineOverlayOps.drawDoubleLinePreview(ctx, state);
}

function drawDoubleLineConnectedPreviewDebug(ctx, state) {
  return doubleLineOverlayOps.drawDoubleLineConnectedPreviewDebug(ctx, state);
}

function drawDoubleLineTrimCandidates(ctx, state) {
  return doubleLineOverlayOps.drawDoubleLineTrimCandidates(ctx, state);
}

function drawDoubleLineTrimIntersections(ctx, state) {
  return doubleLineOverlayOps.drawDoubleLineTrimIntersections(ctx, state);
}

function drawDoubleLineConnectDebug(ctx, state) {
  return doubleLineOverlayOps.drawDoubleLineConnectDebug(ctx, state);
}
const boundsOps = createRenderBoundsOps({
  sampleBSplinePoints,
});
function getShapeWorldBounds(shape, shapeById = null, visiting = null) {
  return boundsOps.getShapeWorldBounds(shape, shapeById, visiting);
}

function isBoundsOutsideView(bounds, viewWorld) {
  return boundsOps.isBoundsOutsideView(bounds, viewWorld);
}

export function render(ctx, canvas, state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPageFrame(ctx, canvas, state);
  drawGrid(ctx, canvas, state);
  drawAxes(ctx, canvas, state);
  const layerCache = (() => {
    const visibleLayerSet = new Set();
    const lockedLayerSet = new Set();
    for (const l of (state.layers || [])) {
      const lid = Number(l?.id);
      if (!Number.isFinite(lid)) continue;
      if (l.visible !== false) visibleLayerSet.add(lid);
      if (l.locked === true) lockedLayerSet.add(lid);
    }
    return { visibleLayerSet, lockedLayerSet };
  })();
  const groupById = new Map((state.groups || []).map((g) => [Number(g.id), g]));
  const groupVisibleMemo = new Map();
  // Fast-path: when every layer is OFF, skip all shape-oriented work.
  if (layerCache.visibleLayerSet.size > 0) {
    const scale = Math.max(1e-9, Number(state.view?.scale) || 1);
    const marginWorld = 80 / scale;
    const left = (0 - state.view.offsetX) / scale - marginWorld;
    const top = (0 - state.view.offsetY) / scale - marginWorld;
    const right = (canvas.width - state.view.offsetX) / scale + marginWorld;
    const bottom = (canvas.height - state.view.offsetY) / scale + marginWorld;
    const viewWorld = {
      minX: Math.min(left, right),
      minY: Math.min(top, bottom),
      maxX: Math.max(left, right),
      maxY: Math.max(top, bottom),
    };
    const selectedSet = new Set((state.selection?.ids || []).map(Number));
    const activeGroupShapeSet = collectHighlightedGroupShapeIdSet(state);
    const currentShapeGroupMap = buildCurrentShapeGroupMap(state);
    // Render order is linked to layer order:
    // panel top( index 0 ) is top-most, so we draw from bottom layer to top layer.
    const layers = Array.isArray(state.layers) ? state.layers : [];
    const layerIndexById = new Map();
    for (let i = 0; i < layers.length; i += 1) {
      const lid = Number(layers[i]?.id);
      if (Number.isFinite(lid)) layerIndexById.set(lid, i);
    }
    const visibleShapesByLayer = new Map();
    const unlayeredVisibleShapes = [];
    for (const shape of (state.shapes || [])) {
      if (!isLayerVisible(state, shape.layerId, layerCache)) continue;
      if (!isVisibleByCurrentLayerFilter(state, shape)) continue;
      const lid = Number(shape.layerId);
      if (!Number.isFinite(lid) || !layerIndexById.has(lid)) {
        unlayeredVisibleShapes.push(shape);
        continue;
      }
      let bucket = visibleShapesByLayer.get(lid);
      if (!bucket) {
        bucket = [];
        visibleShapesByLayer.set(lid, bucket);
      }
      bucket.push(shape);
    }
    let shapeById = null; // lazily allocate only if we meet visible hatch shapes.
    const drawVisibleShape = (shape) => {
      if (shape.type === "hatch" && !shapeById) {
        shapeById = new Map((state.shapes || []).map(s => [Number(s.id), s]));
      }
      const b = getShapeWorldBounds(shape, shapeById);
      if (b && isBoundsOutsideView(b, viewWorld)) return;
      drawShape(ctx, state, shape, currentShapeGroupMap, selectedSet, activeGroupShapeSet, layerCache, groupById, groupVisibleMemo);
    };
    // Unknown layer shapes first (back-most).
    for (const shape of unlayeredVisibleShapes) drawVisibleShape(shape);
    // Draw from bottom layer to top layer.
    for (let li = layers.length - 1; li >= 0; li -= 1) {
      const lid = Number(layers[li]?.id);
      const bucket = visibleShapesByLayer.get(lid);
      if (!bucket || bucket.length === 0) continue;
      for (const shape of bucket) drawVisibleShape(shape);
    }
  }
  drawPreview(ctx, state, state.preview);
  drawDoubleLinePreview(ctx, state);
  drawDoubleLineConnectedPreviewDebug(ctx, state);
  drawDoubleLineTrimCandidates(ctx, state);
  drawDoubleLineTrimIntersections(ctx, state);
  drawDoubleLineConnectDebug(ctx, state);
  drawPolylineDraft(ctx, state);
  drawDimDraft(ctx, state);
  drawDimHoveredShape(ctx, state);
  drawActiveGroupHint(ctx, state);
  drawActiveGroupOriginHandle(ctx, state);
  drawActiveGroupRotateHandle(ctx, state);
  drawActiveGroupScaleHandle(ctx, state);
  drawVertexHandles(ctx, state);
  drawDimEditHandles(ctx, state);
  drawImageScaleHandles(ctx, state);
  drawSelectionBox(ctx, state);
  drawObjectSnapHover(ctx, state);
  drawTrimHover(ctx, state);
  drawHatchHover(ctx, state);
  drawFilletHover(ctx, state);
  drawFilletFlow(ctx, state);
}
