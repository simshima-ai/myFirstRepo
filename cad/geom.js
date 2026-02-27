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

export function getEffectiveGridSize(grid, view) {
  const base = Math.max(1e-9, Number(grid?.size) || 100);
  if (!grid?.auto) return base;
  const scale = Math.max(1e-9, Number(view?.scale) || 1);
  const px = base * scale;
  // しきい値は「画面上1グリッドが何pxになったら切り替えるか」で指定する
  // th50Px: 100 -> 50 へ切り替えるpx目安
  // th10Px: 50 -> 10 へ切り替えるpx目安
  let th50Px = Math.max(1, Math.min(1000, Number(grid?.autoThreshold50) || 30));
  let th10Px = Math.max(1, Math.min(1000, Number(grid?.autoThreshold10) || 60));
  // 段階的に判定して、100 -> 50 -> 10 のような遷移になるようにする
  let ratio = 1;
  let effPx = px;

  // Zoom out (coarser grid): 100 -> 200 -> 500
  // 境界は "<=" / ">=" を避けてヒステリシス的に片側へ寄せる（HTML版寄せ）
  if (effPx < th50Px) {
    ratio *= 2;
    effPx = px * ratio;
    if (effPx < th10Px) {
      ratio *= 2.5; // 2 -> 5
      effPx = px * ratio;
    }
  }

  // Zoom in (finer grid): 100 -> 50 -> 10
  if (effPx > th50Px * 2) {
    ratio *= 0.5;
    effPx = px * ratio;
    // 50 -> 10 は「50%切替よりさらに大きい px」に達したら切替（ラベルどおり 10%切替(px) を使用）
    if (effPx > th10Px) {
      ratio *= 0.2; // 0.5 -> 0.1
      effPx = px * ratio;
    }
  }
  // 100系グリッドでは 1,2,5 刻みになる。端数丸めで意図せず 49/51 等にならないよう、
  // 1-2-5 系へスナップして返す。
  const raw = Math.max(1e-9, base * ratio);
  const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p10;
  let snapped;
  if (n < 1.5) snapped = 1;
  else if (n < 3.5) snapped = 2;
  else if (n < 7.5) snapped = 5;
  else snapped = 10;
  return Math.max(1e-9, snapped * p10);
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

