import { ensurePanelVisibilityState, isPanelVisible } from "./ui_panel_visibility.js";

export function refreshSettingsAndTouchPanels(state, dom, panelLang, helpers) {
  const {
    syncInputValue,
    normalizePageScalePreset,
    normalizeMaxZoomPreset,
    normalizeMenuScalePreset,
    normalizePositiveNumber,
    refreshCustomPageSizeUnitLabels,
    refreshGridUnitLabels,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  } = helpers;

  ensurePanelVisibilityState(state);

  if (dom.dimLinearMode) dom.dimLinearMode.value = state.dimSettings.linearMode || "single";
  if (dom.dimIgnoreGridSnapToggle) dom.dimIgnoreGridSnapToggle.checked = !!state.dimSettings.ignoreGridSnap;
  if (dom.dimSnapMode) dom.dimSnapMode.value = state.dimSettings.snapMode || "object";
  if (dom.dimCircleMode) dom.dimCircleMode.value = state.dimSettings.circleMode || "radius";
  const selectedDim = (() => {
    const ids = new Set((state.selection?.ids || []).map(Number));
    if (!ids.size) return null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim") {
        return s;
      }
    }
    return null;
  })();
  const dimUiSource = selectedDim || state.dimSettings || {};
  if (dom.dimCircleArrowSide) dom.dimCircleArrowSide.value = (dimUiSource.circleArrowSide === "inside" ? "inside" : (state.dimSettings.circleArrowSide === "inside" ? "inside" : "outside"));
  if (dom.dimPrecisionSelect) {
    dom.dimPrecisionSelect.value = String(Math.max(0, Math.min(3, Number(dimUiSource.precision ?? state.dimSettings?.precision ?? 1))));
  }
  if (dom.dimArrowTypeSelect) {
    const raw = String(dimUiSource.dimArrowType ?? state.dimSettings?.dimArrowType ?? "open").toLowerCase();
    const v = (raw === "closed" || raw === "hollow" || raw === "circle" || raw === "circle_filled") ? raw : "open";
    if (dom.dimArrowTypeSelect.value !== v) dom.dimArrowTypeSelect.value = v;
  }
  if (dom.dimArrowSizeInput) {
    const av = Math.max(1, Number(dimUiSource.dimArrowSizePt ?? dimUiSource.dimArrowSize ?? state.dimSettings?.dimArrowSize ?? 10) || 10);
    syncInputValue(dom.dimArrowSizeInput, av);
  }
  if (dom.dimArrowDirectionSelect) {
    const v = (String(dimUiSource.dimArrowDirection ?? state.dimSettings?.dimArrowDirection ?? "normal") === "reverse") ? "reverse" : "normal";
    if (dom.dimArrowDirectionSelect.value !== v) dom.dimArrowDirectionSelect.value = v;
  }
  if (dom.dimFontSizeInput) {
    syncInputValue(dom.dimFontSizeInput, Math.max(1, Number(dimUiSource.fontSize ?? state.dimSettings?.fontSize ?? 12)));
  }
  if (dom.dimTextRotateInput) {
    const tv = (dimUiSource.textRotate ?? state.dimSettings?.textRotate);
    dom.dimTextRotateInput.value = (tv === "auto" || tv == null) ? "auto" : String(tv);
  }
  if (dom.dimExtOffsetInput) syncInputValue(dom.dimExtOffsetInput, dimUiSource.extOffset ?? state.dimSettings?.extOffset ?? 2);
  if (dom.dimExtOverInput) syncInputValue(dom.dimExtOverInput, dimUiSource.extOver ?? state.dimSettings?.extOver ?? 2);
  if (dom.dimROvershootInput) syncInputValue(dom.dimROvershootInput, dimUiSource.rOverrun ?? state.dimSettings?.rOvershoot ?? 5);
  const dimExtOffsetWrap = document.getElementById("dimExtOffsetWrap");
  const dimExtOverWrap = document.getElementById("dimExtOverWrap");
  const isAngleDimContext = (state.tool === "dim" && String(state.dimSettings?.linearMode || "single") === "angle")
    || (selectedDim && selectedDim.type === "dimangle");
  if (dimExtOffsetWrap) dimExtOffsetWrap.style.display = isAngleDimContext ? "none" : "";
  if (dimExtOverWrap) dimExtOverWrap.style.display = isAngleDimContext ? "none" : "";

  const dimChainOps = document.getElementById("dimChainOps");
  if (dimChainOps) {
    dimChainOps.style.display = (state.tool === "dim" && state.dimSettings.linearMode === "chain") ? "block" : "none";
    const touchMode = !!state.ui?.touchMode;
    const isChain = state.tool === "dim" && String(state.dimSettings?.linearMode || "single") === "chain";
    const isDraft = !!(state.dimDraft && state.dimDraft.type === "dimchain");
    const canPrepare = isChain && isDraft && !state.dimDraft.awaitingPlacement && (state.dimDraft.points || []).length >= 2;
    const canFinalize = isChain && isDraft && !!state.dimDraft.awaitingPlacement && !!state.dimDraft.place;
    if (dom.dimChainPrepareBtn) {
      dom.dimChainPrepareBtn.style.display = (!touchMode && isChain) ? "" : "none";
      dom.dimChainPrepareBtn.disabled = !canPrepare;
    }
    if (dom.dimChainFinalizeBtn) {
      dom.dimChainFinalizeBtn.style.display = (!touchMode && isChain) ? "" : "none";
      dom.dimChainFinalizeBtn.disabled = !canFinalize;
    }
  }
  const dimModeOptions = document.getElementById("dimModeOptions");
  if (dimModeOptions) {
    dimModeOptions.style.display = (state.tool === "dim") ? "" : "none";
  }

  if (dom.applyDimSettingsBtn) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let hasDim = false;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim") { hasDim = true; break; }
    }
    dom.applyDimSettingsBtn.disabled = !hasDim;
  }
  if (dom.previewPrecisionSelect) {
    dom.previewPrecisionSelect.value = String(Math.max(0, Math.min(3, Number(state.previewSettings?.precision ?? 2))));
  }
  if (dom.pageSizeSelect) {
    const v = String(state.pageSetup?.size || "A4");
    if (dom.pageSizeSelect.value !== v) dom.pageSizeSelect.value = v;
    dom.pageSizeSelect.disabled = !!state.pageSetup?.customSizeEnabled;
  }
  if (dom.customPageSizeToggle) dom.customPageSizeToggle.checked = !!state.pageSetup?.customSizeEnabled;
  if (dom.customPageWidthInput) {
    syncInputValue(dom.customPageWidthInput, Math.max(1, Number(state.pageSetup?.customWidthMm ?? 297) || 297));
    dom.customPageWidthInput.disabled = !state.pageSetup?.customSizeEnabled;
  }
  if (dom.customPageHeightInput) {
    syncInputValue(dom.customPageHeightInput, Math.max(1, Number(state.pageSetup?.customHeightMm ?? 210) || 210));
    dom.customPageHeightInput.disabled = !state.pageSetup?.customSizeEnabled;
  }
  if (dom.pageOrientationSelect) {
    const v = (String(state.pageSetup?.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
    if (dom.pageOrientationSelect.value !== v) dom.pageOrientationSelect.value = v;
  }
  if (dom.pageScaleInput) {
    const v = normalizePageScalePreset(state.pageSetup?.presetScale ?? state.pageSetup?.scale ?? 1);
    syncInputValue(dom.pageScaleInput, v);
    dom.pageScaleInput.disabled = !!state.pageSetup?.customScaleEnabled;
  }
  if (dom.customScaleToggle) dom.customScaleToggle.checked = !!state.pageSetup?.customScaleEnabled;
  if (dom.customScaleInput) {
    syncInputValue(dom.customScaleInput, normalizePositiveNumber(state.pageSetup?.customScale ?? state.pageSetup?.scale ?? 1, 1, 0.0001));
    dom.customScaleInput.disabled = !state.pageSetup?.customScaleEnabled;
  }
  if (dom.maxZoomInput) {
    const v = normalizeMaxZoomPreset(state.view?.maxScale ?? 100);
    syncInputValue(dom.maxZoomInput, v);
  }
  const menuScalePct = normalizeMenuScalePreset(state.ui?.menuScalePct ?? 100);
  if (dom.menuScaleSelect) {
    syncInputValue(dom.menuScaleSelect, menuScalePct);
  }
  if (dom.touchModeToggle) {
    dom.touchModeToggle.checked = !!state.ui?.touchMode;
  }
  if (dom.topRightAdZoneToggle) dom.topRightAdZoneToggle.checked = state.ui?.adZones?.topRight !== false;
  if (dom.bottomLeftAdZoneToggle) dom.bottomLeftAdZoneToggle.checked = state.ui?.adZones?.bottomLeft !== false;
  if (dom.bottomCenterAdZoneToggle) dom.bottomCenterAdZoneToggle.checked = state.ui?.adZones?.bottomCenter !== false;
  if (dom.touchConfirmOverlay && dom.touchConfirmBtn) {
    const touchMode = !!state.ui?.touchMode;
    const tool = String(state.tool || "");
    const linearDraft = state.polylineDraft;
    const hasLinearDraft = !!(
      linearDraft &&
      linearDraft.kind !== "bspline" &&
      Array.isArray(linearDraft.points) &&
      linearDraft.points.length >= 2
    );
    const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
    const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
    const circleModeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const circleMode = (circleModeRaw === "fixed" || circleModeRaw === "threepoint" || circleModeRaw === "drag")
      ? circleModeRaw
      : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
    const circleThreePointCount = Array.isArray(state.input?.circleThreePointRefs) ? state.input.circleThreePointRefs.length : 0;
    const isChainDim = tool === "dim" && String(state.dimSettings?.linearMode || "single") === "chain";
    const chainDraft = (state.dimDraft && state.dimDraft.type === "dimchain") ? state.dimDraft : null;
    const canPrepareDim = !!(isChainDim && chainDraft && !chainDraft.awaitingPlacement && (chainDraft.points || []).length >= 2);
    const canFinalizeDim = !!(isChainDim && chainDraft && chainDraft.awaitingPlacement && chainDraft.place);
    const canLineFinalize = (tool === "line" && (lineMode === "continuous" || lineMode === "freehand"));
    const canCircleThreePoint = (tool === "circle" && circleMode === "threepoint" && circleThreePointCount >= 3);
    const hasPatternCopySelection = ((state.selection?.ids || []).length > 0) || ((state.selection?.groupIds || []).length > 0);
    const patternCopyMode = String(state.patternCopySettings?.mode || "array");
    let canPatternCopy = (tool === "patterncopy" && hasPatternCopySelection);
    if (canPatternCopy && patternCopyMode === "rotate") canPatternCopy = !!state.input?.patternCopyFlow?.centerPositionId;
    if (canPatternCopy && patternCopyMode === "mirror") canPatternCopy = !!state.input?.patternCopyFlow?.axisLineId;
    const canFillet = (tool === "fillet" && (state.selection?.ids || []).length >= 2);
    const canDline = (tool === "doubleline" && Array.isArray(state.dlinePreview) && state.dlinePreview.length > 0);
    const canHatch = (tool === "hatch" && (state.hatchDraft?.boundaryIds || []).length > 0);
    const rectDraft = state.input?.touchRectDraft || {};
    const isTouchRect = (tool === "rect" && touchMode);
    const canRectConfirm = !!(isTouchRect && (
      (Number(rectDraft.stage) !== 1 && rectDraft.candidateStart) ||
      (Number(rectDraft.stage) === 1 && rectDraft.p1 && rectDraft.candidateEnd)
    ));
    const show = touchMode && (hasLinearDraft || canLineFinalize || isChainDim || (tool === "circle" && circleMode === "threepoint") || tool === "fillet" || tool === "doubleline" || tool === "hatch" || tool === "patterncopy" || tool === "rect");
    let enabled = false;
    let label = "Confirm";
    if (hasLinearDraft) {
      enabled = true;
      label = "Finish Continuous Line";
    } else if (canLineFinalize) {
      enabled = !!(state.polylineDraft && (state.polylineDraft.points || []).length >= 2);
      label = (lineMode === "freehand")
        ? "Finalize B-Spline"
        : "Finish Continuous Line";
    } else if (isChainDim) {
      enabled = canPrepareDim || canFinalizeDim;
      label = canFinalizeDim
        ? "Finalize Dim"
        : "Set Placement";
    } else if (tool === "circle" && circleMode === "threepoint") {
      enabled = canCircleThreePoint;
      label = "Create 3-Point Circle";
    } else if (tool === "fillet") {
      enabled = canFillet;
      label = "Apply Fillet";
    } else if (tool === "doubleline") {
      enabled = canDline;
      label = "Apply Double Line";
    } else if (tool === "hatch") {
      enabled = canHatch;
      label = "Apply Hatch";
    } else if (tool === "patterncopy") {
      enabled = canPatternCopy;
      label = "Run Pattern Copy";
    }
    if (tool === "rect") {
      enabled = canRectConfirm;
      label = (Number(rectDraft.stage) === 1)
        ? "Create Rectangle"
        : "Confirm 1st Point";
    }
    dom.touchConfirmOverlay.style.display = (isPanelVisible(state, "touchConfirmOverlay") && show) ? "flex" : "none";
    if (show) {
      // Keep top-fixed placement and avoid overlap by shifting horizontally to the right of sidebar.
      const sidebar = document.querySelector(".sidebar");
      const top = 14;
      let left = 14;
      if (sidebar) {
        const r = sidebar.getBoundingClientRect();
        left = Math.max(8, Math.round(r.right + 8));
      }
      dom.touchConfirmOverlay.style.left = `${left}px`;
      dom.touchConfirmOverlay.style.top = `${top}px`;
    }
    dom.touchConfirmBtn.disabled = !enabled;
    dom.touchConfirmBtn.textContent = label;
    if (dom.touchCancelBtn) {
      const hasRectPending = !!(isTouchRect && (rectDraft.candidateStart || rectDraft.p1 || rectDraft.candidateEnd));
      const hasPending = !!(
        hasRectPending ||
        hasLinearDraft ||
        state.polylineDraft ||
        state.dimDraft ||
        (state.hatchDraft?.boundaryIds || []).length ||
        (state.input?.circleThreePointRefs || []).length
      );
      dom.touchCancelBtn.disabled = !hasPending;
    }
  }
  if (dom.touchSelectBackOverlay && dom.touchSelectBackBtn) {
    const touchMode = !!state.ui?.touchMode;
    const isSelect = String(state.tool || "") === "select";
    dom.touchSelectBackOverlay.style.display = (isPanelVisible(state, "touchSelectBackOverlay") && touchMode && !isSelect) ? "block" : "none";
  }
  if (dom.touchMultiSelectOverlay && dom.touchMultiSelectBtn) {
    const touchMode = !!state.ui?.touchMode;
    const tool = String(state.tool || "");
    const circleModeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const circleMode = (circleModeRaw === "fixed" || circleModeRaw === "threepoint" || circleModeRaw === "drag")
      ? circleModeRaw
      : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
    const needsMultiSelect = (tool === "select" || tool === "hatch" || tool === "doubleline" || tool === "patterncopy" || (tool === "circle" && circleMode === "threepoint"));
    const on = !!state.ui?.touchMultiSelect;
    dom.touchMultiSelectOverlay.style.display = (isPanelVisible(state, "touchMultiSelectOverlay") && touchMode && needsMultiSelect) ? "block" : "none";
    if (touchMode && needsMultiSelect) {
      const sidebar = document.querySelector(".sidebar");
      let left = 14;
      let top = 14;
      if (sidebar) {
        const r = sidebar.getBoundingClientRect();
        left = Math.max(8, Math.round(r.right + 8));
      }
      const confirmShown = !!(dom.touchConfirmOverlay && dom.touchConfirmOverlay.style.display !== "none");
      if (confirmShown) {
        const cr = dom.touchConfirmOverlay.getBoundingClientRect();
        top = Math.max(8, Math.round(cr.bottom + 8));
      } else {
        top = 14;
      }
      dom.touchMultiSelectOverlay.style.left = `${left}px`;
      dom.touchMultiSelectOverlay.style.top = `${top}px`;
    }
    dom.touchMultiSelectBtn.classList.toggle("is-active", on);
    dom.touchMultiSelectBtn.textContent = on
      ? "Multi-Select ON"
      : "Multi-Select OFF";
  }
  if (dom.fpsDisplayToggle) {
    dom.fpsDisplayToggle.checked = !!state.ui?.showFps;
  }
  if (dom.objectCountDisplayToggle) {
    dom.objectCountDisplayToggle.checked = !!state.ui?.showObjectCount;
  }
  const autoBackupAvailable = String(state.ui?.displayMode || "cad").toLowerCase() !== "viewer";
  if (dom.autoBackupToggle) {
    dom.autoBackupToggle.checked = autoBackupAvailable && state.ui?.autoBackupEnabled !== false;
    dom.autoBackupToggle.disabled = !autoBackupAvailable;
  }
  if (dom.autoBackupIntervalSelect) {
    const sec = Math.max(60, Math.min(600, Math.round(Number(state.ui?.autoBackupIntervalSec ?? 60) || 60)));
    syncInputValue(dom.autoBackupIntervalSelect, sec);
    dom.autoBackupIntervalSelect.disabled = !autoBackupAvailable;
  }
  if (dom.pageUnitSelect) {
    const v = String(state.pageSetup?.unit || "mm");
    if (dom.pageUnitSelect.value !== v) dom.pageUnitSelect.value = v;
  }
  refreshCustomPageSizeUnitLabels(state);
  refreshGridUnitLabels(state);
  const selectedHatchForStroke = (() => {
    const ids = new Set((state.selection?.ids || []).map(Number));
    if (!ids.size) return null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type === "hatch") return s;
    }
    return null;
  })();
  const toolStrokeSync = [
    { cfg: state.lineSettings, width: dom.lineToolLineWidthInput, type: dom.lineToolLineTypeInput, color: dom.lineToolColorInput },
    { cfg: state.rectSettings, width: dom.rectToolLineWidthInput, type: dom.rectToolLineTypeInput, color: dom.rectToolColorInput },
    { cfg: state.circleSettings, width: dom.circleToolLineWidthInput, type: dom.circleToolLineTypeInput, color: dom.circleToolColorInput },
    { cfg: state.filletSettings, width: dom.filletToolLineWidthInput, type: dom.filletToolLineTypeInput, color: null },
    { cfg: state.positionSettings, width: dom.positionToolLineWidthInput, type: dom.positionToolLineTypeInput, color: dom.positionToolColorInput },
    { cfg: state.textSettings, width: dom.textToolLineWidthInput, type: dom.textToolLineTypeInput, color: null },
    { cfg: (selectedDim || state.dimSettings), width: dom.dimToolLineWidthInput, type: dom.dimToolLineTypeInput, color: dom.dimToolColorInput },
    { cfg: (selectedHatchForStroke || state.hatchSettings), width: dom.hatchToolLineWidthInput, type: null, color: null },
    { cfg: state.dlineSettings, width: dom.dlineToolLineWidthInput, type: dom.dlineToolLineTypeInput, color: null },
  ];
  for (const it of toolStrokeSync) {
    if (it.width) syncInputValue(it.width, normalizeLineWidthPreset(it.cfg?.lineWidthMm ?? 0.25));
    if (it.type) it.type.value = normalizeLineTypePreset(it.cfg?.lineType ?? "solid");
    if (it.color) {
      const c = String(it.cfg?.color || "#0f172a");
      it.color.value = /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#0f172a";
    }
  }
  if (dom.pageShowFrameToggle) {
    dom.pageShowFrameToggle.checked = state.pageSetup?.showFrame !== false;
  }
  if (dom.pageInnerMarginInput) {
    const v = Math.max(0, Number(state.pageSetup?.innerMarginMm ?? 10) || 0);
    syncInputValue(dom.pageInnerMarginInput, v);
  }
}



