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
  gridThresholdsFromTiming,
  normalizeLineTypePreset,
  normalizeLineWidthPreset,
  normalizeMaxZoomPreset,
  normalizeMenuScaleAutoPreset,
  normalizeWheelZoomPreset,
  normalizeMenuScalePreset,
  normalizePageScalePreset,
  normalizeGridPreset,
} from "./ui_numeric.js";
export function refreshUiMain(state, dom) {
  const buildNo = String(state.buildVersion || "unknown");
  if (dom.buildBadge) dom.buildBadge.style.display = "none";
  if (dom.settingsBuildBadge) dom.settingsBuildBadge.style.display = "none";
  if (dom.selectionDebugBadge) dom.selectionDebugBadge.style.display = "none";
  document.title = `S-CAD Build No: ${buildNo}`;
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
        refreshUiMain(state, dom);
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
    normalizeWheelZoomPreset,
    normalizeMenuScaleAutoPreset,
    normalizeMenuScalePreset,
    normalizePositiveNumber,
    refreshCustomPageSizeUnitLabels,
    refreshGridUnitLabels,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  });
  refreshStartSetupOverlay(state, dom, panelLang, {
    syncInputValue,
    normalizePageScalePreset,
    normalizePositiveNumber,
  });
  if (state.ui?.pendingFocusSelectMoveInput && typeof dom.focusSelectMoveInput === "function") {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (!state.ui?.pendingFocusSelectMoveInput) return;
        dom.focusSelectMoveInput();
        if (document.activeElement === dom.selectMoveDxInput || document.activeElement === dom.selectToolDxInput) {
          state.ui.pendingFocusSelectMoveInput = false;
        }
      });
    } else {
      dom.focusSelectMoveInput();
      if (document.activeElement === dom.selectMoveDxInput || document.activeElement === dom.selectToolDxInput) {
        state.ui.pendingFocusSelectMoveInput = false;
      }
    }
  }
}

