import { isLayerVisible } from "./state.js";
import { mmPerUnit, getHatchPitchWorld, getHatchLineShiftWorld, getHatchPaddingWorld, getHatchDashWorld, getHatchGapWorld } from "./geom.js";
import { getDimGeometry, getDimChainGeometry, getDimAngleGeometry, getSpecialDimGeometry, getCircleDimGeometry } from "./dim_geom.js";
import { buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";
export function exportPdf(state, helpers) {
    const { setStatus } = helpers;
    const ps = state.pageSetup;
    const PAGE_SIZES_MM = {
        A4: [297, 210],
        A3: [420, 297],
        A2: [594, 420],
        A1: [841, 594],
    };
    const MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, inch: 25.4 };

    const key = String(ps?.size || "A4");
    const [wMm, hMm] = PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4;
    const isPortrait = String(ps?.orientation || "landscape") === "portrait";
    const mmW = isPortrait ? Math.min(wMm, hMm) : Math.max(wMm, hMm);
    const mmH = isPortrait ? Math.max(wMm, hMm) : Math.min(wMm, hMm);

    const scale = Math.max(0.0001, Number(ps?.scale ?? 1) || 1);
    const unit = String(ps?.unit || "mm");
    const mpU = MM_PER_UNIT[unit] || 1;

    const cadW = mmW * scale / mpU;
    const cadH = mmH * scale / mpU;

    // Target DPI for export (e.g., 300 DPI)
    const dpi = 300;
    const mmToInch = 1 / 25.4;
    const pxW = Math.round(mmW * mmToInch * dpi);
    const pxH = Math.round(mmH * mmToInch * dpi);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = pxW;
    offCanvas.height = pxH;
    const offCtx = offCanvas.getContext("2d");

    // Fill white background
    offCtx.fillStyle = "#ffffff";
    offCtx.fillRect(0, 0, pxW, pxH);

    // We need to render the model onto this canvas. 
    // The render function is in render.js. Let's assume it's available in helpers.
    if (!helpers.render) {
        if (setStatus) setStatus("Error: render function not found in helpers");
        return;
    }

    // Setup view for offscreen rendering
    // Paper is centered at (0,0) in world coordinates.
    // We want the bounding box [-cadW/2, -cadH/2, cadW/2, cadH/2] to fill the canvas [0, 0, pxW, pxH].
    const drawScale = pxW / cadW;
    const offView = {
        scale: drawScale,
        offsetX: pxW / 2,
        offsetY: pxH / 2
    };

    // Create a temporary state for rendering that only contains what's needed
    const pdfState = {
        ...state,
        view: offView,
        grid: { ...state.grid, show: false }, // Hide grid for PDF
        pageSetup: { ...state.pageSetup, showFrame: false }, // Hide frame/crop marks for the PDF image itself
        selection: { ...state.selection, ids: [] }, // Clear selection for PDF
        ui: { ...state.ui, layerView: { ...state.ui.layerView, colorize: false } }
    };

    helpers.render(offCtx, offCanvas, pdfState);

    const dataUrl = offCanvas.toDataURL("image/png");
    const win = window.open("", "_blank");
    if (!win) {
        if (setStatus) setStatus("Please allow popups to export PDF");
        return;
    }

    win.document.write(`
        <html>
        <head>
            <title>PDF Export - ${new Date().toLocaleString()}</title>
            <style>
                body { margin: 0; padding: 0; display: flex; justify-content: center; background: #eee; }
                img { max-width: 100%; height: auto; box-shadow: 0 0 10px rgba(0,0,0,0.2); background: white; }
                @media print {
                    @page { size: ${mmW}mm ${mmH}mm; margin: 0; }
                    body { background: white; }
                    img { width: ${mmW}mm; height: ${mmH}mm; box-shadow: none; }
                }
            </style>
        </head>
        <body>
            <img src="${dataUrl}" />
            <script>
                window.onload = () => {
                    setTimeout(() => {
                        window.print();
                        // window.close(); // Optional: close after printing
                    }, 500);
                };
            </script>
        </body>
        </html>
    `);
    win.document.close();

    if (setStatus) setStatus("PDF Export window opened");
}

