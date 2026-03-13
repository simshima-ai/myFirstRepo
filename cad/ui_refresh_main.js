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
  dom.buildBadge.textContent = `Build ${state.buildVersion}`;
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
  const panelText = (panelLang === "en")
    ? {
      hiddenSuffix: " (hidden)",
      setAsCurrentLayerTitle: "Double-click to set as current layer",
      toggleLayerModeTitle: "Toggle ON / OFF / LOCK",
      moveObjectsToLayer: "Move Objects",
      noObjects: "No objects",
      active: "Active",
      clickToSelect: "Click to select",
      ungrouped: "Ungrouped",
      clickToSelectObject: "Click to select object",
      movingOrigin: "Moving origin...",
      moveOrigin: "Move Origin",
    }
    : {
      hiddenSuffix: " (hidden)",
      setAsCurrentLayerTitle: "Double-click to set as current layer",
      toggleLayerModeTitle: "Toggle ON / OFF / LOCK",
      moveObjectsToLayer: "Move Objects",
      noObjects: "No objects",
      active: "Active",
      clickToSelect: "Click to select",
      ungrouped: "Ungrouped",
      clickToSelectObject: "Click to select object",
      movingOrigin: "Moving origin...",
      moveOrigin: "Move Origin",
    };
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