function refreshStartSetupOverlay(state, dom, panelLang, helpers) {
  const { syncInputValue, normalizePageScalePreset, normalizePositiveNumber } = helpers;
  const visible = !!state.ui?.startSetupVisible;
  if (dom.startSetupOverlay) dom.startSetupOverlay.style.display = visible ? "flex" : "none";
  if (!visible) return;
  const isJa = String(panelLang || "en").toLowerCase().startsWith("ja");
  if (dom.startSetupTitle) dom.startSetupTitle.textContent = isJa ? "新規作成" : "New File";
  if (dom.startSetupSubtitle) dom.startSetupSubtitle.textContent = isJa
    ? "用紙とグリッドを決めてから開始できます。"
    : "Set page and grid options before you start drawing.";
  if (dom.startSetupProjectFolderLabel) dom.startSetupProjectFolderLabel.textContent = isJa ? "プロジェクトフォルダ" : "Project Folder";
  if (dom.startSetupSelectProjectFolderBtn) dom.startSetupSelectProjectFolderBtn.textContent = isJa ? "フォルダ選択" : "Choose Folder";
  if (dom.startSetupClearProjectFolderBtn) dom.startSetupClearProjectFolderBtn.textContent = isJa ? "解除" : "Unlink";
  if (dom.startSetupPageTitle) dom.startSetupPageTitle.textContent = isJa ? "用紙設定" : "Page Settings";
  if (dom.startSetupGridTitle) dom.startSetupGridTitle.textContent = isJa ? "グリッド設定" : "Grid Settings";
  if (dom.startSetupPageSizeLabel) dom.startSetupPageSizeLabel.textContent = isJa ? "用紙サイズ" : "Paper Size";
  if (dom.startSetupOrientationLabel) dom.startSetupOrientationLabel.textContent = isJa ? "向き" : "Orientation";
  if (dom.startSetupCustomPageToggleLabel) dom.startSetupCustomPageToggleLabel.textContent = isJa ? "カスタムサイズ" : "Custom Size";
  if (dom.startSetupWidthLabel) dom.startSetupWidthLabel.textContent = isJa ? "幅" : "Width";
  if (dom.startSetupHeightLabel) dom.startSetupHeightLabel.textContent = isJa ? "高さ" : "Height";
  if (dom.startSetupScaleLabel) dom.startSetupScaleLabel.textContent = isJa ? "尺度 (1:)" : "Scale (1:)";
  if (dom.startSetupCustomScaleToggleLabel) dom.startSetupCustomScaleToggleLabel.textContent = isJa ? "カスタム尺度" : "Custom Scale";
  if (dom.startSetupUnitLabel) dom.startSetupUnitLabel.textContent = isJa ? "単位" : "Unit";
  if (dom.startSetupMarginLabel) dom.startSetupMarginLabel.textContent = isJa ? "余白" : "Inner Margin";
  if (dom.startSetupPageShowFrameLabel) dom.startSetupPageShowFrameLabel.textContent = isJa ? "用紙枠を表示" : "Show Paper Frame";
  if (dom.startSetupGridSizeLabel) dom.startSetupGridSizeLabel.textContent = isJa ? "基準グリッド" : "Base Grid";
  if (dom.startSetupCustomGridToggleLabel) dom.startSetupCustomGridToggleLabel.textContent = isJa ? "カスタムグリッド" : "Custom Grid";
  if (dom.startSetupGridShowLabel) dom.startSetupGridShowLabel.textContent = isJa ? "グリッド表示" : "Show Grid";
  if (dom.startSetupGridAutoLabel) dom.startSetupGridAutoLabel.textContent = isJa ? "自動切替" : "Auto Switch";
  if (dom.startSetupGridAutoTimingTitle) dom.startSetupGridAutoTimingTitle.textContent = isJa ? "切替タイミング" : "Switch Timing";
  if (dom.startSetupStartBtn) dom.startSetupStartBtn.textContent = isJa ? "開始" : "Start";
  if (dom.startSetupPageSizeSelect) {
    const v = String(state.pageSetup?.size || "A4");
    if (dom.startSetupPageSizeSelect.value !== v) dom.startSetupPageSizeSelect.value = v;
    dom.startSetupPageSizeSelect.disabled = !!state.pageSetup?.customSizeEnabled;
  }
  if (dom.startSetupCustomPageToggle) dom.startSetupCustomPageToggle.checked = !!state.pageSetup?.customSizeEnabled;
  if (dom.startSetupCustomPageWidthInput) {
    syncInputValue(dom.startSetupCustomPageWidthInput, Math.max(1, Number(state.pageSetup?.customWidthMm ?? 297) || 297));
    dom.startSetupCustomPageWidthInput.disabled = !state.pageSetup?.customSizeEnabled;
  }
  if (dom.startSetupCustomPageHeightInput) {
    syncInputValue(dom.startSetupCustomPageHeightInput, Math.max(1, Number(state.pageSetup?.customHeightMm ?? 210) || 210));
    dom.startSetupCustomPageHeightInput.disabled = !state.pageSetup?.customSizeEnabled;
  }
  if (dom.startSetupOrientationSelect) {
    const v = (String(state.pageSetup?.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
    if (dom.startSetupOrientationSelect.value !== v) dom.startSetupOrientationSelect.value = v;
  }
  if (dom.startSetupPageScaleSelect) {
    const v = normalizePageScalePreset(state.pageSetup?.presetScale ?? state.pageSetup?.scale ?? 1);
    syncInputValue(dom.startSetupPageScaleSelect, v);
    dom.startSetupPageScaleSelect.disabled = !!state.pageSetup?.customScaleEnabled;
  }
  if (dom.startSetupCustomScaleToggle) dom.startSetupCustomScaleToggle.checked = !!state.pageSetup?.customScaleEnabled;
  if (dom.startSetupCustomScaleInput) {
    syncInputValue(dom.startSetupCustomScaleInput, normalizePositiveNumber(state.pageSetup?.customScale ?? state.pageSetup?.scale ?? 1, 1, 0.0001));
    dom.startSetupCustomScaleInput.disabled = !state.pageSetup?.customScaleEnabled;
  }
  if (dom.startSetupPageUnitSelect) {
    const v = String(state.pageSetup?.unit || "mm");
    if (dom.startSetupPageUnitSelect.value !== v) dom.startSetupPageUnitSelect.value = v;
  }
  if (dom.startSetupPageShowFrameToggle) dom.startSetupPageShowFrameToggle.checked = state.pageSetup?.showFrame !== false;
  if (dom.startSetupPageInnerMarginInput) {
    syncInputValue(dom.startSetupPageInnerMarginInput, Math.max(0, Number(state.pageSetup?.innerMarginMm ?? 10) || 0));
  }
  if (dom.startSetupCustomPageWidthUnitLabel) dom.startSetupCustomPageWidthUnitLabel.textContent = `(${String(state.pageSetup?.unit || "mm")})`;
  if (dom.startSetupCustomPageHeightUnitLabel) dom.startSetupCustomPageHeightUnitLabel.textContent = `(${String(state.pageSetup?.unit || "mm")})`;
  if (dom.startSetupPageInnerMarginUnitLabel) dom.startSetupPageInnerMarginUnitLabel.textContent = `(${String(state.pageSetup?.unit || "mm")})`;
  if (dom.startSetupGridSizeSelect) {
    const v = normalizePositiveNumber(state.grid?.customSizeEnabled ? state.grid?.presetSize : state.grid?.size, 10, 1);
    syncInputValue(dom.startSetupGridSizeSelect, v);
  }
  if (dom.startSetupCustomGridToggle) dom.startSetupCustomGridToggle.checked = !!state.grid?.customSizeEnabled;
  if (dom.startSetupCustomGridInput) {
    syncInputValue(dom.startSetupCustomGridInput, Math.max(1, Number(state.grid?.customSize ?? 10) || 10));
    dom.startSetupCustomGridInput.disabled = !state.grid?.customSizeEnabled;
  }
  const unit = String(state.pageSetup?.unit || "mm");
  if (dom.startSetupGridUnitLabel) dom.startSetupGridUnitLabel.textContent = `(${unit})`;
  if (dom.startSetupCustomGridUnitLabel) dom.startSetupCustomGridUnitLabel.textContent = `(${unit})`;
  if (dom.startSetupGridShowToggle) dom.startSetupGridShowToggle.checked = !!state.grid?.show;
  if (dom.startSetupGridAutoToggle) dom.startSetupGridAutoToggle.checked = !!state.grid?.auto;
  const timing = Number.isFinite(Number(state.grid?.autoTiming))
    ? Number(state.grid.autoTiming)
    : gridAutoTimingFromThreshold50(state.grid?.autoThreshold50 ?? 130);
  if (dom.startSetupGridAutoTimingSlider) syncInputValue(dom.startSetupGridAutoTimingSlider, clampGridAutoTiming(timing));
  if (dom.startSetupGridAutoTimingLabel) dom.startSetupGridAutoTimingLabel.textContent = localizeGridAutoTimingLabelText(timing, panelLang);
  if (dom.startSetupGridAutoHint) {
    const th = gridThresholdsFromTiming(timing);
    dom.startSetupGridAutoHint.textContent = isJa
      ? `閾値: 50=${th.th50}% / 10=${th.th10}% / 5=${th.th5}% / 1=${th.th1}%`
      : `Thresholds: 50=${th.th50}% / 10=${th.th10}% / 5=${th.th5}% / 1=${th.th1}%`;
  }
  if (dom.startSetupSelectProjectFolderBtn || dom.startSetupClearProjectFolderBtn || dom.startSetupProjectFolderStatus) {
    const info = state.ui?.projectFolder || {};
    const supported = info.supported !== false;
    const linked = !!info.linked;
    if (dom.startSetupSelectProjectFolderBtn) dom.startSetupSelectProjectFolderBtn.disabled = !supported;
    if (dom.startSetupClearProjectFolderBtn) dom.startSetupClearProjectFolderBtn.disabled = !linked;
    if (dom.startSetupProjectFolderStatus) {
      let text = isJa ? "ブラウザ保存のみを使用" : "Using browser storage only";
      if (!supported) text = isJa ? "このブラウザではプロジェクトフォルダ保存に対応していません" : "Project folder save is not supported in this browser";
      else if (linked && info.source === "file") text = `${isJa ? "連携中" : "Linked"}: ${String(info.name || "")}`;
      else if (linked) text = `${isJa ? "連携中" : "Linked"}: ${String(info.name || "")} ${isJa ? "(ブラウザ代替)" : "(browser fallback)"}`;
      dom.startSetupProjectFolderStatus.textContent = text;
    }
  }
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

