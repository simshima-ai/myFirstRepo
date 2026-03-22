import { bindToolParameterEvents } from "./ui_tool_param_events.js";

export function bindInitTailEvents(params) {
  const {
    state,
    dom,
    actions,
    bindColorInputPalette,
    normalizePositiveNumber,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  normalizePageScalePreset,
  normalizeMaxZoomPreset,
  normalizeWheelZoomPreset,
  normalizeMenuScalePreset,
} = params;
  const isTouchDebugEnabled = (() => {
    try {
      if (new URLSearchParams(window.location.search).has("debugTouch")) return true;
      return window.localStorage?.getItem("s-cad:debug-touch") === "1";
    } catch (_) {
      return false;
    }
  })();
  const touchDebugLog = (msg) => {
    if (!isTouchDebugEnabled) return;
    try { console.log(`[touch-debug] ${msg}`); } catch (_) {}
    actions.setStatus?.(`[touch-debug] ${msg}`);
  };
  const touchPanelDrag = {
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
  };
  const clampTouchPanelPos = (x, y) => {
    const panel = dom.touchToolPanel;
    const width = Math.max(180, Number(panel?.offsetWidth || 250) || 250);
    const height = Math.max(90, Number(panel?.offsetHeight || 120) || 120);
    const maxX = Math.max(8, window.innerWidth - width - 8);
    const maxY = Math.max(8, window.innerHeight - height - 8);
    return {
      x: Math.max(8, Math.min(maxX, Number(x) || 14)),
      y: Math.max(8, Math.min(maxY, Number(y) || 14)),
    };
  };
  const applyTouchPanelPos = (x, y) => {
    const pos = clampTouchPanelPos(x, y);
    if (dom.touchToolPanel) {
      dom.touchToolPanel.style.left = `${pos.x}px`;
      dom.touchToolPanel.style.top = `${pos.y}px`;
    }
    if (!state.ui) state.ui = {};
    state.ui.touchPanelPos = pos;
    return pos;
  };
  const finishTouchPanelDrag = (commit = false) => {
    if (!touchPanelDrag.active) return;
    touchPanelDrag.active = false;
    const pos = state.ui?.touchPanelPos || {
      x: touchPanelDrag.startLeft,
      y: touchPanelDrag.startTop,
    };
    if (commit) actions.setTouchPanelPosition?.(pos);
  };
  if (dom.moveGroupBtn) {
    dom.moveGroupBtn.addEventListener("click", () => {
      const dx = Number(dom.groupMoveDxInput?.value || 0);
      const dy = Number(dom.groupMoveDyInput?.value || 0);
      actions.moveActiveGroup(dx, dy);
    });
  }
  if (dom.copyGroupBtn) {
    dom.copyGroupBtn.addEventListener("click", () => {
      const dx = Number(dom.groupMoveDxInput?.value || 0);
      const dy = Number(dom.groupMoveDyInput?.value || 0);
      actions.copyActiveGroup?.(dx, dy);
    });
  }
  if (dom.moveGroupOriginOnlyBtn) {
    dom.moveGroupOriginOnlyBtn.addEventListener("click", () => {
      actions.beginMoveActiveGroupOriginOnly?.();
    });
  }
  if (dom.groupAimEnableToggle) {
    dom.groupAimEnableToggle.addEventListener("change", () => {
      actions.setActiveGroupAimEnabled?.(!!dom.groupAimEnableToggle.checked);
    });
  }
  if (dom.groupAimPickBtn) {
    dom.groupAimPickBtn.addEventListener("click", () => {
      actions.pickOrConfirmActiveGroupAimTarget?.();
    });
  }
  if (dom.groupAimClearBtn) {
    dom.groupAimClearBtn.addEventListener("click", () => {
      actions.clearActiveGroupAimTarget?.();
    });
  }
  const normalizeGroupScaleInput = (el, fallback = 1) => {
    if (!el) return fallback;
    const v = Math.max(1e-6, Number(el.value) || fallback);
    const rounded = Math.round(v * 1000) / 1000;
    el.value = String(rounded);
    return rounded;
  };
  if (dom.groupScaleEnableToggle) {
    dom.groupScaleEnableToggle.addEventListener("change", () => {
      actions.setActiveGroupScaleOptions?.({
        allowScale: !!dom.groupScaleEnableToggle.checked,
      });
    });
  }
  if (dom.groupScaleKeepAspectToggle) {
    dom.groupScaleKeepAspectToggle.addEventListener("change", () => {
      const keepAspect = !!dom.groupScaleKeepAspectToggle.checked;
      const sx = normalizeGroupScaleInput(dom.groupScaleFactorXInput, 1);
      let sy = normalizeGroupScaleInput(dom.groupScaleFactorYInput, sx);
      if (keepAspect) {
        sy = sx;
        if (dom.groupScaleFactorYInput) dom.groupScaleFactorYInput.value = String(sx);
      }
      if (dom.groupScaleFactorInput) dom.groupScaleFactorInput.value = String(sx);
      actions.setActiveGroupScaleOptions?.({ keepAspect, scaleX: sx, scaleY: sy, scaleFactor: sx });
    });
  }
  if (dom.groupScaleApplyBtn) {
    dom.groupScaleApplyBtn.addEventListener("click", () => {
      const sx = normalizeGroupScaleInput(dom.groupScaleFactorXInput, 1);
      const keepAspect = !!dom.groupScaleKeepAspectToggle?.checked;
      const sy = keepAspect ? sx : normalizeGroupScaleInput(dom.groupScaleFactorYInput, 1);
      if (dom.groupScaleFactorYInput) dom.groupScaleFactorYInput.value = String(sy);
      if (dom.groupScaleFactorInput) dom.groupScaleFactorInput.value = String(sx);
      actions.setActiveGroupScaleFactors?.(sx, sy);
    });
  }
  if (dom.groupScaleFactorXInput) {
    dom.groupScaleFactorXInput.addEventListener("change", () => {
      const sx = normalizeGroupScaleInput(dom.groupScaleFactorXInput, 1);
      if (dom.groupScaleKeepAspectToggle?.checked && dom.groupScaleFactorYInput) {
        dom.groupScaleFactorYInput.value = String(sx);
      }
      if (dom.groupScaleFactorInput) dom.groupScaleFactorInput.value = String(sx);
    });
  }
  if (dom.groupScaleFactorYInput) {
    dom.groupScaleFactorYInput.addEventListener("change", () => {
      if (dom.groupScaleKeepAspectToggle?.checked) {
        const sx = normalizeGroupScaleInput(dom.groupScaleFactorXInput, 1);
        dom.groupScaleFactorYInput.value = String(sx);
        return;
      }
      normalizeGroupScaleInput(dom.groupScaleFactorYInput, 1);
    });
  }
  if (dom.groupScaleFactorInput) {
    dom.groupScaleFactorInput.addEventListener("change", () => {
      const sx = normalizeGroupScaleInput(dom.groupScaleFactorInput, 1);
      if (dom.groupScaleFactorXInput) dom.groupScaleFactorXInput.value = String(sx);
      if (dom.groupScaleKeepAspectToggle?.checked && dom.groupScaleFactorYInput) {
        dom.groupScaleFactorYInput.value = String(sx);
      }
    });
  }
  if (dom.moveSelectedShapesBtn) {
    dom.moveSelectedShapesBtn.addEventListener("click", () => {
      const dx = Number(dom.selectMoveDxInput?.value || 0);
      const dy = Number(dom.selectMoveDyInput?.value || 0);
      actions.moveSelectedShapes?.(dx, dy);
    });
  }
  if (dom.copySelectedShapesBtn) {
    dom.copySelectedShapesBtn.addEventListener("click", () => {
      const dx = Number(dom.selectMoveDxInput?.value || 0);
      const dy = Number(dom.selectMoveDyInput?.value || 0);
      actions.copySelectedShapes?.(dx, dy);
    });
  }
  if (dom.selectionTextContentInput) {
    dom.selectionTextContentInput.addEventListener("input", (e) => {
      actions.updateSelectedTextSettings?.({ text: e.target.value });
    });
  }
  if (dom.selectionTextSizePtInput) {
    dom.selectionTextSizePtInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textSizePt: Number(e.target.value) || 12 });
    });
  }
  if (dom.selectionTextRotateInput) {
    dom.selectionTextRotateInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textRotate: Number(e.target.value) || 0 });
    });
  }
  if (dom.selectionTextFontFamilyInput) {
    dom.selectionTextFontFamilyInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textFontFamily: e.target.value });
    });
  }
  if (dom.selectionTextBoldInput) {
    dom.selectionTextBoldInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textBold: !!e.target.checked });
    });
  }
  if (dom.selectionTextItalicInput) {
    dom.selectionTextItalicInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textItalic: !!e.target.checked });
    });
  }
  if (dom.selectionLeaderArrowTypeSelect) {
    dom.selectionLeaderArrowTypeSelect.addEventListener("change", (e) => {
      const raw = String(e.target.value || "open").toLowerCase();
      const v = (raw === "closed" || raw === "hollow" || raw === "circle" || raw === "circle_filled") ? raw : "open";
      actions.applyDimSettingsToSelection?.({ dimArrowType: v });
    });
  }
  if (dom.selectionLeaderArrowSizeInput) {
    dom.selectionLeaderArrowSizeInput.addEventListener("change", (e) => {
      const v = Math.max(1, Number(e.target.value) || 10);
      e.target.value = String(v);
      actions.applyDimSettingsToSelection?.({ dimArrowSizePt: v });
    });
  }
  if (dom.selectionLeaderLineWidthInput) {
    dom.selectionLeaderLineWidthInput.addEventListener("change", (e) => {
      const v = Math.max(0.01, Number(e.target.value) || 0.25);
      e.target.value = String(v);
      actions.applyDimSettingsToSelection?.({ lineWidthMm: v });
    });
  }
  bindColorInputPalette(dom.selectionLeaderColorInput, (c) => {
    actions.applyDimSettingsToSelection?.({ color: c });
  });
  bindToolParameterEvents({
    state,
    dom,
    actions,
    bindColorInputPalette,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  });
  if (dom.textContentInput) {
    dom.textContentInput.addEventListener("input", () => actions.setTextSettings({ content: dom.textContentInput.value }));
  }
  if (dom.textSizePtInput) {
    dom.textSizePtInput.addEventListener("change", () => actions.setTextSettings({ sizePt: Number(dom.textSizePtInput.value) || 12 }));
  }
  if (dom.textRotateInput) {
    dom.textRotateInput.addEventListener("change", () => actions.setTextSettings({ rotate: Number(dom.textRotateInput.value) || 0 }));
  }
  if (dom.textFontFamilyInput) {
    dom.textFontFamilyInput.addEventListener("change", () => actions.setTextSettings({ fontFamily: dom.textFontFamilyInput.value }));
  }
  if (dom.textBoldInput) {
    dom.textBoldInput.addEventListener("change", () => actions.setTextSettings({ bold: !!dom.textBoldInput.checked }));
  }
  if (dom.textItalicInput) {
    dom.textItalicInput.addEventListener("change", () => actions.setTextSettings({ italic: !!dom.textItalicInput.checked }));
  }
  bindColorInputPalette(dom.textColorInput, (c) => {
    actions.setTextSettings({ color: c });
  });
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.addEventListener("click", () => {
      actions.mergeSelectedShapesToGroup?.();
    });
  }
  if (dom.dimMergeGroupsBtn) {
    dom.dimMergeGroupsBtn.addEventListener("click", () => {
      actions.mergeSelectedShapesToGroup?.();
    });
  }
  if (dom.previewPrecisionSelect) {
    dom.previewPrecisionSelect.addEventListener("change", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.previewPrecisionSelect.value) || 0)));
      dom.previewPrecisionSelect.value = String(p);
      actions.setPreviewPrecision(p);
    });
  }
  if (dom.pageSizeSelect) {
    dom.pageSizeSelect.addEventListener("change", () => {
      actions.setPageSetup({ size: dom.pageSizeSelect.value });
      actions.refitViewToPage?.();
    });
  }
  if (dom.customPageSizeToggle || dom.customPageWidthInput || dom.customPageHeightInput) {
    const applyCustomPageSize = () => {
      const enabled = !!dom.customPageSizeToggle?.checked;
      const w = normalizePositiveNumber(dom.customPageWidthInput?.value, state.pageSetup?.customWidthMm ?? 297, 1);
      const h = normalizePositiveNumber(dom.customPageHeightInput?.value, state.pageSetup?.customHeightMm ?? 210, 1);
      if (dom.customPageWidthInput) dom.customPageWidthInput.value = String(w);
      if (dom.customPageHeightInput) dom.customPageHeightInput.value = String(h);
      actions.setPageSetup({ customSizeEnabled: enabled, customWidthMm: w, customHeightMm: h });
      actions.refitViewToPage?.();
    };
    if (dom.customPageSizeToggle) dom.customPageSizeToggle.addEventListener("change", applyCustomPageSize);
    if (dom.customPageWidthInput) {
      dom.customPageWidthInput.addEventListener("change", applyCustomPageSize);
      dom.customPageWidthInput.addEventListener("input", applyCustomPageSize);
    }
    if (dom.customPageHeightInput) {
      dom.customPageHeightInput.addEventListener("change", applyCustomPageSize);
      dom.customPageHeightInput.addEventListener("input", applyCustomPageSize);
    }
  }
  if (dom.pageOrientationSelect) {
    dom.pageOrientationSelect.addEventListener("change", () => {
      actions.setPageSetup({ orientation: dom.pageOrientationSelect.value });
      actions.refitViewToPage?.();
    });
  }
  if (dom.startSetupPageSizeSelect) {
    dom.startSetupPageSizeSelect.addEventListener("change", () => {
      actions.setPageSetup({ size: dom.startSetupPageSizeSelect.value });
      actions.refitViewToPage?.();
    });
  }
  if (dom.startSetupCustomPageToggle || dom.startSetupCustomPageWidthInput || dom.startSetupCustomPageHeightInput) {
    const applyStartSetupCustomPageSize = () => {
      const enabled = !!dom.startSetupCustomPageToggle?.checked;
      const w = normalizePositiveNumber(dom.startSetupCustomPageWidthInput?.value, state.pageSetup?.customWidthMm ?? 297, 1);
      const h = normalizePositiveNumber(dom.startSetupCustomPageHeightInput?.value, state.pageSetup?.customHeightMm ?? 210, 1);
      if (dom.startSetupCustomPageWidthInput) dom.startSetupCustomPageWidthInput.value = String(w);
      if (dom.startSetupCustomPageHeightInput) dom.startSetupCustomPageHeightInput.value = String(h);
      actions.setPageSetup({ customSizeEnabled: enabled, customWidthMm: w, customHeightMm: h });
      actions.refitViewToPage?.();
    };
    if (dom.startSetupCustomPageToggle) dom.startSetupCustomPageToggle.addEventListener("change", applyStartSetupCustomPageSize);
    if (dom.startSetupCustomPageWidthInput) {
      dom.startSetupCustomPageWidthInput.addEventListener("change", applyStartSetupCustomPageSize);
      dom.startSetupCustomPageWidthInput.addEventListener("input", applyStartSetupCustomPageSize);
    }
    if (dom.startSetupCustomPageHeightInput) {
      dom.startSetupCustomPageHeightInput.addEventListener("change", applyStartSetupCustomPageSize);
      dom.startSetupCustomPageHeightInput.addEventListener("input", applyStartSetupCustomPageSize);
    }
  }
  if (dom.startSetupOrientationSelect) {
    dom.startSetupOrientationSelect.addEventListener("change", () => {
      actions.setPageSetup({ orientation: dom.startSetupOrientationSelect.value });
      actions.refitViewToPage?.();
    });
  }
  if (dom.pageScaleInput) {
    const applyPageScalePreset = () => {
      const v = normalizePageScalePreset(dom.pageScaleInput.value);
      dom.pageScaleInput.value = String(v);
      const customOn = !!dom.customScaleToggle?.checked;
      const patch = { presetScale: v };
      if (!customOn) patch.scale = v;
      actions.setPageSetup(patch);
      if (!customOn) actions.refitViewToPage?.();
    };
    dom.pageScaleInput.addEventListener("change", applyPageScalePreset);
    dom.pageScaleInput.addEventListener("input", applyPageScalePreset);
  }
  if (dom.customScaleToggle || dom.customScaleInput) {
    const applyCustomScale = () => {
      const enabled = !!dom.customScaleToggle?.checked;
      const v = normalizePositiveNumber(dom.customScaleInput?.value, state.pageSetup?.customScale ?? state.pageSetup?.scale ?? 1, 0.0001);
      if (dom.customScaleInput) dom.customScaleInput.value = String(v);
      const patch = { customScaleEnabled: enabled, customScale: v };
      if (enabled) patch.scale = v;
      else patch.scale = normalizePageScalePreset(dom.pageScaleInput?.value ?? state.pageSetup?.presetScale ?? 1);
      actions.setPageSetup(patch);
      actions.refitViewToPage?.();
    };
    if (dom.customScaleToggle) dom.customScaleToggle.addEventListener("change", applyCustomScale);
    if (dom.customScaleInput) {
      dom.customScaleInput.addEventListener("change", applyCustomScale);
      dom.customScaleInput.addEventListener("input", applyCustomScale);
    }
  }
  if (dom.startSetupPageScaleSelect) {
    const applyStartSetupPageScalePreset = () => {
      const v = normalizePageScalePreset(dom.startSetupPageScaleSelect.value);
      dom.startSetupPageScaleSelect.value = String(v);
      const customOn = !!dom.startSetupCustomScaleToggle?.checked;
      const patch = { presetScale: v };
      if (!customOn) patch.scale = v;
      actions.setPageSetup(patch);
      if (!customOn) actions.refitViewToPage?.();
    };
    dom.startSetupPageScaleSelect.addEventListener("change", applyStartSetupPageScalePreset);
    dom.startSetupPageScaleSelect.addEventListener("input", applyStartSetupPageScalePreset);
  }
  if (dom.startSetupCustomScaleToggle || dom.startSetupCustomScaleInput) {
    const applyStartSetupCustomScale = () => {
      const enabled = !!dom.startSetupCustomScaleToggle?.checked;
      const v = normalizePositiveNumber(dom.startSetupCustomScaleInput?.value, state.pageSetup?.customScale ?? state.pageSetup?.scale ?? 1, 0.0001);
      if (dom.startSetupCustomScaleInput) dom.startSetupCustomScaleInput.value = String(v);
      const patch = { customScaleEnabled: enabled, customScale: v };
      if (enabled) patch.scale = v;
      else patch.scale = normalizePageScalePreset(dom.startSetupPageScaleSelect?.value ?? state.pageSetup?.presetScale ?? 1);
      actions.setPageSetup(patch);
      actions.refitViewToPage?.();
    };
    if (dom.startSetupCustomScaleToggle) dom.startSetupCustomScaleToggle.addEventListener("change", applyStartSetupCustomScale);
    if (dom.startSetupCustomScaleInput) {
      dom.startSetupCustomScaleInput.addEventListener("change", applyStartSetupCustomScale);
      dom.startSetupCustomScaleInput.addEventListener("input", applyStartSetupCustomScale);
    }
  }
  if (dom.startSetupPageUnitSelect) {
    dom.startSetupPageUnitSelect.addEventListener("change", () => {
      actions.setPageSetup({ unit: dom.startSetupPageUnitSelect.value || "mm" });
      actions.refitViewToPage?.();
    });
  }
  if (dom.startSetupPageShowFrameToggle) {
    dom.startSetupPageShowFrameToggle.addEventListener("change", () => {
      actions.setPageSetup({ showFrame: !!dom.startSetupPageShowFrameToggle.checked });
    });
  }
  if (dom.startSetupPageInnerMarginInput) {
    const applyStartSetupPageMargin = () => {
      const v = normalizePositiveNumber(dom.startSetupPageInnerMarginInput?.value, state.pageSetup?.innerMarginMm ?? 10, 0);
      dom.startSetupPageInnerMarginInput.value = String(v);
      actions.setPageSetup({ innerMarginMm: v });
    };
    dom.startSetupPageInnerMarginInput.addEventListener("change", applyStartSetupPageMargin);
    dom.startSetupPageInnerMarginInput.addEventListener("input", applyStartSetupPageMargin);
  }
  if (dom.startSetupStartBtn) {
    dom.startSetupStartBtn.addEventListener("click", () => {
      actions.setStartSetupVisible?.(false);
      actions.refitViewToPage?.();
      actions.setStatus?.(String(state.ui?.language || "en").toLowerCase().startsWith("ja") ? "作図を開始できます" : "Ready to start drawing");
    });
  }
  if (dom.startSetupSelectProjectFolderBtn) {
    dom.startSetupSelectProjectFolderBtn.addEventListener("click", () => {
      void actions.chooseProjectFolder?.();
    });
  }
  if (dom.startSetupClearProjectFolderBtn) {
    dom.startSetupClearProjectFolderBtn.addEventListener("click", () => {
      void actions.clearProjectFolder?.();
    });
  }
  if (dom.maxZoomInput) {
    dom.maxZoomInput.addEventListener("change", () => {
      const v = normalizeMaxZoomPreset(dom.maxZoomInput.value);
      dom.maxZoomInput.value = String(v);
      actions.setMaxZoomScale?.(v);
    });
  }
  if (dom.wheelZoomFactorSelect) {
    dom.wheelZoomFactorSelect.addEventListener("change", () => {
      const v = normalizeWheelZoomPreset(dom.wheelZoomFactorSelect.value);
      dom.wheelZoomFactorSelect.value = String(v);
      actions.setWheelZoomFactor?.(v);
    });
  }
  if (dom.uiLanguageSelect) {
    dom.uiLanguageSelect.addEventListener("change", () => {
      actions.setLanguage?.(dom.uiLanguageSelect.value || "ja");
    });
  }
  if (dom.menuScaleSelect) {
    dom.menuScaleSelect.addEventListener("change", () => {
      const v = normalizeMenuScalePreset(dom.menuScaleSelect.value);
      dom.menuScaleSelect.value = String(v);
      actions.setMenuScalePct?.(v);
    });
  }
  if (dom.menuScaleModeSelect) {
    dom.menuScaleModeSelect.addEventListener("change", () => {
      const mode = String(dom.menuScaleModeSelect.value || "auto").toLowerCase() === "manual" ? "manual" : "auto";
      dom.menuScaleModeSelect.value = mode;
      actions.setMenuScaleMode?.(mode);
    });
  }
  if (dom.menuScaleAutoSelect) {
    dom.menuScaleAutoSelect.addEventListener("change", () => {
      const preset = String(dom.menuScaleAutoSelect.value || "normal").toLowerCase();
      dom.menuScaleAutoSelect.value = preset;
      actions.setMenuScaleAutoPreset?.(preset);
    });
  }
  if (dom.touchModeToggle) {
    dom.touchModeToggle.addEventListener("change", () => {
      actions.setTouchMode?.(!!dom.touchModeToggle.checked);
    });
  }
  if (dom.touchToolPanelHeader) {
    dom.touchToolPanelHeader.addEventListener("pointerdown", (e) => {
      if (!state.ui?.touchMode) return;
      if (e.button != null && e.button !== 0) return;
      const panel = dom.touchToolPanel;
      if (!panel) return;
      const rect = panel.getBoundingClientRect();
      touchPanelDrag.active = true;
      touchPanelDrag.pointerId = e.pointerId ?? null;
      touchPanelDrag.startX = Number(e.clientX) || 0;
      touchPanelDrag.startY = Number(e.clientY) || 0;
      touchPanelDrag.startLeft = rect.left;
      touchPanelDrag.startTop = rect.top;
      try { dom.touchToolPanelHeader.setPointerCapture?.(e.pointerId); } catch (_) {}
      if (e.cancelable) e.preventDefault();
      e.stopPropagation?.();
    });
    dom.touchToolPanelHeader.addEventListener("pointermove", (e) => {
      if (!touchPanelDrag.active) return;
      if (touchPanelDrag.pointerId != null && e.pointerId !== touchPanelDrag.pointerId) return;
      const dx = (Number(e.clientX) || 0) - touchPanelDrag.startX;
      const dy = (Number(e.clientY) || 0) - touchPanelDrag.startY;
      applyTouchPanelPos(touchPanelDrag.startLeft + dx, touchPanelDrag.startTop + dy);
      if (e.cancelable) e.preventDefault();
      e.stopPropagation?.();
    });
    const endDrag = (e) => {
      if (!touchPanelDrag.active) return;
      if (touchPanelDrag.pointerId != null && e?.pointerId != null && e.pointerId !== touchPanelDrag.pointerId) return;
      if (e?.cancelable) e.preventDefault();
      e?.stopPropagation?.();
      try { dom.touchToolPanelHeader.releasePointerCapture?.(touchPanelDrag.pointerId); } catch (_) {}
      finishTouchPanelDrag(true);
    };
    dom.touchToolPanelHeader.addEventListener("pointerup", endDrag);
    dom.touchToolPanelHeader.addEventListener("pointercancel", endDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
  }
  if (dom.selectProjectFolderBtn) {
    dom.selectProjectFolderBtn.addEventListener("click", () => {
      void actions.chooseProjectFolder?.();
    });
  }
  if (dom.clearProjectFolderBtn) {
    dom.clearProjectFolderBtn.addEventListener("click", () => {
      void actions.clearProjectFolder?.();
    });
  }
  const bindAdToggle = (el, zoneKey) => {
    if (!el) return;
    el.addEventListener("change", () => {
      actions.setAdZoneEnabled?.(zoneKey, !!el.checked);
    });
  };
  bindAdToggle(dom.topRightAdZoneToggle, "topRight");
  bindAdToggle(dom.bottomLeftAdZoneToggle, "bottomLeft");
  bindAdToggle(dom.bottomCenterAdZoneToggle, "bottomCenter");
  if (dom.pngExportCloseBtn) {
    dom.pngExportCloseBtn.addEventListener("click", () => actions.closePngExportDialog?.());
  }
  if (dom.pngExportCancelBtn) {
    dom.pngExportCancelBtn.addEventListener("click", () => actions.closePngExportDialog?.());
  }
  if (dom.pngExportApplyBtn) {
    dom.pngExportApplyBtn.addEventListener("click", () => actions.runPngExportFromDialog?.());
  }
  if (dom.pngExportModal) {
    dom.pngExportModal.addEventListener("click", (e) => {
      if (e.target === dom.pngExportModal) actions.closePngExportDialog?.();
    });
  }
  if (dom.pngRangeModeSelect) {
    dom.pngRangeModeSelect.addEventListener("change", () => actions.syncPngExportVisibilityByRange?.());
  }
  if (dom.pngSizeModeSelect) {
    dom.pngSizeModeSelect.addEventListener("change", () => actions.syncPngExportVisibilityBySizeMode?.());
  }
  if (dom.pngBackgroundModeSelect && dom.pngBackgroundColorInput) {
    const syncBgColorEnabled = () => {
      const on = String(dom.pngBackgroundModeSelect.value || "white") === "color";
      dom.pngBackgroundColorInput.disabled = !on;
    };
    dom.pngBackgroundModeSelect.addEventListener("change", syncBgColorEnabled);
    syncBgColorEnabled();
  }
  if (dom.touchConfirmBtn) {
    let lastTouchConfirmAt = 0;
    const runTouchConfirm = (e = null) => {
      const now = Date.now();
      if (now - lastTouchConfirmAt < 120) return;
      lastTouchConfirmAt = now;
      if (e?.cancelable) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      if (!state.ui?.touchMode) return;
      const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
      const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
      if (String(state.tool || "") === "line" && !state.lineSettings?.sizeLocked) {
        const ok = !!actions.confirmTouchLineStep?.();
        touchDebugLog(`line confirm pressed mode=${lineMode} => ${ok}`);
        actions.draw?.();
        return;
      }
      const linearDraft = state.polylineDraft;
      const canFinalizeLinearDraft =
        !!linearDraft &&
        linearDraft.kind !== "bspline" &&
        Array.isArray(linearDraft.points) &&
        linearDraft.points.length >= 2;
      touchDebugLog(`confirm pressed tool=${String(state.tool || "")} lineMode=${String(state.lineSettings?.mode || "")} points=${Array.isArray(linearDraft?.points) ? linearDraft.points.length : 0} canFinalize=${canFinalizeLinearDraft}`);
      if (canFinalizeLinearDraft) {
        const ok = !!actions.finalizePolylineDraft?.();
        touchDebugLog(`finalizePolylineDraft() => ${ok}`);
        actions.draw?.();
        return;
      }
      const tool = String(state.tool || "");
      if (tool === "rect") {
        actions.confirmTouchRectStep?.();
        return;
      }
      if (tool === "line" && (lineMode === "continuous" || lineMode === "freehand")) {
        const ok = lineMode === "freehand"
          ? !!actions.finalizeBsplineDraft?.()
          : !!actions.finalizePolylineDraft?.();
        touchDebugLog(lineMode === "freehand" ? `fallback finalizeBsplineDraft() => ${ok}` : `fallback finalizePolylineDraft() => ${ok}`);
        actions.draw?.();
        return;
      }
      if (tool === "dim") {
        const draft = state.dimDraft;
        const ok = (draft && draft.type === "dimchain" && draft.awaitingPlacement)
          ? !!actions.finishTouchDimDraft?.()
          : !!actions.confirmTouchDimStep?.();
        touchDebugLog(draft && draft.type === "dimchain" && draft.awaitingPlacement
          ? `dim generate pressed => ${ok}`
          : `dim add target pressed => ${ok}`);
        actions.draw?.();
        return;
      }
      if (tool === "circle") {
        const ok = !!actions.confirmTouchCircleStep?.();
        touchDebugLog(`circle confirm pressed => ${ok}`);
        actions.draw?.();
        return;
      }
      if (tool === "text") {
        const ok = !!actions.confirmTouchTextStep?.();
        touchDebugLog(`text place pressed => ${ok}`);
        actions.draw?.();
        return;
      }
      if (tool === "patterncopy") {
        actions.executePatternCopy?.();
        return;
      }
      if (tool === "fillet") {
        const r = Number(dom.filletRadiusInput?.value || 0);
        actions.applyFillet?.(r);
        return;
      }
      if (tool === "doubleline") {
        actions.executeDoubleLine?.();
        return;
      }
      if (tool === "hatch") {
        actions.executeHatch?.();
      }
    };
    dom.touchConfirmBtn.addEventListener("click", runTouchConfirm);
    dom.touchConfirmBtn.addEventListener("pointerup", runTouchConfirm);
  }
  if (dom.touchLineFinishBtn) {
    const runTouchLineFinish = (e = null) => {
      if (e?.cancelable) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      if (!state.ui?.touchMode) return;
      if (String(state.tool || "") === "dim") {
        actions.prepareTouchDimChain?.();
        return;
      }
      actions.finishTouchLineDraft?.();
    };
    dom.touchLineFinishBtn.addEventListener("click", runTouchLineFinish);
    dom.touchLineFinishBtn.addEventListener("pointerup", runTouchLineFinish);
  }
  if (dom.touchSelectBackBtn) {
    const runTouchSelectBack = (e = null) => {
      if (e?.cancelable) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      if (!state.ui?.touchMode) return;
      actions.cancelTouchPending?.();
      actions.setTool?.("select");
    };
    dom.touchSelectBackBtn.addEventListener("click", runTouchSelectBack);
    dom.touchSelectBackBtn.addEventListener("pointerup", runTouchSelectBack);
  }
  if (dom.touchMultiSelectBtn) {
    dom.touchMultiSelectBtn.addEventListener("click", () => {
      if (!state.ui?.touchMode) return;
      actions.setTouchMultiSelect?.(!state.ui?.touchMultiSelect);
    });
  }
  if (dom.fpsDisplayToggle) {
    dom.fpsDisplayToggle.addEventListener("change", () => {
      actions.setFpsDisplay?.(!!dom.fpsDisplayToggle.checked);
    });
  }
  if (dom.objectCountDisplayToggle) {
    dom.objectCountDisplayToggle.addEventListener("change", () => {
      actions.setObjectCountDisplay?.(!!dom.objectCountDisplayToggle.checked);
    });
  }
  if (dom.autoBackupToggle) {
    dom.autoBackupToggle.addEventListener("change", () => {
      actions.setAutoBackupEnabled?.(!!dom.autoBackupToggle.checked);
    });
  }
  if (dom.autoBackupIntervalSelect) {
    dom.autoBackupIntervalSelect.addEventListener("change", () => {
      const sec = Math.max(60, Math.min(600, Math.round(Number(dom.autoBackupIntervalSelect.value) || 60)));
      dom.autoBackupIntervalSelect.value = String(sec);
      actions.setAutoBackupIntervalSec?.(sec);
    });
  }
}


