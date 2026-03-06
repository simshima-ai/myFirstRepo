import {
  worldToScreen, screenToWorld, getEffectiveGridSize, mmPerUnit,
  getHatchPitchWorld, getHatchLineShiftWorld, getHatchPaddingWorld, getHatchDashWorld, getHatchGapWorld
} from "./geom.js";
import { getDimGeometry, getDimChainGeometry, getDimAngleGeometry, getSpecialDimGeometry, getCircleDimGeometry, circleDimHasCenterFollowAttribute } from "./dim_geom.js";
import { buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";
import { computeLineCircleAutoTrimPlan } from "./app_tools.js";

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

function isInActiveGroup(state, shapeId) {
  if (state.activeGroupId == null) return false;
  const ids = collectGroupTreeShapeIdSet(state, state.activeGroupId);
  return ids.has(Number(shapeId));
}

const PAGE_SIZES_MM = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
};
const MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, inch: 25.4 };

function getPageFrameWorldSize(pageSetup) {
  const key = String(pageSetup?.size || "A4");
  const [w, h] = PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4;
  const isPortrait = String(pageSetup?.orientation || "landscape") === "portrait";
  const mmW = isPortrait ? Math.min(w, h) : Math.max(w, h);
  const mmH = isPortrait ? Math.max(w, h) : Math.min(w, h);
  const scale = Math.max(0.0001, Number(pageSetup?.scale ?? 1) || 1);
  const unit = String(pageSetup?.unit || "mm");
  const mpU = MM_PER_UNIT[unit] || 1;
  return { cadW: mmW * scale / mpU, cadH: mmH * scale / mpU, mmW, mmH, scale, unit };
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

function drawPageFrame(ctx, canvas, state) {
  if (!state.pageSetup?.showFrame) return;
  const { cadW, cadH, mmW, mmH, scale, unit } = getPageFrameWorldSize(state.pageSetup);

  // Center page at (0,0)
  const tl = worldToScreen(state.view, { x: -cadW / 2, y: -cadH / 2 });
  const br = worldToScreen(state.view, { x: cadW / 2, y: cadH / 2 });
  const sw = br.x - tl.x, sh = br.y - tl.y;
  if (Math.abs(sw) < 1 || Math.abs(sh) < 1) return;

  // Paper fill (white)
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(tl.x, tl.y, sw, sh);

  // Crop marks (Tonbo)
  ctx.strokeStyle = "#1e293b"; // Darker color for better visibility against grid
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  const len = 20; // length of crop mark lines in pixels
  const gap = 5;  // offset outside the paper for center marks in pixels

  // Corners (L-shapes)
  // Top-Left
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y + len); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tl.x + len, tl.y);
  ctx.stroke();
  // Top-Right
  ctx.beginPath();
  ctx.moveTo(br.x - len, tl.y); ctx.lineTo(br.x, tl.y); ctx.lineTo(br.x, tl.y + len);
  ctx.stroke();
  // Bottom-Right
  ctx.beginPath();
  ctx.moveTo(br.x, br.y - len); ctx.lineTo(br.x, br.y); ctx.lineTo(br.x - len, br.y);
  ctx.stroke();
  // Bottom-Left
  ctx.beginPath();
  ctx.moveTo(tl.x + len, br.y); ctx.lineTo(tl.x, br.y); ctx.lineTo(tl.x, br.y - len);
  ctx.stroke();

  // Center marks calculation
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;

  // Add a small cross mark at the center of the paper itself (optional but good for alignment)
  ctx.save();
  ctx.strokeStyle = "rgba(30, 41, 59, 0.3)";
  const clen = 10;
  ctx.beginPath();
  ctx.moveTo(cx - clen, cy); ctx.lineTo(cx + clen, cy);
  ctx.moveTo(cx, cy - clen); ctx.lineTo(cx, cy + clen);
  ctx.stroke();
  ctx.restore();

  // Center marks (outside the frame)
  // Top center
  ctx.beginPath(); ctx.moveTo(cx, tl.y - gap); ctx.lineTo(cx, tl.y - gap - len); ctx.stroke();
  // Bottom center
  ctx.beginPath(); ctx.moveTo(cx, br.y + gap); ctx.lineTo(cx, br.y + gap + len); ctx.stroke();
  // Left center
  ctx.beginPath(); ctx.moveTo(tl.x - gap, cy); ctx.lineTo(tl.x - gap - len, cy); ctx.stroke();
  // Right center
  ctx.beginPath(); ctx.moveTo(br.x + gap, cy); ctx.lineTo(br.x + gap + len, cy); ctx.stroke();

  // Inner margin frame
  const marginMm = Math.max(0, Number(state.pageSetup?.innerMarginMm ?? 10) || 0);
  if (marginMm > 0) {
    const mpU = MM_PER_UNIT[unit] || 1;
    const mCad = marginMm * scale / mpU;
    const itl = worldToScreen(state.view, { x: -cadW / 2 + mCad, y: -cadH / 2 + mCad });
    const ibr = worldToScreen(state.view, { x: cadW / 2 - mCad, y: cadH / 2 - mCad });
    const iw = ibr.x - itl.x, ih = ibr.y - itl.y;
    if (iw > 4 && ih > 4) {
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(itl.x, itl.y, iw, ih);
      ctx.setLineDash([]);
    }
  }

  // Scale label
  const labelStr = `${String(state.pageSetup?.size || "A4")} ${state.pageSetup?.orientation === "portrait" ? "縦" : "横"} | 1:${scale} | ${unit}`;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(labelStr, tl.x + 3, tl.y - 2);

  ctx.restore();
}

