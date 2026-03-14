import {
  worldToScreen,
  mmPerUnit,
  getHatchPitchWorld,
  getHatchLineShiftWorld,
  getHatchPaddingWorld,
  getHatchDashWorld,
  getHatchGapWorld,
} from "./geom.js";
import { getDimGeometry, getDimChainGeometry, getDimAngleGeometry, getCircleDimGeometry } from "./dim_geom.js";
import { buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";
import { drawGrid } from "./render_grid.js";
import { drawPageFrame, drawAxes } from "./render_view_helpers.js";
import { createRenderDimensionOps } from "./render_dimension.js";
import { createRenderHatchOps } from "./render_hatch.js";
import { sampleBSplinePoints } from "./bspline_utils.js";

function isLayerVisible(state, layerId) {
  const lid = Number(layerId);
  const layer = (state.layers || []).find((l) => Number(l.id) === lid);
  return !layer || layer.visible !== false;
}

function isGroupVisible(state, groupId) {
  const gid = Number(groupId);
  if (!Number.isFinite(gid)) return true;
  const map = new Map((state.groups || []).map((g) => [Number(g.id), g]));
  let current = gid;
  const seen = new Set();
  while (Number.isFinite(current) && !seen.has(current)) {
    seen.add(current);
    const g = map.get(current);
    if (!g) return true;
    if (g.visible === false) return false;
    current = g.parentId == null ? NaN : Number(g.parentId);
  }
  return true;
}

function getShapeLineWidthMm(state, shape) {
  return Math.max(0.01, Number(shape?.lineWidthMm ?? state?.lineWidthMm ?? 0.25) || 0.25);
}

function lineWidthMmToScreenPx(state, lineWidthMm) {
  const mm = Math.max(0.01, Number(lineWidthMm) || 0.25);
  const pageScale = Math.max(0.0001, Number(state?.pageSetup?.scale ?? 1) || 1);
  const unitMm = mmPerUnit(state?.pageSetup?.unit || "mm");
  const world = (mm * pageScale) / Math.max(1e-9, unitMm);
  return Math.max(0.5, world * Math.max(1e-9, Number(state?.view?.scale) || 1));
}

function getShapeLineType(shape) {
  const v = String(shape?.lineType || "solid").toLowerCase();
  if (["dashed", "dotted", "dashdot", "longdash", "center", "hidden"].includes(v)) return v;
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

function getImageCache(state) {
  if (!state.ui) state.ui = {};
  if (!state.ui._imageCache || typeof state.ui._imageCache !== "object") state.ui._imageCache = {};
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

const hatchOps = createRenderHatchOps({
  worldToScreen,
  buildHatchLoopsFromBoundaryIds,
  getHatchPitchWorld,
  getHatchLineShiftWorld,
  getHatchPaddingWorld,
  getHatchDashWorld,
  getHatchGapWorld,
});

const dimensionOps = createRenderDimensionOps({
  getGroupColorById: () => "#0f172a",
  getLayerColorById: () => "#0f172a",
  lineWidthMmToScreenPx,
  getShapeLineWidthMm,
});

function drawShape(ctx, state, shape) {
  if (!isLayerVisible(state, shape.layerId)) return;
  if (!isGroupVisible(state, shape.groupId)) return;
  ctx.save();
  const shapeColor = (typeof shape?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(shape.color)) ? shape.color : "#0f172a";
  ctx.strokeStyle = shapeColor;
  ctx.fillStyle = shapeColor;
  ctx.lineWidth = lineWidthMmToScreenPx(state, getShapeLineWidthMm(state, shape));
  if (shape.type !== "hatch" && shape.type !== "text" && shape.type !== "image") {
    applyShapeLineDash(ctx, getShapeLineType(shape), ctx.lineWidth);
  } else {
    ctx.setLineDash([]);
  }

  if (shape.type === "hatch") {
    hatchOps.drawHatchFill(ctx, state, shape);
  } else if (shape.type === "line") {
    const p1 = worldToScreen(state.view, { x: shape.x1, y: shape.y1 });
    const p2 = worldToScreen(state.view, { x: shape.x2, y: shape.y2 });
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  } else if (shape.type === "polyline") {
    const pts = Array.isArray(shape.points) ? shape.points : [];
    if (pts.length >= 2) {
      const p0 = worldToScreen(state.view, { x: Number(pts[0].x), y: Number(pts[0].y) });
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < pts.length; i += 1) {
        const p = worldToScreen(state.view, { x: Number(pts[i].x), y: Number(pts[i].y) });
        ctx.lineTo(p.x, p.y);
      }
      if (shape.closed) ctx.closePath();
      ctx.stroke();
    }
  } else if (shape.type === "bspline") {
    const sampled = sampleBSplinePoints(shape.controlPoints, Number(shape.degree) || 3);
    if (sampled.length >= 2) {
      const p0 = worldToScreen(state.view, sampled[0]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < sampled.length; i += 1) {
        const p = worldToScreen(state.view, sampled[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
  } else if (shape.type === "text") {
    const p = worldToScreen(state.view, { x: shape.x1, y: shape.y1 });
    ctx.translate(p.x, p.y);
    ctx.rotate(((Number(shape.textRotate) || 0) * Math.PI) / 180);
    const isBold = !!shape.textBold;
    const isItalic = !!shape.textItalic;
    const sizePt = Number(shape.textSizePt) || 12;
    const fontFamily = shape.textFontFamily || "Yu Gothic UI";
    ctx.font = `${isItalic ? "italic " : ""}${isBold ? "bold " : ""}${(sizePt * state.view.scale * 1.33)}px "${fontFamily}"`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = shape.textColor || shapeColor;
    ctx.fillText(shape.text || "", 0, 0);
  } else if (shape.type === "image") {
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
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      if (res?.loaded && res.img) {
        ctx.drawImage(res.img, -sw * 0.5, -sh * 0.5, sw, sh);
      } else {
        ctx.fillStyle = "rgba(148,163,184,0.14)";
        ctx.fillRect(-sw * 0.5, -sh * 0.5, sw, sh);
        ctx.strokeRect(-sw * 0.5, -sh * 0.5, sw, sh);
      }
    }
  } else if (shape.type === "imagetrace") {
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
    }
  } else if (shape.type === "rect") {
    const p1 = worldToScreen(state.view, { x: shape.x1, y: shape.y1 });
    const p2 = worldToScreen(state.view, { x: shape.x2, y: shape.y2 });
    ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
  } else if (shape.type === "circle") {
    const c = worldToScreen(state.view, { x: shape.cx, y: shape.cy });
    const r = Math.max(1, Number(shape.r) * state.view.scale);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape.type === "arc") {
    const c = worldToScreen(state.view, { x: shape.cx, y: shape.cy });
    const r = Math.max(1, Number(shape.r) * state.view.scale);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, Number(shape.a1) || 0, Number(shape.a2) || 0, !(shape.ccw !== false));
    ctx.stroke();
  } else if (shape.type === "position") {
    const c = worldToScreen(state.view, { x: shape.x, y: shape.y });
    const size = Math.max(1.5, (shape.size ?? 20) * state.view.scale);
    ctx.beginPath();
    ctx.arc(c.x, c.y, size * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x - size, c.y); ctx.lineTo(c.x + size, c.y);
    ctx.moveTo(c.x, c.y - size); ctx.lineTo(c.x, c.y + size);
    ctx.stroke();
  } else if (shape.type === "dim" || shape.type === "dimchain" || shape.type === "dimangle" || shape.type === "circleDim") {
    let geom = null;
    if (shape.type === "dim") geom = getDimGeometry(shape);
    else if (shape.type === "dimchain") geom = getDimChainGeometry(shape);
    else if (shape.type === "dimangle") geom = getDimAngleGeometry(shape, state.shapes);
    else if (shape.type === "circleDim") geom = getCircleDimGeometry(shape, state.shapes);
    if (geom) dimensionOps.drawDimensionCommon(ctx, state, shape, geom, false, false);
  }

  ctx.restore();
}

export function renderViewer(ctx, canvas, state) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawPageFrame(ctx, canvas, state);
  drawGrid(ctx, canvas, state);
  drawAxes(ctx, canvas, state);
  for (const shape of (state.shapes || [])) drawShape(ctx, state, shape);
}
