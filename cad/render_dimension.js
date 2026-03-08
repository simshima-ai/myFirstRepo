import { worldToScreen, mmPerUnit } from "./geom.js";

export function dimWorldPerMm(state) {
  const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
  const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
  return pageScale / Math.max(1e-9, unitMm);
}

export function dimMmToWorld(state, mm) {
  return Math.max(0, Number(mm) || 0) * dimWorldPerMm(state);
}

export function dimPtToWorld(state, pt) {
  const mm = Math.max(0, Number(pt) || 0) * (25.4 / 72);
  return dimMmToWorld(state, mm);
}

export function dimWorldToScreenPx(state, worldLen) {
  return Math.max(0, Number(worldLen) || 0) * Math.max(1e-9, state.view.scale || 1);
}

function getDimRenderMetrics(state, dim) {
  const fontPt = Math.max(1, Number(dim.fontSize ?? 12) || 12);
  const arrowPt = Math.max(1, Number(dim.dimArrowSizePt ?? 10) || 10);
  const fontPx = Math.max(1, dimWorldToScreenPx(state, dimPtToWorld(state, fontPt)));
  const arrowPx = Math.max(1, dimWorldToScreenPx(state, dimPtToWorld(state, arrowPt)));
  const extOffPx = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.extOffset ?? 2) || 0));
  const extOverPx = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.extOver ?? 2) || 0));
  return { fontPx, arrowPx, extOffPx, extOverPx };
}

function drawArrow(ctx, p, dir, _scale, color, type = "open", sizePt = 10) {
  const headLen = sizePt;
  const headWid = sizePt * 0.35;
  const nx = -dir.y;
  const ny = dir.x;
  const bx = p.x - dir.x * headLen;
  const by = p.y - dir.y * headLen;

  ctx.save();
  if (type === "circle" || type === "circle_filled") {
    const rr = Math.max(1, headLen * 0.45);
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    ctx.fillStyle = type === "circle_filled" ? color : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
  } else if (type === "closed") {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
    ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.stroke();
  } else if (type === "hollow") {
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = Math.max(2, (Number(ctx.lineWidth) || 1) + 1);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
    ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
    ctx.closePath();
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
    ctx.lineTo(p.x, p.y);
    ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
    ctx.stroke();
  }
  ctx.restore();
}

function computeAutoTextAngleDeg(tx, ty) {
  let a = (Math.atan2(ty, tx) * 180) / Math.PI;
  while (a >= 90) a -= 180;
  while (a < -90) a += 180;
  return a;
}

function drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive, normalColor = "#0f172a") {
  const nx = g.nx ?? 0;
  const ny = g.ny ?? 0;
  const dm = getDimRenderMetrics(state, dim);
  const mid = { x: g.d1?.x ?? g.cx ?? 0, y: g.d1?.y ?? g.cy ?? 0 };
  if (g.d1 && g.d2) {
    mid.x = (g.d1.x + g.d2.x) * 0.5;
    mid.y = (g.d1.y + g.d2.y) * 0.5;
  }

  let textWorld;
  if (dim.type === "dim" && Number.isFinite(Number(g.allCtrl?.x)) && Number.isFinite(Number(g.allCtrl?.y))) {
    const hasRel = Number.isFinite(Number(dim.tdx)) && Number.isFinite(Number(dim.tdy));
    textWorld = hasRel
      ? { x: Number(g.allCtrl.x) + Number(dim.tdx), y: Number(g.allCtrl.y) + Number(dim.tdy) }
      : Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))
        ? { x: Number(dim.tx), y: Number(dim.ty) }
        : { x: mid.x + nx * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12), y: mid.y + ny * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12) };
  } else if (dim.type === "dimchain" && Number.isFinite(Number(g.chainMid?.x)) && Number.isFinite(Number(g.chainMid?.y))) {
    const defaultOff = dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12);
    const off = Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))
      ? (Number(dim.tx) - Number(g.chainMid.x)) * nx + (Number(dim.ty) - Number(g.chainMid.y)) * ny
      : defaultOff;
    textWorld = { x: mid.x + nx * off, y: mid.y + ny * off };
  } else if (dim.type === "dimangle" && Number.isFinite(Number(g.tx)) && Number.isFinite(Number(g.ty))) {
    textWorld = { x: Number(g.tx), y: Number(g.ty) };
  } else {
    textWorld = Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))
      ? { x: Number(dim.tx), y: Number(dim.ty) }
      : { x: mid.x + nx * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12), y: mid.y + ny * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12) };
  }

  const textPos = worldToScreen(state.view, textWorld);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = selected ? "#b45309" : groupActive ? "#1d4ed8" : normalColor;
  ctx.font = `${dm.fontPx}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let rotDeg;
  if (dim.textRotate === "auto" || dim.textRotate == null) {
    rotDeg = g.tx != null && g.ty != null ? computeAutoTextAngleDeg(g.tx, g.ty) : 0;
  } else {
    rotDeg = Number(dim.textRotate) || 0;
  }
  const rot = (rotDeg * Math.PI) / 180;
  if (rot) {
    ctx.translate(textPos.x, textPos.y);
    ctx.rotate(rot);
    ctx.fillText(textVal, 0, 0);
  } else {
    ctx.fillText(textVal, textPos.x, textPos.y);
  }
  ctx.restore();
}

export function createRenderDimensionOps(deps) {
  const {
    getGroupColorById,
    getLayerColorById,
    lineWidthMmToScreenPx,
    getShapeLineWidthMm,
  } = deps;

  function drawDimensionCommon(ctx, state, dim, geom, selected, groupActive) {
    if (!geom) return;
    const { scale } = state.view;
    const dm = getDimRenderMetrics(state, dim);
    const layerColorize = !!state.ui?.layerView?.colorize;
    const groupColorize = !!state.ui?.groupView?.colorize;
    const effectiveGroupId = Number.isFinite(Number(dim?.groupId)) ? Number(dim.groupId) : 0;
    const dimColor = typeof dim?.color === "string" && /^#[0-9a-fA-F]{6}$/.test(dim.color) ? dim.color : "#0f172a";
    const normalColor = groupColorize
      ? getGroupColorById(state, effectiveGroupId)
      : layerColorize ? getLayerColorById(state, dim?.layerId) : dimColor;
    const baseStroke = selected ? "#f59e0b" : groupActive ? "#2563eb" : normalColor;
    const dimStrokePx = lineWidthMmToScreenPx(state, getShapeLineWidthMm(state, dim));
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = selected ? Math.max(1, dimStrokePx * 1.15) : dimStrokePx;

    const arrowType = dim.dimArrowType || "open";
    const arrowSize = dm.arrowPx;
    const reverseArrow = String(dim.dimArrowDirection || "normal") === "reverse";

    if (dim.type === "dim") {
      if (geom.kind === "circle" || geom.kind === "arc") {
        const c = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
        const p2 = worldToScreen(state.view, { x: dim.x2, y: dim.y2 });
        const label = (geom.kind === "circle" ? "ﾃ・" : "R ") + geom.len.toFixed(dim.precision ?? 1);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        const dref = reverseArrow ? { x: -geom.u.x, y: -geom.u.y } : geom.u;
        drawArrow(ctx, p2, dref, scale, baseStroke, arrowType, arrowSize);
        const textWorld = Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))
          ? { x: Number(dim.tx), y: Number(dim.ty) }
          : {
              x: dim.x2 + geom.u.x * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12),
              y: dim.y2 + geom.u.y * dimPtToWorld(state, Number(dim.fontSize ?? 12) || 12),
            };
        const textPos = worldToScreen(state.view, textWorld);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = selected ? "#b45309" : normalColor;
        ctx.font = `${dm.fontPx}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, textPos.x, textPos.y);
        ctx.restore();
      } else {
        const d1s = worldToScreen(state.view, geom.d1);
        const d2s = worldToScreen(state.view, geom.d2);
        const extOvr = dm.extOverPx;
        const dimOvr = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
        const sign = Math.sign(geom.off) || 1;
        const enx = geom.nx * sign;
        const eny = geom.ny * sign;
        const extOffWorld = dimMmToWorld(state, Number(dim.extOffset ?? 2) || 0);
        const defaultVisWorld = Math.max(0, Math.abs(Number(geom.off) || 0) - extOffWorld);
        const visLens = Array.isArray(dim.extVisLens) ? dim.extVisLens : [];
        const vis1 = Number.isFinite(Number(visLens[0])) ? Math.max(0, Number(visLens[0])) : defaultVisWorld;
        const vis2 = Number.isFinite(Number(visLens[1])) ? Math.max(0, Number(visLens[1])) : defaultVisWorld;
        const s1 = worldToScreen(state.view, { x: Number(geom.d1.x) - enx * vis1, y: Number(geom.d1.y) - eny * vis1 });
        const s2 = worldToScreen(state.view, { x: Number(geom.d2.x) - enx * vis2, y: Number(geom.d2.y) - eny * vis2 });
        ctx.beginPath();
        ctx.moveTo(s1.x, s1.y);
        ctx.lineTo(d1s.x + extOvr * enx, d1s.y + extOvr * eny);
        ctx.moveTo(s2.x, s2.y);
        ctx.lineTo(d2s.x + extOvr * enx, d2s.y + extOvr * eny);
        ctx.moveTo(d1s.x - geom.tx * dimOvr, d1s.y - geom.ty * dimOvr);
        ctx.lineTo(d2s.x + geom.tx * dimOvr, d2s.y + geom.ty * dimOvr);
        ctx.stroke();
        const d1dir = reverseArrow ? { x: geom.tx, y: geom.ty } : { x: -geom.tx, y: -geom.ty };
        const d2dir = reverseArrow ? { x: -geom.tx, y: -geom.ty } : { x: geom.tx, y: geom.ty };
        drawArrow(ctx, d1s, d1dir, scale, baseStroke, arrowType, arrowSize);
        drawArrow(ctx, d2s, d2dir, scale, baseStroke, arrowType, arrowSize);
        const textVal = geom.len.toFixed(dim.precision ?? 1);
        drawTextLabel(ctx, state, dim, geom, textVal, selected, groupActive, normalColor);
      }
    } else if (dim.type === "circleDim") {
      const g = geom;
      const p1s = worldToScreen(state.view, g.p1);
      const p2s = worldToScreen(state.view, g.p2);
      const c1 = { x: g.cx + g.ux * g.r, y: g.cy + g.uy * g.r };
      const c2 = { x: g.cx - g.ux * g.r, y: g.cy - g.uy * g.r };
      const c1s = worldToScreen(state.view, c1);
      const c2s = worldToScreen(state.view, c2);

      ctx.beginPath();
      ctx.moveTo(p1s.x, p1s.y);
      ctx.lineTo(p2s.x, p2s.y);
      ctx.stroke();

      if (Math.hypot(p1s.x - c1s.x, p1s.y - c1s.y) > 0.5) {
        ctx.beginPath();
        ctx.moveTo(p1s.x, p1s.y);
        ctx.lineTo(c1s.x, c1s.y);
        ctx.stroke();
      }
      const circleArrowSide = dim.circleArrowSide === "inside" ? "inside" : "outside";
      const dir1 = circleArrowSide === "inside" ? { x: -g.ux, y: -g.uy } : { x: g.ux, y: g.uy };
      const d1 = reverseArrow ? { x: -dir1.x, y: -dir1.y } : dir1;
      drawArrow(ctx, c1s, d1, scale, baseStroke, arrowType, arrowSize);
      if (dim.kind === "diameter") {
        if (Math.hypot(p2s.x - c2s.x, p2s.y - c2s.y) > 0.5) {
          ctx.beginPath();
          ctx.moveTo(p2s.x, p2s.y);
          ctx.lineTo(c2s.x, c2s.y);
          ctx.stroke();
        }
        const dir2 = circleArrowSide === "inside" ? { x: g.ux, y: g.uy } : { x: -g.ux, y: -g.uy };
        const d2 = reverseArrow ? { x: -dir2.x, y: -dir2.y } : dir2;
        drawArrow(ctx, c2s, d2, scale, baseStroke, arrowType, arrowSize);
      }

      const value = dim.kind === "diameter" ? g.r * 2 : g.r;
      const label = (dim.kind === "diameter" ? "D " : "R ") + value.toFixed(dim.precision ?? 1);
      const tGeom = { ...g, tx: g.ux, ty: g.uy };
      const tDim = { ...dim, tx: g.tx, ty: g.ty };
      drawTextLabel(ctx, state, tDim, tGeom, label, selected, groupActive, normalColor);
    } else if (dim.type === "dimchain") {
      const segs = geom.segments || [];
      const extOvr = dm.extOverPx;
      const dimOvr = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
      const extOffWorld = dimMmToWorld(state, Number(dim.extOffset ?? 2) || 0);
      const defaultVisWorld = Math.max(0, Math.abs(Number(geom.off) || 0) - extOffWorld);
      const visLens = Array.isArray(dim.extVisLens) ? dim.extVisLens : [];
      const sign = Math.sign(Number(geom.off) || 0) || 1;
      const enx = Number(geom.nx) * sign;
      const eny = Number(geom.ny) * sign;
      if (Array.isArray(geom.dimPoints) && Array.isArray(dim.points) && geom.dimPoints.length === dim.points.length) {
        for (let i = 0; i < geom.dimPoints.length; i += 1) {
          const dpt = geom.dimPoints[i];
          const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVisWorld;
          const startW = { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis };
          const startS = worldToScreen(state.view, startW);
          const dS = worldToScreen(state.view, dpt);
          ctx.beginPath();
          ctx.moveTo(startS.x, startS.y);
          ctx.lineTo(dS.x + extOvr * enx, dS.y + extOvr * eny);
          ctx.stroke();
        }
      }
      segs.forEach((g) => {
        const d1s = worldToScreen(state.view, g.d1);
        const d2s = worldToScreen(state.view, g.d2);
        ctx.beginPath();
        ctx.moveTo(d1s.x - g.tx * dimOvr, d1s.y - g.ty * dimOvr);
        ctx.lineTo(d2s.x + g.tx * dimOvr, d2s.y + g.ty * dimOvr);
        ctx.stroke();
        drawArrow(ctx, d1s, { x: -g.tx, y: -g.ty }, scale, baseStroke, arrowType, arrowSize);
        drawArrow(ctx, d2s, { x: g.tx, y: g.ty }, scale, baseStroke, arrowType, arrowSize);
        const textVal = g.len.toFixed(dim.precision ?? 1);
        drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive, normalColor);
      });
    } else if (dim.type === "dimangle") {
      const c = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
      const rs = geom.r * scale;
      const overPx = dimWorldToScreenPx(state, dimMmToWorld(state, Number(dim.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
      const overAng = rs > 1e-9 ? overPx / rs : 0;
      const a1d = Number(geom.a1) - overAng;
      const a2d = Number(geom.a2) + overAng;
      ctx.beginPath();
      ctx.arc(c.x, c.y, rs, a1d, a2d, false);
      ctx.stroke();
      const p1s = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.a1) * geom.r, y: geom.cy + Math.sin(geom.a1) * geom.r });
      const p2s = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.a2) * geom.r, y: geom.cy + Math.sin(geom.a2) * geom.r });
      const d1 = { x: Math.sin(geom.a1), y: -Math.cos(geom.a1) };
      const d2 = { x: -Math.sin(geom.a2), y: Math.cos(geom.a2) };
      const ad1 = reverseArrow ? { x: -d1.x, y: -d1.y } : d1;
      const ad2 = reverseArrow ? { x: -d2.x, y: -d2.y } : d2;
      drawArrow(ctx, p1s, ad1, scale, baseStroke, arrowType, arrowSize);
      drawArrow(ctx, p2s, ad2, scale, baseStroke, arrowType, arrowSize);
      const textVal = `${((geom.angle * 180) / Math.PI).toFixed(dim.precision ?? 1)}°`;
      drawTextLabel(ctx, state, dim, geom, textVal, selected, groupActive, normalColor);
    }
  }

  return {
    drawDimensionCommon,
  };
}
