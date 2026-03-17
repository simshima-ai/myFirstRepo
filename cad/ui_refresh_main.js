import { TOOL_SHORTCUT_TOOL_ORDER, sanitizeToolShortcuts } from "./state.js";
import { refreshAttrPanel } from "./ui_attr_panel.js";
import { resolveTopActiveContext } from "./ui_context_panels.js";
import { getTopContextHelpText } from "./ui_context_help.js";
import { refreshStatusBar } from "./ui_status_bar.js";
import { refreshGroupContext } from "./ui_group_context.js";
import { getUiLanguage, normalizePositiveNumber, localizeGridAutoTimingLabelText, refreshCustomPageSizeUnitLabels, refreshGridUnitLabels, applyLanguageUi } from "./ui_i18n.js";
import { refreshLeftMenuVisibilitySettings } from "./ui_menu_visibility.js";
import { refreshToolPanels } from "./ui_refresh_tool_panels.js";
import { setupLayoutAndTopContext } from "./ui_layout_context.js";
import { refreshToolShortcutSettings } from "./ui_shortcuts_panel.js";
import { refreshSettingsAndTouchPanels } from "./ui_refresh_settings.js";
import { refreshGroupListPanel } from "./ui_group_list_panel.js";
import { refreshSelectionAndGroupPanels } from "./ui_refresh_selection_group.js";
import { refreshLayerPanels } from "./ui_refresh_layers.js";
import { isLeftMenuItemVisible, getViewportSizeForUi } from "./ui_left_menu_core.js";
import { getPanelText, getStatusBarText } from "./ui_text.js";
import { computeShapesBounds } from "./import_analysis.js";
import {
  clampGridAutoTiming,
  gridAutoTimingFromThreshold50,
  normalizeLineTypePreset,
  normalizeLineWidthPreset,
  normalizeMaxZoomPreset,
  normalizeMenuScalePreset,
  normalizePageScalePreset,
  normalizeGridPreset,
} from "./ui_numeric.js";
export function refreshUiMain(state, dom) {
  if (dom.buildBadge) dom.buildBadge.textContent = `Build ${state.buildVersion}`;
  dom.statusText.textContent = state.ui.statusText || "";
  applyLanguageUi(state, dom);
  const displayMode = String(state.ui?.displayMode || "cad").toLowerCase();
  const modeButtons = [
    [dom.cadHomeModeViewer, "viewer"],
    [dom.cadHomeModeEasy, "easy"],
    [dom.cadHomeModeCad, "cad"],
  ];
  for (const [btn, mode] of modeButtons) {
    if (!btn) continue;
    btn.classList.toggle("is-active", displayMode === mode);
    btn.style.display = (displayMode === mode) ? "none" : "";
  }
  for (const node of Array.from(document.querySelectorAll(".sidebar [data-menu-item-key]"))) {
    const key = String(node.getAttribute("data-menu-item-key") || "");
    if (!key) continue;
    node.style.display = isLeftMenuItemVisible(state, key) ? "" : "none";
  }
  if (String(state.tool || "") === "settings") {
    refreshLeftMenuVisibilitySettings(state, dom, {
      getUiLanguage,
      isLeftMenuItemVisible,
      onToggle: (key, checked) => {
        if (!state.ui) state.ui = {};
        if (!state.ui.leftMenuVisibility || typeof state.ui.leftMenuVisibility !== "object") state.ui.leftMenuVisibility = {};
        state.ui.leftMenuVisibility[key] = !!checked;
        refreshUi(state, dom);
      },
    });
    refreshToolShortcutSettings(state, dom, {
      getUiLanguage,
      sanitizeToolShortcuts,
      toolOrder: TOOL_SHORTCUT_TOOL_ORDER,
    });
  }
  const panelLang = getUiLanguage(state);
  const panelText = getPanelText(panelLang);
  const tool = String(state.tool || "");
  const { getMaxGroupPanelHeight } = setupLayoutAndTopContext(state, tool, {
    getUiLanguage,
    getViewportSizeForUi,
    normalizeMenuScalePreset,
    resolveTopActiveContext,
    getTopContextHelpText,
  });
  const syncInputValue = (el, value) => {
    if (!el) return;
    if (document.activeElement === el) return;
    const s = String(value);
    if (el.value !== s) el.value = s;
  };
  refreshStatusBar(state, dom);
  refreshGroupContext(state, dom, panelLang);
  const leftToolPanels = [dom.toolButtons, dom.editToolButtons, dom.fileToolButtons].filter(Boolean);
  const flash = state.ui?.flashAction;
  const hasActiveFlash = !!(flash && Number(flash.until || 0) > Date.now());
  for (const panel of leftToolPanels) {
    for (const btn of panel.querySelectorAll("button[data-tool]")) {
      btn.classList.toggle("active", !hasActiveFlash && btn.dataset.tool === state.tool);
    }
    for (const btn of panel.querySelectorAll("button[data-action]")) {
      const isFlashActive = flash
        && String(flash.id || "") === String(btn.dataset.action || "")
        && Number(flash.until || 0) > Date.now();
      btn.classList.toggle("active", !!isFlashActive);
    }
  }
  if (dom.undoBtn) {
    for (const btn of dom.toolButtons.querySelectorAll("button[data-action='undo']")) {
      btn.disabled = !(state.history?.past?.length > 0);
    }
  }
  if (dom.redoBtn) {
    for (const btn of dom.toolButtons.querySelectorAll("button[data-action='redo']")) {
      btn.disabled = !(state.history?.future?.length > 0);
    }
  }
  if (dom.undoBtn) dom.undoBtn.disabled = !(state.history?.past?.length > 0);
  if (dom.redoBtn) dom.redoBtn.disabled = !(state.history?.future?.length > 0);
  refreshViewerImportMetaUi(state, dom);
  refreshToolPanels(state, dom, panelLang, {
    getUiLanguage,
    normalizeGridPreset,
    clampGridAutoTiming,
    gridAutoTimingFromThreshold50,
    localizeGridAutoTimingLabelText,
    refreshAttrPanel,
    syncInputValue,
  });

  refreshLayerPanels(state, dom, panelText, getUiLanguage, getMaxGroupPanelHeight);

  refreshGroupListPanel(state, dom, panelText, getUiLanguage, getMaxGroupPanelHeight);

  refreshSelectionAndGroupPanels(state, dom, panelLang, panelText, {
    syncInputValue,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  });

  refreshSettingsAndTouchPanels(state, dom, panelLang, {
    syncInputValue,
    normalizePageScalePreset,
  normalizeGridPreset,
    normalizeMaxZoomPreset,
    normalizeMenuScalePreset,
    normalizePositiveNumber,
    refreshCustomPageSizeUnitLabels,
    refreshGridUnitLabels,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  });
}

