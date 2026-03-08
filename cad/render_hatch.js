export function createRenderHatchOps(deps) {
  const {
    worldToScreen,
    buildHatchLoopsFromBoundaryIds,
    getHatchPitchWorld,
    getHatchLineShiftWorld,
    getHatchPaddingWorld,
    getHatchDashWorld,
    getHatchGapWorld,
  } = deps;

  function appendHatchLoopPathToContext(ctx, state, loop) {
    if (!loop || !Array.isArray(loop.steps) || loop.steps.length === 0) return;
    const step0 = loop.steps[0];
    if (step0.kind === "circle") {
      const c = worldToScreen(state.view, { x: step0.cx, y: step0.cy });
      const r = step0.r * state.view.scale;
      ctx.moveTo(c.x + r, c.y);
      ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      ctx.closePath();
      return;
    }

    const getLoopPoint = (nodeIdx) => {
      for (const st of loop.steps) {
        const e = st.edge;
        if (!e) continue;
        if (nodeIdx === e.n1) {
          if (e.type === "line") return { x: e.s.x1, y: e.s.y1 };
          if (e.type === "arc") return { x: e.s.cx + Math.cos(e.s.a1) * e.s.r, y: e.s.cy + Math.sin(e.s.a1) * e.s.r };
        }
        if (nodeIdx === e.n2) {
          if (e.type === "line") return { x: e.s.x2, y: e.s.y2 };
          if (e.type === "arc") return { x: e.s.cx + Math.cos(e.s.a2) * e.s.r, y: e.s.cy + Math.sin(e.s.a2) * e.s.r };
        }
      }
      return null;
    };

    const startWorld = getLoopPoint(step0.from);
    if (!startWorld) return;
    const start = worldToScreen(state.view, startWorld);
    ctx.moveTo(start.x, start.y);

    for (const st of loop.steps) {
      const e = st.edge;
      if (!e) continue;
      const pToWorld = getLoopPoint(st.to);
      if (!pToWorld) continue;

      if (e.type === "line") {
        const p = worldToScreen(state.view, pToWorld);
        ctx.lineTo(p.x, p.y);
      } else if (e.type === "arc") {
        const c = worldToScreen(state.view, { x: e.s.cx, y: e.s.cy });
        const r = e.s.r * state.view.scale;
        const ccw = e.s.ccw !== false;
        const forward = st.from === e.n1 && st.to === e.n2;
        if (forward) {
          ctx.arc(c.x, c.y, r, Number(e.s.a1), Number(e.s.a2), !ccw);
        } else {
          ctx.arc(c.x, c.y, r, Number(e.s.a2), Number(e.s.a1), ccw);
        }
      }
    }
    ctx.closePath();
  }

  function drawHatchFill(ctx, state, s) {
    const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, s.boundaryIds || [], state.view.scale);
    if (!parsed.ok || !parsed.loops || parsed.loops.length === 0) return;

    const pitch = getHatchPitchWorld(state, s);
    const ang = (Number(s.hatchAngleDeg ?? s.angleDeg ?? state.hatchSettings?.angleDeg) || 45) * (Math.PI / 180);
    const pattern = s.hatchPattern || s.pattern || state.hatchSettings?.pattern || "single";
    const crossAng = (Number(s.hatchCrossAngleDeg ?? s.crossAngleDeg ?? state.hatchSettings?.crossAngleDeg) || 90) * (Math.PI / 180);
    const lineShift = getHatchLineShiftWorld(state, s);
    const padding = getHatchPaddingWorld(state, s);
    const lineType = s.lineType || state.hatchSettings?.lineType || "solid";
    const lineColor = String(s.lineColor ?? state.hatchSettings?.lineColor ?? "#0f172a");
    const dashSize = getHatchDashWorld(state, s) * state.view.scale;
    const gapSize = getHatchGapWorld(state, s) * state.view.scale;
    const fillEnabled = !!(s.fillEnabled ?? state.hatchSettings?.fillEnabled);
    const fillColor = String(s.fillColor ?? state.hatchSettings?.fillColor ?? "#dbeafe");

    const b = parsed.bounds;
    const hatchOrigin = { x: (b.minX + b.maxX) * 0.5, y: (b.minY + b.maxY) * 0.5 };
    const corners = [
      { x: b.minX, y: b.minY }, { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY }, { x: b.minX, y: b.maxY },
    ];

    ctx.save();
    ctx.strokeStyle = /^#[0-9a-fA-F]{6}$/.test(lineColor) ? lineColor : "#0f172a";
    if (fillEnabled) {
      ctx.beginPath();
      for (const loop of parsed.loops) {
        appendHatchLoopPathToContext(ctx, state, loop);
      }
      ctx.fillStyle = /^#[0-9a-fA-F]{6}$/.test(fillColor) ? fillColor : "#dbeafe";
      ctx.fill("evenodd");
    }

    if (lineType === "dashed") {
      ctx.setLineDash([dashSize, gapSize]);
    } else if (lineType === "dotted") {
      ctx.setLineDash([1, gapSize]);
    } else if (lineType === "dashdot") {
      ctx.setLineDash([dashSize, gapSize, 1, gapSize]);
    } else if (lineType === "longdash") {
      ctx.setLineDash([dashSize * 1.8, gapSize]);
    } else if (lineType === "center") {
      ctx.setLineDash([dashSize * 1.4, gapSize, 1, gapSize]);
    } else if (lineType === "hidden") {
      ctx.setLineDash([dashSize * 0.7, gapSize * 0.9]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    for (const loop of parsed.loops) {
      appendHatchLoopPathToContext(ctx, state, loop);
    }
    ctx.clip("evenodd");

    const drawFamily = (angleRad) => {
      const u = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
      const n = { x: -u.y, y: u.x };
      let nMin = Infinity;
      let nMax = -Infinity;
      let uMin = Infinity;
      let uMax = -Infinity;
      for (const p of corners) {
        const rx = p.x - hatchOrigin.x;
        const ry = p.y - hatchOrigin.y;
        const pn = rx * n.x + ry * n.y;
        const pu = rx * u.x + ry * u.y;
        nMin = Math.min(nMin, pn);
        nMax = Math.max(nMax, pn);
        uMin = Math.min(uMin, pu);
        uMax = Math.max(uMax, pu);
      }

      const lineSpan = (Math.max(Math.abs(uMin), Math.abs(uMax)) * 2 + pitch) * 1.5;
      const startN = Math.floor((nMin - padding - pitch * 0.1) / pitch) * pitch;
      const endN = nMax + padding + pitch * 0.1;

      let lineIndex = 0;
      let safetyCounter = 0;
      for (let offN = startN; offN <= endN && safetyCounter < 5000; offN += pitch, lineIndex += 1, safetyCounter += 1) {
        const shiftU = (lineIndex % 2 === 1) ? lineShift : 0;
        const cp = {
          x: hatchOrigin.x + n.x * offN + u.x * shiftU,
          y: hatchOrigin.y + n.y * offN + u.y * shiftU,
        };
        const p1s = worldToScreen(state.view, { x: cp.x - u.x * lineSpan, y: cp.y - u.y * lineSpan });
        const p2s = worldToScreen(state.view, { x: cp.x + u.x * lineSpan, y: cp.y + u.y * lineSpan });
        ctx.beginPath();
        ctx.moveTo(p1s.x, p1s.y);
        ctx.lineTo(p2s.x, p2s.y);
        ctx.stroke();
      }
    };

    drawFamily(ang);
    if (pattern === "cross") drawFamily(ang + crossAng);
    ctx.restore();
  }

  return {
    drawHatchFill,
  };
}
