export function unitMm(unitRaw) {
  const u = String(unitRaw || "").toLowerCase();
  if (u === "mm") return 1;
  if (u === "cm") return 10;
  if (u === "m") return 1000;
  if (u === "inch" || u === "in") return 25.4;
  if (u === "px") return 25.4 / 96;
  if (u === "pt") return 25.4 / 72;
  return NaN;
}

export function detectDxfInsunits(text) {
  const pairs = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (let i = 0; i + 3 < pairs.length; i += 1) {
    const c0 = String(pairs[i] || "").trim();
    const v0 = String(pairs[i + 1] || "").trim();
    const c1 = String(pairs[i + 2] || "").trim();
    const v1 = String(pairs[i + 3] || "").trim();
    if (c0 === "9" && v0.toUpperCase() === "$INSUNITS" && c1 === "70") {
      const n = Number(v1);
      if (n === 4) return "mm";
      if (n === 5) return "cm";
      if (n === 6) return "m";
      if (n === 1) return "inch";
      return "unitless";
    }
  }
  return null;
}

export function detectSvgUnit(text) {
  const m = String(text || "").match(/<svg\b[^>]*\b(?:width|height)\s*=\s*["']\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*([a-z%]+)?\s*["']/i);
  const u = String(m?.[1] || "").toLowerCase();
  if (u === "mm" || u === "cm" || u === "m" || u === "in" || u === "inch" || u === "px" || u === "pt") {
    return u === "in" ? "inch" : u;
  }
  if (!u) return "px";
  return null;
}

export function resolveImportSourceUnit({ manualUnit = "auto", sourceKind = "", text = "" } = {}) {
  const manual = String(manualUnit || "auto").toLowerCase();
  if (manual && manual !== "auto") return manual;
  if (sourceKind === "dxf") return detectDxfInsunits(text) || "unitless";
  if (sourceKind === "svg") return detectSvgUnit(text) || "px";
  return "unitless";
}

export function resolveUnitScale(sourceUnit, targetUnit) {
  const srcMm = unitMm(sourceUnit);
  const dstMm = unitMm(targetUnit);
  if (!Number.isFinite(srcMm) || !Number.isFinite(dstMm) || dstMm === 0) return 1;
  return srcMm / dstMm;
}

export function computeShapeBounds(shape) {
  const t = String(shape?.type || "").toLowerCase();
  if (t === "line" || t === "rect") {
    const x1 = Number(shape.x1);
    const y1 = Number(shape.y1);
    const x2 = Number(shape.x2);
    const y2 = Number(shape.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return {
      minX: Math.min(x1, x2),
      minY: Math.min(y1, y2),
      maxX: Math.max(x1, x2),
      maxY: Math.max(y1, y2),
    };
  }
  if (t === "polyline") {
    return computePointsBounds(shape.points);
  }
  if (t === "circle" || t === "arc") {
    const cx = Number(shape.cx);
    const cy = Number(shape.cy);
    const r = Math.abs(Number(shape.r) || 0);
    if (![cx, cy, r].every(Number.isFinite)) return null;
    return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
  }
  if (t === "bspline") {
    return computePointsBounds(shape.controlPoints);
  }
  if (t === "text") {
    const x = Number(shape.x1);
    const y = Number(shape.y1);
    if (![x, y].every(Number.isFinite)) return null;
    return { minX: x, minY: y, maxX: x, maxY: y };
  }
  if (t === "image" || t === "imagetrace") {
    const x = Number(shape.x);
    const y = Number(shape.y);
    const w = Number(shape.width);
    const h = Number(shape.height);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    return { minX: x, minY: y, maxX: x + w, maxY: y + h };
  }
  if (t === "position") {
    const x = Number(shape.x);
    const y = Number(shape.y);
    const s = Math.max(0, Number(shape.size) || 0);
    if (![x, y].every(Number.isFinite)) return null;
    return { minX: x - s, minY: y - s, maxX: x + s, maxY: y + s };
  }
  if (t === "dim" || t === "dimchain" || t === "dimangle" || t === "circledim") {
    const xs = [];
    const ys = [];
    for (const key of Object.keys(shape || {})) {
      const value = Number(shape[key]);
      if (!Number.isFinite(value)) continue;
      const lower = key.toLowerCase();
      if (lower.startsWith("x") || lower === "cx" || lower === "px" || lower === "tx") xs.push(value);
      if (lower.startsWith("y") || lower === "cy" || lower === "py" || lower === "ty") ys.push(value);
    }
    if (!xs.length || !ys.length) return null;
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  return null;
}

export function computeShapesBounds(shapes) {
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

export function buildImportMeta({
  sourceKind = "",
  sourceName = "",
  detectedUnit = "unitless",
  effectiveUnit = "",
  targetUnit = "mm",
  unitConfidence = "low",
  unitScale = 1,
  originalUnitScale = null,
  originalBounds = null,
  normalizedBounds = null,
  suggestedScales = null,
  lastImportMode = "import",
} = {}) {
  const normalizedDetectedUnit = String(detectedUnit || "unitless").toLowerCase();
  const normalizedEffectiveUnit = String(effectiveUnit || normalizedDetectedUnit || "unitless").toLowerCase();
  const nextOriginalBounds = originalBounds || null;
  const nextNormalizedBounds = normalizedBounds || nextOriginalBounds || null;
  return {
    sourceKind: String(sourceKind || ""),
    sourceName: String(sourceName || ""),
    detectedUnit: normalizedDetectedUnit,
    effectiveUnit: normalizedEffectiveUnit,
    targetUnit: String(targetUnit || "mm").toLowerCase(),
    unitConfidence: String(unitConfidence || "low"),
    unitScale: Number.isFinite(Number(unitScale)) ? Number(unitScale) : 1,
    originalUnitScale: Number.isFinite(Number(originalUnitScale)) ? Number(originalUnitScale) : (Number.isFinite(Number(unitScale)) ? Number(unitScale) : 1),
    originalBounds: nextOriginalBounds,
    normalizedBounds: nextNormalizedBounds,
    suggestedScales: Array.isArray(suggestedScales) && suggestedScales.length
      ? suggestedScales.filter((value) => Number.isFinite(Number(value))).map(Number)
      : suggestImportScales(nextNormalizedBounds, normalizedDetectedUnit),
    lastImportMode: String(lastImportMode || "import"),
  };
}

export function suggestGridSizeFromBounds(bounds, options = {}) {
  const width = Math.abs(Number(bounds?.maxX) - Number(bounds?.minX));
  const height = Math.abs(Number(bounds?.maxY) - Number(bounds?.minY));
  const span = Math.max(width, height);
  if (!(Number.isFinite(span) && span > 0)) return 10;
  const targetMinorLines = Math.max(8, Number(options.targetMinorLines) || 50);
  return niceStep(span / targetMinorLines);
}

function computePointsBounds(points) {
  const pts = Array.isArray(points) ? points : [];
  if (!pts.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const pt of pts) {
    const x = Number(pt?.x);
    const y = Number(pt?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}

function suggestImportScales(bounds, detectedUnit) {
  const width = Math.abs(Number(bounds?.maxX) - Number(bounds?.minX));
  const height = Math.abs(Number(bounds?.maxY) - Number(bounds?.minY));
  const span = Math.max(width, height);
  if (String(detectedUnit || "").toLowerCase() !== "unitless") {
    if (!Number.isFinite(span) || span <= 0) return [0.1, 1, 10];
    if (span < 1) return [1, 10, 100];
    if (span > 10000) return [0.01, 0.1, 1];
    if (span > 1000) return [0.1, 1, 10];
    return [0.1, 1, 10];
  }
  if (!Number.isFinite(span) || span <= 0) return [0.1, 1, 10];
  if (span < 1) return [1, 10, 100];
  if (span > 10000) return [0.01, 0.1, 1];
  if (span > 1000) return [0.1, 1, 10];
  return [1, 10, 0.1];
}

function niceStep(value) {
  const v = Math.abs(Number(value));
  if (!(Number.isFinite(v) && v > 0)) return 10;
  const exponent = Math.floor(Math.log10(v));
  const base = 10 ** exponent;
  const normalized = v / base;
  if (normalized <= 1.5) return base;
  if (normalized <= 3.5) return 2 * base;
  if (normalized <= 7.5) return 5 * base;
  return 10 * base;
}
