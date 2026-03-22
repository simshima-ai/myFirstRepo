export function clampGridAutoTiming(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

const GRID_T50_MIN = 110;
const GRID_T50_OLD_MAX = 240;
const GRID_T50_SPLIT = 157; // old formula at timing=60
const GRID_T50_NEW_MAX = 420; // extended slow-side headroom

function oldThresholdsFromTiming(t) {
  const u = t / 100;
  const s = u * u;
  return {
    th50: Math.round(110 + (130 * s)),
    th10: Math.round(150 + (220 * s)),
    th5: Math.round(200 + (320 * s)),
    th1: Math.round(260 + (520 * s)),
  };
}

export function gridThresholdsFromTiming(timing) {
  const t = clampGridAutoTiming(timing);
  const old = oldThresholdsFromTiming(t);
  let th50 = old.th50;
  let th10 = old.th10;
  let th5 = old.th5;
  let th1 = old.th1;
  if (t > 60) {
    const z = ((t - 60) / 40);
    const w = z * z;
    const from = oldThresholdsFromTiming(60);
    th50 = Math.round(from.th50 + (420 - from.th50) * w);
    th10 = Math.round(from.th10 + (680 - from.th10) * w);
    th5 = Math.round(from.th5 + (980 - from.th5) * w);
    th1 = Math.round(from.th1 + (1500 - from.th1) * w);
  }
  return {
    th50,
    th10: Math.max(th50, th10),
    th5: Math.max(th10, th5),
    th1: Math.max(th5, th1),
  };
}

export function gridAutoTimingFromThreshold50(th50) {
  const v50 = Math.max(GRID_T50_MIN, Math.min(GRID_T50_NEW_MAX, Math.round(Number(th50) || 130)));
  if (v50 <= GRID_T50_SPLIT) {
    const s = Math.max(0, Math.min(1, (v50 - GRID_T50_MIN) / (GRID_T50_OLD_MAX - GRID_T50_MIN)));
    return clampGridAutoTiming(Math.sqrt(s) * 100);
  }
  const z = Math.sqrt(Math.max(0, Math.min(1, (v50 - GRID_T50_SPLIT) / (GRID_T50_NEW_MAX - GRID_T50_SPLIT))));
  return clampGridAutoTiming(60 + (40 * z));
}

export function gridAutoTimingLabelText(timing) {
  const t = clampGridAutoTiming(timing);
  if (t <= 20) return "Very Fast";
  if (t <= 40) return "Fast";
  if (t <= 60) return "Normal";
  if (t <= 80) return "Slow";
  return "Very Slow";
}

export function normalizeGridPreset(v) {
  const n = Number(v);
  const opts = [1, 5, 10, 50, 100, 500, 1000];
  if (!Number.isFinite(n)) return 100;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

export function normalizePageScalePreset(v) {
  const n = Number(v);
  const opts = [1, 5, 10, 50, 100, 500, 1000];
  if (!Number.isFinite(n)) return 1;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

export function normalizeMaxZoomPreset(v) {
  const n = Number(v);
  const opts = [1, 10, 100, 1000];
  if (!Number.isFinite(n)) return 100;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

export function normalizeMenuScaleMode(v) {
  return String(v || "").toLowerCase() === "manual" ? "manual" : "auto";
}

export function normalizeMenuScaleAutoPreset(v) {
  const s = String(v || "normal").toLowerCase();
  const opts = new Set(["subtle", "normal", "dynamic", "strong"]);
  return opts.has(s) ? s : "normal";
}

export function computeAutoMenuScale(width, height, preset = "normal") {
  const w = Number(width);
  const h = Number(height);
  const base = Math.min(
    Number.isFinite(w) && w > 0 ? w : Infinity,
    Number.isFinite(h) && h > 0 ? h : Infinity
  );
  if (!Number.isFinite(base)) return 1;
  const p = normalizeMenuScaleAutoPreset(preset);
  const table = {
    subtle: { small: 0.9, medium: 1.0, large: 1.05, xlarge: 1.1 },
    normal: { small: 0.8, medium: 1.0, large: 1.1, xlarge: 1.2 },
    dynamic: { small: 0.7, medium: 1.0, large: 1.15, xlarge: 1.3 },
    strong: { small: 0.6, medium: 1.0, large: 1.2, xlarge: 1.35 },
  };
  const c = table[p] || table.normal;
  const lerp = (a, b, t) => a + ((b - a) * t);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const t1 = clamp01((base - 900) / 300);
  const t2 = clamp01((base - 1200) / 400);
  const t3 = clamp01((base - 1600) / 600);
  if (base <= 1200) return lerp(c.small, c.medium, t1);
  if (base <= 1600) return lerp(c.medium, c.large, t2);
  return lerp(c.large, c.xlarge, t3);
}

export function resolveMenuScale(ui, width, height) {
  const mode = normalizeMenuScaleMode(ui?.menuScaleMode);
  if (mode === "manual") {
    return normalizeMenuScalePreset(ui?.menuScalePct ?? 100) / 100;
  }
  return computeAutoMenuScale(width, height, ui?.menuScaleAutoPreset);
}

export function normalizeWheelZoomPreset(v) {
  const n = Number(v);
  const opts = [1.05, 1.1, 1.2, 1.35, 1.5];
  if (!Number.isFinite(n)) return 1.1;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

export function normalizeMenuScalePreset(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 100;
  const snapped = Math.round(n / 5) * 5;
  return Math.max(50, Math.min(200, snapped));
}

export function normalizeLineWidthPreset(v) {
  const n = Number(v);
  const opts = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
  if (!Number.isFinite(n)) return 0.25;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

export function normalizeLineTypePreset(v) {
  const allowed = ["solid", "dashed", "dotted", "dashdot", "longdash", "center", "hidden"];
  const key = String(v || "solid").toLowerCase();
  return allowed.includes(key) ? key : "solid";
}
