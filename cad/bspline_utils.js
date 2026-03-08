export function sampleBSplinePoints(controlPoints, degreeRaw = 3) {
  const cps = Array.isArray(controlPoints)
    ? controlPoints
      .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];
  if (cps.length < 2) return [];
  const degree = Math.max(1, Math.min(Number(degreeRaw) || 3, cps.length - 1));
  const n = cps.length - 1;
  const m = n + degree + 1;
  const knots = new Array(m + 1).fill(0);
  for (let i = 0; i <= m; i += 1) {
    if (i <= degree) knots[i] = 0;
    else if (i >= m - degree) knots[i] = 1;
    else knots[i] = (i - degree) / (m - 2 * degree);
  }
  const basis = (i, p, u) => {
    if (p === 0) {
      if (u === 1) return i === n ? 1 : 0;
      return knots[i] <= u && u < knots[i + 1] ? 1 : 0;
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
  for (let s = 0; s <= sampleCount; s += 1) {
    const u = s / sampleCount;
    let x = 0;
    let y = 0;
    for (let i = 0; i <= n; i += 1) {
      const w = basis(i, degree, u);
      if (!w) continue;
      x += cps[i].x * w;
      y += cps[i].y * w;
    }
    out.push({ x, y });
  }
  return out;
}
