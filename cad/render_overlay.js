export function createRenderOverlayOps(deps) {
  const {
    worldToScreen,
    drawShape,
    isLayerVisible,
    isVisibleByCurrentLayerFilter,
    normalizeRad,
    computeLineCircleAutoTrimPlan,
  } = deps;

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
      ctx.fillStyle = "rgba(14,165,233,0.15)";
      ctx.strokeStyle = "#0ea5e9";
      ctx.setLineDash([]);
    } else {
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
    if (state.tool === "trim") return;
    if (state.tool === "dim" && state.dimSettings?.linearMode === "single") return;
    if (state.tool === "dim" && !state.dimDraft) return;
    const p = state.input?.objectSnapHover;
    if (!p) return;

    const isDragging = state.vertexEdit.drag.active || state.selection.drag.active;
    const hasSelection = state.selection.ids.length > 0 || (state.tool === "vertex" && (state.vertexEdit.selectedVertices || []).length > 0);
    if ((state.tool === "vertex" || state.tool === "select") && !hasSelection && !isDragging) return;

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
      ctx.strokeStyle = "#16a34a";
      ctx.fillStyle = "rgba(34,197,94,0.15)";
      ctx.lineWidth = 0.8;
    }

    ctx.beginPath();
    ctx.arc(s.x, s.y, isCreateTool ? 3.5 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    const h = 7;
    ctx.moveTo(s.x - h, s.y);
    ctx.lineTo(s.x + h, s.y);
    ctx.moveTo(s.x, s.y - h);
    ctx.lineTo(s.x, s.y + h);
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
    const s = th.line;
    const buildSampledSlice = (sampled, t0, t1) => {
      const pts = Array.isArray(sampled) ? sampled : [];
      if (pts.length < 2) return [];
      const segCount = pts.length - 1;
      const a = Math.max(0, Math.min(1, Number(t0) || 0));
      const b = Math.max(0, Math.min(1, Number(t1) || 0));
      if (b - a < 1e-6) return [];
      const pointAt = (t) => {
        const clamped = Math.max(0, Math.min(1, Number(t) || 0));
        const idxF = clamped * segCount;
        const idx = Math.max(0, Math.min(segCount - 1, Math.floor(idxF)));
        const lt = Math.max(0, Math.min(1, idxF - idx));
        const p1 = pts[idx];
        const p2 = pts[idx + 1];
        return {
          x: Number(p1.x) + (Number(p2.x) - Number(p1.x)) * lt,
          y: Number(p1.y) + (Number(p2.y) - Number(p1.y)) * lt,
        };
      };
      const out = [pointAt(a)];
      const iStart = Math.floor(a * segCount);
      const iEnd = Math.floor(b * segCount);
      for (let i = iStart + 1; i <= iEnd; i++) {
        if (i > 0 && i < pts.length - 1) out.push({ x: Number(pts[i].x), y: Number(pts[i].y) });
      }
      out.push(pointAt(b));
      return out.filter((p) => Number.isFinite(Number(p?.x)) && Number.isFinite(Number(p?.y)));
    };
    if (th.targetType === "circle" || th.targetType === "arc") {
      const csh = th.circle || th.arc;
      if (!csh || !isLayerVisible(state, csh.layerId) || !isVisibleByCurrentLayerFilter(state, csh)) return;
      const c = worldToScreen(state.view, { x: Number(csh.cx), y: Number(csh.cy) });
      const r = Math.max(1, Number(csh.r) * state.view.scale);
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, r, Number(th.remA1) || 0, Number(th.remA2) || 0, !(th.remCCW !== false));
      ctx.stroke();
      ctx.setLineDash([]);
      for (const p of [{ x: Number(th.x1), y: Number(th.y1) }, { x: Number(th.x2), y: Number(th.y2) }]) {
        const ip = worldToScreen(state.view, p);
        ctx.fillStyle = "rgba(239,68,68,0.12)";
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ip.x, ip.y, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (th.targetType === "bspline") {
      const bs = th.spline;
      if (!bs || !isLayerVisible(state, bs.layerId) || !isVisibleByCurrentLayerFilter(state, bs)) return;
      const segPts = buildSampledSlice(th.sampled, th.t0, th.t1);
      if (segPts.length >= 2) {
        ctx.save();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        const p0 = worldToScreen(state.view, segPts[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < segPts.length; i++) {
          const pi = worldToScreen(state.view, segPts[i]);
          ctx.lineTo(pi.x, pi.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        for (const p of [{ x: Number(th.x1), y: Number(th.y1) }, { x: Number(th.x2), y: Number(th.y2) }]) {
          const ip = worldToScreen(state.view, p);
          ctx.fillStyle = "rgba(239,68,68,0.12)";
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ip.x, ip.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      }
      return;
    }
    const visShape = (th.targetType === "polyline") ? th.polyline : s;
    if (!s || !visShape || !isLayerVisible(state, visShape.layerId) || !isVisibleByCurrentLayerFilter(state, visShape)) return;
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
    const from = th.trimEnd === "p1" ? p1 : p2;
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
      const ax = Number(a.x);
      const ay = Number(a.y);
      const bx = Number(b.x);
      const by = Number(b.y);
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
      const x = Number(p.x);
      const y = Number(p.y);
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
      ctx.moveTo(s.x - 8, s.y);
      ctx.lineTo(s.x + 8, s.y);
      ctx.moveTo(s.x, s.y - 8);
      ctx.lineTo(s.x, s.y + 8);
      ctx.stroke();
      ctx.restore();
    };

    const drawTrimArcSeg = (arcShape, aStart, aEnd, ccw) => {
      const cx = Number(arcShape?.cx);
      const cy = Number(arcShape?.cy);
      const rr = Math.abs(Number(arcShape?.r) || 0);
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
    const normTau = (a) => {
      let x = Number(a) || 0;
      const t = Math.PI * 2;
      while (x < 0) x += t;
      while (x >= t) x -= t;
      return x;
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
        const cutKey = (plan?.cutKey === "a1" || plan?.cutKey === "a2") ? plan.cutKey : null;
        const a1Old = normTau(Number(fh.sol.circle?.a1) || 0);
        const a2Old = normTau(Number(fh.sol.circle?.a2) || 0);
        const ccwOld = fh.sol.circle?.ccw !== false;
        const th = normTau(Math.atan2(Number(fh.sol?.tCircle?.y) - Number(fh.sol.circle?.cy), Number(fh.sol?.tCircle?.x) - Number(fh.sol.circle?.cx)));
        if (cutKey === "a1") {
          drawTrimArcSeg(fh.sol.circle, a1Old, th, ccwOld);
        } else if (cutKey === "a2") {
          drawTrimArcSeg(fh.sol.circle, th, a2Old, ccwOld);
        }
      }
    }
    if (fh.sol?.tLine) drawRedPoint(fh.sol.tLine);
    if (fh.sol?.tCircle) drawRedPoint(fh.sol.tCircle);
  }

  function drawFilletFlow(ctx, state) {
    const ff = state.input?.filletFlow;
    if (!ff) return;
    if (ff.stage === "confirm-arc-sides" && ff.kind === "arc-arc" && ff.sol?.arc1 && ff.sol?.arc2 && ff.sol?.t1 && ff.sol?.t2) {
      const drawArcSplit = (arcShape, tangentPoint, keepSide) => {
        const cx = Number(arcShape.cx);
        const cy = Number(arcShape.cy);
        const rr = Math.abs(Number(arcShape.r) || 0);
        const a1 = Number(arcShape.a1) || 0;
        const a2 = Number(arcShape.a2) || 0;
        const ccw = arcShape.ccw !== false;
        const tAng = normalizeRad(Math.atan2(Number(tangentPoint.y) - cy, Number(tangentPoint.x) - cx));
        const c = worldToScreen(state.view, { x: cx, y: cy });
        const rs = Math.max(1, rr * state.view.scale);
        const anti = !ccw;
        const keepA = keepSide === "a2" ? { s: tAng, e: a2, anti } : { s: a1, e: tAng, anti };
        const trimA = keepSide === "a2" ? { s: a1, e: tAng, anti } : { s: tAng, e: a2, anti };
        ctx.setLineDash([8, 5]);
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#22c55e";
        ctx.beginPath();
        ctx.arc(c.x, c.y, rs, keepA.s, keepA.e, keepA.anti);
        ctx.stroke();
        ctx.strokeStyle = "#ef4444";
        ctx.beginPath();
        ctx.arc(c.x, c.y, rs, trimA.s, trimA.e, trimA.anti);
        ctx.stroke();
        ctx.setLineDash([]);
        const ts = worldToScreen(state.view, tangentPoint);
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(ts.x, ts.y, 5, 0, Math.PI * 2);
        ctx.fill();
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
    ctx.moveTo(a1.x, a1.y);
    ctx.lineTo(a2.x, a2.y);
    ctx.stroke();
    ctx.strokeStyle = "#ef4444";
    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
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
    if (h) {
      ctx.save();
      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      drawShape(ctx, state, h, null);
      ctx.restore();
    }
    drawHatchValidation(ctx, state);
  }

  function drawHatchValidation(ctx, state) {
    if (state.tool !== "hatch") return;
    const v = state.input?.hatchValidation;
    if (!v) return;
    const currentIds = Array.from(new Set((state.hatchDraft?.boundaryIds || []).map((id) => Number(id)).filter(Number.isFinite))).sort((a, b) => a - b);
    const currentKey = currentIds.join(",");
    if (String(v.idsKey || "") !== currentKey) return;

    const openNodes = Array.isArray(v.openNodes) ? v.openNodes : [];
    const nearPairs = Array.isArray(v.nearMissPairs) ? v.nearMissPairs : [];
    if (openNodes.length === 0 && nearPairs.length === 0) return;

    ctx.save();
    for (const pair of nearPairs) {
      const a = pair?.a;
      const b = pair?.b;
      if (!a || !b) continue;
      const sa = worldToScreen(state.view, { x: Number(a.x), y: Number(a.y) });
      const sb = worldToScreen(state.view, { x: Number(b.x), y: Number(b.y) });
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const n of openNodes) {
      const s = worldToScreen(state.view, { x: Number(n.x), y: Number(n.y) });
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "rgba(239,68,68,0.12)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x - 8, s.y);
      ctx.lineTo(s.x + 8, s.y);
      ctx.moveTo(s.x, s.y - 8);
      ctx.lineTo(s.x, s.y + 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    drawSelectionBox,
    drawObjectSnapHover,
    drawTrimHover,
    drawFilletHover,
    drawFilletFlow,
    drawHatchHover,
  };
}
