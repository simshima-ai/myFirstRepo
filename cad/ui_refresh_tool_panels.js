import { getPatternCopyText } from "./ui_text.js";
export function refreshToolPanels(state, dom, panelLang, helpers) {
  const patternCopyText = getPatternCopyText(panelLang);
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
      dom.gridAutoTimingHint.textContent = lang === "ja"
        ? `??: 50=${t50}% / 10=${t10}% / 5=${t5}% / 1=${t1}%`
        : `Thresholds: 50=${t50}% / 10=${t10}% / 5=${t5}% / 1=${t1}%`;
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
        ? (panelLang === "ja" ? "Bスプライン確定" : "Finalize B-Spline")
        : (panelLang === "ja" ? "連続ライン確定" : "Finish Continuous Line");
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
  if (dom.hatchValidateBtn) {
    dom.hatchValidateBtn.disabled = !(state.tool === "hatch" && state.hatchDraft?.boundaryIds?.length > 0);
  }
  if (dom.hatchValidateResult) {
    const v = state.input?.hatchValidation;
    const currentIds = Array.from(new Set((state.hatchDraft?.boundaryIds || []).map((id) => Number(id)).filter(Number.isFinite))).sort((a, b) => a - b);
    const currentKey = currentIds.join(",");
    const lang = String(state.ui?.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
    if (!v || String(v.idsKey || "") !== currentKey) {
      dom.hatchValidateResult.textContent = "";
      dom.hatchValidateResult.style.color = "#64748b";
    } else {
      const openCount = Number(v.openNodes?.length || 0);
      const nearCount = Number(v.nearMissPairs?.length || 0);
      const loopOk = (v.loopOk !== false);
      if (!loopOk) {
        const err = String(v.loopError || "Boundary loop build failed");
        dom.hatchValidateResult.textContent = (lang === "ja")
          ? `\u7aef\u70b9\u4e00\u81f4: NG (${err})`
          : `Endpoint match: NG (${err})`;
        dom.hatchValidateResult.style.color = "#b91c1c";
      } else if (openCount === 0) {
        dom.hatchValidateResult.textContent = (lang === "ja")
          ? "\u7aef\u70b9\u4e00\u81f4: OK"
          : "Endpoint match: OK";
        dom.hatchValidateResult.style.color = "#15803d";
      } else {
        dom.hatchValidateResult.textContent = (lang === "ja")
          ? `\u7aef\u70b9\u4e00\u81f4: open ${openCount} / near ${nearCount}`
          : `Endpoint match: open ${openCount} / near ${nearCount}`;
        dom.hatchValidateResult.style.color = "#b91c1c";
      }
    }
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
      ? patternCopyText.centerSetStatus(cid)
      : patternCopyText.centerUnsetStatus;
    if (dom.patternCopySetCenterBtn) {
      dom.patternCopySetCenterBtn.textContent = cid
        ? patternCopyText.centerClearButton
        : patternCopyText.centerSetButton;
    }
  }
  if (dom.patternCopyAxisStatus) {
    const aid = state.input.patternCopyFlow.axisLineId;
    dom.patternCopyAxisStatus.textContent = aid
      ? patternCopyText.axisSetStatus(aid)
      : patternCopyText.axisUnsetStatus;
    if (dom.patternCopySetAxisBtn) {
      dom.patternCopySetAxisBtn.textContent = aid
        ? patternCopyText.axisClearButton
        : patternCopyText.axisSetButton;
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

  const selectedImage = (() => {
    const shapeMap = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    const ids = new Set((state.selection?.ids || []).map(Number));
    if (!ids.size) return null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (String(s.type || "") === "image") return s;
    }
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (String(s.type || "") !== "imagetrace") continue;
      const srcId = Number(s.traceSourceImageId);
      if (!Number.isFinite(srcId)) continue;
      const src = shapeMap.get(srcId);
      if (src && String(src.type || "") === "image") return src;
    }
    return null;
  })();
  const traceBase = state.ui?.imageTraceParams || selectedImage?.traceParams || null;
  if (dom.traceTargetInfo) {
    if (selectedImage) {
      const traceShapeIds = Array.isArray(selectedImage.traceShapeIds)
        ? selectedImage.traceShapeIds.map(Number).filter(Number.isFinite)
        : [];
      let count = 0;
      if (traceShapeIds.length > 0) {
        const shapeMap = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
        for (const sid of traceShapeIds) {
          const tr = shapeMap.get(Number(sid));
          if (!tr || String(tr.type || "") !== "imagetrace") continue;
          count += Array.isArray(tr.segments) ? tr.segments.length : 0;
        }
      } else {
        count = Array.isArray(selectedImage.traceLineIds) ? selectedImage.traceLineIds.length : 0;
      }
      dom.traceTargetInfo.textContent = (panelLang === "en")
        ? `Target: image #${Number(selectedImage.id)} (${count} lines)`
        : `\u5bfe\u8c61: \u753b\u50cf #${Number(selectedImage.id)} (${count}\u672c)`;
    } else {
      dom.traceTargetInfo.textContent = (panelLang === "en")
        ? "Select an imported image object"
        : "インポート画像を選択";
    }
  }
  const setIfNotEditing = (el, v) => {
    if (!el) return;
    if (document.activeElement === el) return;
    el.value = String(v);
  };
  if (traceBase) {
    if (dom.traceMaxDimInput) setIfNotEditing(dom.traceMaxDimInput, Math.round(Number(traceBase.maxDim ?? 420) || 420));
    if (dom.traceEdgePercentInput) setIfNotEditing(dom.traceEdgePercentInput, Number(traceBase.edgePercent ?? 72));
    if (dom.traceSimplifyInput) setIfNotEditing(dom.traceSimplifyInput, Number(traceBase.simplify ?? 1.25));
    if (dom.traceMinSegInput) setIfNotEditing(dom.traceMinSegInput, Number(traceBase.minSeg ?? 1.2));
    if (dom.traceMaxSegmentsInput) setIfNotEditing(dom.traceMaxSegmentsInput, Math.round(Number(traceBase.maxSegments ?? 12000) || 12000));
    if (dom.traceOffsetXInput) setIfNotEditing(dom.traceOffsetXInput, Number(traceBase.offsetX ?? 0));
    if (dom.traceOffsetYInput) setIfNotEditing(dom.traceOffsetYInput, Number(traceBase.offsetY ?? 0));
    if (dom.traceLineWidthInput) setIfNotEditing(dom.traceLineWidthInput, Number(traceBase.lineWidthMm ?? 0.1));
    if (dom.traceLineTypeInput && document.activeElement !== dom.traceLineTypeInput) {
      dom.traceLineTypeInput.value = String(traceBase.lineType || "solid");
    }
    if (dom.traceInvertToggle) dom.traceInvertToggle.checked = Number(traceBase.invert || 0) >= 1;
  }
  if (dom.traceRegenerateBtn) dom.traceRegenerateBtn.disabled = !selectedImage;

  const importAdjust = state.ui?.importAdjust || null;
  const importAdjustActive = !!importAdjust?.active;
  const importAdjustParams = importAdjust?.params || { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
  if (dom.importAdjustScaleInput) setIfNotEditing(dom.importAdjustScaleInput, Number(importAdjustParams.scale ?? 1));
  if (dom.importAdjustDxInput) setIfNotEditing(dom.importAdjustDxInput, Number(importAdjustParams.dx ?? 0));
  if (dom.importAdjustDyInput) setIfNotEditing(dom.importAdjustDyInput, Number(importAdjustParams.dy ?? 0));
  if (dom.importAdjustFlipXToggle) dom.importAdjustFlipXToggle.checked = !!importAdjustParams.flipX;
  if (dom.importAdjustFlipYToggle) dom.importAdjustFlipYToggle.checked = !!importAdjustParams.flipY;
  if (dom.importSourceUnitSelect && document.activeElement !== dom.importSourceUnitSelect) {
    dom.importSourceUnitSelect.value = String(state.ui?.importSourceUnit || "auto");
  }
  if (dom.importAsPolylineToggle) dom.importAsPolylineToggle.checked = !!state.ui?.importAsPolyline;
  if (dom.importAdjustScaleInput) dom.importAdjustScaleInput.disabled = !importAdjustActive;
  if (dom.importAdjustDxInput) dom.importAdjustDxInput.disabled = !importAdjustActive;
  if (dom.importAdjustDyInput) dom.importAdjustDyInput.disabled = !importAdjustActive;
  if (dom.importAdjustFlipXToggle) dom.importAdjustFlipXToggle.disabled = !importAdjustActive;
  if (dom.importAdjustFlipYToggle) dom.importAdjustFlipYToggle.disabled = !importAdjustActive;
  if (dom.importAdjustApplyBtn) dom.importAdjustApplyBtn.disabled = !importAdjustActive;
  if (dom.importAdjustCancelBtn) dom.importAdjustCancelBtn.disabled = !importAdjustActive;

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
