export function createRenderHandlesOps(deps) {
  const {
    worldToScreen,
    isLayerVisible,
    isVisibleByCurrentLayerFilter,
    getDimChainGeometry,
    getDimAngleGeometry,
    getCircleDimGeometry,
    circleDimHasCenterFollowAttribute,
    dimMmToWorld,
    dimPtToWorld,
  } = deps;

  function drawVertexHandles(ctx, state) {
    if (state.tool !== "vertex") return;
    const filterShapeId = state.vertexEdit?.filterShapeId != null ? Number(state.vertexEdit.filterShapeId) : null;
    const active = state.vertexEdit?.activeVertex || null;
    const selectedSet = new Set(((state.vertexEdit?.selectedVertices) || []).map((v) => `${Number(v.shapeId)}:${v.key}`));
    ctx.save();
    for (const s of (state.shapes || [])) {
      if (!isLayerVisible(state, s.layerId)) continue;
      if (!isVisibleByCurrentLayerFilter(state, s)) continue;
      if (filterShapeId !== null && Number(s.id) !== filterShapeId) continue;
      let pts = null;
      if (s.type === "line" || s.type === "rect") {
        pts = [
          { key: "p1", x: s.x1, y: s.y1 },
          { key: "p2", x: s.x2, y: s.y2 },
        ];
      } else if (s.type === "arc") {
        const cx = Number(s.cx);
        const cy = Number(s.cy);
        const r = Number(s.r);
        const a1 = Number(s.a1);
        const a2 = Number(s.a2);
        if ([cx, cy, r, a1, a2].every(Number.isFinite)) {
          pts = [
            { key: "a1", x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r },
            { key: "a2", x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r },
          ];
        }
      } else if (s.type === "bspline" && Array.isArray(s.controlPoints)) {
        pts = s.controlPoints
          .map((cp, idx) => ({ key: `cp${idx}`, x: Number(cp?.x), y: Number(cp?.y) }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (pts.length >= 2) {
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = "rgba(100,116,139,0.75)";
          ctx.beginPath();
          const p0 = worldToScreen(state.view, pts[0]);
          ctx.moveTo(p0.x, p0.y);
          for (let i = 1; i < pts.length; i += 1) {
            const sp = worldToScreen(state.view, pts[i]);
            ctx.lineTo(sp.x, sp.y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
      if (!pts) continue;
      for (const p of pts) {
        const sp = worldToScreen(state.view, p);
        const isActive = active && Number(active.shapeId) === Number(s.id) && active.key === p.key;
        const isSelected = selectedSet.has(`${Number(s.id)}:${p.key}`);
        const isHovered = state.input.hover?.vertex && Number(state.input.hover.vertex.shapeId) === Number(s.id) && state.input.hover.vertex.key === p.key;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, (isActive || isHovered) ? 6 : (isSelected ? 5.5 : 4.5), 0, Math.PI * 2);
        ctx.fillStyle = (isActive || isSelected) ? "#f59e0b" : (isHovered ? "#dbeafe" : "#ffffff");
        ctx.strokeStyle = (isActive || isSelected) ? "#b45309" : (isHovered ? "#2563eb" : "#0ea5e9");
        ctx.lineWidth = (isActive || isSelected || isHovered) ? 2 : 1.5;
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawDimEditHandles(ctx, state) {
    if (state.tool !== "select") return;
    const selectedIds = new Set((state.selection?.ids || []).map(Number));
    if (!selectedIds.size) return;
    ctx.save();
    for (const s of (state.shapes || [])) {
      if (!selectedIds.has(Number(s.id))) continue;
      if (s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle") continue;
      if (!isLayerVisible(state, s.layerId)) continue;
      if (!isVisibleByCurrentLayerFilter(state, s)) continue;

      if (s.type === "dimchain") {
        if (!Array.isArray(s.points) || s.points.length < 2) continue;
        const geom = getDimChainGeometry(s);
        ctx.lineWidth = 1.5;
        for (const pt of s.points) {
          const ps = worldToScreen(state.view, pt);
          ctx.beginPath();
          ctx.arc(ps.x, ps.y, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = "#fee2e2";
          ctx.strokeStyle = "#dc2626";
          ctx.fill();
          ctx.stroke();
        }
        if (geom && Array.isArray(geom.dimPoints)) {
          for (const dpt of geom.dimPoints) {
            const ds = worldToScreen(state.view, dpt);
            ctx.beginPath();
            ctx.arc(ds.x, ds.y, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = "#ccfbf1";
            ctx.strokeStyle = "#0f766e";
            ctx.fill();
            ctx.stroke();
          }
        }
        const pp = worldToScreen(state.view, { x: Number(s.px), y: Number(s.py) });
        ctx.beginPath();
        ctx.moveTo(pp.x, pp.y - 7);
        ctx.lineTo(pp.x + 7, pp.y);
        ctx.lineTo(pp.x, pp.y + 7);
        ctx.lineTo(pp.x - 7, pp.y);
        ctx.closePath();
        ctx.fillStyle = "#fde68a";
        ctx.strokeStyle = "#d97706";
        ctx.fill();
        ctx.stroke();
        if (geom && Array.isArray(geom.dimPoints) && geom.dimPoints.length >= 2) {
          const d0 = geom.dimPoints[0];
          const dN = geom.dimPoints[geom.dimPoints.length - 1];
          const mc = worldToScreen(state.view, { x: (d0.x + dN.x) * 0.5, y: (d0.y + dN.y) * 0.5 });
          ctx.beginPath();
          ctx.rect(mc.x - 5, mc.y - 5, 10, 10);
          ctx.fillStyle = "#bfdbfe";
          ctx.strokeStyle = "#2563eb";
          ctx.fill();
          ctx.stroke();
        }
        if (geom && Array.isArray(geom.dimPoints) && Array.isArray(s.points) && geom.dimPoints.length === s.points.length) {
          const extOffWorld = dimMmToWorld(state, Number(s.extOffset ?? 2) || 0);
          const defaultVisWorld = Math.max(0, Math.abs(Number(geom.off) || 0) - extOffWorld);
          const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
          const sign = Math.sign(Number(geom.off) || 0) || 1;
          const enx = Number(geom.nx) * sign;
          const eny = Number(geom.ny) * sign;
          const drawDiamond = (p) => {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 6);
            ctx.lineTo(p.x + 6, p.y);
            ctx.lineTo(p.x, p.y + 6);
            ctx.lineTo(p.x - 6, p.y);
            ctx.closePath();
            ctx.fillStyle = "#e9d5ff";
            ctx.strokeStyle = "#7c3aed";
            ctx.fill();
            ctx.stroke();
          };
          for (let i = 0; i < geom.dimPoints.length; i += 1) {
            const dpt = geom.dimPoints[i];
            const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVisWorld;
            const hp = worldToScreen(state.view, { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis });
            drawDiamond(hp);
          }
        }
        if (geom && geom.chainMid) {
          const fontPt = Math.max(1, Number(s.fontSize ?? 12) || 12);
          const defaultOff = dimPtToWorld(state, fontPt);
          const txtWorld = (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
            ? { x: Number(s.tx), y: Number(s.ty) }
            : { x: Number(geom.chainMid.x) + Number(geom.nx) * defaultOff, y: Number(geom.chainMid.y) + Number(geom.ny) * defaultOff };
          const ts = worldToScreen(state.view, txtWorld);
          ctx.beginPath();
          ctx.rect(ts.x - 5, ts.y - 5, 10, 10);
          ctx.fillStyle = "#93c5fd";
          ctx.strokeStyle = "#1d4ed8";
          ctx.fill();
          ctx.stroke();
        }
        continue;
      }

      if (s.type === "dimangle") {
        const g = getDimAngleGeometry(s, state.shapes);
        if (!g) continue;
        const ts = worldToScreen(state.view, { x: Number(g.tx), y: Number(g.ty) });
        ctx.beginPath();
        ctx.rect(ts.x - 5, ts.y - 5, 10, 10);
        ctx.fillStyle = "#93c5fd";
        ctx.strokeStyle = "#1d4ed8";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        const rs = worldToScreen(state.view, { x: Number(g.cx) + Number(g.ux) * Number(g.r), y: Number(g.cy) + Number(g.uy) * Number(g.r) });
        ctx.beginPath();
        ctx.moveTo(rs.x, rs.y - 7);
        ctx.lineTo(rs.x + 7, rs.y);
        ctx.lineTo(rs.x, rs.y + 7);
        ctx.lineTo(rs.x - 7, rs.y);
        ctx.closePath();
        ctx.fillStyle = "#fde68a";
        ctx.strokeStyle = "#d97706";
        ctx.fill();
        ctx.stroke();
        continue;
      }

      const p1s = worldToScreen(state.view, { x: Number(s.x1), y: Number(s.y1) });
      const p2s = worldToScreen(state.view, { x: Number(s.x2), y: Number(s.y2) });
      ctx.beginPath();
      ctx.arc(p1s.x, p1s.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#dcfce7";
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p2s.x, p2s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const x1 = Number(s.x1);
      const y1 = Number(s.y1);
      const x2 = Number(s.x2);
      const y2 = Number(s.y2);
      const vx = x2 - x1;
      const vy = y2 - y1;
      const len = Math.hypot(vx, vy);
      if (len > 1e-9) {
        const tx = vx / len;
        const ty = vy / len;
        const nx = -ty;
        const ny = tx;
        const off = (Number(s.px) - x1) * nx + (Number(s.py) - y1) * ny;
        const d1 = { x: x1 + nx * off, y: y1 + ny * off };
        const d2 = { x: x2 + nx * off, y: y2 + ny * off };
        const mid = { x: (d1.x + d2.x) * 0.5, y: (d1.y + d2.y) * 0.5 };
        const placeW = { x: (mid.x + d2.x) * 0.5, y: (mid.y + d2.y) * 0.5 };
        const p = worldToScreen(state.view, placeW);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 7);
        ctx.lineTo(p.x + 7, p.y);
        ctx.lineTo(p.x, p.y + 7);
        ctx.lineTo(p.x - 7, p.y);
        ctx.closePath();
        ctx.fillStyle = "#fde68a";
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        const hasRel = Number.isFinite(Number(s.tdx)) && Number.isFinite(Number(s.tdy));
        const textWorld = hasRel
          ? { x: mid.x + Number(s.tdx), y: mid.y + Number(s.tdy) }
          : (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
            ? { x: Number(s.tx), y: Number(s.ty) }
            : { x: mid.x + nx * (12 / Math.max(1e-9, state.view.scale)), y: mid.y + ny * (12 / Math.max(1e-9, state.view.scale)) };
        const textHandleOff = 14 / Math.max(1e-9, state.view.scale);
        const tw = { x: Number(textWorld.x) + Number(nx) * textHandleOff, y: Number(textWorld.y) + Number(ny) * textHandleOff };
        const tp = worldToScreen(state.view, tw);
        ctx.beginPath();
        ctx.rect(tp.x - 6, tp.y - 6, 12, 12);
        ctx.fillStyle = "#fecaca";
        ctx.strokeStyle = "#dc2626";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        const mp = worldToScreen(state.view, mid);
        ctx.beginPath();
        ctx.rect(mp.x - 5, mp.y - 5, 10, 10);
        ctx.fillStyle = "#dbeafe";
        ctx.strokeStyle = "#1d4ed8";
        ctx.fill();
        ctx.stroke();
        const extOffWorld = dimMmToWorld(state, Number(s.extOffset ?? 2) || 0);
        const defaultVisWorld = Math.max(0, Math.abs(Number(off) || 0) - extOffWorld);
        const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
        const sign = Math.sign(Number(off) || 0) || 1;
        const enx = Number(nx) * sign;
        const eny = Number(ny) * sign;
        const vis1 = Number.isFinite(Number(visLens[0])) ? Math.max(0, Number(visLens[0])) : defaultVisWorld;
        const vis2 = Number.isFinite(Number(visLens[1])) ? Math.max(0, Number(visLens[1])) : defaultVisWorld;
        const h1 = worldToScreen(state.view, { x: Number(d1.x) - enx * vis1, y: Number(d1.y) - eny * vis1 });
        const h2 = worldToScreen(state.view, { x: Number(d2.x) - enx * vis2, y: Number(d2.y) - eny * vis2 });
        const drawDiamond = (hp) => {
          ctx.beginPath();
          ctx.moveTo(hp.x, hp.y - 6);
          ctx.lineTo(hp.x + 6, hp.y);
          ctx.lineTo(hp.x, hp.y + 6);
          ctx.lineTo(hp.x - 6, hp.y);
          ctx.closePath();
          ctx.fillStyle = "#e9d5ff";
          ctx.strokeStyle = "#7c3aed";
          ctx.fill();
          ctx.stroke();
        };
        drawDiamond(h1);
        drawDiamond(h2);
      }
    }

    for (const s of (state.shapes || [])) {
      if (!selectedIds.has(Number(s.id))) continue;
      if (s.type !== "circleDim") continue;
      const geom = getCircleDimGeometry(s, state.shapes);
      if (!geom) continue;
      const pArcS = worldToScreen(state.view, { x: geom.cx + Math.cos(geom.ang) * geom.r, y: geom.cy + Math.sin(geom.ang) * geom.r });
      ctx.beginPath();
      ctx.arc(pArcS.x, pArcS.y, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#dcfce7";
      ctx.strokeStyle = "#16a34a";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
      if (circleDimHasCenterFollowAttribute(s)) {
        const cts = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
        ctx.beginPath();
        ctx.arc(cts.x, cts.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = "#e0e7ff";
        ctx.strokeStyle = "#4f46e5";
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cts.x - 6, cts.y);
        ctx.lineTo(cts.x + 6, cts.y);
        ctx.moveTo(cts.x, cts.y - 6);
        ctx.lineTo(cts.x, cts.y + 6);
        ctx.stroke();
      }
      const p1s = worldToScreen(state.view, geom.p1);
      ctx.beginPath();
      ctx.arc(p1s.x, p1s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const p2s = worldToScreen(state.view, geom.p2);
      ctx.beginPath();
      ctx.arc(p2s.x, p2s.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const pts = worldToScreen(state.view, { x: geom.tx, y: geom.ty });
      ctx.beginPath();
      ctx.moveTo(pts.x, pts.y - 7);
      ctx.lineTo(pts.x + 7, pts.y);
      ctx.lineTo(pts.x, pts.y + 7);
      ctx.lineTo(pts.x - 7, pts.y);
      ctx.closePath();
      ctx.fillStyle = "#fde68a";
      ctx.strokeStyle = "#d97706";
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawImageScaleHandles(ctx, state) {
    if (String(state.tool || "") !== "select") return;
    const selectedIds = new Set((state.selection?.ids || []).map(Number));
    if (!selectedIds.size) return;
    const images = (state.shapes || []).filter((s) => selectedIds.has(Number(s.id)) && String(s.type || "") === "image");
    if (!images.length) return;
    const handleHalf = 4.5;
    for (const s of images) {
      if (!isLayerVisible(state, s.layerId)) continue;
      if (!isVisibleByCurrentLayerFilter(state, s)) continue;
      if (!!s.lockTransform) continue;
      const x = Number(s.x);
      const y = Number(s.y);
      const w = Math.max(1e-9, Number(s.width) || 0);
      const h = Math.max(1e-9, Number(s.height) || 0);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !(w > 0) || !(h > 0)) continue;
      const cx = x + w * 0.5;
      const cy = y + h * 0.5;
      const rotDeg = Number(s.rotationDeg) || 0;
      const rotate = (px, py) => {
        const r = (rotDeg * Math.PI) / 180;
        const dx = px - cx;
        const dy = py - cy;
        return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
      };
      const tl = rotate(x, y);
      const br = rotate(x + w, y + h);
      const pTl = worldToScreen(state.view, tl);
      const pBr = worldToScreen(state.view, br);
      ctx.save();
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#1d4ed8";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.rect(pTl.x - handleHalf, pTl.y - handleHalf, handleHalf * 2, handleHalf * 2);
      ctx.rect(pBr.x - handleHalf, pBr.y - handleHalf, handleHalf * 2, handleHalf * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  return {
    drawVertexHandles,
    drawDimEditHandles,
    drawImageScaleHandles,
  };
}
