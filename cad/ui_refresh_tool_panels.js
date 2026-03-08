export function refreshToolPanels(state, dom, panelLang, helpers) {
  const {
    getUiLanguage,
    normalizeGridPreset,
    clampGridAutoTiming,
    gridAutoTimingFromThreshold50,
    localizeGridAutoTimingLabelText,
    refreshAttrPanel,
    syncInputValue,
  } = helpers;

  const customGridOn = !!state.grid?.customSizeEnabled;
  const gridPreset = normalizeGridPreset(state.grid?.presetSize ?? state.grid?.size ?? 10);
  const gridCustom = Math.max(1, Number(state.grid?.customSize ?? state.grid?.size ?? 10) || 10);
  if (dom.gridSizeInput) {
    syncInputValue(dom.gridSizeInput, gridPreset);
    dom.gridSizeInput.disabled = customGridOn;
  }
  if (dom.gridSizeContextInput) {
    syncInputValue(dom.gridSizeContextInput, gridPreset);
    dom.gridSizeContextInput.disabled = customGridOn;
  }
  if (dom.customGridToggle) dom.customGridToggle.checked = customGridOn;
  if (dom.customGridInput) syncInputValue(dom.customGridInput, gridCustom);
  if (dom.customGridInput) dom.customGridInput.disabled = !customGridOn;
  if (dom.gridSnapToggle) dom.gridSnapToggle.checked = !!state.grid.snap;
  if (dom.gridSnapContextToggle) dom.gridSnapContextToggle.checked = !!state.grid.snap;
  if (dom.gridShowToggle) dom.gridShowToggle.checked = !!state.grid.show;
  if (dom.gridShowContextToggle) dom.gridShowContextToggle.checked = !!state.grid.show;
  if (dom.gridAutoToggle) dom.gridAutoToggle.checked = !!state.grid.auto;
  if (dom.gridAutoContextToggle) dom.gridAutoContextToggle.checked = !!state.grid.auto;
  if (dom.gridAutoTimingSlider) {
    const lang = getUiLanguage(state);
    const timing = Number.isFinite(Number(state.grid?.autoTiming))
      ? clampGridAutoTiming(state.grid.autoTiming)
      : gridAutoTimingFromThreshold50(state.grid?.autoThreshold50 ?? 130);
    dom.gridAutoTimingSlider.value = String(timing);
    if (dom.gridAutoTimingLabel) dom.gridAutoTimingLabel.textContent = localizeGridAutoTimingLabelText(timing, lang);
    if (dom.gridAutoTimingHint) {
      const t50 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold50 ?? 130))));
      const t10 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold10 ?? 180))));
      const t5 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold5 ?? 240))));
      const t1 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold1 ?? 320))));
      dom.gridAutoTimingHint.textContent = `入閾値: 50=${t50}% / 10=${t10}% / 5=${t5}% / 1=${t1}%`;
    }
  }
  if (dom.objSnapToggle) dom.objSnapToggle.checked = state.objectSnap?.enabled !== false;
  if (dom.objSnapEndpointToggle) dom.objSnapEndpointToggle.checked = state.objectSnap?.endpoint !== false;
  if (dom.objSnapMidpointToggle) dom.objSnapMidpointToggle.checked = !!state.objectSnap?.midpoint;
  if (dom.objSnapCenterToggle) dom.objSnapCenterToggle.checked = state.objectSnap?.center !== false;
  if (dom.objSnapIntersectionToggle) dom.objSnapIntersectionToggle.checked = state.objectSnap?.intersection !== false;
  if (dom.lineModeSelect) {
    const modeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
    const mode = (modeRaw === "continuous" || modeRaw === "freehand") ? modeRaw : "segment";
    if (dom.lineModeSelect.value !== mode) dom.lineModeSelect.value = mode;
    if (dom.lineTouchFinalizeBtn) {
      const touchMode = !!state.ui?.touchMode;
      const show = !touchMode && state.tool === "line" && (mode === "continuous" || mode === "freehand");
      dom.lineTouchFinalizeBtn.style.display = show ? "" : "none";
      dom.lineTouchFinalizeBtn.textContent = mode === "freehand"
        ? (panelLang === "en" ? "Finalize B-Spline" : "Bスプライン確定")
        : (panelLang === "en" ? "Finish Continuous Line" : "連続線を確定");
    }
  }
  if (dom.objSnapTangentToggle) dom.objSnapTangentToggle.checked = !!state.objectSnap?.tangent;
  if (dom.objSnapTangentKeepToggle) dom.objSnapTangentKeepToggle.checked = !!(state.objectSnap?.keepAttributes || state.objectSnap?.tangentKeep);
  if (dom.objSnapVectorToggle) dom.objSnapVectorToggle.checked = !!state.objectSnap?.vector;

  if (dom.circleCenterMarkToggle) {
    const selectedCircles = (state.selection?.ids || []).map(id => state.shapes.find(sh => Number(sh.id) === Number(id))).filter(s => s && (s.type === "circle" || s.type === "arc"));
    if (selectedCircles.length > 0) {
      dom.circleCenterMarkToggle.checked = selectedCircles.every(s => s.showCenterMark);
    } else {
      dom.circleCenterMarkToggle.checked = !!state.circleSettings.showCenterMark;
    }
  }
  if (dom.textContentInput && document.activeElement !== dom.textContentInput) dom.textContentInput.value = state.textSettings.content;
  if (dom.textSizePtInput) syncInputValue(dom.textSizePtInput, state.textSettings.sizePt);
  if (dom.textRotateInput) syncInputValue(dom.textRotateInput, state.textSettings.rotate);
  if (dom.textFontFamilyInput) dom.textFontFamilyInput.value = state.textSettings.fontFamily;
  if (dom.textBoldInput) dom.textBoldInput.checked = !!state.textSettings.bold;
  if (dom.textItalicInput) dom.textItalicInput.checked = !!state.textSettings.italic;
  if (dom.textColorInput) dom.textColorInput.value = state.textSettings.color;

  const selectedHatch = (() => {
    const ids = new Set((state.selection?.ids || []).map(Number));
    if (!ids.size) return null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type === "hatch") return s;
    }
    return null;
  })();
  const hatchUi = selectedHatch || state.hatchSettings;
  if (dom.hatchPitchInput) syncInputValue(dom.hatchPitchInput, Number(hatchUi?.pitchMm ?? state.hatchSettings.pitchMm));
  if (dom.hatchAngleInput) syncInputValue(dom.hatchAngleInput, Number(hatchUi?.hatchAngleDeg ?? hatchUi?.angleDeg ?? state.hatchSettings.angleDeg));
  if (dom.hatchPaddingInput) syncInputValue(dom.hatchPaddingInput, Number(hatchUi?.repetitionPaddingMm ?? state.hatchSettings.repetitionPaddingMm));
  if (dom.hatchAltShiftInput) syncInputValue(dom.hatchAltShiftInput, Number(hatchUi?.lineShiftMm ?? state.hatchSettings.lineShiftMm ?? 0));
  if (dom.hatchFillToggle) dom.hatchFillToggle.checked = !!(hatchUi?.fillEnabled ?? state.hatchSettings.fillEnabled);
  if (dom.hatchFillColorInput) {
    const c = String(hatchUi?.fillColor ?? state.hatchSettings.fillColor ?? "#dbeafe");
    dom.hatchFillColorInput.value = /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#dbeafe";
  }
  if (dom.hatchLineColorInput) {
    const c = String(hatchUi?.lineColor ?? state.hatchSettings.lineColor ?? "#0f172a");
    dom.hatchLineColorInput.value = /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#0f172a";
  }
  if (dom.hatchDashMmInput) syncInputValue(dom.hatchDashMmInput, Number(hatchUi?.lineDashMm ?? state.hatchSettings.lineDashMm));
  if (dom.hatchGapMmInput) syncInputValue(dom.hatchGapMmInput, Number(hatchUi?.lineGapMm ?? state.hatchSettings.lineGapMm));
  if (dom.applyHatchBtn) {
    const touchMode = !!state.ui?.touchMode;
    dom.applyHatchBtn.style.display = touchMode ? "none" : "";
    dom.applyHatchBtn.disabled = !(state.tool === "hatch" && state.hatchDraft?.boundaryIds?.length > 0);
  }

  if (dom.patternCopyModeSelect) dom.patternCopyModeSelect.value = state.patternCopySettings.mode;
  if (dom.patternCopyArrayOptions) dom.patternCopyArrayOptions.style.display = state.patternCopySettings.mode === "array" ? "block" : "none";
  if (dom.patternCopyRotateOptions) dom.patternCopyRotateOptions.style.display = state.patternCopySettings.mode === "rotate" ? "block" : "none";
  if (dom.patternCopyMirrorOptions) dom.patternCopyMirrorOptions.style.display = state.patternCopySettings.mode === "mirror" ? "block" : "none";

  if (dom.patternCopyArrayDxInput) syncInputValue(dom.patternCopyArrayDxInput, state.patternCopySettings.arrayDx);
  if (dom.patternCopyArrayDyInput) syncInputValue(dom.patternCopyArrayDyInput, state.patternCopySettings.arrayDy);
  if (dom.patternCopyArrayCountXInput) syncInputValue(dom.patternCopyArrayCountXInput, state.patternCopySettings.arrayCountX);
  if (dom.patternCopyArrayCountYInput) syncInputValue(dom.patternCopyArrayCountYInput, state.patternCopySettings.arrayCountY);
  if (dom.patternCopyRotateAngleInput) syncInputValue(dom.patternCopyRotateAngleInput, state.patternCopySettings.rotateAngleDeg);
  if (dom.patternCopyRotateCountInput) syncInputValue(dom.patternCopyRotateCountInput, state.patternCopySettings.rotateCount);

  if (dom.patternCopyCenterStatus) {
    const cid = state.input.patternCopyFlow.centerPositionId;
    dom.patternCopyCenterStatus.textContent = cid
      ? (panelLang === "en" ? `Set: Point #${cid}` : `設定済み: 点 #${cid}`)
      : (panelLang === "en" ? "Not set (pick a point on canvas)" : "未設定 (キャンバスの点を選択)");
    if (dom.patternCopySetCenterBtn) {
      dom.patternCopySetCenterBtn.textContent = cid
        ? (panelLang === "en" ? "Clear Center" : "中心解除")
        : (panelLang === "en" ? "Set as Center" : "中心として設定");
    }
  }
  if (dom.patternCopyAxisStatus) {
    const aid = state.input.patternCopyFlow.axisLineId;
    dom.patternCopyAxisStatus.textContent = aid
      ? (panelLang === "en" ? `Set: Line #${aid}` : `設定済み: 線 #${aid}`)
      : (panelLang === "en" ? "Not set (pick a line on canvas)" : "未設定 (キャンバスの線を選択)");
    if (dom.patternCopySetAxisBtn) {
      dom.patternCopySetAxisBtn.textContent = aid
        ? (panelLang === "en" ? "Clear Axis" : "軸設定を解除")
        : (panelLang === "en" ? "Set as Axis" : "軸として設定");
    }
  }

  if (dom.patternCopyApplyBtn) {
    const touchMode = !!state.ui?.touchMode;
    dom.patternCopyApplyBtn.style.display = touchMode ? "none" : "";
    const hasSelection = ((state.selection?.ids || []).length > 0) || ((state.selection?.groupIds || []).length > 0);
    const mode = state.patternCopySettings.mode;
    let ok = hasSelection;
    if (mode === "rotate") ok = ok && !!state.input.patternCopyFlow.centerPositionId;
    if (mode === "mirror") ok = ok && !!state.input.patternCopyFlow.axisLineId;
    dom.patternCopyApplyBtn.disabled = !ok;
  }

  const _selIdSet = new Set((state.selection?.ids || []).map(Number));
  const selectedShapes = _selIdSet.size > 0 ? (state.shapes || []).filter(s => _selIdSet.has(Number(s.id))) : [];
  refreshAttrPanel(state, dom, selectedShapes);
  const firstText = selectedShapes.find(s => s.type === "text");
  if (dom.selectionTextEdit) {
    dom.selectionTextEdit.style.display = firstText ? "flex" : "none";
  }
  if (firstText && dom.selectionTextContentInput && document.activeElement !== dom.selectionTextContentInput) {
    dom.selectionTextContentInput.value = firstText.text || "";
  }
  if (firstText && dom.selectionTextSizePtInput && document.activeElement !== dom.selectionTextSizePtInput) {
    dom.selectionTextSizePtInput.value = String(firstText.textSizePt || 12);
  }
  if (firstText && dom.selectionTextRotateInput && document.activeElement !== dom.selectionTextRotateInput) {
    dom.selectionTextRotateInput.value = String(firstText.textRotate || 0);
  }
  if (firstText && dom.selectionTextFontFamilyInput && document.activeElement !== dom.selectionTextFontFamilyInput) {
    dom.selectionTextFontFamilyInput.value = firstText.textFontFamily || "Yu Gothic UI";
  }
  if (firstText && dom.selectionTextBoldInput) {
    dom.selectionTextBoldInput.checked = !!firstText.textBold;
  }
  if (firstText && dom.selectionTextItalicInput) {
    dom.selectionTextItalicInput.checked = !!firstText.textItalic;
  }
  if (firstText && dom.selectionTextColorInput) {
    dom.selectionTextColorInput.value = firstText.textColor || state.textSettings.color;
  }
}