function refreshViewerImportMetaUi(state, dom) {
  const displayMode = String(state.ui?.displayMode || "cad").toLowerCase();
  const hasShapes = Array.isArray(state.shapes) && state.shapes.length > 0;
  const importMeta = state.importMeta && typeof state.importMeta === "object" ? state.importMeta : null;
  const liveBounds = getViewerLiveBounds(state);
  const t = getStatusBarText(state);
  const showImportMeta = displayMode === "viewer" && hasShapes && !!importMeta;
  if (dom.viewerImportMeta) dom.viewerImportMeta.style.display = showImportMeta ? "flex" : "none";
  if (dom.viewerImportUnitLabel) dom.viewerImportUnitLabel.textContent = t.detectedUnit;
  if (dom.viewerImportUnitValue) {
    dom.viewerImportUnitValue.textContent = String(importMeta?.effectiveUnit || importMeta?.detectedUnit || "unitless");
  }
  if (dom.viewerImportBoundsLabel) dom.viewerImportBoundsLabel.textContent = t.bounds;
  if (dom.viewerImportBoundsValue) {
    dom.viewerImportBoundsValue.textContent = formatViewerBounds(liveBounds, importMeta?.effectiveUnit || importMeta?.detectedUnit || "unitless");
  }
  const suggested = Array.isArray(importMeta?.suggestedScales) ? importMeta.suggestedScales.slice(0, 3) : [];
  const buttons = [dom.viewerImportScaleBtn1, dom.viewerImportScaleBtn2, dom.viewerImportScaleBtn3];
  for (let i = 0; i < buttons.length; i += 1) {
    const btn = buttons[i];
    if (!btn) continue;
    const scale = Number(suggested[i]);
    if (showImportMeta && Number.isFinite(scale) && scale > 0) {
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

function getViewerLiveBounds(state) {
  const importAdjustIds = Array.isArray(state.ui?.importAdjust?.shapeIds)
    ? state.ui.importAdjust.shapeIds.map(Number).filter(Number.isFinite)
    : [];
  if (importAdjustIds.length > 0) {
    const importAdjustIdSet = new Set(importAdjustIds);
    const importAdjustShapes = (state.shapes || []).filter((s) => importAdjustIdSet.has(Number(s?.id)));
    const importAdjustBounds = computeShapesBounds(importAdjustShapes);
    if (importAdjustBounds) return importAdjustBounds;
  }
  const selectedIds = new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite));
  if (selectedIds.size > 0) {
    const selectedShapes = (state.shapes || []).filter((s) => selectedIds.has(Number(s?.id)));
    const selectedBounds = computeShapesBounds(selectedShapes);
    if (selectedBounds) return selectedBounds;
  }
  const activeGroupId = Number(state.activeGroupId);
  if (Number.isFinite(activeGroupId)) {
    const groupShapes = (state.shapes || []).filter((s) => Number(s?.groupId) === activeGroupId);
    const groupBounds = computeShapesBounds(groupShapes);
    if (groupBounds) return groupBounds;
  }
  return computeShapesBounds(state.shapes || []);
}

function formatViewerBounds(bounds, unit) {
  const width = Math.abs(Number(bounds?.maxX) - Number(bounds?.minX));
  const height = Math.abs(Number(bounds?.maxY) - Number(bounds?.minY));
  if (!(Number.isFinite(width) && Number.isFinite(height))) return "-";
  const suffix = String(unit || "unitless").trim();
  return `${formatViewerNumber(width)} x ${formatViewerNumber(height)} ${suffix}`.trim();
}

function formatViewerNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1000) return Math.round(n).toLocaleString("en-US");
  if (abs >= 10) return (Math.round(n * 10) / 10).toString();
  if (abs >= 1) return (Math.round(n * 100) / 100).toString();
  return (Math.round(n * 1000) / 1000).toString();
}

