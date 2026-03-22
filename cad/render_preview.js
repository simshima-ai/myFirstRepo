export function createRenderPreviewOps(config) {
  const {
    worldToScreen,
    drawShape,
    drawDimensionCommon,
    getCircleDimGeometry,
    getLeaderDimGeometry,
    getSpecialDimGeometry,
    getDimChainGeometry,
    getDimGeometry,
    isLayerVisible,
    isVisibleByCurrentLayerFilter,
    sampleBSplinePoints
  } = config || {};

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

  function drawPurpleCandidate(ctx, state, x, y) {
    const p = worldToScreen(state.view, { x, y });
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "rgba(239,68,68,0.10)";
    ctx.setLineDash([]);
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y); ctx.lineTo(p.x + 7, p.y);
    ctx.moveTo(p.x, p.y - 7); ctx.lineTo(p.x, p.y + 7);
    ctx.stroke();
    ctx.restore();
  }

  function drawTouchGuideLine(ctx, state, x1, y1, x2, y2) {
    const p1 = worldToScreen(state.view, { x: x1, y: y1 });
    const p2 = worldToScreen(state.view, { x: x2, y: y2 });
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
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
      drawPreviewLabel(ctx, mid.x + 10, mid.y - 28, `L=${len.toFixed(prec)}  A=${ang.toFixed(1)}ﾂｰ`);
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

  function drawPreview(ctx, state, preview) {
    if (!preview) return;
    const drawRedDashLine = (x1, y1, x2, y2) => {
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.setLineDash([7, 4]);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    };
    const drawRedDashCircle = (cx, cy, sr) => {
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.setLineDash([7, 4]);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, sr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    if (preview.type === "touchRectCandidates") {
      const p1 = worldToScreen(state.view, { x: Number(preview.x1), y: Number(preview.y1) });
      const p2 = worldToScreen(state.view, { x: Number(preview.x2), y: Number(preview.y2) });
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.2;
      const drawMarker = (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y);
        ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7);
        ctx.stroke();
      };
      drawMarker(p1.x, p1.y);
      drawMarker(p2.x, p2.y);
      ctx.restore();
      return;
    }
    if (preview.type === "touchRectPlan") {
      const p1 = worldToScreen(state.view, { x: Number(preview.x1), y: Number(preview.y1) });
      const p2 = worldToScreen(state.view, { x: Number(preview.x2), y: Number(preview.y2) });
      const sx = Math.min(p1.x, p2.x), sy = Math.min(p1.y, p2.y);
      const ex = Math.max(p1.x, p2.x), ey = Math.max(p1.y, p2.y);
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.setLineDash([7, 4]);
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(ex, sy);
      ctx.lineTo(ex, ey); ctx.lineTo(sx, ey);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 1.2;
      const drawMarker = (x, y) => {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y);
        ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7);
        ctx.stroke();
      };
      drawMarker(p1.x, p1.y);
      drawMarker(p2.x, p2.y);
      ctx.restore();
      return;
    }
    if (preview.type === "rect" && preview.rectPreviewMode === "fixed") {
      const p1 = worldToScreen(state.view, { x: Number(preview.x1), y: Number(preview.y1) });
      const p2 = worldToScreen(state.view, { x: Number(preview.x2), y: Number(preview.y2) });
      const sx = Math.min(p1.x, p2.x), sy = Math.min(p1.y, p2.y);
      const sw = Math.abs(p2.x - p1.x), sh = Math.abs(p2.y - p1.y);
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.setLineDash([7, 4]);
      ctx.lineWidth = 1.1;
      ctx.strokeRect(sx, sy, sw, sh);
      const ax = Number(preview.touchRectAnchor?.x);
      const ay = Number(preview.touchRectAnchor?.y);
      if (Number.isFinite(ax) && Number.isFinite(ay)) {
        const a = worldToScreen(state.view, { x: ax, y: ay });
        ctx.setLineDash([]);
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(a.x - 7, a.y);
        ctx.lineTo(a.x + 7, a.y);
        ctx.moveTo(a.x, a.y - 7);
        ctx.lineTo(a.x, a.y + 7);
        ctx.stroke();
      }
      ctx.restore();
      drawPreviewMetrics(ctx, state, preview);
      return;
    }
    if (preview.type === "line" && (preview.linePreviewMode === "fixed" || preview.linePreviewMode === "touch")) {
      const p1 = worldToScreen(state.view, { x: Number(preview.x1), y: Number(preview.y1) });
      const p2 = worldToScreen(state.view, { x: Number(preview.x2), y: Number(preview.y2) });
      drawRedDashLine(p1.x, p1.y, p2.x, p2.y);
      drawPreviewMetrics(ctx, state, preview);
      return;
    }
    if (preview.type === "circle" && (preview.circlePreviewMode === "fixed" || preview.circlePreviewMode === "touch")) {
      const cx = Number(preview.cx), cy = Number(preview.cy);
      const r = Math.abs(Number(preview.r) || 0);
      const c = worldToScreen(state.view, { x: cx, y: cy });
      const sr = Math.max(0, r * Math.max(1e-9, state.view.scale));
      drawRedDashCircle(c.x, c.y, sr);
      drawPreviewMetrics(ctx, state, preview);
      return;
    }
    ctx.save();
      ctx.strokeStyle = "#ef4444";
    ctx.setLineDash([]);
    ctx.lineWidth = 1.0;
    drawShape(ctx, state, preview, null);
    ctx.restore();
    drawPreviewMetrics(ctx, state, preview);
  }

  function drawPolylineDraft(ctx, state) {
    const d = state.polylineDraft;
    if (!d || !Array.isArray(d.points) || d.points.length === 0) return;
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.fillStyle = "#ef4444";
    ctx.setLineDash([7, 4]);
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    if (d.kind === "bspline") {
      const cp = d.hoverPoint ? [...d.points, d.hoverPoint] : [...d.points];
      const sampled = sampleBSplinePoints(cp, 3);
      if (sampled.length >= 2) {
        const p0 = worldToScreen(state.view, sampled[0]);
        ctx.moveTo(p0.x, p0.y);
        for (let i = 1; i < sampled.length; i++) {
          const p = worldToScreen(state.view, sampled[i]);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = "rgba(239,68,68,0.45)";
      ctx.beginPath();
      const c0 = worldToScreen(state.view, d.points[0]);
      ctx.moveTo(c0.x, c0.y);
      for (let i = 1; i < d.points.length; i++) {
        const p = worldToScreen(state.view, d.points[i]);
        ctx.lineTo(p.x, p.y);
      }
      if (d.hoverPoint) {
        const hp = worldToScreen(state.view, d.hoverPoint);
        ctx.lineTo(hp.x, hp.y);
      }
      ctx.stroke();
    } else {
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
    }
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
        ctx.fillStyle = "rgba(239,68,68,0.35)";
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDimDraft(ctx, state) {
    const d = state.dimDraft;
    if (!d) return;
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 1.0;
    ctx.setLineDash([]);

    if (d.dimRef) {
      const touchDash = !!state.ui?.touchMode;
      const touchDim = touchDash ? { ...d, color: "#ef4444" } : d;
      if (d.type === "circleDim") {
        const geom = getCircleDimGeometry(d, state.shapes);
        if (geom) {
          if (touchDash) ctx.setLineDash([6, 4]);
          drawDimensionCommon(ctx, state, { ...touchDim, precision: state.dimSettings?.precision ?? 1 }, geom, false, false);
          if (touchDash) ctx.setLineDash([]);
        }
      } else {
        const geom = getSpecialDimGeometry({ kind: d.kind, dimRef: d.dimRef, x2: d.x2, y2: d.y2 }, state.shapes);
        if (geom) {
          if (touchDash) ctx.setLineDash([6, 4]);
          drawDimensionCommon(ctx, state, { type: "dim", kind: d.kind, precision: 1, color: "#ef4444" }, geom, false, false);
          if (touchDash) ctx.setLineDash([]);
        }
      }
      if (Number.isFinite(Number(d.x2)) && Number.isFinite(Number(d.y2))) {
        drawPurpleCandidate(ctx, state, Number(d.x2), Number(d.y2));
      } else {
        const hx = Number(state.input?.hoverWorld?.x);
        const hy = Number(state.input?.hoverWorld?.y);
        if (Number.isFinite(hx) && Number.isFinite(hy)) drawPurpleCandidate(ctx, state, hx, hy);
      }
    } else if (d.type === "dimleader" && d.p1) {
      drawPurpleCandidate(ctx, state, Number(d.p1.x), Number(d.p1.y));
      const target = d.p2 || d.hover || state.input?.hoverWorld;
      if (target && Number.isFinite(Number(target.x)) && Number.isFinite(Number(target.y))) {
        const lineDir = ((Number(target.x) - Number(d.p1.x)) >= 0) ? 1 : -1;
        const lineLen = Math.max(1, Number(d.lineLen) || 24 / Math.max(1e-9, state.view.scale));
        const textGap = Math.max(1, Number(d.textGap) || 12 / Math.max(1e-9, state.view.scale));
        const geom = getLeaderDimGeometry({
          type: "dimleader",
          x1: Number(d.p1.x),
          y1: Number(d.p1.y),
          x2: Number(target.x),
          y2: Number(target.y),
          lineDir,
          lineLen,
          tx: Number(target.x) + lineDir * lineLen * 0.5,
          ty: Number(target.y) - textGap,
        });
        if (geom) {
          if (state.ui?.touchMode) ctx.setLineDash([6, 4]);
          drawDimensionCommon(ctx, state, { type: "dimleader", leaderText: String(state.dimSettings?.labelText || "NOTE"), color: "#ef4444" }, geom, false, false);
          if (state.ui?.touchMode) ctx.setLineDash([]);
        }
      }
      if (d.p2) {
        drawPurpleCandidate(ctx, state, Number(d.p2.x), Number(d.p2.y));
      } else if (d.hover) {
        drawPurpleCandidate(ctx, state, Number(d.hover.x), Number(d.hover.y));
      }
    } else if (d.points && d.points.length >= 1) {
      const lastPoint = d.points[d.points.length - 1];
      const awaitingPlacement = !!d.awaitingPlacement;
      const hoverPoint = d.hoverPoint || lastPoint;
      const pts = [...d.points];
      if (!awaitingPlacement && Math.hypot(hoverPoint.x - lastPoint.x, hoverPoint.y - lastPoint.y) > 1e-9) pts.push(hoverPoint);
      if (pts.length >= 2) {
        const placePt = d.place ?? d.hoverPlace ?? (awaitingPlacement ? lastPoint : hoverPoint);
        const geom = getDimChainGeometry({ points: pts, px: placePt.x, py: placePt.y });
        if (geom) {
          if (Array.isArray(geom.dimPoints)) {
            for (let i = 0; i < d.points.length && i < geom.dimPoints.length; i += 1) {
              const src = d.points[i];
              const dst = geom.dimPoints[i];
              drawTouchGuideLine(ctx, state, Number(src.x), Number(src.y), Number(dst.x), Number(dst.y));
            }
          }
          ctx.setLineDash([6, 4]);
          drawDimensionCommon(ctx, state, { type: "dimchain", precision: 1, color: "#ef4444" }, geom, false, false);
          ctx.setLineDash([]);
        }
      }
      for (const pt of d.points) {
        drawPurpleCandidate(ctx, state, Number(pt.x), Number(pt.y));
      }
      const m = awaitingPlacement ? (d.hoverPlace || d.place) : d.hoverPoint;
      if (m && Number.isFinite(Number(m.x)) && Number.isFinite(Number(m.y))) drawPurpleCandidate(ctx, state, Number(m.x), Number(m.y));
    } else if (d.p1) {
      drawPurpleCandidate(ctx, state, Number(d.p1.x), Number(d.p1.y));
      if (d.p2) {
        const px = d.place?.x ?? d.p2.x;
        const py = d.place?.y ?? d.p2.y;
        const vx = d.p2.x - d.p1.x, vy = d.p2.y - d.p1.y;
        const len = Math.hypot(vx, vy);
        let off = 0;
        if (len > 1e-9) {
          const nx = -vy / len, ny = vx / len;
          off = (px - d.p1.x) * nx + (py - d.p1.y) * ny;
        }
        const geom = getDimGeometry({ x1: d.p1.x, y1: d.p1.y, x2: d.p2.x, y2: d.p2.y, dimOffset: off });
        if (geom) {
          if (state.ui?.touchMode) {
            drawTouchGuideLine(ctx, state, Number(d.p1.x), Number(d.p1.y), Number(geom.d1.x), Number(geom.d1.y));
            drawTouchGuideLine(ctx, state, Number(d.p2.x), Number(d.p2.y), Number(geom.d2.x), Number(geom.d2.y));
          }
          ctx.setLineDash([6, 4]);
          drawDimensionCommon(ctx, state, { type: "dim", precision: state.dimSettings?.precision ?? 1, color: "#ef4444" }, geom, false, false);
          ctx.setLineDash([]);
        }
        drawPurpleCandidate(ctx, state, Number(d.p2.x), Number(d.p2.y));
      } else if (d.hover) {
        const hs = worldToScreen(state.view, d.hover);
        const p1s = worldToScreen(state.view, d.p1);
        ctx.beginPath();
        ctx.moveTo(p1s.x, p1s.y);
        ctx.lineTo(hs.x, hs.y);
        ctx.strokeStyle = "#ef4444";
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.setLineDash([]);
        if (Number.isFinite(Number(d.hover.x)) && Number.isFinite(Number(d.hover.y))) {
          drawPurpleCandidate(ctx, state, Number(d.hover.x), Number(d.hover.y));
        }
      } else {
        const hx = Number(state.input?.hoverWorld?.x);
        const hy = Number(state.input?.hoverWorld?.y);
        if (Number.isFinite(hx) && Number.isFinite(hy)) drawPurpleCandidate(ctx, state, hx, hy);
      }
    }
    ctx.restore();
  }

  function drawDimHoveredShape(ctx, state) {
    if (state.tool !== "dim" || state.dimDraft) return;
    const touchCandidate = state.ui?.touchMode ? (state.input?.touchDimDraft?.candidatePoint || state.input?.hoverWorld || state.input?.hover?.world || null) : null;
    if (touchCandidate && Number.isFinite(Number(touchCandidate.x)) && Number.isFinite(Number(touchCandidate.y))) {
      drawPurpleCandidate(ctx, state, Number(touchCandidate.x), Number(touchCandidate.y));
      return;
    }
    const preview = state.input.dimHoverPreview;
    if (preview) {
      ctx.save();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      const geom = getSpecialDimGeometry(preview, state.shapes);
      if (geom) {
        drawDimensionCommon(ctx, state, { type: "dim", kind: preview.kind, precision: state.dimSettings?.precision ?? 1, color: "#ef4444" }, geom, false, false);
      }
      ctx.setLineDash([]);
      ctx.restore();
      return;
    }
    if (state.input.dimHoveredShapeId == null) return;
    const s = state.shapes.find(sh => Number(sh.id) === Number(state.input.dimHoveredShapeId));
    if (!s) return;
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    if (s.type === "line") {
      const p1 = worldToScreen(state.view, { x: s.x1, y: s.y1 });
      const p2 = worldToScreen(state.view, { x: s.x2, y: s.y2 });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    } else if (s.type === "polyline") {
      const pts = Array.isArray(s.points) ? s.points : [];
      if (pts.length >= 2) {
        const segIdx = Number(state.input?.dimHoveredSegmentIndex);
        const segCount = pts.length - 1 + (s.closed ? 1 : 0);
        if (Number.isFinite(segIdx) && segIdx >= 0 && segIdx < segCount) {
          const i1 = segIdx;
          const i2 = (segIdx + 1) % pts.length;
          const a = worldToScreen(state.view, { x: Number(pts[i1].x), y: Number(pts[i1].y) });
          const b = worldToScreen(state.view, { x: Number(pts[i2].x), y: Number(pts[i2].y) });
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        } else {
          const p0 = worldToScreen(state.view, { x: Number(pts[0].x), y: Number(pts[0].y) });
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i++) {
            const p = worldToScreen(state.view, { x: Number(pts[i].x), y: Number(pts[i].y) });
            ctx.lineTo(p.x, p.y);
          }
          if (s.closed) ctx.closePath();
          ctx.stroke();
        }
      }
    } else if (s.type === "circle" || s.type === "arc") {
      const c = worldToScreen(state.view, { x: s.cx, y: s.cy });
      const r = Math.abs(Number(s.r)) * state.view.scale;
      ctx.beginPath();
      if (s.type === "circle") ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      else ctx.arc(c.x, c.y, r, Number(s.a1), Number(s.a2), !(s.ccw !== false));
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    drawPreviewLabel,
    drawPreviewMetrics,
    drawPreview,
    drawPolylineDraft,
    drawDimDraft,
    drawDimHoveredShape
  };
}
