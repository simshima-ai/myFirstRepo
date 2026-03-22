import { getStatusBarText } from "./ui_text.js";

function setDisplay(el, value) {
  if (!el) return;
  el.style.display = value;
}

function syncInputValue(el, value) {
  if (!el) return;
  const next = String(value ?? "");
  if (el.value !== next) el.value = next;
}

export function refreshViewerUi(state, dom) {
  const buildNo = String(state.buildVersion || "unknown");
  if (dom.buildBadge) dom.buildBadge.textContent = `Build No: ${buildNo}`;
  if (dom.settingsBuildBadge) dom.settingsBuildBadge.textContent = `Build No: ${buildNo}`;
  if (dom.selectionDebugBadge) {
    const selIds = Array.isArray(state.selection?.ids) ? state.selection.ids.map(Number).filter(Number.isFinite) : [];
    const selTypes = selIds.length
      ? (state.shapes || [])
          .filter((s) => selIds.includes(Number(s.id)))
          .map((s) => String(s.type || ""))
          .filter(Boolean)
      : [];
    dom.selectionDebugBadge.textContent = selIds.length
      ? `Sel ${selIds.length}: ${selTypes.join(", ") || "-" }`
      : "Sel 0";
    dom.selectionDebugBadge.style.display = "";
  }
  document.title = `S-CAD Build No: ${buildNo}`;

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
  const importMeta = state.importMeta && typeof state.importMeta === "object" ? state.importMeta : null;
  const t = getStatusBarText(state);
  const status = String(state.ui?.statusText || "").trim();
  const fallback = (displayMode === "viewer" && !hasShapes) ? t.viewerEmpty : "";
  if (dom.statusText) dom.statusText.textContent = status || fallback;

  const showEmptyState = displayMode === "viewer" && !hasShapes;
  if (dom.viewerEmptyState) dom.viewerEmptyState.style.display = showEmptyState ? "block" : "none";
  if (dom.viewerEmptyStateTitle) dom.viewerEmptyStateTitle.textContent = t.viewerEmptyTitle;
  if (dom.viewerEmptyStateText) dom.viewerEmptyStateText.textContent = t.viewerEmpty;

  const suggested = Array.isArray(importMeta?.suggestedScales) ? importMeta.suggestedScales.slice(0, 3) : [];
  const showImportMeta = displayMode === "viewer" && hasShapes && !!importMeta;
  if (dom.viewerImportMeta) dom.viewerImportMeta.style.display = showImportMeta ? "flex" : "none";
  if (dom.viewerImportUnitLabel) dom.viewerImportUnitLabel.textContent = t.detectedUnit;
  if (dom.viewerImportUnitValue) {
    dom.viewerImportUnitValue.textContent = String(importMeta?.effectiveUnit || importMeta?.detectedUnit || "unitless");
  }
  const buttons = [dom.viewerImportScaleBtn1, dom.viewerImportScaleBtn2, dom.viewerImportScaleBtn3];
  for (let i = 0; i < buttons.length; i += 1) {
    const btn = buttons[i];
    if (!btn) continue;
    const scale = Number(suggested[i]);
    if (Number.isFinite(scale) && scale > 0) {
      btn.style.display = "";
      btn.textContent = `x${scale}`;
      btn.dataset.scale = String(scale);
    } else {
      btn.style.display = "none";
      btn.textContent = "";
      btn.dataset.scale = "";
    }
  }
  if (dom.viewerImportResetViewBtn) dom.viewerImportResetViewBtn.textContent = t.resetView;
}