function drawGrid(ctx, canvas, state) {
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
    // Reduce line density when zoom/grid would generate too many lines.
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

function drawAxes(ctx, canvas, state) {
  ctx.save();
  ctx.strokeStyle = "#cfd6df";
  ctx.lineWidth = 1;
  const o = worldToScreen(state.view, { x: 0, y: 0 });
  ctx.beginPath();
  ctx.moveTo(0, o.y);
  ctx.lineTo(canvas.width, o.y);
  ctx.moveTo(o.x, 0);
  ctx.lineTo(o.x, canvas.height);
  ctx.stroke();
  ctx.restore();
}

function drawShape(ctx, state, shape, currentShapeGroupMap = null, selectedSet = null, activeGroupShapeSet = null, layerCache = null, groupById = null, groupVisibleMemo = null) {
  if (!isLayerVisible(state, shape.layerId, layerCache)) return;
  if (!isShapeGroupVisible(state, shape, currentShapeGroupMap, groupById, groupVisibleMemo)) return;
  ctx.save();
  if (isLayerLocked(state, shape.layerId, layerCache)) {
    ctx.globalAlpha *= 0.5;
  }
  const sid = Number(shape.id);
  const selected = selectedSet ? selectedSet.has(sid) : state.selection.ids.includes(sid);
  const isHatchBoundary = state.tool === "hatch" && state.hatchDraft?.boundaryIds?.includes(Number(shape.id));
  const isPatternCopyReference = state.tool === "patterncopy" && (
    Number(shape.id) === state.input.patternCopyFlow.centerPositionId ||
    Number(shape.id) === state.input.patternCopyFlow.axisLineId
  );
  const groupActive = !selected && (activeGroupShapeSet ? activeGroupShapeSet.has(sid) : isInActiveGroup(state, shape.id));
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

  ctx.strokeStyle = (selected || isHatchBoundary) ? "#f59e0b" : (isPatternCopyReference ? "#22c55e" : (groupActive ? "#2563eb" : (isHovered ? "#94a3b8" : baseStroke)));
  const shapeStrokePx = lineWidthMmToScreenPx(state, getShapeLineWidthMm(state, shape));
  ctx.lineWidth = (selected || isHatchBoundary || isPatternCopyReference)
    ? Math.max(2, shapeStrokePx)
    : (isHovered ? Math.max(2, shapeStrokePx) : shapeStrokePx);
  if (shape.type !== "hatch" && shape.type !== "text" && shape.type !== "image") {
    applyShapeLineDash(ctx, getShapeLineType(shape), ctx.lineWidth);
  } else {
    ctx.setLineDash([]);
  }

  if (shape.type === "hatch") {
    drawHatchFill(ctx, state, shape);
    if (selected) {
      // ハッチ選択時にバウンディングボックスを描画
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
    ctx.fillStyle = selected ? "#f59e0b" : (groupActive ? "#2563eb" : (shape.textColor || baseStroke));
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

function drawPreview(ctx, state, preview) {
  if (!preview) return;
  const drawPurpleCandidate = (x, y) => {
    const p = worldToScreen(state.view, { x, y });
    ctx.save();
    ctx.strokeStyle = "#7c3aed";
    ctx.fillStyle = "rgba(124,58,237,0.10)";
    ctx.setLineDash([]);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7);
    ctx.stroke();
    ctx.restore();
  };
  const drawRedCandidate = (x, y) => {
    const p = worldToScreen(state.view, { x, y });
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "rgba(239,68,68,0.10)";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7);
    ctx.stroke();
    ctx.restore();
  };
  if (preview.type === "position") {
    if (preview.positionPreviewMode === "marker") {
      const x = Number(preview.x ?? preview.x1 ?? 0);
      const y = Number(preview.y ?? preview.y1 ?? 0);
      drawPurpleCandidate(x, y);
      drawPreviewMetrics(ctx, state, preview);
      return;
    }
    // Position tool preview: draw with actual object size in purple.
    const x = Number(preview.x ?? preview.x1 ?? 0);
    const y = Number(preview.y ?? preview.y1 ?? 0);
    const c = worldToScreen(state.view, { x, y });
    const size = Math.max(1.5, (Number(preview.size ?? 20) || 20) * state.view.scale);
    ctx.save();
    ctx.strokeStyle = "#7c3aed";
    ctx.setLineDash([]);
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(c.x, c.y, size * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x - size, c.y);
    ctx.lineTo(c.x + size, c.y);
    ctx.moveTo(c.x, c.y - size);
    ctx.lineTo(c.x, c.y + size);
    ctx.stroke();
    ctx.restore();
    drawPreviewMetrics(ctx, state, preview);
    return;
  }
  if (preview.type === "line") {
    if (preview.linePreviewMode === "fixed") {
      const ap = preview.lineAnchorWorld || null;
      const ax = Number(ap?.x), ay = Number(ap?.y);
      if (Number.isFinite(ax) && Number.isFinite(ay)) drawRedCandidate(ax, ay);
    } else {
      const x2 = Number(preview.x2);
      const y2 = Number(preview.y2);
      if (Number.isFinite(x2) && Number.isFinite(y2)) drawPurpleCandidate(x2, y2);
    }
  } else if (preview.type === "rect") {
    if (preview.rectPreviewMode === "fixed") {
      const ap = preview.rectAnchorWorld || null;
      const ax = Number(ap?.x), ay = Number(ap?.y);
      if (Number.isFinite(ax) && Number.isFinite(ay)) drawRedCandidate(ax, ay);
    } else {
      const x2 = Number(preview.x2);
      const y2 = Number(preview.y2);
      if (Number.isFinite(x2) && Number.isFinite(y2)) drawPurpleCandidate(x2, y2);
    }
  } else if (preview.type === "circle") {
    if (preview.circlePreviewMode === "fixed") {
      const ap = preview.circleAnchorWorld || null;
      const ax = Number(ap?.x), ay = Number(ap?.y);
      if (Number.isFinite(ax) && Number.isFinite(ay)) drawRedCandidate(ax, ay);
    } else {
      // For circle tool, 2nd click is on perimeter at current hover.
      const hx = Number(state.input?.hoverWorld?.x);
      const hy = Number(state.input?.hoverWorld?.y);
      if (Number.isFinite(hx) && Number.isFinite(hy)) drawPurpleCandidate(hx, hy);
    }
  } else if (preview.type === "text") {
    const x = Number(preview.x ?? preview.x1 ?? 0);
    const y = Number(preview.y ?? preview.y1 ?? 0);
    drawPurpleCandidate(x, y);
    drawPreviewMetrics(ctx, state, preview);
    return;
  }
  if (preview.type === "rect" && preview.rectPreviewMode === "fixed") {
    const x1 = Number(preview.x1), y1 = Number(preview.y1);
    const x2 = Number(preview.x2), y2 = Number(preview.y2);
    const p1 = worldToScreen(state.view, { x: x1, y: y1 });
    const p2 = worldToScreen(state.view, { x: x2, y: y2 });
    const sx = Math.min(p1.x, p2.x);
    const sy = Math.min(p1.y, p2.y);
    const sw = Math.abs(p2.x - p1.x);
    const sh = Math.abs(p2.y - p1.y);
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.setLineDash([7, 4]);
    ctx.lineWidth = 1.1;
    ctx.strokeRect(sx, sy, sw, sh);
    ctx.restore();
    drawPreviewMetrics(ctx, state, preview);
    return;
  }
  if (preview.type === "line" && preview.linePreviewMode === "fixed") {
    const p1 = worldToScreen(state.view, { x: Number(preview.x1), y: Number(preview.y1) });
    const p2 = worldToScreen(state.view, { x: Number(preview.x2), y: Number(preview.y2) });
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.setLineDash([7, 4]);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
    drawPreviewMetrics(ctx, state, preview);
    return;
  }
  if (preview.type === "circle" && preview.circlePreviewMode === "fixed") {
    const cx = Number(preview.cx), cy = Number(preview.cy);
    const r = Math.abs(Number(preview.r) || 0);
    const c = worldToScreen(state.view, { x: cx, y: cy });
    const sr = Math.max(0, r * Math.max(1e-9, state.view.scale));
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.setLineDash([7, 4]);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(c.x, c.y, sr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawPreviewMetrics(ctx, state, preview);
    return;
  }
  ctx.save();
  ctx.strokeStyle = "#64748b"; // Slate 500
  ctx.setLineDash([]);
  ctx.lineWidth = 1.0;
  drawShape(ctx, state, preview, null);
  ctx.restore();
  drawPreviewMetrics(ctx, state, preview);
}

function drawPreviewLabel(ctx, x, y, text) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const padX = 6;
  const padY = 4;
  const m = ctx.measureText(text);
  const w = Math.ceil(m.width) + padX * 2;
  const h = 20;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.strokeStyle = "#cbd5e1";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0f172a";
  ctx.fillText(text, x + padX, y + h * 0.5);
  ctx.restore();
}

function drawPreviewMetrics(ctx, state, preview) {
  if (!preview) return;
  const prec = Math.max(0, Math.min(3, Number(state.previewSettings?.precision ?? 2)));
  if (preview.type === "line") {
    const x1 = Number(preview.x1), y1 = Number(preview.y1);
    const x2 = Number(preview.x2), y2 = Number(preview.y2);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const mid = worldToScreen(state.view, { x: (x1 + x2) * 0.5, y: (y1 + y2) * 0.5 });
    drawPreviewLabel(ctx, mid.x + 10, mid.y - 28, `L=${len.toFixed(prec)}  A=${ang.toFixed(1)}°`);
    return;
  }
  if (preview.type === "rect") {
    const x1 = Number(preview.x1), y1 = Number(preview.y1);
    const x2 = Number(preview.x2), y2 = Number(preview.y2);
    const wv = x2 - x1;
    const hv = y2 - y1;
    const c = worldToScreen(state.view, { x: (x1 + x2) * 0.5, y: (y1 + y2) * 0.5 });
    drawPreviewLabel(ctx, c.x + 10, c.y - 28, `W=${wv.toFixed(prec)}  H=${hv.toFixed(prec)}`);
    return;
  }
  if (preview.type === "circle") {
    const c = worldToScreen(state.view, { x: Number(preview.cx), y: Number(preview.cy) });
    const r = Number(preview.r) || 0;
    drawPreviewLabel(ctx, c.x + 10, c.y - 28, `R=${r.toFixed(prec)}  D=${(r * 2).toFixed(prec)}`);
    return;
  }
  if (preview.type === "position" || preview.type === "text") {
    const x = Number(preview.x ?? preview.x1 ?? 0);
    const y = Number(preview.y ?? preview.y1 ?? 0);
    const c = worldToScreen(state.view, { x, y });
    drawPreviewLabel(ctx, c.x + 10, c.y - 28, `X=${x.toFixed(prec)}  Y=${y.toFixed(prec)}`);
  }
}

function sampleBSplinePoints(controlPoints, degreeRaw = 3) {
  const cps = Array.isArray(controlPoints) ? controlPoints
    .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];
  if (cps.length < 2) return [];
  const degree = Math.max(1, Math.min(Number(degreeRaw) || 3, cps.length - 1));
  const n = cps.length - 1;
  const m = n + degree + 1;
  const knots = new Array(m + 1).fill(0);
  for (let i = 0; i <= m; i++) {
    if (i <= degree) knots[i] = 0;
    else if (i >= m - degree) knots[i] = 1;
    else knots[i] = (i - degree) / (m - 2 * degree);
  }
  const basis = (i, p, u) => {
    if (p === 0) {
      if (u === 1) return i === n ? 1 : 0;
      return (knots[i] <= u && u < knots[i + 1]) ? 1 : 0;
    }
    const d1 = knots[i + p] - knots[i];
    const d2 = knots[i + p + 1] - knots[i + 1];
    const a = d1 > 1e-12 ? ((u - knots[i]) / d1) * basis(i, p - 1, u) : 0;
    const b = d2 > 1e-12 ? ((knots[i + p + 1] - u) / d2) * basis(i + 1, p - 1, u) : 0;
    return a + b;
  };
  const spans = Math.max(1, n - degree + 1);
  const sampleCount = Math.max(24, Math.min(720, spans * 32));
  const out = [];
  for (let s = 0; s <= sampleCount; s++) {
    const u = s / sampleCount;
    let x = 0;
    let y = 0;
    for (let i = 0; i <= n; i++) {
      const w = basis(i, degree, u);
      if (!w) continue;
      x += cps[i].x * w;
      y += cps[i].y * w;
    }
    out.push({ x, y });
  }
  return out;
}

function drawPolylineDraft(ctx, state) {
  const d = state.polylineDraft;
  if (!d || !Array.isArray(d.points) || d.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = "#64748b";
  ctx.fillStyle = "#64748b";
  ctx.setLineDash([]);
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  if (d.kind === "bspline") {
    const cp = d.hoverPoint ? [...d.points, d.hoverPoint] : [...d.points];
    const sampled = sampleBSplinePoints(cp, 3);
    if (sampled.length >= 2) {
      const p0 = worldToScreen(state.view, sampled[0]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < sampled.length; i++) {
        const p = worldToScreen(state.view, sampled[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(100,116,139,0.45)";
    ctx.beginPath();
    const c0 = worldToScreen(state.view, d.points[0]);
    ctx.moveTo(c0.x, c0.y);
    for (let i = 1; i < d.points.length; i++) {
      const p = worldToScreen(state.view, d.points[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (d.hoverPoint) {
      const hp = worldToScreen(state.view, d.hoverPoint);
      ctx.lineTo(hp.x, hp.y);
    }
    ctx.stroke();
  } else {
    const p0 = worldToScreen(state.view, d.points[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < d.points.length; i++) {
      const p = worldToScreen(state.view, d.points[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (d.hoverPoint) {
      const hp = worldToScreen(state.view, d.hoverPoint);
      ctx.lineTo(hp.x, hp.y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const wp of d.points) {
    const p = worldToScreen(state.view, wp);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (d.hoverPoint) {
    const hp = worldToScreen(state.view, d.hoverPoint);
    ctx.beginPath();
    ctx.arc(hp.x, hp.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(14,165,233,0.35)";
    ctx.fill();
  }
  ctx.restore();
}

function drawDimDraft(ctx, state) {
  const d = state.dimDraft;
  if (!d) return;
  const drawPurpleCandidate = (x, y) => {
    const p = worldToScreen(state.view, { x, y });
    ctx.save();
    ctx.strokeStyle = "#7c3aed";
    ctx.fillStyle = "rgba(124,58,237,0.10)";
    ctx.setLineDash([]);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7);
    ctx.stroke();
    ctx.restore();
  };
  ctx.save();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1.0;
  ctx.setLineDash([]);

  if (d.dimRef) {
    // Radial/Diameter preview
    if (d.type === "circleDim") {
      const geom = getCircleDimGeometry(d, state.shapes);
      if (geom) drawDimensionCommon(ctx, state, { ...d, precision: state.dimSettings?.precision ?? 1 }, geom, false, false);
    } else {
      const geom = getSpecialDimGeometry({ kind: d.kind, dimRef: d.dimRef, x2: d.x2, y2: d.y2 }, state.shapes);
      if (geom) drawDimensionCommon(ctx, state, { type: "dim", kind: d.kind, precision: 1 }, geom, false, false);
    }
    if (Number.isFinite(Number(d.x2)) && Number.isFinite(Number(d.y2))) {
      drawPurpleCandidate(Number(d.x2), Number(d.y2));
    } else {
      const hx = Number(state.input?.hoverWorld?.x);
      const hy = Number(state.input?.hoverWorld?.y);
      if (Number.isFinite(hx) && Number.isFinite(hy)) drawPurpleCandidate(hx, hy);
    }
  } else if (d.points && d.points.length >= 1) {
    // Chain preview
    const lastPoint = d.points[d.points.length - 1];
    const awaitingPlacement = !!d.awaitingPlacement;
    const hoverPoint = d.hoverPoint || lastPoint;
    const pts = [...d.points];
    if (!awaitingPlacement && Math.hypot(hoverPoint.x - lastPoint.x, hoverPoint.y - lastPoint.y) > 1e-9) {
      pts.push(hoverPoint);
    }
    if (pts.length >= 2) {
      const placePt = d.place ?? d.hoverPlace ?? (awaitingPlacement ? lastPoint : hoverPoint);
      const geom = getDimChainGeometry({ points: pts, px: placePt.x, py: placePt.y });
      if (geom) drawDimensionCommon(ctx, state, { type: "dimchain", precision: 1 }, geom, false, false);
    }
    // Show p1 dot
    const p1s = worldToScreen(state.view, d.points[0]);
    ctx.beginPath(); ctx.arc(p1s.x, p1s.y, 3, 0, Math.PI * 2); ctx.stroke();
    const m = awaitingPlacement ? (d.hoverPlace || d.place) : d.hoverPoint;
    if (m && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y))) {
      drawPurpleCandidate(Number(m.x), Number(m.y));
    }
  } else if (d.p1) {
    const p1s = worldToScreen(state.view, d.p1);
    ctx.beginPath();
    ctx.arc(p1s.x, p1s.y, 3, 0, Math.PI * 2);
    ctx.stroke();

    if (d.p2) {
      // Compute off from placement point so the dim preview follows the mouse
      const px = d.place?.x ?? d.p2.x;
      const py = d.place?.y ?? d.p2.y;
      const vx = d.p2.x - d.p1.x, vy = d.p2.y - d.p1.y;
      const len = Math.hypot(vx, vy);
      let off = 0;
      if (len > 1e-9) {
        const nx = -vy / len, ny = vx / len;
        off = (px - d.p1.x) * nx + (py - d.p1.y) * ny;
      }
      const geom = getDimGeometry({ x1: d.p1.x, y1: d.p1.y, x2: d.p2.x, y2: d.p2.y, dimOffset: off });
      if (geom) drawDimensionCommon(ctx, state, { type: "dim", precision: state.dimSettings?.precision ?? 1 }, geom, false, false);
    } else if (d.hover) {
      const hs = worldToScreen(state.view, d.hover);
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y);
      ctx.lineTo(hs.x, hs.y);
      ctx.stroke();
      if (Number.isFinite(Number(d.hover.x)) && Number.isFinite(Number(d.hover.y))) {
        drawPurpleCandidate(Number(d.hover.x), Number(d.hover.y));
      }
    } else {
      const hx = Number(state.input?.hoverWorld?.x);
      const hy = Number(state.input?.hoverWorld?.y);
      if (Number.isFinite(hx) && Number.isFinite(hy)) drawPurpleCandidate(hx, hy);
    }
  }
  ctx.restore();
}

function drawDimHoveredShape(ctx, state) {
  if (state.tool !== "dim" || state.dimDraft) return;

  // Draw dim preview when hovering over circle/arc
  const preview = state.input.dimHoverPreview;
  if (preview) {
    ctx.save();
    ctx.strokeStyle = "rgba(100, 116, 139, 0.75)";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    const geom = getSpecialDimGeometry(preview, state.shapes);
    if (geom) drawDimensionCommon(ctx, state, { type: "dim", kind: preview.kind, precision: state.dimSettings?.precision ?? 1 }, geom, false, false);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  if (state.input.dimHoveredShapeId == null) return;
  const s = state.shapes.find(sh => Number(sh.id) === Number(state.input.dimHoveredShapeId));
  if (!s) return;
  ctx.save();
  if (s.type === "line") {
    // Same style direction as trim candidate: red dashed hover cue.
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
  } else {
    ctx.strokeStyle = "rgba(34, 197, 94, 0.5)";
    ctx.lineWidth = 6;
    ctx.setLineDash([]);
  }
  if (s.type === "line") {
    const p1 = worldToScreen(state.view, { x: s.x1, y: s.y1 });
    const p2 = worldToScreen(state.view, { x: s.x2, y: s.y2 });
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  } else if (s.type === "circle" || s.type === "arc") {
    const c = worldToScreen(state.view, { x: s.cx, y: s.cy });
    const r = Math.abs(Number(s.r)) * state.view.scale;
    ctx.beginPath();
    if (s.type === "circle") {
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    } else {
      ctx.arc(c.x, c.y, r, Number(s.a1), Number(s.a2), !(s.ccw !== false));
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelectionBox(ctx, state) {
  const box = state.selection?.box;
  if (!box || !box.active || !box.startScreen || !box.currentScreen) return;
  const x = Math.min(box.startScreen.x, box.currentScreen.x);
  const y = Math.min(box.startScreen.y, box.currentScreen.y);
  const w = Math.abs(box.currentScreen.x - box.startScreen.x);
  const h = Math.abs(box.currentScreen.y - box.startScreen.y);
  const leftToRight = box.currentScreen.x >= box.startScreen.x;

  ctx.save();
  if (leftToRight) {
    // Window selection: Blue
    ctx.fillStyle = "rgba(14,165,233,0.15)";
    ctx.strokeStyle = "#0ea5e9";
    ctx.setLineDash([]);
  } else {
    // Crossing selection: Green
    ctx.fillStyle = "rgba(34,197,94,0.15)";
    ctx.strokeStyle = "#22c55e";
    ctx.setLineDash([5, 5]);
  }
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawObjectSnapHover(ctx, state) {
  if (state.tool === "trim") return; // トリムツール時はスナップ候補を表示しない
  const p = state.input?.objectSnapHover;
  if (!p) return;

  // 頂点編集または選択ツール時、何も選択されていない場合は表示しない（ドラッグ中を除く）
  const isDragging = state.vertexEdit.drag.active || state.selection.drag.active;
  const hasSelection = (state.selection.ids.length > 0) || (state.tool === "vertex" && (state.vertexEdit.selectedVertices || []).length > 0);

  if ((state.tool === "vertex" || state.tool === "select") && !hasSelection && !isDragging) {
    return;
  }
  const isCreateTool = (
    state.tool === "line" ||
    state.tool === "rect" ||
    state.tool === "circle" ||
    state.tool === "polyline" ||
    state.tool === "position" ||
    state.tool === "text" ||
    state.tool === "dim"
  );
  const s = worldToScreen(state.view, p);
  ctx.save();

  if (isCreateTool) {
    ctx.strokeStyle = "#7c3aed";
    ctx.fillStyle = "rgba(124,58,237,0.10)";
    ctx.lineWidth = 0.75;
  } else {
    // Green style (#22c55e)
    ctx.strokeStyle = "#16a34a"; // Vivid green
    ctx.fillStyle = "rgba(34,197,94,0.15)";
    ctx.lineWidth = 0.8;
  }

  // Smaller circle
  ctx.beginPath();
  ctx.arc(s.x, s.y, isCreateTool ? 3.5 : 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Smaller crosshair
  ctx.beginPath();
  const h = isCreateTool ? 7 : 7;
  ctx.moveTo(s.x - h, s.y); ctx.lineTo(s.x + h, s.y);
  ctx.moveTo(s.x, s.y - h); ctx.lineTo(s.x, s.y + h);
  ctx.stroke();

  const label = p.kind === "nearest"
    ? "NEA"
    : (p.kind === "intersection"
      ? "INT"
      : (p.kind === "center"
        ? "CEN"
        : (p.kind === "midpoint"
          ? "MID"
          : (p.kind === "vector" ? "VEC" : "END"))));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isCreateTool ? "#5b21b6" : "#166534";
  ctx.fillText(label, s.x + 10, s.y - 8);
  ctx.restore();
}

function drawTrimHover(ctx, state) {
  if (state.tool !== "trim") return;
  const th = state.input?.trimHover;
  if (!th) return;
  const s = th.line; // th.line に直接オブジェクトが入っている
  if (th.targetType === "circle" || th.targetType === "arc") {
    const csh = th.circle || th.arc; // 直接参照
    if (!csh || !isLayerVisible(state, csh.layerId)) return;
    const c = worldToScreen(state.view, { x: Number(csh.cx), y: Number(csh.cy) });
    const r = Math.max(1, Number(csh.r) * state.view.scale);
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, (Number(th.remA1) || 0), (Number(th.remA2) || 0), !(th.remCCW !== false));
    ctx.stroke();
    ctx.setLineDash([]);
    for (const p of [{ x: Number(th.x1), y: Number(th.y1) }, { x: Number(th.x2), y: Number(th.y2) }]) {
      const ip = worldToScreen(state.view, p);
      ctx.fillStyle = "rgba(239,68,68,0.12)";
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ip.x, ip.y, 6, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    return;
  }
  if (!s || !isLayerVisible(state, s.layerId)) return;
  const p1 = worldToScreen(state.view, { x: Number(s.x1), y: Number(s.y1) });
  const p2 = worldToScreen(state.view, { x: Number(s.x2), y: Number(s.y2) });
  ctx.save();
  if (th.mode === "delete-line") {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }
  if (th.mode === "middle") {
    const i1 = worldToScreen(state.view, { x: Number(th.x1), y: Number(th.y1) });
    const i2 = worldToScreen(state.view, { x: Number(th.x2), y: Number(th.y2) });
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(i1.x, i1.y);
    ctx.lineTo(i2.x, i2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const ip of [i1, i2]) {
      ctx.fillStyle = "rgba(239,68,68,0.12)";
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(ip.x, ip.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ip.x - 9, ip.y);
      ctx.lineTo(ip.x + 9, ip.y);
      ctx.moveTo(ip.x, ip.y - 9);
      ctx.lineTo(ip.x, ip.y + 9);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const ip = worldToScreen(state.view, { x: Number(th.ip?.x), y: Number(th.ip?.y) });
  const from = (th.trimEnd === "p1") ? p1 : p2;
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(ip.x, ip.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(239,68,68,0.12)";
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(ip.x, ip.y, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ip.x - 9, ip.y);
  ctx.lineTo(ip.x + 9, ip.y);
  ctx.moveTo(ip.x, ip.y - 9);
  ctx.lineTo(ip.x, ip.y + 9);
  ctx.stroke();
  ctx.restore();
}

function drawFilletHover(ctx, state) {
  const fh = state.input?.filletHover;
  if (!fh || !fh.arc) return;
  const arc = fh.arc;
  const c = worldToScreen(state.view, { x: arc.cx, y: arc.cy });
  const r = Math.max(1, Number(arc.r) * state.view.scale);
  const drawTrimLineSeg = (a, b) => {
    if (!a || !b) return;
    const ax = Number(a.x), ay = Number(a.y), bx = Number(b.x), by = Number(b.y);
    if (![ax, ay, bx, by].every(Number.isFinite)) return;
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen < 1e-6) {
      const p = worldToScreen(state.view, { x: ax, y: ay });
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "rgba(239,68,68,0.2)";
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    const p1 = worldToScreen(state.view, { x: ax, y: ay });
    const p2 = worldToScreen(state.view, { x: bx, y: by });
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  };
  const drawRedPoint = (p) => {
    if (!p) return;
    const x = Number(p.x), y = Number(p.y);
    if (![x, y].every(Number.isFinite)) return;
    const s = worldToScreen(state.view, { x, y });
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "rgba(239,68,68,0.25)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s.x - 8, s.y); ctx.lineTo(s.x + 8, s.y);
    ctx.moveTo(s.x, s.y - 8); ctx.lineTo(s.x, s.y + 8);
    ctx.stroke();
    ctx.restore();
  };
  const drawTrimArcSeg = (arcShape, aStart, aEnd, ccw) => {
    const cx = Number(arcShape?.cx), cy = Number(arcShape?.cy), rr = Math.abs(Number(arcShape?.r) || 0);
    if (!(rr > 1e-9)) return;
    const cs = worldToScreen(state.view, { x: cx, y: cy });
    const rs = Math.max(1, rr * state.view.scale);
    const s = Number(aStart);
    const e = Number(aEnd);
    if (![s, e].every(Number.isFinite)) return;
    const anti = !(ccw !== false);
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(cs.x, cs.y, rs, s, e, anti);
    ctx.stroke();
    ctx.restore();
  };
  ctx.save();
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, Number(arc.a1) || 0, Number(arc.a2) || 0, !(arc.ccw !== false));
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of (fh.points || [])) {
    const s = worldToScreen(state.view, p);
    ctx.fillStyle = "#8b5cf6";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Debug visualization: show trim-to-delete candidates in red dashed lines/arcs.
  if (fh.sol?.t1 && fh.sol?.t2 && fh.sol?.e1 && fh.sol?.e2) {
    drawTrimLineSeg(fh.sol.e1.trimPoint, fh.sol.t1);
    drawTrimLineSeg(fh.sol.e2.trimPoint, fh.sol.t2);
  } else if (fh.sol?.line && fh.sol?.tLine) {
    const plan = computeLineCircleAutoTrimPlan(state, fh.sol, fh.sol.line, fh.sol.circle, fh.sol.keepEnd || "p1", null);
    const lc = plan?.lineCandidate || null;
    if (lc && lc.targetType === "line") {
      if (lc.mode === "p1") {
        drawTrimLineSeg(
          { x: Number(lc.line?.x1), y: Number(lc.line?.y1) },
          { x: Number(lc.ip?.x), y: Number(lc.ip?.y) }
        );
      } else if (lc.mode === "p2") {
        drawTrimLineSeg(
          { x: Number(lc.ip?.x), y: Number(lc.ip?.y) },
          { x: Number(lc.line?.x2), y: Number(lc.line?.y2) }
        );
      } else if (lc.mode === "middle") {
        drawTrimLineSeg(lc.ip1, lc.ip2);
      }
    }
    if (fh.sol.circle?.type === "arc") {
      const ac = plan?.arcCandidate || null;
      if (ac && ac.targetType === "arc") {
        if (ac.mode === "arc-remove-arc" || ac.mode === "arc-remove-middle") {
          drawTrimArcSeg(fh.sol.circle, Number(ac.remA1), Number(ac.remA2), ac.remCCW !== false);
        } else if (ac.mode === "delete-arc") {
          drawTrimArcSeg(
            fh.sol.circle,
            Number(fh.sol.circle?.a1) || 0,
            Number(fh.sol.circle?.a2) || 0,
            fh.sol.circle?.ccw !== false
          );
        }
      }
    }
  }
  // Always show intended trim tangent points in red for debugging.
  if (fh.sol?.tLine) drawRedPoint(fh.sol.tLine);
  if (fh.sol?.tCircle) drawRedPoint(fh.sol.tCircle);
}

function drawFilletFlow(ctx, state) {
  const ff = state.input?.filletFlow;
  if (!ff) return;
  if (ff.stage === "confirm-arc-sides" && ff.kind === "arc-arc" && ff.sol?.arc1 && ff.sol?.arc2 && ff.sol?.t1 && ff.sol?.t2) {
    const drawArcSplit = (arcShape, tangentPoint, keepSide) => {
      const cx = Number(arcShape.cx), cy = Number(arcShape.cy), rr = Math.abs(Number(arcShape.r) || 0);
      const a1 = Number(arcShape.a1) || 0, a2 = Number(arcShape.a2) || 0;
      const ccw = arcShape.ccw !== false;
      const tAng = normalizeRad(Math.atan2(Number(tangentPoint.y) - cy, Number(tangentPoint.x) - cx));
      const c = worldToScreen(state.view, { x: cx, y: cy });
      const rs = Math.max(1, rr * state.view.scale);
      const anti = !ccw;
      const keepA = (keepSide === "a2") ? { s: tAng, e: a2, anti } : { s: a1, e: tAng, anti };
      const trimA = (keepSide === "a2") ? { s: a1, e: tAng, anti } : { s: tAng, e: a2, anti };
      ctx.setLineDash([8, 5]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#22c55e";
      ctx.beginPath(); ctx.arc(c.x, c.y, rs, keepA.s, keepA.e, keepA.anti); ctx.stroke();
      ctx.strokeStyle = "#ef4444";
      ctx.beginPath(); ctx.arc(c.x, c.y, rs, trimA.s, trimA.e, trimA.anti); ctx.stroke();
      ctx.setLineDash([]);
      const ts = worldToScreen(state.view, tangentPoint);
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath(); ctx.arc(ts.x, ts.y, 5, 0, Math.PI * 2); ctx.fill();
    };
    ctx.save();
    drawArcSplit(ff.sol.arc1, ff.sol.t1, ff.hoverKeep1 === "a2" ? "a2" : "a1");
    drawArcSplit(ff.sol.arc2, ff.sol.t2, ff.hoverKeep2 === "a2" ? "a2" : "a1");
    ctx.restore();
    return;
  }
  if (ff.stage !== "confirm-line-side" || (ff.kind !== "line-circle" && ff.kind !== "line-arc") || !ff.sol?.line || !ff.sol?.tLine) return;
  const line = ff.sol.line;
  const t = ff.sol.tLine;
  const p1 = { x: Number(line.x1), y: Number(line.y1) };
  const p2 = { x: Number(line.x2), y: Number(line.y2) };
  const keepEnd = ff.hoverKeepEnd === "p2" ? "p2" : "p1";
  const segKeepA = keepEnd === "p1" ? p1 : t;
  const segKeepB = keepEnd === "p1" ? t : p2;
  const segTrimA = keepEnd === "p1" ? t : p1;
  const segTrimB = keepEnd === "p1" ? p2 : t;
  const a1 = worldToScreen(state.view, segKeepA);
  const a2 = worldToScreen(state.view, segKeepB);
  const b1 = worldToScreen(state.view, segTrimA);
  const b2 = worldToScreen(state.view, segTrimB);
  const ts = worldToScreen(state.view, t);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 5]);
  ctx.strokeStyle = "#22c55e";
  ctx.beginPath();
  ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y);
  ctx.stroke();
  ctx.strokeStyle = "#ef4444";
  ctx.beginPath();
  ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#f59e0b";
  ctx.beginPath();
  ctx.arc(ts.x, ts.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHatchHover(ctx, state) {
  if (state.tool !== "hatch") return;
  const h = state.input?.hatchHover;
  if (!h) return;
  ctx.save();
  ctx.strokeStyle = "#8b5cf6"; // 紫系
  ctx.lineWidth = 3;
  ctx.setLineDash([5, 5]);
  drawShape(ctx, state, h, null);
  ctx.restore();
}

function drawActiveGroupHint(ctx, state) {
  // HTML???: ??????????? bbox ??????
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

function drawVertexHandles(ctx, state) {
  if (state.tool !== "vertex") return;
  const filterShapeId = state.vertexEdit?.filterShapeId != null ? Number(state.vertexEdit.filterShapeId) : null;
  const active = state.vertexEdit?.activeVertex || null;
  const selectedSet = new Set(((state.vertexEdit?.selectedVertices) || []).map(v => `${Number(v.shapeId)}:${v.key}`));
  ctx.save();
  for (const s of state.shapes || []) {
    if (!isLayerVisible(state, s.layerId)) continue;
    if (filterShapeId !== null && Number(s.id) !== filterShapeId) continue;
    let pts = null;
    if (s.type === "line" || s.type === "rect") {
      pts = [
        { key: "p1", x: s.x1, y: s.y1, objectSnap: { enabled: false } },
        { key: "p2", x: s.x2, y: s.y2, objectSnap: { enabled: false } },
      ];
    } else if (s.type === "arc") {
      const cx = Number(s.cx), cy = Number(s.cy), r = Number(s.r);
      const a1 = Number(s.a1), a2 = Number(s.a2);
      if ([cx, cy, r, a1, a2].every(Number.isFinite)) {
        pts = [
          { key: "a1", x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r, objectSnap: { enabled: false } },
          { key: "a2", x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r, objectSnap: { enabled: false } },
        ];
      }
    } else if (s.type === "bspline" && Array.isArray(s.controlPoints)) {
      pts = s.controlPoints.map((cp, idx) => ({
        key: `cp${idx}`,
        x: Number(cp?.x),
        y: Number(cp?.y),
        objectSnap: { enabled: false },
      })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      if (pts.length >= 2) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(100,116,139,0.75)";
        ctx.beginPath();
        const p0 = worldToScreen(state.view, pts[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < pts.length; i++) {
          const sp = worldToScreen(state.view, pts[i]);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        ctx.restore();
      }
    }
    if (!pts) continue;
    for (const p of pts) {
      const sp = worldToScreen(state.view, p);
      const isActive = active && Number(active.shapeId) === Number(s.id) && active.key === p.key;
      const isSelected = selectedSet.has(`${Number(s.id)}:${p.key}`);
      const isHovered = state.input.hover?.vertex && Number(state.input.hover.vertex.shapeId) === Number(s.id) && state.input.hover.vertex.key === p.key;

      ctx.beginPath();
      ctx.arc(sp.x, sp.y, (isActive || isHovered) ? 6 : (isSelected ? 5.5 : 4.5), 0, Math.PI * 2);
      ctx.fillStyle = (isActive || isSelected) ? "#f59e0b" : (isHovered ? "#dbeafe" : "#ffffff");
      ctx.strokeStyle = (isActive || isSelected) ? "#b45309" : (isHovered ? "#2563eb" : "#0ea5e9");
      ctx.lineWidth = (isActive || isSelected || isHovered) ? 2 : 1.5;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDimEditHandles(ctx, state) {
  if (state.tool !== "select") return;
  const selectedIds = new Set((state.selection?.ids || []).map(Number));
  if (!selectedIds.size) return;
  ctx.save();
  for (const s of state.shapes || []) {
    if (!selectedIds.has(Number(s.id))) continue;
    if (s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle") continue;
    if (!isLayerVisible(state, s.layerId)) continue;

    if (s.type === "dimchain") {
      if (!Array.isArray(s.points) || s.points.length < 2) continue;
      const geom = getDimChainGeometry(s);
      // Measurement point handles (green circles)
      ctx.lineWidth = 1.5;
      for (const pt of s.points) {
        const ps = worldToScreen(state.view, pt);
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#fee2e2";
        ctx.strokeStyle = "#dc2626";
        ctx.fill();
        ctx.stroke();
      }
      // Extension target handles on dimension line (teal circles)
      if (geom && Array.isArray(geom.dimPoints)) {
        for (const dpt of geom.dimPoints) {
          const ds = worldToScreen(state.view, dpt);
          ctx.beginPath();
          ctx.arc(ds.x, ds.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = "#ccfbf1";
          ctx.strokeStyle = "#0f766e";
          ctx.fill();
          ctx.stroke();
        }
      }
      // Placement handle (yellow diamond)
      const pp = worldToScreen(state.view, { x: Number(s.px), y: Number(s.py) });
      ctx.beginPath();
      ctx.moveTo(pp.x, pp.y - 7);
      ctx.lineTo(pp.x + 7, pp.y);
      ctx.lineTo(pp.x, pp.y + 7);
      ctx.lineTo(pp.x - 7, pp.y);
      ctx.closePath();
      ctx.fillStyle = "#fde68a";
      ctx.strokeStyle = "#d97706";
      ctx.fill();
      ctx.stroke();
      // Whole dimchain move handle (blue square at dimension-line midpoint)
      if (geom && Array.isArray(geom.dimPoints) && geom.dimPoints.length >= 2) {
        const d0 = geom.dimPoints[0];
        const dN = geom.dimPoints[geom.dimPoints.length - 1];
        const mc = worldToScreen(state.view, { x: (d0.x + dN.x) * 0.5, y: (d0.y + dN.y) * 0.5 });
        ctx.beginPath();
        ctx.rect(mc.x - 5, mc.y - 5, 10, 10);
        ctx.fillStyle = "#bfdbfe";
        ctx.strokeStyle = "#2563eb";
        ctx.fill();
        ctx.stroke();
      }
      // Extension-length handles for each helper line (purple diamonds, target side)
      if (geom && Array.isArray(geom.dimPoints) && Array.isArray(s.points) && geom.dimPoints.length === s.points.length) {
        const extOffWorld = dimMmToWorld(state, Number(s.extOffset ?? 2) || 0);
        const defaultVisWorld = Math.max(0, Math.abs(Number(geom.off) || 0) - extOffWorld);
        const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
        const sign = Math.sign(Number(geom.off) || 0) || 1;
        const enx = Number(geom.nx) * sign;
        const eny = Number(geom.ny) * sign;
        const drawDiamond = (p) => {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 6);
          ctx.lineTo(p.x + 6, p.y);
          ctx.lineTo(p.x, p.y + 6);
          ctx.lineTo(p.x - 6, p.y);
          ctx.closePath();
          ctx.fillStyle = "#e9d5ff";
          ctx.strokeStyle = "#7c3aed";
          ctx.fill();
          ctx.stroke();
        };
        for (let i = 0; i < geom.dimPoints.length; i++) {
          const dpt = geom.dimPoints[i];
          const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVisWorld;
          const hp = worldToScreen(state.view, { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis });
          drawDiamond(hp);
        }
      }
      // Text handle (blue square): move text along chain normal
      if (geom && geom.chainMid) {
        const fontPt = Math.max(1, Number(s.fontSize ?? 12) || 12);
        const defaultOff = dimPtToWorld(state, fontPt);
        const txtWorld = (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
          ? { x: Number(s.tx), y: Number(s.ty) }
          : { x: Number(geom.chainMid.x) + Number(geom.nx) * defaultOff, y: Number(geom.chainMid.y) + Number(geom.ny) * defaultOff };
        const ts = worldToScreen(state.view, txtWorld);
        ctx.beginPath();
        ctx.rect(ts.x - 5, ts.y - 5, 10, 10);
        ctx.fillStyle = "#93c5fd";
        ctx.strokeStyle = "#1d4ed8";
        ctx.fill();
        ctx.stroke();
      }
      continue;
    }
    if (s.type === "dimangle") {
      const g = getDimAngleGeometry(s, state.shapes);
      if (!g) continue;
      const ts = worldToScreen(state.view, { x: Number(g.tx), y: Number(g.ty) });
      ctx.beginPath();
      ctx.rect(ts.x - 5, ts.y - 5, 10, 10);
      ctx.fillStyle = "#93c5fd";
      ctx.strokeStyle = "#1d4ed8";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      const rs = worldToScreen(state.view, { x: Number(g.cx) + Number(g.ux) * Number(g.r), y: Number(g.cy) + Number(g.uy) * Number(g.r) });
      ctx.beginPath();
      ctx.moveTo(rs.x, rs.y - 7);
      ctx.lineTo(rs.x + 7, rs.y);
      ctx.lineTo(rs.x, rs.y + 7);
      ctx.lineTo(rs.x - 7, rs.y);
      ctx.closePath();
      ctx.fillStyle = "#fde68a";
      ctx.strokeStyle = "#d97706";
      ctx.fill();
      ctx.stroke();
      continue;
    }
    const p1s = worldToScreen(state.view, { x: Number(s.x1), y: Number(s.y1) });
    const p2s = worldToScreen(state.view, { x: Number(s.x2), y: Number(s.y2) });
    ctx.beginPath();
    ctx.arc(p1s.x, p1s.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#dcfce7";
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p2s.x, p2s.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
    const vx = x2 - x1, vy = y2 - y1;
    const len = Math.hypot(vx, vy);
    if (len > 1e-9) {
      const tx = vx / len, ty = vy / len;
      const nx = -ty, ny = tx;
      const off = (Number(s.px) - x1) * nx + (Number(s.py) - y1) * ny;
      const d1 = { x: x1 + nx * off, y: y1 + ny * off };
      const d2 = { x: x2 + nx * off, y: y2 + ny * off };
      const mid = { x: (d1.x + d2.x) * 0.5, y: (d1.y + d2.y) * 0.5 };
      const placeW = { x: (mid.x + d2.x) * 0.5, y: (mid.y + d2.y) * 0.5 };
      const p = worldToScreen(state.view, placeW);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 7);
      ctx.lineTo(p.x + 7, p.y);
      ctx.lineTo(p.x, p.y + 7);
      ctx.lineTo(p.x - 7, p.y);
      ctx.closePath();
      ctx.fillStyle = "#fde68a";
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      const hasRel = Number.isFinite(Number(s.tdx)) && Number.isFinite(Number(s.tdy));
      const tw = hasRel
        ? { x: mid.x + Number(s.tdx), y: mid.y + Number(s.tdy) }
        : (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
          ? { x: Number(s.tx), y: Number(s.ty) }
          : { x: mid.x + nx * (12 / Math.max(1e-9, state.view.scale)), y: mid.y + ny * (12 / Math.max(1e-9, state.view.scale)) };
      const tp = worldToScreen(state.view, tw);
      ctx.beginPath();
      ctx.rect(tp.x - 5, tp.y - 5, 10, 10);
      ctx.fillStyle = "#bfdbfe";
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      const mp = worldToScreen(state.view, mid);
      ctx.beginPath();
      ctx.rect(mp.x - 5, mp.y - 5, 10, 10);
      ctx.fillStyle = "#dbeafe";
      ctx.strokeStyle = "#1d4ed8";
      ctx.fill();
      ctx.stroke();
      // Extension-length handles for single dim helper lines (purple diamonds).
      const extOffWorld = dimMmToWorld(state, Number(s.extOffset ?? 2) || 0);
      const defaultVisWorld = Math.max(0, Math.abs(Number(off) || 0) - extOffWorld);
      const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
      const sign = Math.sign(Number(off) || 0) || 1;
      const enx = Number(nx) * sign, eny = Number(ny) * sign;
      const vis1 = Number.isFinite(Number(visLens[0])) ? Math.max(0, Number(visLens[0])) : defaultVisWorld;
      const vis2 = Number.isFinite(Number(visLens[1])) ? Math.max(0, Number(visLens[1])) : defaultVisWorld;
      const h1 = worldToScreen(state.view, { x: Number(d1.x) - enx * vis1, y: Number(d1.y) - eny * vis1 });
      const h2 = worldToScreen(state.view, { x: Number(d2.x) - enx * vis2, y: Number(d2.y) - eny * vis2 });
      const drawDiamond = (hp) => {
        ctx.beginPath();
        ctx.moveTo(hp.x, hp.y - 6);
        ctx.lineTo(hp.x + 6, hp.y);
        ctx.lineTo(hp.x, hp.y + 6);
        ctx.lineTo(hp.x - 6, hp.y);
        ctx.closePath();
        ctx.fillStyle = "#e9d5ff";
        ctx.strokeStyle = "#7c3aed";
        ctx.fill();
        ctx.stroke();
      };
      drawDiamond(h1);
      drawDiamond(h2);
    }
  }

  // circleDim handles
  for (const s of state.shapes || []) {
    if (!selectedIds.has(Number(s.id))) continue;
    if (s.type !== "circleDim") continue;

    const geom = getCircleDimGeometry(s, state.shapes);
    if (!geom) continue;

    const scale = state.view.scale;
    // pArc (on arc)
    const pArcS = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.ang) * geom.r, y: geom.cy + Math.sin(geom.ang) * geom.r });
    ctx.beginPath();
    ctx.arc(pArcS.x, pArcS.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#dcfce7";
    ctx.strokeStyle = "#16a34a";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();

    if (circleDimHasCenterFollowAttribute(s)) {
      const cts = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
      ctx.beginPath();
      ctx.arc(cts.x, cts.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#e0e7ff";
      ctx.strokeStyle = "#4f46e5";
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cts.x - 6, cts.y);
      ctx.lineTo(cts.x + 6, cts.y);
      ctx.moveTo(cts.x, cts.y - 6);
      ctx.lineTo(cts.x, cts.y + 6);
      ctx.stroke();
    }

    // off1 (arrow tip 1)
    const p1s = worldToScreen(state.view, geom.p1);
    ctx.beginPath();
    ctx.arc(p1s.x, p1s.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // off2 (arrow tip 2)
    const p2s = worldToScreen(state.view, geom.p2);
    ctx.beginPath();
    ctx.arc(p2s.x, p2s.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // pText (text position) - Diamond handle
    const pts = worldToScreen(state.view, { x: geom.tx, y: geom.ty });
    ctx.beginPath();
    ctx.moveTo(pts.x, pts.y - 7);
    ctx.lineTo(pts.x + 7, pts.y);
    ctx.lineTo(pts.x, pts.y + 7);
    ctx.lineTo(pts.x - 7, pts.y);
    ctx.closePath();
    ctx.fillStyle = "#fde68a";
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function drawImageScaleHandles(ctx, state) {
  if (String(state.tool || "") !== "select") return;
  const selectedIds = new Set((state.selection?.ids || []).map(Number));
  if (!selectedIds.size) return;
  const images = (state.shapes || []).filter((s) => selectedIds.has(Number(s.id)) && String(s.type || "") === "image");
  if (!images.length) return;
  const handleHalf = 4.5;
  for (const s of images) {
    if (!isLayerVisible(state, s.layerId)) continue;
    if (!!s.lockTransform) continue;
    const x = Number(s.x), y = Number(s.y);
    const w = Math.max(1e-9, Number(s.width) || 0);
    const h = Math.max(1e-9, Number(s.height) || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(h > 0)) continue;
    const cx = x + w * 0.5;
    const cy = y + h * 0.5;
    const rotDeg = Number(s.rotationDeg) || 0;
    const rotate = (px, py) => {
      const r = rotDeg * Math.PI / 180;
      const dx = px - cx, dy = py - cy;
      return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
    };
    const tl = rotate(x, y);
    const br = rotate(x + w, y + h);
    const pTl = worldToScreen(state.view, tl);
    const pBr = worldToScreen(state.view, br);
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(pTl.x - handleHalf, pTl.y - handleHalf, handleHalf * 2, handleHalf * 2);
    ctx.rect(pBr.x - handleHalf, pBr.y - handleHalf, handleHalf * 2, handleHalf * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawHatchFill(ctx, state, s) {
  const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, s.boundaryIds || [], state.view.scale);
  if (!parsed.ok || !parsed.loops || parsed.loops.length === 0) return;

  const pitch = getHatchPitchWorld(state, s);
  const ang = (Number(s.hatchAngleDeg ?? s.angleDeg ?? state.hatchSettings?.angleDeg) || 45) * (Math.PI / 180);
  const pattern = s.hatchPattern || s.pattern || state.hatchSettings?.pattern || "single";
  const crossAng = (Number(s.hatchCrossAngleDeg ?? s.crossAngleDeg ?? state.hatchSettings?.crossAngleDeg) || 90) * (Math.PI / 180);
  const rangeScale = Math.max(1, Math.min(20, Number(s.hatchRangeScale ?? s.rangeScale ?? state.hatchSettings?.rangeScale) || 1.2));
  const parallelRangeScale = Math.max(1, Math.min(20, Number(s.hatchParallelRangeScale ?? s.parallelRangeScale ?? state.hatchSettings?.parallelRangeScale) || 1.2));
  const lineShift = getHatchLineShiftWorld(state, s);
  const padding = getHatchPaddingWorld(state, s);
  const lineType = s.lineType || state.hatchSettings?.lineType || "solid";
  const lineColor = String(s.lineColor ?? state.hatchSettings?.lineColor ?? "#0f172a");
  const dashSize = getHatchDashWorld(state, s) * state.view.scale;
  const gapSize = getHatchGapWorld(state, s) * state.view.scale;
  const fillEnabled = !!(s.fillEnabled ?? state.hatchSettings?.fillEnabled);
  const fillColor = String(s.fillColor ?? state.hatchSettings?.fillColor ?? "#dbeafe");

  const b = parsed.bounds;
  const hatchOrigin = { x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5 };

  const corners = [
    { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }
  ];

  ctx.save();
  ctx.strokeStyle = /^#[0-9a-fA-F]{6}$/.test(lineColor) ? lineColor : "#0f172a";
  if (fillEnabled) {
    ctx.beginPath();
    for (const loop of parsed.loops) {
      appendHatchLoopPathToContext(ctx, state, loop);
    }
    ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(fillColor) ? fillColor : "#dbeafe";
    ctx.fill("evenodd");
  }

  // Apply line dash
  if (lineType === "dashed") {
    ctx.setLineDash([dashSize, gapSize]);
  } else if (lineType === "dotted") {
    ctx.setLineDash([1, gapSize]);
  } else if (lineType === "dashdot") {
    ctx.setLineDash([dashSize, gapSize, 1, gapSize]);
  } else if (lineType === "longdash") {
    ctx.setLineDash([dashSize * 1.8, gapSize]);
  } else if (lineType === "center") {
    ctx.setLineDash([dashSize * 1.4, gapSize, 1, gapSize]);
  } else if (lineType === "hidden") {
    ctx.setLineDash([dashSize * 0.7, gapSize * 0.9]);
  } else {
    ctx.setLineDash([]);
  }

  ctx.beginPath();
  for (const loop of parsed.loops) {
    appendHatchLoopPathToContext(ctx, state, loop);
  }
  ctx.clip("evenodd");

  const drawFamily = (angleRad) => {
    const u = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
    const n = { x: -u.y, y: u.x };

    // オブジェクトの角（境界ボックスの角）が、線の法線方向 (n) と 接線方向 (u) に
    // どこまで広がっているかを投影して計算
    let nMin = Infinity, nMax = -Infinity;
    let uMin = Infinity, uMax = -Infinity;

    for (const p of corners) {
      const rx = p.x - hatchOrigin.x;
      const ry = p.y - hatchOrigin.y;
      const pn = rx * n.x + ry * n.y; // 法線ポジション
      const pu = rx * u.x + ry * u.y; // 接線ポジション
      nMin = Math.min(nMin, pn);
      nMax = Math.max(nMax, pn);
      uMin = Math.min(uMin, pu);
      uMax = Math.max(uMax, pu);
    }

    // 接線方向の長さ L: 
    // バウンディングボックスの対角線長があれば確実。
    // ここでは投影した uMin/uMax の最大幅に余裕を持たせる。
    const L = (Math.max(Math.abs(uMin), Math.abs(uMax)) * 2 + pitch) * 1.5;

    // 法線方向の範囲:
    // nMin から nMax まで pitch 間隔で線を引く。
    // 浮動小数点の誤差を考慮して少し広めに。
    // padding を追加して繰り返し方向の漏れを防止。
    const startN = Math.floor((nMin - padding - pitch * 0.1) / pitch) * pitch;
    const endN = nMax + padding + pitch * 0.1;

    let lineIndex = 0;
    // 無限ループ防止のため最大本数を制限
    let safetyCounter = 0;
    for (let offN = startN; offN <= endN && safetyCounter < 5000; offN += pitch, lineIndex++, safetyCounter++) {
      const shiftU = (lineIndex % 2 === 1) ? lineShift : 0;
      const cp = {
        x: hatchOrigin.x + n.x * offN + u.x * shiftU,
        y: hatchOrigin.y + n.y * offN + u.y * shiftU
      };
      // cp を中心に、u方向に L 広がった線を描く
      const p1s = worldToScreen(state.view, { x: cp.x - u.x * L, y: cp.y - u.y * L });
      const p2s = worldToScreen(state.view, { x: cp.x + u.x * L, y: cp.y + u.y * L });
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y);
      ctx.lineTo(p2s.x, p2s.y);
      ctx.stroke();
    }
  };

  drawFamily(ang);
  if (pattern === "cross") drawFamily(ang + crossAng);
  ctx.restore();
}

/**
 * Re-implemented appendHatchLoopPath that works with worldToScreen
 */
function appendHatchLoopPathToContext(ctx, state, loop) {
  if (!loop || !Array.isArray(loop.steps) || loop.steps.length === 0) return;
  const step0 = loop.steps[0];
  if (step0.kind === "circle") {
    const c = worldToScreen(state.view, { x: step0.cx, y: step0.cy });
    const r = step0.r * state.view.scale;
    ctx.moveTo(c.x + r, c.y);
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  const getLoopPoint = (nodeIdx) => {
    for (const st of loop.steps) {
      const e = st.edge;
      if (!e) continue;
      if (nodeIdx === e.n1) {
        if (e.type === "line") return { x: e.s.x1, y: e.s.y1 };
        if (e.type === "arc") return { x: e.s.cx + Math.cos(e.s.a1) * e.s.r, y: e.s.cy + Math.sin(e.s.a1) * e.s.r };
      }
      if (nodeIdx === e.n2) {
        if (e.type === "line") return { x: e.s.x2, y: e.s.y2 };
        if (e.type === "arc") return { x: e.s.cx + Math.cos(e.s.a2) * e.s.r, y: e.s.cy + Math.sin(e.s.a2) * e.s.r };
      }
    }
    return null;
  };

  const startWorld = getLoopPoint(step0.from);
  if (!startWorld) return;
  const start = worldToScreen(state.view, startWorld);
  ctx.moveTo(start.x, start.y);

  for (const st of loop.steps) {
    const e = st.edge;
    if (!e) continue;
    const pToWorld = getLoopPoint(st.to);
    if (!pToWorld) continue;

    if (e.type === "line") {
      const p = worldToScreen(state.view, pToWorld);
      ctx.lineTo(p.x, p.y);
    } else if (e.type === "arc") {
      const c = worldToScreen(state.view, { x: e.s.cx, y: e.s.cy });
      const r = e.s.r * state.view.scale;
      const ccw = e.s.ccw !== false;
      const forward = st.from === e.n1 && st.to === e.n2;
      if (forward) {
        ctx.arc(c.x, c.y, r, Number(e.s.a1), Number(e.s.a2), !ccw);
      } else {
        ctx.arc(c.x, c.y, r, Number(e.s.a2), Number(e.s.a1), ccw);
      }
    }
  }
  ctx.closePath();
}

function drawDoubleLinePreview(ctx, state) {
  if (!state.dlinePreview || state.tool !== "doubleline") return;
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
      ctx.arc(c.x, c.y, rr, -a1, -a2, !ccw);
      ctx.stroke();
      continue;
    }
    const p1 = worldToScreen(state.view, { x: o.x1, y: o.y1 });
    const p2 = worldToScreen(state.view, { x: o.x2, y: o.y2 });
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();
}

function getShapeWorldBounds(shape, shapeById = null, visiting = null) {
  const expandBounds = (acc, b) => {
    if (!b) return acc;
    if (!acc) return { minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY };
    acc.minX = Math.min(acc.minX, b.minX);
    acc.minY = Math.min(acc.minY, b.minY);
    acc.maxX = Math.max(acc.maxX, b.maxX);
    acc.maxY = Math.max(acc.maxY, b.maxY);
    return acc;
  };
  const boundsFromPoints = (pts) => {
    let acc = null;
    for (const p of (pts || [])) {
      const x = Number(p?.x), y = Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const b = { minX: x, minY: y, maxX: x, maxY: y };
      acc = expandBounds(acc, b);
    }
    return acc;
  };
  if (!shape || !shape.type) return null;
  if (shape.type === "line" || shape.type === "rect" || shape.type === "text") {
    const x1 = Number(shape.x1), y1 = Number(shape.y1), x2 = Number(shape.x2), y2 = Number(shape.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  }
  if (shape.type === "image") {
    const x = Number(shape.x), y = Number(shape.y);
    const w = Math.abs(Number(shape.width) || 0), h = Math.abs(Number(shape.height) || 0);
    if (![x, y, w, h].every(Number.isFinite) || !(w > 0) || !(h > 0)) return null;
    const cx = x + w * 0.5, cy = y + h * 0.5;
    const rotDeg = Number(shape.rotationDeg) || 0;
    const rotPt = (px, py) => {
      const r = rotDeg * Math.PI / 180;
      const dx = px - cx, dy = py - cy;
      return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
    };
    return boundsFromPoints([
      rotPt(x, y),
      rotPt(x + w, y),
      rotPt(x + w, y + h),
      rotPt(x, y + h),
    ]);
  }
  if (shape.type === "bspline") {
    const sampled = sampleBSplinePoints(shape.controlPoints, Number(shape.degree) || 3);
    return boundsFromPoints(sampled);
  }
  if (shape.type === "circle" || shape.type === "arc") {
    const cx = Number(shape.cx), cy = Number(shape.cy), r = Math.abs(Number(shape.r));
    if (![cx, cy, r].every(Number.isFinite)) return null;
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }
  if (shape.type === "position") {
    const x = Number(shape.x), y = Number(shape.y);
    const size = Math.max(0, Number(shape.size ?? 20) || 20);
    if (![x, y].every(Number.isFinite)) return null;
    return { minX: x - size, minY: y - size, maxX: x + size, maxY: y + size };
  }
  if (shape.type === "dim") {
    const b = boundsFromPoints([
      { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 },
      { x: shape.px, y: shape.py }, { x: shape.tx, y: shape.ty },
    ]);
    return b;
  }
  if (shape.type === "dimchain") {
    const pts = [];
    if (Array.isArray(shape.points)) {
      for (const p of shape.points) pts.push({ x: p?.x, y: p?.y });
    }
    pts.push({ x: shape.px, y: shape.py }, { x: shape.tx, y: shape.ty });
    return boundsFromPoints(pts);
  }
  if (shape.type === "dimangle") {
    // Cheap approximation from stored parameters.
    const pts = [
      { x: shape.x1, y: shape.y1 }, { x: shape.x2, y: shape.y2 },
      { x: shape.tx, y: shape.ty }, { x: shape.cx, y: shape.cy },
    ];
    const cx = Number(shape.cx), cy = Number(shape.cy), r = Math.abs(Number(shape.r));
    let b = boundsFromPoints(pts);
    if ([cx, cy, r].every(Number.isFinite)) {
      b = expandBounds(b, { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r });
    }
    return b;
  }
  if (shape.type === "circleDim") {
    const cx = Number(shape.cx), cy = Number(shape.cy), r = Math.abs(Number(shape.r));
    let b = boundsFromPoints([{ x: shape.tx, y: shape.ty }, { x: shape.px, y: shape.py }]);
    if ([cx, cy, r].every(Number.isFinite)) {
      b = expandBounds(b, { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r });
    }
    return b;
  }
  if (shape.type === "hatch") {
    const ids = Array.isArray(shape.boundaryIds) ? shape.boundaryIds.map(Number).filter(Number.isFinite) : [];
    if (!ids.length || !shapeById) return null;
    const seen = visiting || new Set();
    const selfId = Number(shape.id);
    if (Number.isFinite(selfId)) seen.add(selfId);
    let out = null;
    for (const id of ids) {
      if (seen.has(Number(id))) continue;
      seen.add(Number(id));
      const ref = shapeById.get(Number(id));
      if (!ref) continue;
      const rb = getShapeWorldBounds(ref, shapeById, seen);
      out = expandBounds(out, rb);
    }
    return out;
  }
  return null;
}

function isBoundsOutsideView(bounds, viewWorld) {
  if (!bounds || !viewWorld) return false;
  if (bounds.maxX < viewWorld.minX) return true;
  if (bounds.minX > viewWorld.maxX) return true;
  if (bounds.maxY < viewWorld.minY) return true;
  if (bounds.minY > viewWorld.maxY) return true;
  return false;
}

function drawDoubleLineTrimCandidates(ctx, state) {
  if (state.tool !== "doubleline" || !state.dlineTrimPending) return;
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
  if (state.tool !== "doubleline" || !state.dlineTrimPending) return;
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
    const activeGroupShapeSet = (state.activeGroupId == null)
      ? null
      : collectGroupTreeShapeIdSet(state, state.activeGroupId);
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
  drawDoubleLineTrimCandidates(ctx, state);
  drawDoubleLineTrimIntersections(ctx, state);
  drawPolylineDraft(ctx, state);
  drawDimDraft(ctx, state);
  drawDimHoveredShape(ctx, state);
  drawActiveGroupHint(ctx, state);
  drawActiveGroupOriginHandle(ctx, state);
  drawActiveGroupRotateHandle(ctx, state);
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

function drawArrow(ctx, p, dir, scale, color, type = 'open', sizePt = 10) {
  const headLen = sizePt;
  const headWid = sizePt * 0.35;
  const nx = -dir.y, ny = dir.x;
  const bx = p.x - dir.x * headLen;
  const by = p.y - dir.y * headLen;

  ctx.save();
  if (type === 'circle' || type === 'circle_filled') {
    const rr = Math.max(1, headLen * 0.45);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fillStyle = (type === 'circle_filled') ? color : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
  } else if (type === 'closed') {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
    ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  } else if (type === 'hollow') {
    // Keep dimension line from entering the triangle: erase center segment in the head.
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(2, (Number(ctx.lineWidth) || 1) + 1);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
    ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    // open
    ctx.beginPath();
    ctx.moveTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
    ctx.stroke();
  }
  ctx.restore();
}

function dimWorldPerMm(state) {
  const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
  const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
  return pageScale / Math.max(1e-9, unitMm);
}

function dimMmToWorld(state, mm) {
  return Math.max(0, Number(mm) || 0) * dimWorldPerMm(state);
}

function dimPtToWorld(state, pt) {
  const mm = Math.max(0, Number(pt) || 0) * (25.4 / 72);
  return dimMmToWorld(state, mm);
}

function dimWorldToScreenPx(state, worldLen) {
  return Math.max(0, Number(worldLen) || 0) * Math.max(1e-9, state.view.scale || 1);
}

function getDimRenderMetrics(state, dim) {
  const fontPt = Math.max(1, Number(dim.fontSize ?? 12) || 12);
  const arrowPt = Math.max(1, Number(dim.dimArrowSizePt ?? 10) || 10);
  const fontPx = Math.max(1, dimWorldToScreenPx(state, dimPtToWorld(state, fontPt)));
  const arrowPx = Math.max(1, dimWorldToScreenPx(state, dimPtToWorld(state, arrowPt)));
  const extOffPx = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.extOffset ?? 2) || 0));
  const extOverPx = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.extOver ?? 2) || 0));
  return { fontPx, arrowPx, extOffPx, extOverPx };
}

function computeAutoTextAngleDeg(tx, ty) {
  // Normalize measurement direction angle to [-90, 90): prefer "up" and "left" reading
  let a = Math.atan2(ty, tx) * 180 / Math.PI;
  while (a >= 90) a -= 180;
  while (a < -90) a += 180;
  return a;
}

function drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive, normalColor = "#0f172a") {
  const nx = g.nx ?? 0, ny = g.ny ?? 0;
  const dm = getDimRenderMetrics(state, dim);
  const mid = { x: (g.d1?.x ?? g.cx ?? 0), y: (g.d1?.y ?? g.cy ?? 0) };
  if (g.d1 && g.d2) {
    mid.x = (g.d1.x + g.d2.x) * 0.5;
    mid.y = (g.d1.y + g.d2.y) * 0.5;
  }

  let textWorld;
  if (dim.type === "dim" && Number.isFinite(Number(g.allCtrl?.x)) && Number.isFinite(Number(g.allCtrl?.y))) {
    const hasRel = Number.isFinite(Number(dim.tdx)) && Number.isFinite(Number(dim.tdy));
    textWorld = hasRel
      ? { x: Number(g.allCtrl.x) + Number(dim.tdx), y: Number(g.allCtrl.y) + Number(dim.tdy) }
      : (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
        ? { x: Number(dim.tx), y: Number(dim.ty) }
        : { x: mid.x + nx * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12), y: mid.y + ny * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12) };
  } else if (dim.type === "dimchain" && Number.isFinite(Number(g.chainMid?.x)) && Number.isFinite(Number(g.chainMid?.y))) {
    const defaultOff = dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12);
    const off = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
      ? ((Number(dim.tx) - Number(g.chainMid.x)) * nx + (Number(dim.ty) - Number(g.chainMid.y)) * ny)
      : defaultOff;
    textWorld = { x: mid.x + nx * off, y: mid.y + ny * off };
  } else if (dim.type === "dimangle" && Number.isFinite(Number(g.tx)) && Number.isFinite(Number(g.ty))) {
    textWorld = { x: Number(g.tx), y: Number(g.ty) };
  } else {
    textWorld = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
      ? { x: Number(dim.tx), y: Number(dim.ty) }
      : { x: mid.x + nx * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12), y: mid.y + ny * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12) };
  }

  const textPos = worldToScreen(state.view, textWorld);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = selected ? "#b45309" : (groupActive ? "#1d4ed8" : normalColor);
  ctx.font = `${dm.fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let rotDeg;
  if (dim.textRotate === "auto" || dim.textRotate == null) {
    rotDeg = (g.tx != null && g.ty != null) ? computeAutoTextAngleDeg(g.tx, g.ty) : 0;
  } else {
    rotDeg = Number(dim.textRotate) || 0;
  }
  const rot = rotDeg * Math.PI / 180;
  if (rot) {
    ctx.translate(textPos.x, textPos.y);
    ctx.rotate(rot);
    ctx.fillText(textVal, 0, 0);
  } else {
    ctx.fillText(textVal, textPos.x, textPos.y);
  }
  ctx.restore();
}

function drawDimensionCommon(ctx, state, dim, geom, selected, groupActive) {
  if (!geom) return;
  const { scale } = state.view;
  const dm = getDimRenderMetrics(state, dim);
  const layerColorize = !!state.ui?.layerView?.colorize;
  const groupColorize = !!state.ui?.groupView?.colorize;
  const effectiveGroupId = Number.isFinite(Number(dim?.groupId)) ? Number(dim.groupId) : 0;
  const normalColor = groupColorize
    ? getGroupColorById(state, effectiveGroupId)
    : (layerColorize ? getLayerColorById(state, dim?.layerId) : "#0f172a");
  const baseStroke = (selected) ? "#f59e0b" : (groupActive ? "#2563eb" : normalColor);
  const dimStrokePx = lineWidthMmToScreenPx(state, getShapeLineWidthMm(state, dim));
  ctx.strokeStyle = baseStroke;
  // Keep selected highlight slightly thicker, but preserve user-defined line width.
  ctx.lineWidth = selected ? Math.max(1, dimStrokePx * 1.15) : dimStrokePx;

  const arrowType = dim.dimArrowType || 'open';
  const arrowSize = dm.arrowPx;
  const reverseArrow = String(dim.dimArrowDirection || "normal") === "reverse";

  if (dim.type === "dim") {
    if (geom.kind === "circle" || geom.kind === "arc") {
      const c = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
      const p2 = worldToScreen(state.view, { x: dim.x2, y: dim.y2 });
      const label = (geom.kind === "circle" ? "Ø " : "R ") + geom.len.toFixed(dim.precision ?? 1);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      const dref = reverseArrow ? { x: -geom.u.x, y: -geom.u.y } : geom.u;
      drawArrow(ctx, p2, dref, scale, baseStroke, arrowType, arrowSize);
      const textWorld = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
        ? { x: Number(dim.tx), y: Number(dim.ty) }
        : { x: dim.x2 + geom.u.x * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12), y: dim.y2 + geom.u.y * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12) };
      const textPos = worldToScreen(state.view, textWorld);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = selected ? "#b45309" : normalColor;
      ctx.font = `${dm.fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, textPos.x, textPos.y);
      ctx.restore();
    } else {
      const p1s = worldToScreen(state.view, { x: geom.x1, y: geom.y1 });
      const p2s = worldToScreen(state.view, { x: geom.x2, y: geom.y2 });
      const d1s = worldToScreen(state.view, geom.d1);
      const d2s = worldToScreen(state.view, geom.d2);
      const extOvr = dm.extOverPx;
      const dimOvr = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
      const sign = Math.sign(geom.off) || 1;
      const enx = geom.nx * sign, eny = geom.ny * sign;
      const extOffWorld = dimMmToWorld(state, Number(dim.extOffset ?? 2) || 0);
      const defaultVisWorld = Math.max(0, Math.abs(Number(geom.off) || 0) - extOffWorld);
      const visLens = Array.isArray(dim.extVisLens) ? dim.extVisLens : [];
      const vis1 = Number.isFinite(Number(visLens[0])) ? Math.max(0, Number(visLens[0])) : defaultVisWorld;
      const vis2 = Number.isFinite(Number(visLens[1])) ? Math.max(0, Number(visLens[1])) : defaultVisWorld;
      const s1 = worldToScreen(state.view, { x: Number(geom.d1.x) - enx * vis1, y: Number(geom.d1.y) - eny * vis1 });
      const s2 = worldToScreen(state.view, { x: Number(geom.d2.x) - enx * vis2, y: Number(geom.d2.y) - eny * vis2 });
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(d1s.x + extOvr * enx, d1s.y + extOvr * eny);
      ctx.moveTo(s2.x, s2.y);
      ctx.lineTo(d2s.x + extOvr * enx, d2s.y + extOvr * eny);
      ctx.moveTo(d1s.x - geom.tx * dimOvr, d1s.y - geom.ty * dimOvr);
      ctx.lineTo(d2s.x + geom.tx * dimOvr, d2s.y + geom.ty * dimOvr);
      ctx.stroke();
      const d1dir = reverseArrow ? { x: geom.tx, y: geom.ty } : { x: -geom.tx, y: -geom.ty };
      const d2dir = reverseArrow ? { x: -geom.tx, y: -geom.ty } : { x: geom.tx, y: geom.ty };
      drawArrow(ctx, d1s, d1dir, scale, baseStroke, arrowType, arrowSize);
      drawArrow(ctx, d2s, d2dir, scale, baseStroke, arrowType, arrowSize);
      const textVal = geom.len.toFixed(dim.precision ?? 1);
      drawTextLabel(ctx, state, dim, geom, textVal, selected, groupActive, normalColor);
    }
  } else if (dim.type === "circleDim") {
    // geom is already calculated by drawShape as CircleDimGeometry
    const g = geom;
    const p1s = worldToScreen(state.view, g.p1);
    const p2s = worldToScreen(state.view, g.p2);
    const c1 = { x: g.cx + g.ux * g.r, y: g.cy + g.uy * g.r };
    const c2 = { x: g.cx - g.ux * g.r, y: g.cy - g.uy * g.r };
    const c1s = worldToScreen(state.view, c1);
    const c2s = worldToScreen(state.view, c2);

    ctx.beginPath();
    ctx.moveTo(p1s.x, p1s.y);
    ctx.lineTo(p2s.x, p2s.y);
    ctx.stroke();

    // Keep off1/off2 as appearance controls, but force arrow tips to the circumference.
    if (Math.hypot(p1s.x - c1s.x, p1s.y - c1s.y) > 0.5) {
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y);
      ctx.lineTo(c1s.x, c1s.y);
      ctx.stroke();
    }
    const circleArrowSide = dim.circleArrowSide === "inside" ? "inside" : "outside";
    const dir1 = circleArrowSide === "inside" ? { x: -g.ux, y: -g.uy } : { x: g.ux, y: g.uy };
    const d1 = reverseArrow ? { x: -dir1.x, y: -dir1.y } : dir1;
    drawArrow(ctx, c1s, d1, scale, baseStroke, arrowType, arrowSize);
    if (dim.kind === "diameter") {
      if (Math.hypot(p2s.x - c2s.x, p2s.y - c2s.y) > 0.5) {
        ctx.beginPath();
        ctx.moveTo(p2s.x, p2s.y);
        ctx.lineTo(c2s.x, c2s.y);
        ctx.stroke();
      }
      const dir2 = circleArrowSide === "inside" ? { x: g.ux, y: g.uy } : { x: -g.ux, y: -g.uy };
      const d2 = reverseArrow ? { x: -dir2.x, y: -dir2.y } : dir2;
      drawArrow(ctx, c2s, d2, scale, baseStroke, arrowType, arrowSize);
    }

    // Displayed value must follow target circle/arc radius, not visual controllers.
    const value = dim.kind === "diameter" ? (g.r * 2) : g.r;
    const label = (dim.kind === "diameter" ? "D " : "R ") + value.toFixed(dim.precision ?? 1);
    const textVal = label;
    // Keep auto-rotation vector while forcing text position to circleDim geometry text anchor.
    const tGeom = { ...g, tx: g.ux, ty: g.uy };
    const tDim = { ...dim, tx: g.tx, ty: g.ty };
    drawTextLabel(ctx, state, tDim, tGeom, textVal, selected, groupActive, normalColor);

  } else if (dim.type === "dimchain") {
    const segs = geom.segments || [];
    const extOff = dm.extOffPx;
    const extOvr = dm.extOverPx;
    const dimOvr = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
    const extOffWorld = dimMmToWorld(state, Number(dim.extOffset ?? 2) || 0);
    const defaultVisWorld = Math.max(0, Math.abs(Number(geom.off) || 0) - extOffWorld);
    const visLens = Array.isArray(dim.extVisLens) ? dim.extVisLens : [];
    const sign = Math.sign(Number(geom.off) || 0) || 1;
    const enx = Number(geom.nx) * sign, eny = Number(geom.ny) * sign;
    if (Array.isArray(geom.dimPoints) && Array.isArray(dim.points) && geom.dimPoints.length === dim.points.length) {
      for (let i = 0; i < geom.dimPoints.length; i++) {
        const dpt = geom.dimPoints[i];
        const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVisWorld;
        const startW = { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis };
        const startS = worldToScreen(state.view, startW);
        const dS = worldToScreen(state.view, dpt);
        ctx.beginPath();
        ctx.moveTo(startS.x, startS.y);
        ctx.lineTo(dS.x + extOvr * enx, dS.y + extOvr * eny);
        ctx.stroke();
      }
    }
    segs.forEach((g, i) => {
      const d1s = worldToScreen(state.view, g.d1);
      const d2s = worldToScreen(state.view, g.d2);
      ctx.beginPath();
      ctx.moveTo(d1s.x - g.tx * dimOvr, d1s.y - g.ty * dimOvr);
      ctx.lineTo(d2s.x + g.tx * dimOvr, d2s.y + g.ty * dimOvr);
      ctx.stroke();
      drawArrow(ctx, d1s, { x: -g.tx, y: -g.ty }, scale, baseStroke, arrowType, arrowSize);
      drawArrow(ctx, d2s, { x: g.tx, y: g.ty }, scale, baseStroke, arrowType, arrowSize);
      const textVal = g.len.toFixed(dim.precision ?? 1);
      drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive, normalColor);
    });
  } else if (dim.type === "dimangle") {
    const c = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
    const rs = geom.r * scale;
    const overPx = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
    const overAng = (rs > 1e-9) ? (overPx / rs) : 0;
    const a1d = Number(geom.a1) - overAng;
    const a2d = Number(geom.a2) + overAng;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rs, a1d, a2d, false);
    ctx.stroke();
    const p1s = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.a1) * geom.r, y: geom.cy + Math.sin(geom.a1) * geom.r });
    const p2s = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.a2) * geom.r, y: geom.cy + Math.sin(geom.a2) * geom.r });
    const d1 = { x: Math.sin(geom.a1), y: -Math.cos(geom.a1) };
    const d2 = { x: -Math.sin(geom.a2), y: Math.cos(geom.a2) };
    const ad1 = reverseArrow ? { x: -d1.x, y: -d1.y } : d1;
    const ad2 = reverseArrow ? { x: -d2.x, y: -d2.y } : d2;
    drawArrow(ctx, p1s, ad1, scale, baseStroke, arrowType, arrowSize);
    drawArrow(ctx, p2s, ad2, scale, baseStroke, arrowType, arrowSize);
    const textVal = (geom.angle * 180 / Math.PI).toFixed(dim.precision ?? 1) + "°";
    drawTextLabel(ctx, state, dim, geom, textVal, selected, groupActive, normalColor);
  }
}
