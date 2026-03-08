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
  if (dom.maxZoomInput) {
    dom.maxZoomInput.addEventListener("change", () => {
      const v = normalizeMaxZoomPreset(dom.maxZoomInput.value);
      dom.maxZoomInput.value = String(v);
      actions.setMaxZoomScale?.(v);
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
  if (dom.touchModeToggle) {
    dom.touchModeToggle.addEventListener("change", () => {
      actions.setTouchMode?.(!!dom.touchModeToggle.checked);
    });
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
      const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
      const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
      if (tool === "line" && (lineMode === "continuous" || lineMode === "freehand")) {
        const ok = !!actions.finalizePolylineDraft?.();
        touchDebugLog(`fallback finalizePolylineDraft() => ${ok}`);
        actions.draw?.();
        return;
      }
      if (tool === "dim" && String(state.dimSettings?.linearMode || "single") === "chain") {
        const draft = state.dimDraft;
        if (draft && draft.type === "dimchain") {
          if (!draft.awaitingPlacement && (draft.points || []).length >= 2) {
            draft.awaitingPlacement = true;
            actions.setStatus?.("Chain dim: click to place dimension line.");
            actions.draw?.();
            return;
          }
          if (draft.awaitingPlacement && draft.place) {
            actions.finalizeDimDraft?.();
            actions.setStatus?.("Dim finished");
            actions.draw?.();
            return;
          }
        }
      }
      if (tool === "circle") {
        const modeRaw = String(state.circleSettings?.mode || "").toLowerCase();
        const mode = (modeRaw === "fixed" || modeRaw === "threepoint" || modeRaw === "drag")
          ? modeRaw
          : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
        if (mode === "threepoint") {
          actions.executeCircleThreePointFromTargets?.();
          return;
        }
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
  if (dom.touchSelectBackBtn) {
    dom.touchSelectBackBtn.addEventListener("click", () => {
      if (!state.ui?.touchMode) return;
      actions.setTool?.("select");
    });
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