export function exportSvg(state, helpers) {
    const { setStatus } = helpers;
    const ps = state.pageSetup;
    const PAGE_SIZES_MM = {
        A4: [297, 210],
        A3: [420, 297],
        A2: [594, 420],
        A1: [841, 594],
    };
    const key = String(ps?.size || "A4");
    const [wMm, hMm] = PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4;
    const isPortrait = String(ps?.orientation || "landscape") === "portrait";
    const mmW = isPortrait ? Math.min(wMm, hMm) : Math.max(wMm, hMm);
    const mmH = isPortrait ? Math.max(wMm, hMm) : Math.min(wMm, hMm);

    const pageScale = Math.max(0.0001, Number(ps?.scale ?? 1) || 1);
    const unit = String(ps?.unit || "mm");
    const unitMm = mmPerUnit(unit);
    const cadW = mmW * pageScale / Math.max(1e-9, unitMm);
    const cadH = mmH * pageScale / Math.max(1e-9, unitMm);

    const dpi = 300;
    const pxW = Math.max(1, Math.round(mmW / 25.4 * dpi));
    const drawScale = pxW / Math.max(1e-9, cadW);

    const fmt = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return "0";
        return Number(n.toFixed(6)).toString();
    };
    const esc = (s) => String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    const dimWorldPerMm = () => pageScale / Math.max(1e-9, unitMm);
    const dimMmToWorld = (mm) => Math.max(0, Number(mm) || 0) * dimWorldPerMm();
    const dimPtToWorld = (pt) => dimMmToWorld(Math.max(0, Number(pt) || 0) * (25.4 / 72));
    const strokeWorld = (px) => Math.max(0.02, Number(px) / Math.max(1e-9, drawScale));
    const normalizeRad = (a) => {
        let r = Number(a) || 0;
        while (r < 0) r += Math.PI * 2;
        while (r >= Math.PI * 2) r -= Math.PI * 2;
        return r;
    };
    const deltaAlong = (a1, a2, ccw) => {
        if (ccw) return normalizeRad(a2 - a1);
        return normalizeRad(a1 - a2);
    };
    const autoTextAngleDeg = (tx, ty) => {
        let a = Math.atan2(ty, tx) * 180 / Math.PI;
        while (a >= 90) a -= 180;
        while (a < -90) a += 180;
        return a;
    };
    const hatchLoopPathData = (loop) => {
        if (!loop || !Array.isArray(loop.steps) || loop.steps.length === 0) return "";
        const step0 = loop.steps[0];
        if (step0.kind === "circle") {
            const cx = Number(step0.cx), cy = Number(step0.cy), r = Math.abs(Number(step0.r) || 0);
            if (!(r > 1e-9)) return "";
            return `M ${fmt(cx + r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx - r)} ${fmt(cy)} A ${fmt(r)} ${fmt(r)} 0 1 0 ${fmt(cx + r)} ${fmt(cy)} Z`;
        }
        const nodePoint = (nodeIdx) => {
            for (const st of loop.steps) {
                const e = st.edge;
                if (!e) continue;
                if (nodeIdx === e.n1) {
                    if (e.type === "line") return { x: Number(e.s.x1), y: Number(e.s.y1) };
                    if (e.type === "arc") return { x: Number(e.s.cx) + Math.cos(Number(e.s.a1)) * Number(e.s.r), y: Number(e.s.cy) + Math.sin(Number(e.s.a1)) * Number(e.s.r) };
                }
                if (nodeIdx === e.n2) {
                    if (e.type === "line") return { x: Number(e.s.x2), y: Number(e.s.y2) };
                    if (e.type === "arc") return { x: Number(e.s.cx) + Math.cos(Number(e.s.a2)) * Number(e.s.r), y: Number(e.s.cy) + Math.sin(Number(e.s.a2)) * Number(e.s.r) };
                }
            }
            return null;
        };
        const start = nodePoint(step0.from);
        if (!start) return "";
        let d = `M ${fmt(start.x)} ${fmt(start.y)}`;
        for (const st of loop.steps) {
            const e = st.edge;
            if (!e) continue;
            const pTo = nodePoint(st.to);
            if (!pTo) continue;
            if (e.type === "line") {
                d += ` L ${fmt(pTo.x)} ${fmt(pTo.y)}`;
            } else if (e.type === "arc") {
                const cx = Number(e.s.cx), cy = Number(e.s.cy), r = Math.abs(Number(e.s.r) || 0);
                const ccw = !!e.s.ccw;
                const forward = st.from === e.n1 && st.to === e.n2;
                const startA = forward ? Number(e.s.a1) : Number(e.s.a2);
                const endA = forward ? Number(e.s.a2) : Number(e.s.a1);
                const dirCcw = forward ? ccw : !ccw;
                const span = deltaAlong(startA, endA, dirCcw);
                const largeArc = span > Math.PI ? 1 : 0;
                const sweep = dirCcw ? 0 : 1;
                d += ` A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweep} ${fmt(pTo.x)} ${fmt(pTo.y)}`;
            }
        }
        d += " Z";
        return d;
    };

    const arrowSvg = (p, dir, sizeWorld, color, arrowType) => {
        const len = Math.max(1e-9, Math.hypot(Number(dir?.x) || 0, Number(dir?.y) || 0));
        const ux = (Number(dir?.x) || 0) / len;
        const uy = (Number(dir?.y) || 0) / len;
        const nx = -uy, ny = ux;
        const headLen = Math.max(1e-9, Number(sizeWorld) || 0);
        const headWid = headLen * 0.35;
        const p1 = { x: Number(p.x) - ux * headLen + nx * headWid, y: Number(p.y) - uy * headLen + ny * headWid };
        const p2 = { x: Number(p.x) - ux * headLen - nx * headWid, y: Number(p.y) - uy * headLen - ny * headWid };
        const b = { x: Number(p.x) - ux * headLen, y: Number(p.y) - uy * headLen };
        if (arrowType === "circle" || arrowType === "circle_filled") {
            const rr = Math.max(1e-9, headLen * 0.45);
            const fill = arrowType === "circle_filled" ? color : "#ffffff";
            return `<circle cx="${fmt(p.x)}" cy="${fmt(p.y)}" r="${fmt(rr)}" fill="${fill}" stroke="${color}" stroke-width="${fmt(strokeWorld(1.5))}"/>`;
        }
        if (arrowType === "closed") {
            return `<polygon points="${fmt(p.x)},${fmt(p.y)} ${fmt(p1.x)},${fmt(p1.y)} ${fmt(p2.x)},${fmt(p2.y)}" fill="${color}" stroke="${color}" stroke-width="${fmt(strokeWorld(1))}"/>`;
        }
        if (arrowType === "hollow") {
            const eraseW = strokeWorld(2.4);
            return [
                `<path d="M ${fmt(p.x)} ${fmt(p.y)} L ${fmt(b.x)} ${fmt(b.y)}" fill="none" stroke="#ffffff" stroke-width="${fmt(eraseW)}" stroke-linecap="round"/>`,
                `<polygon points="${fmt(p.x)},${fmt(p.y)} ${fmt(p1.x)},${fmt(p1.y)} ${fmt(p2.x)},${fmt(p2.y)}" fill="#ffffff" stroke="${color}" stroke-width="${fmt(strokeWorld(1.5))}"/>`
            ].join("");
        }
        return `<path d="M ${fmt(p1.x)} ${fmt(p1.y)} L ${fmt(p.x)} ${fmt(p.y)} L ${fmt(p2.x)} ${fmt(p2.y)}" fill="none" stroke="${color}" stroke-width="${fmt(strokeWorld(1.5))}" stroke-linecap="round"/>`;
    };

    const parts = [];
    parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(mmW)}mm" height="${fmt(mmH)}mm" viewBox="${fmt(-cadW * 0.5)} ${fmt(-cadH * 0.5)} ${fmt(cadW)} ${fmt(cadH)}" version="1.1">`);
    parts.push(`<rect x="${fmt(-cadW * 0.5)}" y="${fmt(-cadH * 0.5)}" width="${fmt(cadW)}" height="${fmt(cadH)}" fill="#ffffff"/>`);
    parts.push(`<g fill="none" stroke="#0f172a" stroke-width="${fmt(strokeWorld(1.5))}" stroke-linecap="round" stroke-linejoin="round">`);

    for (const s of (state.shapes || [])) {
        if (!isLayerVisible(state, s.layerId)) continue;
        if (s.type === "line") {
            parts.push(`<line x1="${fmt(s.x1)}" y1="${fmt(s.y1)}" x2="${fmt(s.x2)}" y2="${fmt(s.y2)}"/>`);
            continue;
        }
        if (s.type === "polyline") {
            const pts = Array.isArray(s.points) ? s.points : [];
            if (pts.length >= 2) {
                const list = pts.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(" ");
                if (s.closed) {
                    parts.push(`<polygon points="${list}"/>`);
                } else {
                    parts.push(`<polyline points="${list}"/>`);
                }
            }
            continue;
        }
        if (s.type === "rect") {
            const x = Math.min(Number(s.x1), Number(s.x2));
            const y = Math.min(Number(s.y1), Number(s.y2));
            const w = Math.abs(Number(s.x2) - Number(s.x1));
            const h = Math.abs(Number(s.y2) - Number(s.y1));
            parts.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}"/>`);
            continue;
        }
        if (s.type === "circle") {
            parts.push(`<circle cx="${fmt(s.cx)}" cy="${fmt(s.cy)}" r="${fmt(Math.abs(Number(s.r) || 0))}"/>`);
            continue;
        }
        if (s.type === "arc") {
            const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
            if (!(r > 1e-9)) continue;
            const a1 = Number(s.a1) || 0;
            const a2 = Number(s.a2) || 0;
            const ccw = s.ccw !== false;
            const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
            const p2 = { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
            const largeArc = deltaAlong(a1, a2, ccw) > Math.PI ? 1 : 0;
            const sweep = ccw ? 1 : 0;
            parts.push(`<path d="M ${fmt(p1.x)} ${fmt(p1.y)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} ${sweep} ${fmt(p2.x)} ${fmt(p2.y)}"/>`);
            continue;
        }
        if (s.type === "position") {
            const x = Number(s.x), y = Number(s.y), size = Math.max(0.1, Number(s.size ?? 20));
            parts.push(`<circle cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(size * 0.28)}"/>`);
            parts.push(`<line x1="${fmt(x - size)}" y1="${fmt(y)}" x2="${fmt(x + size)}" y2="${fmt(y)}"/>`);
            parts.push(`<line x1="${fmt(x)}" y1="${fmt(y - size)}" x2="${fmt(x)}" y2="${fmt(y + size)}"/>`);
            continue;
        }
        if (s.type === "text") {
            const fontPt = Math.max(1, Number(s.textSizePt) || 12);
            const fontWorld = dimPtToWorld(fontPt);
            const fill = String(s.textColor || "#0f172a");
            const rot = Number(s.textRotate) || 0;
            const weight = s.textBold ? "700" : "400";
            const style = s.textItalic ? "italic" : "normal";
            const family = esc(s.textFontFamily || "Yu Gothic UI");
            const txt = esc(s.text || "");
            parts.push(`<text x="${fmt(s.x1)}" y="${fmt(s.y1)}" font-size="${fmt(fontWorld)}" fill="${fill}" font-style="${style}" font-weight="${weight}" font-family="${family}" dominant-baseline="middle" text-anchor="start" transform="rotate(${fmt(rot)} ${fmt(s.x1)} ${fmt(s.y1)})">${txt}</text>`);
            continue;
        }
        if (s.type === "hatch") {
            const parsed = buildHatchLoopsFromBoundaryIds(state.shapes || [], s.boundaryIds || [], Number(state.view?.scale) || 1);
            if (!parsed?.ok || !Array.isArray(parsed.loops) || !parsed.loops.length || !parsed.bounds) continue;
            const clipId = `hclip_${Number(s.id)}`;
            const loopPaths = parsed.loops.map(hatchLoopPathData).filter(Boolean);
            if (!loopPaths.length) continue;
            parts.push(`<defs><clipPath id="${clipId}">`);
            for (const d of loopPaths) parts.push(`<path d="${d}" fill-rule="evenodd"/>`);
            parts.push(`</clipPath></defs>`);

            const pitch = Math.max(1e-9, Number(getHatchPitchWorld(state, s)) || 1);
            const ang = (Number(s.hatchAngleDeg ?? s.angleDeg ?? state.hatchSettings?.angleDeg) || 45) * (Math.PI / 180);
            const pattern = s.hatchPattern || s.pattern || state.hatchSettings?.pattern || "single";
            const crossAng = (Number(s.hatchCrossAngleDeg ?? s.crossAngleDeg ?? state.hatchSettings?.crossAngleDeg) || 90) * (Math.PI / 180);
            const lineShift = Number(getHatchLineShiftWorld(state, s)) || 0;
            const padding = Math.max(0, Number(getHatchPaddingWorld(state, s)) || 0);
            const lineType = s.lineType || state.hatchSettings?.lineType || "solid";
            const lineColor = String(s.lineColor ?? state.hatchSettings?.lineColor ?? "#0f172a");
            const dashW = Number(getHatchDashWorld(state, s)) || 0;
            const gapW = Number(getHatchGapWorld(state, s)) || 0;
            const fillEnabled = !!(s.fillEnabled ?? state.hatchSettings?.fillEnabled);
            const fillColor = String(s.fillColor ?? state.hatchSettings?.fillColor ?? "#dbeafe");
            const dashAttr = (() => {
                if (lineType === "dashed") return ` stroke-dasharray="${fmt(dashW)} ${fmt(gapW)}"`;
                if (lineType === "dotted") return ` stroke-dasharray="${fmt(Math.max(0.15, strokeWorld(1)))} ${fmt(gapW)}"`;
                if (lineType === "dashdot") return ` stroke-dasharray="${fmt(dashW)} ${fmt(gapW)} ${fmt(Math.max(0.15, strokeWorld(1)))} ${fmt(gapW)}"`;
                if (lineType === "longdash") return ` stroke-dasharray="${fmt(dashW * 1.8)} ${fmt(gapW)}"`;
                if (lineType === "center") return ` stroke-dasharray="${fmt(dashW * 1.4)} ${fmt(gapW)} ${fmt(Math.max(0.15, strokeWorld(1)))} ${fmt(gapW)}"`;
                if (lineType === "hidden") return ` stroke-dasharray="${fmt(dashW * 0.7)} ${fmt(gapW * 0.9)}"`;
                return "";
            })();
            if (fillEnabled) {
                const safeFill = /^#[0-9a-fA-F]{6}$/.test(fillColor) ? fillColor : "#dbeafe";
                for (const d of loopPaths) parts.push(`<path d="${d}" fill="${safeFill}" fill-rule="evenodd"/>`);
            }
            const b = parsed.bounds;
            const origin = { x: (Number(b.minX) + Number(b.maxX)) * 0.5, y: (Number(b.minY) + Number(b.maxY)) * 0.5 };
            const corners = [
                { x: Number(b.minX), y: Number(b.minY) }, { x: Number(b.maxX), y: Number(b.minY) },
                { x: Number(b.maxX), y: Number(b.maxY) }, { x: Number(b.minX), y: Number(b.maxY) }
            ];
            const familyAngles = [ang];
            if (pattern === "cross") familyAngles.push(ang + crossAng);
            const hatchStrokeW = Math.max(0.01, Number(s.lineWidthMm ?? state.hatchSettings?.lineWidthMm ?? 0.25) || 0.25);
            const safeLineColor = /^#[0-9a-fA-F]{6}$/.test(lineColor) ? lineColor : "#0f172a";
            parts.push(`<g clip-path="url(#${clipId})" stroke="${safeLineColor}" stroke-width="${fmt(hatchStrokeW)}"${dashAttr}>`);
            for (const angleRad of familyAngles) {
                const u = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
                const n = { x: -u.y, y: u.x };
                let nMin = Infinity, nMax = -Infinity;
                let uMin = Infinity, uMax = -Infinity;
                for (const p of corners) {
                    const rx = p.x - origin.x;
                    const ry = p.y - origin.y;
                    const pn = rx * n.x + ry * n.y;
                    const pu = rx * u.x + ry * u.y;
                    nMin = Math.min(nMin, pn);
                    nMax = Math.max(nMax, pn);
                    uMin = Math.min(uMin, pu);
                    uMax = Math.max(uMax, pu);
                }
                const L = (Math.max(Math.abs(uMin), Math.abs(uMax)) * 2 + pitch) * 1.5;
                const startN = Math.floor((nMin - padding - pitch * 0.1) / pitch) * pitch;
                const endN = nMax + padding + pitch * 0.1;
                let idx = 0;
                let safety = 0;
                for (let offN = startN; offN <= endN && safety < 8000; offN += pitch, idx++, safety++) {
                    const shiftU = (idx % 2 === 1) ? lineShift : 0;
                    const cp = { x: origin.x + n.x * offN + u.x * shiftU, y: origin.y + n.y * offN + u.y * shiftU };
                    const p1 = { x: cp.x - u.x * L, y: cp.y - u.y * L };
                    const p2 = { x: cp.x + u.x * L, y: cp.y + u.y * L };
                    parts.push(`<line x1="${fmt(p1.x)}" y1="${fmt(p1.y)}" x2="${fmt(p2.x)}" y2="${fmt(p2.y)}"/>`);
                }
            }
            parts.push(`</g>`);
            continue;
        }

        if (s.type === "dim") {
            const baseStroke = "#0f172a";
            const arrowType = s.dimArrowType || "open";
            const reverseArrow = String(s.dimArrowDirection || "normal") === "reverse";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            if (s.dimRef) {
                const g = getSpecialDimGeometry(s, state.shapes);
                if (!g) continue;
                const label = (g.kind === "circle" ? "D " : "R ") + (Number(g.len) || 0).toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
                parts.push(`<line x1="${fmt(g.cx)}" y1="${fmt(g.cy)}" x2="${fmt(s.x2)}" y2="${fmt(s.y2)}"/>`);
                const dref = reverseArrow ? { x: -Number(g.u?.x || 0), y: -Number(g.u?.y || 0) } : g.u;
                parts.push(arrowSvg({ x: Number(s.x2), y: Number(s.y2) }, dref, arrowSize, baseStroke, arrowType));
                const tx = Number.isFinite(Number(s.tx)) ? Number(s.tx) : (Number(s.x2) + Number(g.u.x) * dimPtToWorld(Number(s.fontSize ?? 12) || 12));
                const ty = Number.isFinite(Number(s.ty)) ? Number(s.ty) : (Number(s.y2) + Number(g.u.y) * dimPtToWorld(Number(s.fontSize ?? 12) || 12));
                parts.push(`<text x="${fmt(tx)}" y="${fmt(ty)}" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(label)}</text>`);
                continue;
            }
            const g = getDimGeometry(s);
            if (!g) continue;
            const extOff = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
            const extOver = dimMmToWorld(Number(s.extOver ?? 2) || 0);
            const dimOver = dimMmToWorld(Math.max(0, Number(s.rOverrun ?? 0) || 0));
            const sign = Math.sign(g.off) || 1;
            const enx = g.nx * sign, eny = g.ny * sign;
            parts.push(`<line x1="${fmt(g.x1 + extOff * enx)}" y1="${fmt(g.y1 + extOff * eny)}" x2="${fmt(g.d1.x + extOver * enx)}" y2="${fmt(g.d1.y + extOver * eny)}"/>`);
            parts.push(`<line x1="${fmt(g.x2 + extOff * enx)}" y1="${fmt(g.y2 + extOff * eny)}" x2="${fmt(g.d2.x + extOver * enx)}" y2="${fmt(g.d2.y + extOver * eny)}"/>`);
            parts.push(`<line x1="${fmt(g.d1.x - g.tx * dimOver)}" y1="${fmt(g.d1.y - g.ty * dimOver)}" x2="${fmt(g.d2.x + g.tx * dimOver)}" y2="${fmt(g.d2.y + g.ty * dimOver)}"/>`);
            const d1dir = reverseArrow ? { x: g.tx, y: g.ty } : { x: -g.tx, y: -g.ty };
            const d2dir = reverseArrow ? { x: -g.tx, y: -g.ty } : { x: g.tx, y: g.ty };
            parts.push(arrowSvg(g.d1, d1dir, arrowSize, baseStroke, arrowType));
            parts.push(arrowSvg(g.d2, d2dir, arrowSize, baseStroke, arrowType));
            const textVal = (Number(g.len) || 0).toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
            const mid = { x: (g.d1.x + g.d2.x) * 0.5, y: (g.d1.y + g.d2.y) * 0.5 };
            const hasRel = Number.isFinite(Number(s.tdx)) && Number.isFinite(Number(s.tdy));
            const tw = hasRel ? { x: Number(g.allCtrl.x) + Number(s.tdx), y: Number(g.allCtrl.y) + Number(s.tdy) }
                : (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) ? { x: Number(s.tx), y: Number(s.ty) }
                    : { x: mid.x + g.nx * dimPtToWorld(Number(s.fontSize ?? 12) || 12), y: mid.y + g.ny * dimPtToWorld(Number(s.fontSize ?? 12) || 12) };
            const rotDeg = (s.textRotate === "auto" || s.textRotate == null) ? autoTextAngleDeg(g.tx, g.ty) : (Number(s.textRotate) || 0);
            parts.push(`<text x="${fmt(tw.x)}" y="${fmt(tw.y)}" transform="rotate(${fmt(rotDeg)} ${fmt(tw.x)} ${fmt(tw.y)})" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(textVal)}</text>`);
            continue;
        }

        if (s.type === "dimchain") {
            const geom = getDimChainGeometry(s);
            if (!geom) continue;
            const baseStroke = "#0f172a";
            const arrowType = s.dimArrowType || "open";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            const dimOver = dimMmToWorld(Math.max(0, Number(s.rOverrun ?? 0) || 0));
            const extOff = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
            const defaultVis = Math.max(0, Math.abs(Number(geom.off) || 0) - extOff);
            const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
            const sign = Math.sign(Number(geom.off) || 0) || 1;
            const enx = Number(geom.nx) * sign, eny = Number(geom.ny) * sign;
            if (Array.isArray(geom.dimPoints)) {
                for (let i = 0; i < geom.dimPoints.length; i++) {
                    const dpt = geom.dimPoints[i];
                    const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVis;
                    const sw = { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis };
                    parts.push(`<line x1="${fmt(sw.x)}" y1="${fmt(sw.y)}" x2="${fmt(dpt.x)}" y2="${fmt(dpt.y)}"/>`);
                }
            }
            for (const g of (geom.segments || [])) {
                parts.push(`<line x1="${fmt(g.d1.x - g.tx * dimOver)}" y1="${fmt(g.d1.y - g.ty * dimOver)}" x2="${fmt(g.d2.x + g.tx * dimOver)}" y2="${fmt(g.d2.y + g.ty * dimOver)}"/>`);
                parts.push(arrowSvg(g.d1, { x: -g.tx, y: -g.ty }, arrowSize, baseStroke, arrowType));
                parts.push(arrowSvg(g.d2, { x: g.tx, y: g.ty }, arrowSize, baseStroke, arrowType));
                const textVal = (Number(g.len) || 0).toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
                const mid = { x: (g.d1.x + g.d2.x) * 0.5, y: (g.d1.y + g.d2.y) * 0.5 };
                const defaultOff = dimPtToWorld(Number(s.fontSize ?? 12) || 12);
                const off = (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty)))
                    ? ((Number(s.tx) - Number(g.chainMid?.x || 0)) * g.nx + (Number(s.ty) - Number(g.chainMid?.y || 0)) * g.ny)
                    : defaultOff;
                const tw = { x: mid.x + g.nx * off, y: mid.y + g.ny * off };
                const rotDeg = (s.textRotate === "auto" || s.textRotate == null) ? autoTextAngleDeg(g.tx, g.ty) : (Number(s.textRotate) || 0);
                parts.push(`<text x="${fmt(tw.x)}" y="${fmt(tw.y)}" transform="rotate(${fmt(rotDeg)} ${fmt(tw.x)} ${fmt(tw.y)})" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(textVal)}</text>`);
            }
            continue;
        }

        if (s.type === "circleDim") {
            const g = getCircleDimGeometry(s, state.shapes);
            if (!g) continue;
            const baseStroke = "#0f172a";
            const arrowType = s.dimArrowType || "open";
            const reverseArrow = String(s.dimArrowDirection || "normal") === "reverse";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            const c1 = { x: g.cx + g.ux * g.r, y: g.cy + g.uy * g.r };
            const c2 = { x: g.cx - g.ux * g.r, y: g.cy - g.uy * g.r };
            parts.push(`<line x1="${fmt(g.p1.x)}" y1="${fmt(g.p1.y)}" x2="${fmt(g.p2.x)}" y2="${fmt(g.p2.y)}"/>`);
            if (Math.hypot(g.p1.x - c1.x, g.p1.y - c1.y) > 1e-9) parts.push(`<line x1="${fmt(g.p1.x)}" y1="${fmt(g.p1.y)}" x2="${fmt(c1.x)}" y2="${fmt(c1.y)}"/>`);
            const arrowSide = s.circleArrowSide === "inside" ? "inside" : "outside";
            const dir1 = arrowSide === "inside" ? { x: -g.ux, y: -g.uy } : { x: g.ux, y: g.uy };
            const d1 = reverseArrow ? { x: -dir1.x, y: -dir1.y } : dir1;
            parts.push(arrowSvg(c1, d1, arrowSize, baseStroke, arrowType));
            if (s.kind === "diameter") {
                if (Math.hypot(g.p2.x - c2.x, g.p2.y - c2.y) > 1e-9) parts.push(`<line x1="${fmt(g.p2.x)}" y1="${fmt(g.p2.y)}" x2="${fmt(c2.x)}" y2="${fmt(c2.y)}"/>`);
                const dir2 = arrowSide === "inside" ? { x: g.ux, y: g.uy } : { x: -g.ux, y: -g.uy };
                const d2 = reverseArrow ? { x: -dir2.x, y: -dir2.y } : dir2;
                parts.push(arrowSvg(c2, d2, arrowSize, baseStroke, arrowType));
            }
            const value = s.kind === "diameter" ? (Number(g.r) * 2) : Number(g.r);
            const textVal = (s.kind === "diameter" ? "D " : "R ") + value.toFixed(Math.max(0, Number(s.precision ?? 1) || 0));
            const rotDeg = (s.textRotate === "auto" || s.textRotate == null) ? autoTextAngleDeg(g.ux, g.uy) : (Number(s.textRotate) || 0);
            parts.push(`<text x="${fmt(g.tx)}" y="${fmt(g.ty)}" transform="rotate(${fmt(rotDeg)} ${fmt(g.tx)} ${fmt(g.ty)})" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(textVal)}</text>`);
            continue;
        }

        if (s.type === "dimangle") {
            const g = getDimAngleGeometry(s, state.shapes);
            if (!g) continue;
            const cx = Number(g.cx), cy = Number(g.cy), r = Math.abs(Number(g.r) || 0);
            const a1 = Number(g.a1) || 0, a2 = Number(g.a2) || 0;
            const over = dimMmToWorld(Math.max(0, Number(s.rOverrun ?? state.dimSettings?.rOvershoot ?? 0) || 0));
            const overAng = r > 1e-9 ? over / r : 0;
            const a1d = a1 - overAng;
            const a2d = a2 + overAng;
            const p1 = { x: cx + Math.cos(a1d) * r, y: cy + Math.sin(a1d) * r };
            const p2 = { x: cx + Math.cos(a2d) * r, y: cy + Math.sin(a2d) * r };
            const da = normalizeRad(a2d - a1d);
            const largeArc = da > Math.PI ? 1 : 0;
            parts.push(`<path d="M ${fmt(p1.x)} ${fmt(p1.y)} A ${fmt(r)} ${fmt(r)} 0 ${largeArc} 1 ${fmt(p2.x)} ${fmt(p2.y)}"/>`);
            const arrowType = s.dimArrowType || "open";
            const reverseArrow = String(s.dimArrowDirection || "normal") === "reverse";
            const arrowSize = dimPtToWorld(Math.max(1, Number(s.dimArrowSizePt ?? 10) || 10));
            const d1 = { x: Math.sin(a1), y: -Math.cos(a1) };
            const d2 = { x: -Math.sin(a2), y: Math.cos(a2) };
            const ad1 = reverseArrow ? { x: -d1.x, y: -d1.y } : d1;
            const ad2 = reverseArrow ? { x: -d2.x, y: -d2.y } : d2;
            parts.push(arrowSvg({ x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r }, ad1, arrowSize, "#0f172a", arrowType));
            parts.push(arrowSvg({ x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r }, ad2, arrowSize, "#0f172a", arrowType));
            const angle = Number(g.angle) * 180 / Math.PI;
            const label = `${angle.toFixed(Math.max(0, Number(s.precision ?? 1) || 0))} deg`;
            const midA = a1 + da * 0.5;
            const tx = Number(g.tx);
            const ty = Number(g.ty);
            parts.push(`<text x="${fmt(tx)}" y="${fmt(ty)}" font-size="${fmt(dimPtToWorld(Number(s.fontSize ?? 12) || 12))}" fill="#0f172a" dominant-baseline="middle" text-anchor="middle">${esc(label)}</text>`);
            continue;
        }
    }

    parts.push(`</g>`);
    parts.push(`</svg>`);

    const svg = parts.join("\n");
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.svg`;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (setStatus) setStatus(`Exported ${name} (vector SVG)`);
}

export function exportDxf(state, helpers) {
    const { setStatus } = helpers;
    const fmt = (v, digits = 6) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return "0";
        return Number(n.toFixed(digits)).toString();
    };
    const normalizeRadLocal = (a) => {
        let r = Number(a) || 0;
        while (r < 0) r += Math.PI * 2;
        while (r >= Math.PI * 2) r -= Math.PI * 2;
        return r;
    };
    const radToDeg = (a) => (normalizeRadLocal(a) * 180 / Math.PI);
    const cleanText = (s) => String(s ?? "").replace(/\r\n|\r|\n/g, " ").replace(/\s+/g, " ").trim();
    const layerNameSafe = (name, fallbackId) => {
        const raw = String(name ?? "").trim();
        const base = raw || `L${Number(fallbackId) || 0}`;
        const cleaned = base.replace(/[<>\/\\":;?*|=,]/g, "_");
        return cleaned.slice(0, 255) || `L${Number(fallbackId) || 0}`;
    };

    const ps = state.pageSetup || {};
    const pageScale = Math.max(0.0001, Number(ps.scale ?? 1) || 1);
    const unitMm = Math.max(1e-9, Number(mmPerUnit(ps.unit || "mm")) || 1);
    const worldPerMm = pageScale / unitMm;
    const textPtToWorld = (pt) => Math.max(0.05, (Math.max(0, Number(pt) || 0) * (25.4 / 72)) * worldPerMm);

    const visibleShapes = (state.shapes || []).filter((s) => isLayerVisible(state, s.layerId));
    const layerById = new Map((state.layers || []).map((l) => [Number(l.id), l]));
    const usedLayerIds = new Set();
    for (const s of visibleShapes) {
        const lid = Number(s.layerId);
        if (Number.isFinite(lid)) usedLayerIds.add(lid);
    }
    const layerNameById = new Map();
    for (const lid of usedLayerIds) {
        const layer = layerById.get(Number(lid));
        layerNameById.set(Number(lid), layerNameSafe(layer?.name, lid));
    }
    const layerNames = Array.from(new Set(["0", ...Array.from(layerNameById.values())]));
    const layerNameFor = (shape) => {
        const lid = Number(shape?.layerId);
        if (!Number.isFinite(lid)) return "0";
        return layerNameById.get(lid) || `L${lid}`;
    };

    const entities = [];
    const addEntity = (type, pairs) => {
        entities.push(["0", type]);
        for (const [code, value] of pairs) entities.push([String(code), String(value)]);
    };

    let exportedShapeCount = 0;
    let skippedShapeCount = 0;
    for (const s of visibleShapes) {
        const layerName = layerNameFor(s);
        if (s.type === "line") {
            addEntity("LINE", [
                [8, layerName],
                [10, fmt(s.x1)], [20, fmt(s.y1)], [30, "0"],
                [11, fmt(s.x2)], [21, fmt(s.y2)], [31, "0"],
            ]);
            exportedShapeCount += 1;
            continue;
        }
        if (s.type === "polyline") {
            const pts = Array.isArray(s.points) ? s.points : [];
            if (pts.length < 2) { skippedShapeCount += 1; continue; }
            const pairs = [
                [8, layerName],
                [90, String(pts.length)],
                [70, s.closed ? "1" : "0"],
            ];
            for (const p of pts) {
                pairs.push([10, fmt(p.x)]);
                pairs.push([20, fmt(p.y)]);
            }
            addEntity("LWPOLYLINE", pairs);
            exportedShapeCount += 1;
            continue;
        }
        if (s.type === "rect") {
            const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
            const minX = Math.min(x1, x2), maxX = Math.max(x1, x2);
            const minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
            const segs = [
                [minX, minY, maxX, minY],
                [maxX, minY, maxX, maxY],
                [maxX, maxY, minX, maxY],
                [minX, maxY, minX, minY],
            ];
            for (const [ax, ay, bx, by] of segs) {
                addEntity("LINE", [
                    [8, layerName],
                    [10, fmt(ax)], [20, fmt(ay)], [30, "0"],
                    [11, fmt(bx)], [21, fmt(by)], [31, "0"],
                ]);
            }
            exportedShapeCount += 1;
            continue;
        }
        if (s.type === "circle") {
            const r = Math.abs(Number(s.r) || 0);
            if (!(r > 1e-9)) { skippedShapeCount += 1; continue; }
            addEntity("CIRCLE", [
                [8, layerName],
                [10, fmt(s.cx)], [20, fmt(s.cy)], [30, "0"],
                [40, fmt(r)],
            ]);
            exportedShapeCount += 1;
            continue;
        }
        if (s.type === "arc") {
            const r = Math.abs(Number(s.r) || 0);
            if (!(r > 1e-9)) { skippedShapeCount += 1; continue; }
            const a1 = Number(s.a1) || 0;
            const a2 = Number(s.a2) || 0;
            const ccw = s.ccw !== false;
            const startDeg = ccw ? radToDeg(a1) : radToDeg(a2);
            const endDeg = ccw ? radToDeg(a2) : radToDeg(a1);
            addEntity("ARC", [
                [8, layerName],
                [10, fmt(s.cx)], [20, fmt(s.cy)], [30, "0"],
                [40, fmt(r)],
                [50, fmt(startDeg)],
                [51, fmt(endDeg)],
            ]);
            exportedShapeCount += 1;
            continue;
        }
        if (s.type === "position") {
            const x = Number(s.x), y = Number(s.y), size = Math.max(0.1, Number(s.size ?? 20));
            addEntity("CIRCLE", [
                [8, layerName],
                [10, fmt(x)], [20, fmt(y)], [30, "0"],
                [40, fmt(size * 0.28)],
            ]);
            addEntity("LINE", [
                [8, layerName],
                [10, fmt(x - size)], [20, fmt(y)], [30, "0"],
                [11, fmt(x + size)], [21, fmt(y)], [31, "0"],
            ]);
            addEntity("LINE", [
                [8, layerName],
                [10, fmt(x)], [20, fmt(y - size)], [30, "0"],
                [11, fmt(x)], [21, fmt(y + size)], [31, "0"],
            ]);
            exportedShapeCount += 1;
            continue;
        }
        if (s.type === "text") {
            const txt = cleanText(s.text);
            if (!txt) { skippedShapeCount += 1; continue; }
            addEntity("TEXT", [
                [8, layerName],
                [10, fmt(s.x1)], [20, fmt(s.y1)], [30, "0"],
                [40, fmt(textPtToWorld(Number(s.textSizePt) || 12))],
                [1, txt],
                [50, fmt(Number(s.textRotate) || 0)],
                [7, "STANDARD"],
            ]);
            exportedShapeCount += 1;
            continue;
        }
        skippedShapeCount += 1;
    }

    const lines = [];
    const emit = (code, value) => { lines.push(String(code)); lines.push(String(value)); };
    emit(0, "SECTION"); emit(2, "HEADER");
    emit(9, "$ACADVER"); emit(1, "AC1009");
    emit(0, "ENDSEC");
    emit(0, "SECTION"); emit(2, "TABLES");
    emit(0, "TABLE"); emit(2, "LAYER"); emit(70, layerNames.length);
    for (const name of layerNames) {
        emit(0, "LAYER"); emit(2, name); emit(70, 0); emit(62, 7); emit(6, "CONTINUOUS");
    }
    emit(0, "ENDTAB");
    emit(0, "ENDSEC");
    emit(0, "SECTION"); emit(2, "ENTITIES");
    for (const [code, value] of entities) emit(code, value);
    emit(0, "ENDSEC");
    emit(0, "EOF");

    const dxf = lines.join("\r\n");
    const blob = new Blob([dxf], { type: "application/dxf;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.dxf`;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (setStatus) {
        const suffix = skippedShapeCount > 0 ? ` / skipped ${skippedShapeCount} unsupported` : "";
        setStatus(`Exported ${name} (DXF R12) / shapes ${exportedShapeCount}${suffix}`);
    }
}

