export function createRenderDoubleLineOverlayOps(deps) {
  const { worldToScreen } = deps;

  function drawPreviewLineCollection(ctx, state, lines, color, dash, lineWidth) {
    const arr = Array.isArray(lines) ? lines : [];
    if (!arr.length) return;
    ctx.save();
    ctx.strokeStyle = String(color || "#38bdf8");
    ctx.lineWidth = Number.isFinite(Number(lineWidth)) ? Number(lineWidth) : 1.2;
    ctx.setLineDash(Array.isArray(dash) ? dash : []);
    for (const o of arr) {
      if (!o) continue;
      const t = String(o.type || "line");
      if (t === "circle") {
        const c = worldToScreen(state.view, { x: Number(o.cx), y: Number(o.cy) });
        const rr = Math.max(0, Number(o.r) * state.view.scale);
        ctx.beginPath();
        ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      if (t === "arc") {
        const c = worldToScreen(state.view, { x: Number(o.cx), y: Number(o.cy) });
        const rr = Math.max(0, Number(o.r) * state.view.scale);
        const a1 = Number(o.a1) || 0;
        const a2 = Number(o.a2) || 0;
        const ccw = !!o.ccw;
        ctx.beginPath();
        ctx.arc(c.x, c.y, rr, a1, a2, !ccw);
        ctx.stroke();
        continue;
      }
      const x1 = Number.isFinite(Number(o.fullX1)) ? Number(o.fullX1) : Number(o.x1);
      const y1 = Number.isFinite(Number(o.fullY1)) ? Number(o.fullY1) : Number(o.y1);
      const x2 = Number.isFinite(Number(o.fullX2)) ? Number(o.fullX2) : Number(o.x2);
      const y2 = Number.isFinite(Number(o.fullY2)) ? Number(o.fullY2) : Number(o.y2);
      const p1 = worldToScreen(state.view, { x: x1, y: y1 });
      const p2 = worldToScreen(state.view, { x: x2, y: y2 });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDoubleLinePreview(ctx, state) {
    if (!state.dlinePreview || state.tool !== "doubleline") return;
    if (state.dlineTrimPending) return;
    drawPreviewLineCollection(ctx, state, state.dlinePreview, "#ef4444", [6, 4], 1.0);
    const dbg = Array.isArray(state?.dlineDebugMarkers) ? state.dlineDebugMarkers : [];
    if (dbg.length) {
      ctx.save();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.1;
      for (const m of dbg) {
        if (!m) continue;
        const mt = String(m.type || "");
        ctx.strokeStyle = String(m.color || "#16a34a");
        if (mt === "circle") {
          const c = worldToScreen(state.view, { x: Number(m.cx), y: Number(m.cy) });
          const rr = Math.max(1.5, Number(m.r) * state.view.scale);
          ctx.beginPath();
          ctx.arc(c.x, c.y, rr, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        if (mt === "cross") {
          const c = worldToScreen(state.view, { x: Number(m.x), y: Number(m.y) });
          const half = Math.max(2, Number(m.halfPx) || 2);
          ctx.beginPath();
          ctx.moveTo(c.x - half, c.y - half);
          ctx.lineTo(c.x + half, c.y + half);
          ctx.moveTo(c.x - half, c.y + half);
          ctx.lineTo(c.x + half, c.y - half);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawDoubleLineConnectedPreviewDebug(ctx, state) {
    if (state.tool !== "doubleline") return;
    if (!state?.ui?.debugDoubleLineConnect) return;
    const connected = Array.isArray(state?.dlineConnectedPreviewDebug) ? state.dlineConnectedPreviewDebug : [];
    if (!connected.length) return;
    drawPreviewLineCollection(ctx, state, connected, "#22c55e", [3, 3], 1.4);
  }

  function drawDoubleLineTrimCandidates(ctx, state) {
    if (state.tool !== "doubleline" || !state.dlineTrimPending) return;
    const candidates = Array.isArray(state.dlineTrimCandidates) ? state.dlineTrimCandidates : [];
    if (!candidates.length) return;
    ctx.save();
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.0;
    ctx.setLineDash([8, 4]);
    for (const o of candidates) {
      if (!o || o.type !== "line") continue;
      const p1 = worldToScreen(state.view, { x: Number(o.x1), y: Number(o.y1) });
      const p2 = worldToScreen(state.view, { x: Number(o.x2), y: Number(o.y2) });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDoubleLineTrimIntersections(ctx, state) {
    const points = Array.isArray(state.dlineTrimIntersections) ? state.dlineTrimIntersections : [];
    if (!points.length) return;
    ctx.save();
    ctx.fillStyle = "#facc15";
    ctx.strokeStyle = "#ca8a04";
    ctx.lineWidth = 1.2;
    for (const p of points) {
      const s = worldToScreen(state.view, { x: Number(p.x), y: Number(p.y) });
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDoubleLineConnectDebug(ctx, state) {
    if (state.tool !== "doubleline") return;
    if (!state?.ui?.debugDoubleLineConnect) return;
    const dbg = state?.dlineConnectDebug;
    if (!dbg || !Array.isArray(dbg.markers)) return;
    const markerById = new Map();
    for (const m of dbg.markers) {
      const i = Number(m?.i);
      if (!Number.isFinite(i)) continue;
      markerById.set(i, m);
    }
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#22c55e";
    for (const e of (dbg.edges || [])) {
      const a = markerById.get(Number(e?.u));
      const b = markerById.get(Number(e?.v));
      if (!a || !b) continue;
      const p1 = worldToScreen(state.view, { x: Number(a.x), y: Number(a.y) });
      const p2 = worldToScreen(state.view, { x: Number(b.x), y: Number(b.y) });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.font = "10px monospace";
    ctx.textBaseline = "top";
    for (const m of dbg.markers) {
      const x = Number(m?.x), y = Number(m?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const s = worldToScreen(state.view, { x, y });
      const label = `#${Number(m?.i)}`;
      ctx.fillStyle = "#111827";
      ctx.fillText(label, s.x + 5, s.y - 14);
      let yoff = 0;
      for (const lr of (m?.lanes || [])) {
        const sid = Number(lr?.sid);
        const rj = lr?.reject || null;
        const p = Number(rj?.parallel || 0);
        const c = Number(rj?.cross || 0);
        const ii = Number(rj?.intermediate || 0);
        const txt = `sid:${sid} P${p} C${c} I${ii}`;
        ctx.fillStyle = "#334155";
        ctx.fillText(txt, s.x + 5, s.y + yoff);
        yoff += 10;
      }
      const chosen = Array.isArray(m?.chosen) ? m.chosen.filter((v) => Number.isFinite(Number(v))).map((v) => Number(v)) : [];
      if (chosen.length) {
        ctx.fillStyle = "#065f46";
        ctx.fillText(`to:${chosen.join(",")}`, s.x + 5, s.y + yoff);
      }
    }
    ctx.restore();
  }

  return {
    drawDoubleLinePreview,
    drawDoubleLineConnectedPreviewDebug,
    drawDoubleLineTrimCandidates,
    drawDoubleLineTrimIntersections,
    drawDoubleLineConnectDebug,
  };
}