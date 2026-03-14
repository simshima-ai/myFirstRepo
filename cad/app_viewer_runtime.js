function computeShapeBounds(shape) {
  const t = String(shape?.type || "").toLowerCase();
  if (t === "line" || t === "rect") {
    return {
      minX: Math.min(Number(shape.x1), Number(shape.x2)),
      minY: Math.min(Number(shape.y1), Number(shape.y2)),
      maxX: Math.max(Number(shape.x1), Number(shape.x2)),
      maxY: Math.max(Number(shape.y1), Number(shape.y2)),
    };
  }
  if (t === "polyline") {
    const pts = Array.isArray(shape.points) ? shape.points : [];
    if (!pts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of pts) {
      const x = Number(pt?.x), y = Number(pt?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }
  if (t === "circle" || t === "arc") {
    const cx = Number(shape.cx), cy = Number(shape.cy), r = Math.abs(Number(shape.r) || 0);
    if (![cx, cy, r].every(Number.isFinite)) return null;
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }
  if (t === "bspline") {
    const pts = Array.isArray(shape.controlPoints) ? shape.controlPoints : [];
    if (!pts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of pts) {
      const x = Number(pt?.x), y = Number(pt?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
  }
  if (t === "text") {
    const x = Number(shape.x1), y = Number(shape.y1);
    if (![x, y].every(Number.isFinite)) return null;
    return { minX: x, minY: y, maxX: x, maxY: y };
  }
  if (t === "image" || t === "imagetrace") {
    const x = Number(shape.x), y = Number(shape.y), w = Number(shape.width), h = Number(shape.height);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }
  if (t === "position") {
    const x = Number(shape.x), y = Number(shape.y), s = Math.max(0, Number(shape.size) || 0);
    if (![x, y].every(Number.isFinite)) return null;
    return { minX: x - s, minY: y - s, maxX: x + s, maxY: y + s };
  }
  if (t === "dim" || t === "dimchain" || t === "dimangle" || t === "circledim") {
    const nums = [];
    for (const key of Object.keys(shape || {})) {
      if (/^(x|y|cx|cy|tx|ty|x1|y1|x2|y2|x3|y3)/i.test(key)) nums.push([key, Number(shape[key])]);
    }
    const xs = nums.filter(([k,v]) => Number.isFinite(v) && k.toLowerCase().startsWith("x")).map(([,v]) => v);
    const ys = nums.filter(([k,v]) => Number.isFinite(v) && k.toLowerCase().startsWith("y")).map(([,v]) => v);
    if (!xs.length || !ys.length) return null;
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  return null;
}

function computeAllShapeBounds(shapes) {
  let out = null;
  for (const shape of (shapes || [])) {
    const b = computeShapeBounds(shape);
    if (!b) continue;
    if (!out) out = { ...b };
    else {
      out.minX = Math.min(out.minX, b.minX);
      out.minY = Math.min(out.minY, b.minY);
      out.maxX = Math.max(out.maxX, b.maxX);
      out.maxY = Math.max(out.maxY, b.maxY);
    }
  }
  return out;
}

export function createViewerViewRuntime(config) {
  const { state, dom, ctx, getPageFrameWorldSize, draw } = config || {};

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
    const vw = Math.max(1, Number(rect?.width) || 1);
    const vh = Math.max(1, Number(rect?.height) || 1);
    const bounds = computeAllShapeBounds(state.shapes || []);
    if (bounds) {
      const padPx = 28;
      const availW = Math.max(1, vw - padPx * 2);
      const availH = Math.max(1, vh - padPx * 2);
      const bw = Math.max(1e-9, Number(bounds.maxX) - Number(bounds.minX));
      const bh = Math.max(1e-9, Number(bounds.maxY) - Number(bounds.minY));
      const fitScale = Math.max(0.0001, Math.min(Number(state.view?.maxScale ?? 192), Math.min(availW / bw, availH / bh)));
      state.view.scale = fitScale;
      const cx = (Number(bounds.minX) + Number(bounds.maxX)) * 0.5;
      const cy = (Number(bounds.minY) + Number(bounds.maxY)) * 0.5;
      state.view.offsetX = vw * 0.5 - cx * fitScale;
      state.view.offsetY = vh * 0.5 - cy * fitScale;
    } else {
      const { cadW, cadH } = getPageFrameWorldSize(state.pageSetup);
      const fitScale = Math.max(0.0001, Math.min(vw / Math.max(1e-9, cadW), vh / Math.max(1e-9, cadH)));
      state.view.scale = fitScale;
      state.view.offsetX = vw * 0.5;
      state.view.offsetY = vh * 0.5;
    }
    state.grid.autoBasePxAtReset = Math.max(1e-9, (Number(state.grid?.size) || 100) * state.view.scale);
    state.grid.autoLevel = 100;
    draw();
  }

  return { resizeCanvas, resetView };
}
