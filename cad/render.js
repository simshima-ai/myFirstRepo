import { worldToScreen, screenToWorld, getEffectiveGridSize } from "./geom.js";
import { getDimGeometry, getDimChainGeometry, getDimAngleGeometry, getSpecialDimGeometry } from "./dim_geom.js";
import { buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";

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

function isLayerVisible(state, layerId) {
  const layers = state.layers || [];
  const layer = layers.find((l) => Number(l.id) === Number(layerId));
  return !layer || layer.visible !== false;
}

function isLayerLocked(state, layerId) {
  const layers = state.layers || [];
  const layer = layers.find((l) => Number(l.id) === Number(layerId));
  return !!(layer && layer.locked === true);
}

function getLayerColorById(layerId) {
  const palette = ["#0f172a", "#1d4ed8", "#059669", "#b45309", "#7c3aed", "#be123c", "#0f766e", "#334155"];
  const n = Math.abs(Number(layerId) || 0);
  return palette[n % palette.length];
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
  ctx.strokeStyle = "#94a3b8";
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

  // Center marks (outside the frame)
  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;
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
  const step = getEffectiveGridSize(state.grid, state.view);
  const majorStep = step * 5;
  const left = (0 - state.view.offsetX) / state.view.scale;
  const top = (0 - state.view.offsetY) / state.view.scale;
  const right = (canvas.width - state.view.offsetX) / state.view.scale;
  const bottom = (canvas.height - state.view.offsetY) / state.view.scale;
  const x0 = Math.floor(left / step) * step;
  const y0 = Math.floor(top / step) * step;
  ctx.save();
  const drawGridPass = (gridStep, color) => {
    const gx0 = Math.floor(left / gridStep) * gridStep;
    const gy0 = Math.floor(top / gridStep) * gridStep;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = gx0; x <= right; x += gridStep) {
      const sx = x * state.view.scale + state.view.offsetX;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, canvas.height);
    }
    for (let y = gy0; y <= bottom; y += gridStep) {
      const sy = y * state.view.scale + state.view.offsetY;
      ctx.moveTo(0, sy);
      ctx.lineTo(canvas.width, sy);
    }
    ctx.stroke();
  };
  drawGridPass(step, "#e6ebf2");
  drawGridPass(majorStep, "#d4dbe5");
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

function drawShape(ctx, state, shape) {
  if (!isLayerVisible(state, shape.layerId)) return;
  ctx.save();
  if (isLayerLocked(state, shape.layerId)) {
    ctx.globalAlpha *= 0.5;
  }
  const selected = state.selection.ids.includes(Number(shape.id));
  const isHatchBoundary = state.tool === "hatch" && state.hatchDraft?.boundaryIds?.includes(Number(shape.id));
  const isPatternCopyReference = state.tool === "patterncopy" && (
    Number(shape.id) === state.input.patternCopyFlow.centerPositionId ||
    Number(shape.id) === state.input.patternCopyFlow.axisLineId
  );
  const groupActive = !selected && isInActiveGroup(state, shape.id);
  const layerColorize = !!state.ui?.layerView?.colorize;
  const baseStroke = layerColorize ? getLayerColorById(shape.layerId) : "#0f172a";

  const isHovered = (state.tool === "vertex" || state.tool === "select") && state.input.hover?.shape && Number(state.input.hover.shape.id) === Number(shape.id);

  ctx.strokeStyle = (selected || isHatchBoundary) ? "#f59e0b" : (isPatternCopyReference ? "#22c55e" : (groupActive ? "#2563eb" : (isHovered ? "#94a3b8" : baseStroke)));
  ctx.lineWidth = (selected || isHatchBoundary || isPatternCopyReference) ? 2 : (isHovered ? 2 : 1.5);

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
    const size = Math.max(8, (shape.size ?? 20) * state.view.scale);
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
  if (shape.type === "dim" || shape.type === "dimchain" || shape.type === "dimangle") {
    // Determine geometry based on type
    let geom = null;
    if (shape.type === "dim") {
      if (shape.dimRef) geom = getSpecialDimGeometry(shape, state.shapes);
      else geom = getDimGeometry(shape);
    } else if (shape.type === "dimchain") {
      geom = getDimChainGeometry(shape);
    } else if (shape.type === "dimangle") {
      geom = getDimAngleGeometry(shape);
    }

    if (geom) {
      drawDimensionCommon(ctx, state, shape, geom, selected, groupActive);
    }
  }
  ctx.restore();
}

