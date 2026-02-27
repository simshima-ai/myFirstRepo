
function drawArrow(ctx, p, dir, scale, color) {
    const size = 10;
    const headLen = size;
    const headWid = size * 0.35;
    const nx = -dir.y, ny = dir.x;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - dir.x * headLen + nx * headWid, p.y - dir.y * headLen + ny * headWid);
    ctx.lineTo(p.x - dir.x * headLen - nx * headWid, p.y - dir.y * headLen - ny * headWid);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}

function drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive) {
    const nx = g.nx, ny = g.ny;
    const mid = { x: (g.d1.x + g.d2.x) * 0.5, y: (g.d1.y + g.d2.y) * 0.5 };
    const textWorld = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
        ? { x: Number(dim.tx), y: Number(dim.ty) }
        : { x: mid.x + nx * (12 / Math.max(1e-9, state.view.scale)), y: mid.y + ny * (12 / Math.max(1e-9, state.view.scale)) };

    const textPos = worldToScreen(state.view, textWorld);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = selected ? "#b45309" : (groupActive ? "#1d4ed8" : "#0f172a");
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (dim.textRotate) {
        ctx.translate(textPos.x, textPos.y);
        ctx.rotate(dim.textRotate * Math.PI / 180);
        ctx.fillText(textVal, 0, 0);
    } else {
        ctx.fillText(textVal, textPos.x, textPos.y);
    }
    ctx.restore();
}

function drawDimensionCommon(ctx, state, dim, geom, selected, groupActive) {
    if (!geom) return;
    const { scale } = state.view;
    const baseStroke = (selected) ? "#f59e0b" : (groupActive ? "#2563eb" : "#0f172a");
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = selected ? 2 : 1.5;

    if (dim.type === 'dim') {
        if (geom.kind === 'circle' || geom.kind === 'arc') {
            // Radial/Diameter
            const c = worldToScreen(state.view, { x: geom.cx, y: geom.cy });
            const p2 = worldToScreen(state.view, { x: dim.x2, y: dim.y2 });
            const label = (geom.kind === 'circle' ? 'Ø ' : 'R ') + geom.len.toFixed(dim.precision);

            ctx.beginPath();
            ctx.moveTo(c.x, c.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();

            drawArrow(ctx, p2, geom.u, scale, baseStroke);

            const textWorld = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
                ? { x: Number(dim.tx), y: Number(dim.ty) }
                : { x: dim.x2 + geom.u.x * (15 / scale), y: dim.y2 + geom.u.y * (15 / scale) };
            const textPos = worldToScreen(state.view, textWorld);

            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = selected ? "#b45309" : "#0f172a";
            ctx.font = "12px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(label, textPos.x, textPos.y);
            ctx.restore();
        } else {
            // Linear
            const p1s = worldToScreen(state.view, { x: geom.x1, y: geom.y1 });
            const p2s = worldToScreen(state.view, { x: geom.x2, y: geom.y2 });
            const d1s = worldToScreen(state.view, geom.d1);
            const d2s = worldToScreen(state.view, geom.d2);

            ctx.beginPath();
            ctx.moveTo(p1s.x, p1s.y); ctx.lineTo(d1s.x, d1s.y);
            ctx.moveTo(p2s.x, p2s.y); ctx.lineTo(d2s.x, d2s.y);
            ctx.moveTo(d1s.x, d1s.y); ctx.lineTo(d2s.x, d2s.y);
            ctx.stroke();

            drawArrow(ctx, d1s, { x: -geom.tx, y: -geom.ty }, scale, baseStroke);
            drawArrow(ctx, d2s, { x: geom.tx, y: geom.ty }, scale, baseStroke);

            const textVal = geom.len.toFixed(dim.precision);
            drawTextLabel(ctx, state, dim, geom, textVal, selected, groupActive);
        }
    } else if (dim.type === 'dimchain') {
        const segs = geom.segments || [];
        segs.forEach((g, i) => {
            const p1s = worldToScreen(state.view, { x: g.x1, y: g.y1 });
            const p2s = worldToScreen(state.view, { x: g.x2, y: g.y2 });
            const d1s = worldToScreen(state.view, g.d1);
            const d2s = worldToScreen(state.view, g.d2);

            ctx.beginPath();
            ctx.moveTo(p1s.x, p1s.y); ctx.lineTo(d1s.x, d1s.y);
            if (i === segs.length - 1) {
                ctx.moveTo(p2s.x, p2s.y); ctx.lineTo(d2s.x, d2s.y);
            }
            ctx.moveTo(d1s.x, d1s.y); ctx.lineTo(d2s.x, d2s.y);
            ctx.stroke();

            drawArrow(ctx, d1s, { x: -g.tx, y: -g.ty }, scale, baseStroke);
            drawArrow(ctx, d2s, { x: g.tx, y: g.ty }, scale, baseStroke);

            const textVal = g.len.toFixed(dim.precision);
            drawTextLabel(ctx, state, dim, g, textVal, selected, groupActive);
        });
    } else if (dim.type === 'dimangle') {
        // TODO: Angle rendering logic
    }
}