export function exportPng(state, helpers, options = {}) {
    const { setStatus } = helpers || {};
    if (typeof helpers?.render !== "function") {
        if (setStatus) setStatus("PNG export failed: render helper not available.");
        return;
    }
    const fmtNum = (v, fb) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fb;
    };
    const clampInt = (v, lo, hi, fb) => {
        const n = Math.round(fmtNum(v, fb));
        return Math.max(lo, Math.min(hi, n));
    };
    const clampPos = (v, lo, fb) => {
        const n = fmtNum(v, fb);
        return Math.max(lo, n);
    };
    const getPageSpec = () => {
        const ps = state.pageSetup || {};
        const PAGE_SIZES_MM = {
            A1: [841, 594],
            A2: [594, 420],
            A3: [420, 297],
            A4: [297, 210],
            Letter: [279.4, 215.9],
            Legal: [355.6, 215.9],
            Tabloid: [431.8, 279.4],
            Ledger: [431.8, 279.4],
        };
        const useCustomSize = !!ps.customSizeEnabled;
        const customW = Math.max(1, Number(ps.customWidthMm) || 297);
        const customH = Math.max(1, Number(ps.customHeightMm) || 210);
        const key = String(ps.size || "A4");
        const base = useCustomSize ? [customW, customH] : (PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4);
        const isPortrait = String(ps.orientation || "landscape") === "portrait";
        const mmW = isPortrait ? Math.min(base[0], base[1]) : Math.max(base[0], base[1]);
        const mmH = isPortrait ? Math.max(base[0], base[1]) : Math.min(base[0], base[1]);
        const pageScale = Math.max(0.0001, Number(ps.scale ?? 1) || 1);
        const unitMm = Math.max(1e-9, Number(mmPerUnit(ps.unit || "mm")) || 1);
        const cadW = mmW * pageScale / unitMm;
        const cadH = mmH * pageScale / unitMm;
        return { mmW, mmH, cadW, cadH, pageScale, unitMm };
    };
    const getShapeBounds = (s) => {
        if (!s || typeof s !== "object") return null;
        if (s.type === "line" || s.type === "rect") {
            const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
            if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
            return { minX: Math.min(x1, x2), minY: Math.min(y1, y2), maxX: Math.max(x1, x2), maxY: Math.max(y1, y2) };
        }
        if (s.type === "polyline") {
            const pts = Array.isArray(s.points) ? s.points : [];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of pts) {
                const x = Number(p?.x), y = Number(p?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                minX = Math.min(minX, x); minY = Math.min(minY, y);
                maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
            if (!Number.isFinite(minX)) return null;
            return { minX, minY, maxX, maxY };
        }
        if (s.type === "bspline") {
            const cps = Array.isArray(s.controlPoints) ? s.controlPoints : [];
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of cps) {
                const x = Number(p?.x), y = Number(p?.y);
                if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
                minX = Math.min(minX, x); minY = Math.min(minY, y);
                maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            }
            if (!Number.isFinite(minX)) return null;
            return { minX, minY, maxX, maxY };
        }
        if (s.type === "circle" || s.type === "arc") {
            const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
            if (![cx, cy, r].every(Number.isFinite)) return null;
            return { minX: cx - r, minY: cy - r, maxX: cx + r, maxY: cy + r };
        }
        if (s.type === "position") {
            const x = Number(s.x), y = Number(s.y), sz = Math.max(0.1, Number(s.size ?? 20));
            if (![x, y, sz].every(Number.isFinite)) return null;
            return { minX: x - sz, minY: y - sz, maxX: x + sz, maxY: y + sz };
        }
        if (s.type === "text") {
            const x = Number(s.x1), y = Number(s.y1);
            if (![x, y].every(Number.isFinite)) return null;
            return { minX: x - 5, minY: y - 5, maxX: x + 5, maxY: y + 5 };
        }
        if (s.type === "image") {
            const x = Number(s.x), y = Number(s.y), w = Number(s.width), h = Number(s.height);
            if (![x, y, w, h].every(Number.isFinite)) return null;
            return { minX: x, minY: y, maxX: x + w, maxY: y + h };
        }
        if (s.type === "dim") {
            const g = s.dimRef ? getSpecialDimGeometry(s, state.shapes) : getDimGeometry(s);
            if (!g) return null;
            const xs = [Number(s.x1), Number(s.x2), Number(s.px), Number(s.tx)];
            const ys = [Number(s.y1), Number(s.y2), Number(s.py), Number(s.ty)];
            const vx = xs.filter(Number.isFinite);
            const vy = ys.filter(Number.isFinite);
            if (!vx.length || !vy.length) return null;
            return { minX: Math.min(...vx), minY: Math.min(...vy), maxX: Math.max(...vx), maxY: Math.max(...vy) };
        }
        if (s.type === "dimchain") {
            const g = getDimChainGeometry(s);
            const xs = [];
            const ys = [];
            if (g?.segments?.length) {
                for (const seg of g.segments) {
                    xs.push(Number(seg?.d1?.x), Number(seg?.d2?.x));
                    ys.push(Number(seg?.d1?.y), Number(seg?.d2?.y));
                }
            }
            if (Array.isArray(s.points)) {
                for (const p of s.points) { xs.push(Number(p?.x)); ys.push(Number(p?.y)); }
            }
            xs.push(Number(s.tx)); ys.push(Number(s.ty));
            const vx = xs.filter(Number.isFinite);
            const vy = ys.filter(Number.isFinite);
            if (!vx.length || !vy.length) return null;
            return { minX: Math.min(...vx), minY: Math.min(...vy), maxX: Math.max(...vx), maxY: Math.max(...vy) };
        }
        if (s.type === "circleDim") {
            const g = getCircleDimGeometry(s, state.shapes);
            if (!g) return null;
            const xs = [Number(g.p1?.x), Number(g.p2?.x), Number(g.tx)];
            const ys = [Number(g.p1?.y), Number(g.p2?.y), Number(g.ty)];
            const vx = xs.filter(Number.isFinite);
            const vy = ys.filter(Number.isFinite);
            if (!vx.length || !vy.length) return null;
            return { minX: Math.min(...vx), minY: Math.min(...vy), maxX: Math.max(...vx), maxY: Math.max(...vy) };
        }
        if (s.type === "dimangle") {
            const g = getDimAngleGeometry(s, state.shapes);
            if (!g) return null;
            const cx = Number(g.cx), cy = Number(g.cy), r = Math.abs(Number(g.r) || 0);
            if (![cx, cy, r].every(Number.isFinite)) return null;
            const tx = Number(g.tx), ty = Number(g.ty);
            const minX = Math.min(cx - r, Number.isFinite(tx) ? tx : (cx - r));
            const minY = Math.min(cy - r, Number.isFinite(ty) ? ty : (cy - r));
            const maxX = Math.max(cx + r, Number.isFinite(tx) ? tx : (cx + r));
            const maxY = Math.max(cy + r, Number.isFinite(ty) ? ty : (cy + r));
            return { minX, minY, maxX, maxY };
        }
        return null;
    };
    const unionBounds = (a, b) => {
        if (!a) return b ? { ...b } : null;
        if (!b) return a;
        a.minX = Math.min(a.minX, b.minX);
        a.minY = Math.min(a.minY, b.minY);
        a.maxX = Math.max(a.maxX, b.maxX);
        a.maxY = Math.max(a.maxY, b.maxY);
        return a;
    };

    const page = getPageSpec();
    const rangeMode = String(options.rangeMode || "page");
    let worldRange = null;
    if (rangeMode === "view") {
        const vw = Math.max(1, Number(state.view?.viewportWidth) || 1);
        const vh = Math.max(1, Number(state.view?.viewportHeight) || 1);
        const sc = Math.max(1e-9, Number(state.view?.scale) || 1);
        worldRange = {
            minX: (0 - Number(state.view?.offsetX || 0)) / sc,
            minY: (0 - Number(state.view?.offsetY || 0)) / sc,
            maxX: (vw - Number(state.view?.offsetX || 0)) / sc,
            maxY: (vh - Number(state.view?.offsetY || 0)) / sc,
        };
    } else if (rangeMode === "selection") {
        const selSet = new Set((state.selection?.ids || []).map(Number));
        let b = null;
        for (const s of (state.shapes || [])) {
            if (!selSet.has(Number(s.id))) continue;
            b = unionBounds(b, getShapeBounds(s));
        }
        worldRange = b;
    } else if (rangeMode === "custom") {
        const cx = fmtNum(options.customX, 0);
        const cy = fmtNum(options.customY, 0);
        const w = Math.max(1e-6, fmtNum(options.customWidth, page.cadW));
        const h = Math.max(1e-6, fmtNum(options.customHeight, page.cadH));
        worldRange = { minX: cx - w * 0.5, minY: cy - h * 0.5, maxX: cx + w * 0.5, maxY: cy + h * 0.5 };
    } else {
        worldRange = { minX: -page.cadW * 0.5, minY: -page.cadH * 0.5, maxX: page.cadW * 0.5, maxY: page.cadH * 0.5 };
    }
    if (!worldRange) {
        worldRange = { minX: -page.cadW * 0.5, minY: -page.cadH * 0.5, maxX: page.cadW * 0.5, maxY: page.cadH * 0.5 };
    }
    let worldW = Math.max(1e-9, worldRange.maxX - worldRange.minX);
    let worldH = Math.max(1e-9, worldRange.maxY - worldRange.minY);

    const sizeMode = String(options.sizeMode || "pixels");
    const dpi = clampPos(options.dpi, 1, 300);
    const scaleMul = clampPos(options.scaleMul, 0.01, 1);
    let innerWpx = 0;
    let innerHpx = 0;
    if (sizeMode === "dpi") {
        const worldToMm = (w) => w * page.unitMm / page.pageScale;
        const mmW = worldToMm(worldW);
        const mmH = worldToMm(worldH);
        innerWpx = Math.max(1, Math.round(mmW / 25.4 * dpi * scaleMul));
        innerHpx = Math.max(1, Math.round(mmH / 25.4 * dpi * scaleMul));
    } else {
        const wIn = clampInt(options.pxWidth, 1, 30000, 2048);
        const hIn = clampInt(options.pxHeight, 1, 30000, 2048);
        innerWpx = Math.max(1, Math.round(wIn * scaleMul));
        innerHpx = Math.max(1, Math.round(hIn * scaleMul));
    }
    const marginPx = clampInt(options.marginPx, 0, 2000, 0);
    const outW = Math.max(1, innerWpx + marginPx * 2);
    const outH = Math.max(1, innerHpx + marginPx * 2);

    const offCanvas = document.createElement("canvas");
    offCanvas.width = outW;
    offCanvas.height = outH;
    const offCtx = offCanvas.getContext("2d", { alpha: true });
    if (!offCtx) {
        if (setStatus) setStatus("PNG export failed: cannot allocate canvas context.");
        return;
    }
    offCtx.imageSmoothingEnabled = options.antialias !== false;
    offCtx.clearRect(0, 0, outW, outH);
    const backgroundMode = String(options.backgroundMode || "white");
    const bgColor = /^#[0-9a-fA-F]{6}$/.test(String(options.backgroundColor || ""))
        ? String(options.backgroundColor)
        : "#ffffff";
    if (backgroundMode === "white") {
        offCtx.fillStyle = "#ffffff";
        offCtx.fillRect(0, 0, outW, outH);
    } else if (backgroundMode === "color") {
        offCtx.fillStyle = bgColor;
        offCtx.fillRect(0, 0, outW, outH);
    }

    const scale = Math.min(innerWpx / worldW, innerHpx / worldH);
    const drawW = worldW * scale;
    const drawH = worldH * scale;
    const padX = marginPx + (innerWpx - drawW) * 0.5;
    const padY = marginPx + (innerHpx - drawH) * 0.5;
    const offView = {
        scale,
        offsetX: padX - worldRange.minX * scale,
        offsetY: padY - worldRange.minY * scale,
    };
    const colorMode = String(options.colorMode || "normal");
    const includeSelection = !!options.includeSelection;
    const lineScale = Math.max(0.01, Number(options.lineScale) || 1);
    const minLinePx = Math.max(0, Number(options.minLinePx) || 0);
    const minLineMmFromPx = (minLinePx > 0)
        ? (minLinePx * page.unitMm) / Math.max(1e-9, page.pageScale * scale)
        : 0;
    const scaledShapes = JSON.parse(JSON.stringify(state.shapes || []));
    for (const s of scaledShapes) {
        if (!s || typeof s !== "object") continue;
        if (Number.isFinite(Number(s.lineWidthMm))) {
            let lw = Number(s.lineWidthMm) * lineScale;
            if (minLineMmFromPx > 0) lw = Math.max(lw, minLineMmFromPx);
            s.lineWidthMm = Math.max(0.01, lw);
        }
    }
    const exportState = {
        ...state,
        shapes: scaledShapes,
        lineWidthMm: Math.max(0.01, Math.max((Number(state.lineWidthMm) || 0.25) * lineScale, minLineMmFromPx)),
        view: {
            ...state.view,
            ...offView,
            viewportWidth: outW,
            viewportHeight: outH,
        },
        grid: {
            ...state.grid,
            show: !!options.includeGrid,
        },
        pageSetup: {
            ...state.pageSetup,
            showFrame: !!options.includePageFrame,
        },
        selection: includeSelection ? state.selection : { ...state.selection, ids: [] },
        ui: {
            ...state.ui,
            hideAxes: !options.includeAxes,
            suppressSelectionHighlight: !includeSelection,
            layerView: {
                ...(state.ui?.layerView || {}),
                colorize: colorMode === "layer",
            },
            groupView: {
                ...(state.ui?.groupView || {}),
                colorize: colorMode === "group",
            },
        },
    };

    helpers.render(offCtx, offCanvas, exportState);

    let mime = "image/png";
    if (backgroundMode === "transparent") mime = "image/png";
    const dataUrl = offCanvas.toDataURL(mime);
    const a = document.createElement("a");
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fallbackName = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
    const rawName = String(options.filename || "").trim();
    const name = (rawName.length ? rawName : fallbackName).replace(/\.(png)$/i, "") + ".png";
    a.href = dataUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    if (setStatus) setStatus(`Exported ${name} (${outW}x${outH})`);
}