function drawPreview(ctx, state, preview) {
  if (!preview) return;
  ctx.save();
  ctx.strokeStyle = "#0ea5e9";
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  drawShape(ctx, state, preview);
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

function drawPolylineDraft(ctx, state) {
  const d = state.polylineDraft;
  if (!d || !Array.isArray(d.points) || d.points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = "#0ea5e9";
  ctx.fillStyle = "#0ea5e9";
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
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
  ctx.save();
  ctx.strokeStyle = "#0ea5e9";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);

  if (d.dimRef) {
    // Radial/Diameter preview
    const geom = getSpecialDimGeometry({ kind: d.kind, dimRef: d.dimRef, x2: d.x2, y2: d.y2 }, state.shapes);
    if (geom) drawDimensionCommon(ctx, state, { type: "dim", kind: d.kind, precision: 1 }, geom, false, false);
  } else if (d.points && d.points.length >= 1) {
    // Chain preview
    const lastPoint = d.points[d.points.length - 1];
    const hoverPoint = state.input.dimHoverSnap || lastPoint; // or similar
    const pts = [...d.points];
    if (Math.hypot(hoverPoint.x - lastPoint.x, hoverPoint.y - lastPoint.y) > 1e-9) {
      pts.push(hoverPoint);
    }
    if (pts.length >= 2) {
      const geom = getChainDimGeometry({ points: pts, px: d.place.x, py: d.place.y });
      if (geom) drawDimensionCommon(ctx, state, { type: "dimchain", precision: 1 }, geom, false, false);
    }
  } else if (d.p1) {
    const p1s = worldToScreen(state.view, d.p1);
    ctx.beginPath();
    ctx.arc(p1s.x, p1s.y, 3, 0, Math.PI * 2);
    ctx.stroke();

    if (d.p2) {
      const geom = getDimGeometry({ x1: d.p1.x, y1: d.p1.y, x2: d.p2.x, y2: d.p2.y, px: d.place.x, py: d.place.y });
      if (geom) drawDimensionCommon(ctx, state, { type: "dim", precision: 1 }, geom, false, false);
    } else if (d.hover) {
      const hs = worldToScreen(state.view, d.hover);
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y);
      ctx.lineTo(hs.x, hs.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawDimHoveredShape(ctx, state) {
  if (state.tool !== "dim" || state.dimDraft || state.input.dimHoveredShapeId == null) return;
  const s = state.shapes.find(sh => Number(sh.id) === Number(state.input.dimHoveredShapeId));
  if (!s) return;

  ctx.save();
  ctx.strokeStyle = "rgba(34, 197, 94, 0.5)"; // Bright green
  ctx.lineWidth = 6;
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
  const s = worldToScreen(state.view, p);
  ctx.save();

  // Green style (#22c55e)
  ctx.strokeStyle = "#16a34a"; // Vivid green
  ctx.fillStyle = "rgba(34,197,94,0.15)";
  ctx.lineWidth = 1.2;

  // Smaller circle
  ctx.beginPath();
  ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Smaller crosshair
  ctx.beginPath();
  ctx.moveTo(s.x - 7, s.y); ctx.lineTo(s.x + 7, s.y);
  ctx.moveTo(s.x, s.y - 7); ctx.lineTo(s.x, s.y + 7);
  ctx.stroke();

  const label = p.kind === "nearest" ? "NEA" : (p.kind === "intersection" ? "INT" : (p.kind === "center" ? "CEN" : "END"));
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = "bold 10px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#166534"; // Darker green for text
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
    ctx.lineWidth = 4;
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
    ctx.lineWidth = 4;
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
    ctx.lineWidth = 4;
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
  ctx.lineWidth = 4;
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
  drawShape(ctx, state, h);
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
  const r = 14;
  ctx.save();
  ctx.strokeStyle = "#f59e0b";
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
  const originR = 14;
  const handleDist = originR * 4.7;
  const ang = (Number(g.rotationDeg) || 0) * Math.PI / 180;
  const rp = { x: c.x + Math.cos(ang) * handleDist, y: c.y + Math.sin(ang) * handleDist };
  ctx.save();
  ctx.strokeStyle = "#f59e0b";
  ctx.lineWidth = 1.8;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(rp.x, rp.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(rp.x, rp.y, 6, 0, Math.PI * 2);
  ctx.fillStyle = "#f59e0b";
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  const ra = Math.atan2(rp.y - c.y, rp.x - c.x);
  ctx.beginPath();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "#f59e0b";
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
        { key: "p1", x: s.x1, y: s.y1 },
        { key: "p2", x: s.x2, y: s.y2 },
      ];
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
    if (s.type !== "dim") continue;
    if (!isLayerVisible(state, s.layerId)) continue;
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
    const p = worldToScreen(state.view, { x: Number(s.px), y: Number(s.py) });
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
      const tw = (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
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
    }
  }
  ctx.restore();
}

function drawHatchFill(ctx, state, s) {
  const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, s.boundaryIds || [], state.view.scale);
  if (!parsed.ok || !parsed.loops || parsed.loops.length === 0) return;

  const pitch = getHatchPitchWorld(state, s);
  const ang = (Number(s.hatchAngleDeg ?? state.hatchSettings?.angleDeg) || 45) * (Math.PI / 180);
  const pattern = s.hatchPattern || state.hatchSettings?.pattern || "single";
  const crossAng = (Number(s.hatchCrossAngleDeg ?? state.hatchSettings?.crossAngleDeg) || 90) * (Math.PI / 180);
  const rangeScale = Math.max(1, Math.min(20, Number(s.hatchRangeScale ?? state.hatchSettings?.rangeScale) || 1.2));
  const parallelRangeScale = Math.max(1, Math.min(20, Number(s.hatchParallelRangeScale ?? state.hatchSettings?.parallelRangeScale) || 1.2));
  const lineShift = getHatchLineShiftWorld(state, s);
  const padding = getHatchPaddingWorld(state, s);
  const lineType = s.hatchLineType || state.hatchSettings?.lineType || "solid";
  const dashSize = getHatchDashWorld(state, s) * state.view.scale;
  const gapSize = getHatchGapWorld(state, s) * state.view.scale;

  const b = parsed.bounds;
  const hatchOrigin = { x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5 };

  const corners = [
    { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
    { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY }
  ];

  ctx.save();
  // Apply line dash
  if (lineType === "dashed") {
    ctx.setLineDash([dashSize, gapSize]);
  } else if (lineType === "dotted") {
    ctx.setLineDash([1, gapSize]);
  } else if (lineType === "dashdot") {
    ctx.setLineDash([dashSize, gapSize, 1, gapSize]);
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
  ctx.strokeStyle = "#3b82f6"; // Blue
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  for (const o of state.dlinePreview) {
    const p1 = worldToScreen(state.view, { x: o.x1, y: o.y1 });
    const p2 = worldToScreen(state.view, { x: o.x2, y: o.y2 });
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();
}

export function render(ctx, canvas, state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPageFrame(ctx, canvas, state);
  drawGrid(ctx, canvas, state);
  drawAxes(ctx, canvas, state);
  for (const shape of state.shapes) drawShape(ctx, state, shape);
  drawPreview(ctx, state, state.preview);
  drawDoubleLinePreview(ctx, state);
  drawPolylineDraft(ctx, state);
  drawDimDraft(ctx, state);
  drawDimHoveredShape(ctx, state);
  drawActiveGroupHint(ctx, state);
  drawActiveGroupOriginHandle(ctx, state);
  drawActiveGroupRotateHandle(ctx, state);
  drawVertexHandles(ctx, state);
  drawDimEditHandles(ctx, state);
  drawSelectionBox(ctx, state);
  drawObjectSnapHover(ctx, state);
  drawTrimHover(ctx, state);
  drawHatchHover(ctx, state);
  drawFilletHover(ctx, state);
  drawFilletFlow(ctx, state);
}

function drawArrow(ctx, p, dir, scale, color) {
  const size = 10;
  const headLen = size;
  const headWid = size * 0.35;
  const nx = -dir.y, ny = dir.x;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
  ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive) {
  const nx = g.nx, ny = g.ny;
  const mid = { x: (g.d1?.x ?? g.cx ?? 0), y: (g.d1?.y ?? g.cy ?? 0) };
  if (g.d1 && g.d2) {
    mid.x = (g.d1.x + g.d2.x) * 0.5;
    mid.y = (g.d1.y + g.d2.y) * 0.5;
  }

  const textWorld = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
    ? { x: Number(dim.tx), y: Number(dim.ty) }
    : { x: mid.x + nx * (12 / Math.max(1e-9, state.view.scale)), y: mid.y + ny * (12 / Math.max(1e-9, state.view.scale)) };

  const textPos = worldToScreen(state.view, textWorld);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = selected ? "#b45309" : (groupActive ? "#1d4ed8" : "#0f172a");
  ctx.font = "12px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (dim.textRotate) {
    ctx.translate(textPos.x, textPos.y);
    ctx.rotate(dim.textRotate * Math.PI / 180);
    ctx.fillText(textVal, 0, 0);
  } else {
    ctx.fillText(textVal, textPos.x, textPos.y);
  }
  ctx.restore();
}

function drawDimensionCommon(ctx, state, dim, geom, selected, groupActive) {
  if (!geom) return;
  const { scale } = state.view;
  const baseStroke = (selected) ? "#f59e0b" : (groupActive ? "#2563eb" : "#0f172a");
  ctx.strokeStyle = baseStroke;
  ctx.lineWidth = selected ? 2 : 1.5;

  if (dim.type === "dim") {
    if (geom.kind === "circle" || geom.kind === "arc") {
      const c = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
      const p2 = worldToScreen(state.view, { x: dim.x2, y: dim.y2 });
      const label = (geom.kind === "circle" ? "Ø " : "R ") + geom.len.toFixed(dim.precision || 1);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      drawArrow(ctx, p2, geom.u, scale, baseStroke);
      const textWorld = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
        ? { x: Number(dim.tx), y: Number(dim.ty) }
        : { x: dim.x2 + geom.u.x * (15 / scale), y: dim.y2 + geom.u.y * (15 / scale) };
      const textPos = worldToScreen(state.view, textWorld);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = selected ? "#b45309" : "#0f172a";
      ctx.font = "12px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, textPos.x, textPos.y);
      ctx.restore();
    } else {
      const p1s = worldToScreen(state.view, { x: geom.x1, y: geom.y1 });
      const p2s = worldToScreen(state.view, { x: geom.x2, y: geom.y2 });
      const d1s = worldToScreen(state.view, geom.d1);
      const d2s = worldToScreen(state.view, geom.d2);
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y); ctx.lineTo(d1s.x, d1s.y);
      ctx.moveTo(p2s.x, p2s.y); ctx.lineTo(d2s.x, d2s.y);
      ctx.moveTo(d1s.x, d1s.y); ctx.lineTo(d2s.x, d2s.y);
      ctx.stroke();
      drawArrow(ctx, d1s, { x: -geom.tx, y: -geom.ty }, scale, baseStroke);
      drawArrow(ctx, d2s, { x: geom.tx, y: geom.ty }, scale, baseStroke);
      const textVal = geom.len.toFixed(dim.precision || 1);
      drawTextLabel(ctx, state, dim, geom, textVal, selected, groupActive);
    }
  } else if (dim.type === "dimchain") {
    const segs = geom.segments || [];
    segs.forEach((g, i) => {
      const p1s = worldToScreen(state.view, { x: g.x1, y: g.y1 });
      const p2s = worldToScreen(state.view, { x: g.x2, y: g.y2 });
      const d1s = worldToScreen(state.view, g.d1);
      const d2s = worldToScreen(state.view, g.d2);
      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y); ctx.lineTo(d1s.x, d1s.y);
      if (i === segs.length - 1) {
        ctx.moveTo(p2s.x, p2s.y); ctx.lineTo(d2s.x, d2s.y);
      }
      ctx.moveTo(d1s.x, d1s.y); ctx.lineTo(d2s.x, d2s.y);
      ctx.stroke();
      drawArrow(ctx, d1s, { x: -g.tx, y: -g.ty }, scale, baseStroke);
      drawArrow(ctx, d2s, { x: g.tx, y: g.ty }, scale, baseStroke);
      const textVal = g.len.toFixed(dim.precision || 1);
      drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive);
    });
  } else if (dim.type === "dimangle") {
    const c = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
    const rs = geom.r * scale;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rs, geom.a1, geom.a2, false);
    ctx.stroke();
    const p1s = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.a1) * geom.r, y: geom.cy + Math.sin(geom.a1) * geom.r });
    const p2s = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.a2) * geom.r, y: geom.cy + Math.sin(geom.a2) * geom.r });
    drawArrow(ctx, p1s, { x: Math.sin(geom.a1), y: -Math.cos(geom.a1) }, scale, baseStroke);
    drawArrow(ctx, p2s, { x: -Math.sin(geom.a2), y: Math.cos(geom.a2) }, scale, baseStroke);
    const textVal = (geom.angle * 180 / Math.PI).toFixed(dim.precision || 1) + "°";
    drawTextLabel(ctx, state, dim, geom, textVal, selected, groupActive);
  }
}
