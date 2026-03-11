import { worldToScreen } from "./geom.js";

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
const MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, inch: 25.4 };

function getPageFrameWorldSize(pageSetup) {
  const useCustomSize = !!pageSetup?.customSizeEnabled;
  const customW = Math.max(1, Number(pageSetup?.customWidthMm) || 297);
  const customH = Math.max(1, Number(pageSetup?.customHeightMm) || 210);
  const key = String(pageSetup?.size || "A4");
  const [w, h] = useCustomSize ? [customW, customH] : (PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4);
  const isPortrait = String(pageSetup?.orientation || "landscape") === "portrait";
  const mmW = isPortrait ? Math.min(w, h) : Math.max(w, h);
  const mmH = isPortrait ? Math.max(w, h) : Math.min(w, h);
  const effectiveScale = !!pageSetup?.customScaleEnabled
    ? Number(pageSetup?.customScale ?? pageSetup?.scale ?? 1)
    : Number(pageSetup?.scale ?? pageSetup?.presetScale ?? 1);
  const scale = Math.max(0.0001, effectiveScale || 1);
  const unit = String(pageSetup?.unit || "mm");
  const mpU = MM_PER_UNIT[unit] || 1;
  return { cadW: mmW * scale / mpU, cadH: mmH * scale / mpU, mmW, mmH, scale, unit };
}

export function drawPageFrame(ctx, canvas, state) {
  if (!state.pageSetup?.showFrame) return;
  const { cadW, cadH, mmW, mmH, scale, unit } = getPageFrameWorldSize(state.pageSetup);

  const tl = worldToScreen(state.view, { x: -cadW / 2, y: -cadH / 2 });
  const br = worldToScreen(state.view, { x: cadW / 2, y: cadH / 2 });
  const sw = br.x - tl.x, sh = br.y - tl.y;
  if (Math.abs(sw) < 1 || Math.abs(sh) < 1) return;

  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(tl.x, tl.y, sw, sh);

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  const len = 20;
  const gap = 5;

  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y + len); ctx.lineTo(tl.x, tl.y); ctx.lineTo(tl.x + len, tl.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(br.x - len, tl.y); ctx.lineTo(br.x, tl.y); ctx.lineTo(br.x, tl.y + len);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(br.x, br.y - len); ctx.lineTo(br.x, br.y); ctx.lineTo(br.x - len, br.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tl.x + len, br.y); ctx.lineTo(tl.x, br.y); ctx.lineTo(tl.x, br.y - len);
  ctx.stroke();

  const cx = (tl.x + br.x) / 2;
  const cy = (tl.y + br.y) / 2;

  ctx.save();
  ctx.strokeStyle = "rgba(30, 41, 59, 0.3)";
  const clen = 10;
  ctx.beginPath();
  ctx.moveTo(cx - clen, cy); ctx.lineTo(cx + clen, cy);
  ctx.moveTo(cx, cy - clen); ctx.lineTo(cx, cy + clen);
  ctx.stroke();
  ctx.restore();

  ctx.beginPath(); ctx.moveTo(cx, tl.y - gap); ctx.lineTo(cx, tl.y - gap - len); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, br.y + gap); ctx.lineTo(cx, br.y + gap + len); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tl.x - gap, cy); ctx.lineTo(tl.x - gap - len, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(br.x + gap, cy); ctx.lineTo(br.x + gap + len, cy); ctx.stroke();

  const marginMm = Math.max(0, Number(state.pageSetup?.innerMarginMm ?? 10) || 0);
  if (marginMm > 0) {
    const mpU = MM_PER_UNIT[unit] || 1;
    const mCad = marginMm * scale / mpU;
    const itl = worldToScreen(state.view, { x: -cadW / 2 + mCad, y: -cadH / 2 + mCad });
    const ibr = worldToScreen(state.view, { x: cadW / 2 - mCad, y: cadH / 2 - mCad });
    const iw = ibr.x - itl.x, ih = ibr.y - itl.y;
    if (iw > 4 && ih > 4) {
      ctx.strokeStyle = "#94a3b8";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(itl.x, itl.y, iw, ih);
      ctx.setLineDash([]);
    }
  }

  const pageSizeLabel = !!state.pageSetup?.customSizeEnabled
    ? `${Number(mmW.toFixed(1)).toString()}x${Number(mmH.toFixed(1)).toString()}mm`
    : String(state.pageSetup?.size || "A4");
  const labelStr = `${pageSizeLabel} ${state.pageSetup?.orientation === "portrait" ? "縦" : "横"} | 1:${scale} | ${unit}`;
  ctx.fillStyle = "#94a3b8";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText(labelStr, tl.x + 3, tl.y - 2);
  ctx.restore();
}

export function drawAxes(ctx, canvas, state) {
  if (state?.ui?.hideAxes) return;
  ctx.save();
  ctx.strokeStyle = "#cfd6df";
  ctx.lineWidth = 1;
  const o = worldToScreen(state.view, { x: 0, y: 0 });
  ctx.beginPath();
  ctx.moveTo(0, o.y);
  ctx.lineTo(canvas.width, o.y);
  ctx.moveTo(o.x, 0);
  ctx.lineTo(o.x, canvas.height);
  ctx.stroke();
  ctx.restore();
}
