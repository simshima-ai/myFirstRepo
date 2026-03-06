export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function dist(a, b) {
  return Math.sqrt(dist2(a, b));
}

export function mmPerUnit(unit) {
  switch (String(unit).toLowerCase()) {
    case "m": return 1000;
    case "cm": return 10;
    case "inch":
    case "in": return 25.4;
    case "ft": return 304.8;
    case "mm":
    default:
      return 1;
  }
}

export function getHatchPitchWorld(state, hatchShape) {
  const mm = Math.max(0.1, Number(hatchShape.pitchMm ?? state.hatchSettings?.pitchMm ?? 5));
  const sc = Math.max(1, Number(state.pageSetup?.scale) || 1);
  const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
  return (mm * sc) / Math.max(1e-9, unitMm);
}

export function getHatchLineShiftWorld(state, hatchShape) {
  const mm = Math.max(0, Number(hatchShape.lineShiftMm ?? state.hatchSettings?.lineShiftMm ?? 0));
  const sc = Math.max(1, Number(state.pageSetup?.scale) || 1);
  const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
  return (mm * sc) / Math.max(1e-9, unitMm);
}

export function getHatchPaddingWorld(state, hatchShape) {
  const mm = Math.max(0, Number(hatchShape.repetitionPaddingMm ?? state.hatchSettings?.repetitionPaddingMm ?? 2));
  const sc = Math.max(1, Number(state.pageSetup?.scale) || 1);
  const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
  return (mm * sc) / Math.max(1e-9, unitMm);
}

export function getHatchDashWorld(state, hatchShape) {
  const mm = Math.max(0.1, Number(hatchShape.lineDashMm ?? state.hatchSettings?.lineDashMm ?? 5));
  const sc = Math.max(1, Number(state.pageSetup?.scale) || 1);
  const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
  return (mm * sc) / Math.max(1e-9, unitMm);
}

export function getHatchGapWorld(state, hatchShape) {
  const mm = Math.max(0.1, Number(hatchShape.lineGapMm ?? state.hatchSettings?.lineGapMm ?? 2));
  const sc = Math.max(1, Number(state.pageSetup?.scale) || 1);
  const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
  return (mm * sc) / Math.max(1e-9, unitMm);
}

export function getPaperWorldRect(state) {
  const ps = state.pageSetup;
  if (!ps?.showFrame) return null;
  // A4 landscape: 297x210
  const sizes = {
    "A3": { w: 420, h: 297 },
    "A4": { w: 297, h: 210 },
  };
  const base = sizes[ps.size] || sizes["A4"];
  const w = ps.orientation === "landscape" ? base.w : base.h;
  const h = ps.orientation === "landscape" ? base.h : base.w;
  const sc = Math.max(1, Number(ps.scale) || 1);
  const unitMm = mmPerUnit(ps.unit || "mm");
  const wr = (w * sc) / unitMm;
  const hr = (h * sc) / unitMm;
  return { x1: -wr * 0.5, y1: -hr * 0.5, x2: wr * 0.5, y2: hr * 0.5 };
}

export function worldToScreen(view, p) {
  return {
    x: p.x * view.scale + view.offsetX,
    y: p.y * view.scale + view.offsetY,
  };
}

export function screenToWorld(view, p) {
  return {
    x: (p.x - view.offsetX) / view.scale,
    y: (p.y - view.offsetY) / view.scale,
  };
}

export function snapValue(v, step) {
  if (!(step > 0)) return v;
  return Math.round(v / step) * step;
}

export function snapPoint(p, step) {
  return {
    x: snapValue(p.x, step),
    y: snapValue(p.y, step),
  };
}

export function getEffectiveGridSize(grid, view, pageSetup = null) {
  const base = Math.max(1e-9, Number(grid?.size) || 100);
  if (!grid?.auto) return base;
  const scale = Math.max(1e-9, Number(view?.scale) || 1);
  const currentPx = base * scale;
  const basePx = Math.max(1e-9, Number(grid?.autoBasePxAtReset) || currentPx);
  const z = currentPx / basePx;

  let e50 = Math.max(1.01, Number(grid?.autoThreshold50 || 130) / 100);
  let e10 = Math.max(e50, Number(grid?.autoThreshold10 || 180) / 100);
  // Tune only deep-zoom stages to avoid becoming too fine too early.
  let e5 = Math.max(e10, (Number(grid?.autoThreshold5 || 240) / 100) * 1.2);
  let e1 = Math.max(e5, (Number(grid?.autoThreshold1 || 320) / 100) * 2.5);
  const h = 0.85; // hysteresis return ratio
  const r50 = e50 * h;
  const r10 = e10 * h;
  const r5 = e5 * h;
  const r1 = e1 * h;

  let level = Number(grid?.autoLevel);
  if (![100, 50, 10, 5, 1].includes(level)) level = 100;
  // Catch up multiple stages in one frame when zoom delta is large (wheel/pinch burst).
  // Single-step transition causes visible lag/flicker around threshold crossings.
  for (let i = 0; i < 8; i++) {
    const prev = level;
    if (level === 100) {
      if (z >= e50) level = 50;
    } else if (level === 50) {
      if (z >= e10) level = 10;
      else if (z <= r50) level = 100;
    } else if (level === 10) {
      if (z >= e5) level = 5;
      else if (z <= r10) level = 50;
    } else if (level === 5) {
      if (z >= e1) level = 1;
      else if (z <= r5) level = 10;
    } else {
      if (z <= r1) level = 5;
    }
    if (level === prev) break;
  }

  grid.autoLevel = level;
  return Math.max(1e-9, base * (level / 100));
}

export function nearestPointOnSegment(p, a, b) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-12) return { x: a.x, y: a.y, t: 0 };
  let t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  t = clamp(t, 0, 1);
  return {
    x: a.x + vx * t,
    y: a.y + vy * t,
    t,
  };
}

export function hitTestLine(world, line, tolWorld) {
  const q = nearestPointOnSegment(world, { x: line.x1, y: line.y1 }, { x: line.x2, y: line.y2 });
  return dist(world, q) <= tolWorld;
}
