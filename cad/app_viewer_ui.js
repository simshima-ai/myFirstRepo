import { getStatusBarText } from "./ui_text.js";

﻿function setDisplay(el, value) {
  if (!el) return;
  el.style.display = value;
}

function syncInputValue(el, value) {
  if (!el) return;
  const next = String(value ?? "");
  if (el.value !== next) el.value = next;
}

export function refreshViewerUi(state, dom) {
  if (dom.buildBadge) dom.buildBadge.textContent = `Build ${state.buildVersion || ""}`.trim();

  const displayMode = String(state.ui?.displayMode || "viewer").toLowerCase();
  const modeButtons = [
    [dom.cadHomeModeViewer, "viewer"],
    [dom.cadHomeModeEasy, "easy"],
    [dom.cadHomeModeCad, "cad"],
  ];
  for (const [btn, mode] of modeButtons) {
    if (!btn) continue;
    btn.classList.toggle("is-active", displayMode === mode);
    btn.style.display = displayMode === mode ? "none" : "";
  }

  const topContext = document.getElementById("topContext");
  const topContextHelp = document.getElementById("topContextHelp");
  const importActive = !!state.ui?.importAdjust?.active;
  if (topContext) {
    for (const el of topContext.querySelectorAll("[data-context]")) {
      const key = String(el.getAttribute("data-context") || "");
      setDisplay(el, importActive && key === "importadjust" ? "flex" : "none");
    }
    setDisplay(topContext, importActive ? "grid" : "none");
  }
  if (topContextHelp) setDisplay(topContextHelp, "none");

  const ia = state.ui?.importAdjust?.params || {};
  syncInputValue(dom.importAdjustScaleInput, ia.scale ?? 1);
  syncInputValue(dom.importAdjustDxInput, ia.dx ?? 0);
  syncInputValue(dom.importAdjustDyInput, ia.dy ?? 0);
  if (dom.importAdjustFlipXToggle) dom.importAdjustFlipXToggle.checked = !!ia.flipX;
  if (dom.importAdjustFlipYToggle) dom.importAdjustFlipYToggle.checked = !!ia.flipY;
  if (dom.importAsPolylineToggle) dom.importAsPolylineToggle.checked = !!state.ui?.importAsPolyline;
  syncInputValue(dom.importSourceUnitSelect, state.ui?.importSourceUnit || "auto");

  const hasShapes = Array.isArray(state.shapes) && state.shapes.length > 0;
  const t = getStatusBarText(state);
  const status = String(state.ui?.statusText || "").trim();
  const fallback = (displayMode === "viewer" && !hasShapes)
    ? t.viewerEmpty
    : "";
  if (dom.statusText) dom.statusText.textContent = status || fallback;
}
