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
  if (t <= 20) return "かなり早い";
  if (t <= 40) return "やや早い";
  if (t <= 60) return "標準";
  if (t <= 80) return "やや遅い";
  return "かなり遅い";
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
