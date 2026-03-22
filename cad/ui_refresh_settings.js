import { getTouchConfirmText } from "./ui_text.js";
import { ensurePanelVisibilityState, isPanelVisible } from "./ui_panel_visibility.js";
import { getDimGeometry, getDimChainGeometry } from "./dim_geom.js";

function getDimScaleComp(dim) {
  const c = Number(dim?.groupScaleComp);
  return Number.isFinite(c) && c > 1e-9 ? c : 1;
}

function getSelectedDimChainValues(dim) {
  const geom = getDimChainGeometry(dim);
  const segs = Array.isArray(geom?.segments) ? geom.segments : [];
  const comp = getDimScaleComp(dim);
  const measured = segs.map((seg) => Number(seg?.len) / comp);
  const stored = Array.isArray(dim?.numericValues) ? dim.numericValues : [];
  const fallback = Number.isFinite(Number(dim?.numericValue)) ? Number(dim.numericValue) : null;
  return measured.map((m, i) => {
    const sv = Number(stored[i]);
    if (Number.isFinite(sv)) return sv;
    if (fallback != null) return fallback;
    return Number.isFinite(Number(m)) ? Number(m) : null;
  });
}

function renderDimChainNumericValueInputs(state, dom, selectedDim) {
  const wrap = dom.dimChainNumericValuesWrap;
  const list = dom.dimChainNumericValuesList;
  const singleWrap = dom.dimNumericValueWrap;
  if (!wrap || !list || !singleWrap) return;
  const isChainDim = !!selectedDim && selectedDim.type === "dimchain";
  wrap.style.display = isChainDim ? "flex" : "none";
  singleWrap.style.display = isChainDim ? "none" : "";
  if (!isChainDim) {
    wrap.dataset.dimChainSignature = "";
    list.textContent = "";
    return;
  }
  const values = getSelectedDimChainValues(selectedDim);
  if (!values.length) {
    wrap.style.display = "none";
    singleWrap.style.display = "";
    list.textContent = "";
    return;
  }
  const signature = `${Number(selectedDim.id) || 0}:${values.length}:${values.map((v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(6) : "null")).join(",")}`;
  if (wrap.dataset.dimChainSignature === signature) return;
  wrap.dataset.dimChainSignature = signature;
  list.textContent = "";
  values.forEach((value, index) => {
    const label = document.createElement("label");
    label.style.display = "inline-flex";
    label.style.alignItems = "center";
    label.style.gap = "4px";
    label.style.fontSize = "12px";
    label.style.whiteSpace = "nowrap";
    label.textContent = `#${index + 1}`;

    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.1";
    input.dataset.dimChainValueIndex = String(index);
    input.value = Number.isFinite(Number(value)) ? String(Number(value)) : "";
    input.style.width = "72px";
    input.style.fontSize = "12px";
    input.style.padding = "2px";

    label.appendChild(input);
    list.appendChild(label);
  });
}

export function refreshSettingsAndTouchPanels(state, dom, panelLang, helpers) {
  const {
    syncInputValue,
    normalizePageScalePreset,
    normalizeMaxZoomPreset,
    normalizeWheelZoomPreset,
    normalizeMenuScaleAutoPreset,
    normalizeMenuScalePreset,
    normalizePositiveNumber,
    refreshCustomPageSizeUnitLabels,
    refreshGridUnitLabels,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  } = helpers;

  const touchText = getTouchConfirmText(panelLang);
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
      if (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "dimleader" || s.type === "circleDim") {
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
  if (dom.dimLabelTextInput) {
    dom.dimLabelTextInput.value = String(dimUiSource.leaderText || state.dimSettings?.labelText || "NOTE");
  }
  if (dom.dimTextRotateInput) {
    const tv = (dimUiSource.textRotate ?? state.dimSettings?.textRotate);
    dom.dimTextRotateInput.value = (tv === "auto" || tv == null) ? "auto" : String(tv);
  }
  const isNumericPriorityTarget = !selectedDim || selectedDim.type === "dim" || selectedDim.type === "dimchain";
  if (dom.dimNumericPriorityToggle) {
    dom.dimNumericPriorityToggle.checked = !!(dimUiSource.numericPriority ?? state.dimSettings?.numericPriority);
    dom.dimNumericPriorityToggle.disabled = !isNumericPriorityTarget;
  }
  if (dom.dimNumericValueInput) {
    const numericPriorityOn = !!(dimUiSource.numericPriority ?? state.dimSettings?.numericPriority);
    const measuredDimValue = selectedDim && selectedDim.type === "dim"
      ? (() => {
          const g = getDimGeometry(selectedDim);
          if (!g) return null;
          const comp = Number(selectedDim?.groupScaleComp);
          const scaleComp = Number.isFinite(comp) && comp > 1e-9 ? comp : 1;
          const v = Number(g.len) / scaleComp;
          return Number.isFinite(v) ? v : null;
        })()
      : null;
    const rawNumericValue = dimUiSource.numericValue ?? state.dimSettings?.numericValue ?? (numericPriorityOn ? measuredDimValue : null);
    dom.dimNumericValueInput.value = (rawNumericValue == null || rawNumericValue === "")
      ? ""
      : (Number.isFinite(Number(rawNumericValue)) ? String(Number(rawNumericValue)) : "");
    dom.dimNumericValueInput.disabled = !isNumericPriorityTarget || !dom.dimNumericPriorityToggle?.checked;
  }
  renderDimChainNumericValueInputs(state, dom, selectedDim);
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
      if (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "dimleader" || s.type === "circleDim") { hasDim = true; break; }
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
  if (dom.wheelZoomFactorSelect) {
    const v = normalizeWheelZoomPreset(state.ui?.wheelZoomFactor ?? 1.1);
    syncInputValue(dom.wheelZoomFactorSelect, v);
  }
  const menuScalePct = normalizeMenuScalePreset(state.ui?.menuScalePct ?? 100);
  const menuScaleMode = String(state.ui?.menuScaleMode || "auto").toLowerCase() === "manual" ? "manual" : "auto";
  const menuScaleAutoPreset = normalizeMenuScaleAutoPreset(state.ui?.menuScaleAutoPreset ?? "normal");
  if (dom.menuScaleModeSelect) {
    if (dom.menuScaleModeSelect.value !== menuScaleMode) dom.menuScaleModeSelect.value = menuScaleMode;
  }
  if (dom.menuScaleAutoSelect) {
    if (dom.menuScaleAutoSelect.value !== menuScaleAutoPreset) dom.menuScaleAutoSelect.value = menuScaleAutoPreset;
    dom.menuScaleAutoSelect.disabled = menuScaleMode === "manual";
  }
  if (dom.menuScaleSelect) {
    syncInputValue(dom.menuScaleSelect, menuScalePct);
    dom.menuScaleSelect.disabled = menuScaleMode === "auto";
  }
  if (dom.touchModeToggle) {
    dom.touchModeToggle.checked = !!state.ui?.touchMode;
  }
  if (dom.topRightAdZoneToggle) dom.topRightAdZoneToggle.checked = state.ui?.adZones?.topRight === true;
  if (dom.bottomLeftAdZoneToggle) dom.bottomLeftAdZoneToggle.checked = state.ui?.adZones?.bottomLeft === true;
  if (dom.bottomCenterAdZoneToggle) dom.bottomCenterAdZoneToggle.checked = state.ui?.adZones?.bottomCenter === true;
  if (dom.touchToolPanel) {
    const touchMode = !!state.ui?.touchMode;
    const panelPos = state.ui?.touchPanelPos || { x: 14, y: 14 };
    dom.touchToolPanel.style.display = touchMode ? "block" : "none";
    dom.touchToolPanel.style.left = `${Math.max(8, Number(panelPos.x) || 14)}px`;
    dom.touchToolPanel.style.top = `${Math.max(8, Number(panelPos.y) || 14)}px`;
    if (dom.touchToolPanelStatus) {
      const tool = String(state.tool || "select");
      const liveStatus = String(state.ui?.statusText || "").trim();
      const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
      const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
      const circleModeRaw = String(state.circleSettings?.mode || "").toLowerCase();
      const circleMode = (circleModeRaw === "fixed" || circleModeRaw === "threepoint" || circleModeRaw === "drag")
        ? circleModeRaw
        : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
      const lineDraft = state.input?.touchLineDraft || {};
      const lineStage = Number(lineDraft.stage) || 0;
      const circleDraft = state.input?.touchCircleDraft || {};
      const circleStage = Number(circleDraft.stage) || 0;
      const circleThreePointCount = Array.isArray(state.input?.circleThreePointRefs) ? state.input.circleThreePointRefs.length : 0;
      const isJa = String(panelLang || "").toLowerCase().startsWith("ja");
      const circleStatus = (touchMode && tool === "circle")
        ? (circleMode === "fixed"
          ? (isJa ? "円: キャンバスをタップして作成" : "Circle: tap canvas to create")
          : (circleMode === "drag"
            ? (circleStage === 0
              ? (isJa ? "円: 中心点を確定" : "Circle: confirm center point")
              : (isJa ? "円: 円周点を確定" : "Circle: confirm edge point"))
            : (circleThreePointCount >= 3
              ? (isJa ? "3点円: 作成可能" : "3-point circle: ready to create")
              : (isJa ? "3点円: ターゲットを登録" : "3-point circle: register target"))))
        : "";
      const lineStatus = (touchMode && tool === "line" && !state.lineSettings?.sizeLocked)
        ? (lineMode === "segment"
          ? (lineStage === 0
            ? (isJa ? "ライン: 始点を確定" : "Line: confirm start point")
            : (isJa ? "ライン: 終点を確定" : "Line: confirm end point"))
          : (lineMode === "freehand"
            ? (isJa ? "B-スプライン: 現在位置を確定" : "B-Spline: confirm current position")
            : (isJa ? "連続ライン: 現在位置を確定" : "Continuous line: confirm current position")))
        : "";
      const statusText = touchMode
        ? (circleStatus || lineStatus || liveStatus || `${tool}${state.ui?.touchMultiSelect ? " / Multi-Select ON" : ""}`)
        : "";
      dom.touchToolPanelStatus.textContent = "";
      dom.touchToolPanelStatus.style.display = "none";
    }
  }
  if (dom.touchConfirmOverlay && dom.touchConfirmBtn) {
    const touchMode = !!state.ui?.touchMode;
    const tool = String(state.tool || "");
    const lineDraft = state.input?.touchLineDraft || {};
    const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
    const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
    const isTouchLine = touchMode && tool === "line" && !state.lineSettings?.sizeLocked;
    const lineCandidate = lineDraft.candidatePoint || state.input?.hover?.world || null;
    const lineStage = Number(lineDraft.stage) || 0;
    const linearDraft = state.polylineDraft;
    const hasLinearDraft = !!(
      linearDraft &&
      linearDraft.kind !== "bspline" &&
      Array.isArray(linearDraft.points) &&
      linearDraft.points.length >= 2
    );
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
    const lineTouchTextUnused = panelLang === "ja"
      ? {
          startConfirm: "開始点を確定",
          endConfirm: "終了点を確定",
          currentConfirm: "現在位置を確定",
          finishLine: "連続ライン確定",
          cancel: "キャンセル",
        }
      : {
          startConfirm: "Confirm Start Point",
          endConfirm: "Confirm End Point",
          currentConfirm: "Confirm Current Position",
          finishLine: "Finish Continuous Line",
          cancel: "Cancel",
        };
    const lineTouchText = panelLang === "ja"
      ? {
          startConfirm: "\u958b\u59cb\u70b9\u3092\u78ba\u5b9a",
          endConfirm: "\u7d42\u70b9\u3092\u78ba\u5b9a",
          currentConfirm: "\u73fe\u5728\u4f4d\u7f6e\u3092\u78ba\u5b9a",
          finishLine: "\u9023\u7d9a\u30e9\u30a4\u30f3\u7d42\u4e86",
          cancel: "\u30ad\u30e3\u30f3\u30bb\u30eb",
        }
      : {
          startConfirm: "Confirm Start Point",
          endConfirm: "Confirm End Point",
          currentConfirm: "Confirm Current Position",
          finishLine: "Finish Continuous Line",
          cancel: "Cancel",
        };
    const dimTouchText = panelLang === "ja"
      ? {
          target: "\u30bf\u30fc\u30b2\u30c3\u30c8\u3092\u78ba\u5b9a",
          secondTarget: "\u4e8c\u3064\u76ee\u3092\u78ba\u5b9a",
          placement: "\u914d\u7f6e\u4f4d\u7f6e\u3092\u78ba\u5b9a",
          create: "\u5bf8\u6cd5\u3092\u4f5c\u6210",
          angleCreate: "\u89d2\u5ea6\u5bf8\u6cd5\u3092\u4f5c\u6210",
          leaderCreate: "\u30ea\u30fc\u30c0\u30fc\u5bf8\u6cd5\u3092\u4f5c\u6210",
          dimChainAddTarget: "\u30bf\u30fc\u30b2\u30c3\u30c8\u3092\u8ffd\u52a0",
          dimChainConfirmTarget: "\u30bf\u30fc\u30b2\u30c3\u30c8\u3092\u78ba\u5b9a",
          dimChainGenerate: "\u5bf8\u6cd5\u7dda\u3092\u751f\u6210",
          cancel: "\u30ad\u30e3\u30f3\u30bb\u30eb",
        }
      : {
          target: "Confirm Target",
          secondTarget: "Confirm 2nd Target",
          placement: "Confirm Placement",
          create: "Create Dimension",
          angleCreate: "Create Angle Dimension",
          leaderCreate: "Create Leader Dimension",
          dimChainAddTarget: "Add Target",
          dimChainConfirmTarget: "Confirm Target",
          dimChainGenerate: "Generate Dimension Line",
          cancel: "Cancel",
        };
    const circleTouchText = panelLang === "ja"
      ? {
          centerConfirm: "\u4e2d\u5fc3\u70b9\u3092\u78ba\u5b9a",
          edgeConfirm: "\u5186\u5468\u70b9\u3092\u78ba\u5b9a",
          addTarget: "\u30bf\u30fc\u30b2\u30c3\u30c8\u3068\u3057\u3066\u767b\u9332",
          createCircle: "\u5916\u63a5\u5186\u3092\u751f\u6210",
          cancel: "\u30ad\u30e3\u30f3\u30bb\u30eb",
        }
      : {
          centerConfirm: "Confirm Center Point",
          edgeConfirm: "Confirm Edge Point",
          addTarget: "Register Target",
          createCircle: "Create Circumscribed Circle",
          cancel: "Cancel",
        };
    if (isTouchLine) {
      const showLineFinish = (lineMode === "continuous" || lineMode === "freehand");
      const hasCurrentCandidate = !!lineCandidate;
      const hasLineDraftPoints = !!(state.polylineDraft && Array.isArray(state.polylineDraft.points) && state.polylineDraft.points.length >= 2);
      const hasBsplineDraftPoints = !!(state.polylineDraft && state.polylineDraft.kind === "bspline" && Array.isArray(state.polylineDraft.points) && state.polylineDraft.points.length >= 2);
      const hasPending = hasCurrentCandidate || hasLineDraftPoints || hasBsplineDraftPoints || lineStage > 0 || !!lineDraft.p1;
      dom.touchConfirmOverlay.style.display = (isPanelVisible(state, "touchConfirmOverlay")) ? "flex" : "none";
      dom.touchConfirmBtn.style.display = "";
      dom.touchConfirmBtn.disabled = !hasCurrentCandidate;
      dom.touchConfirmBtn.textContent = (lineMode === "segment")
        ? (lineStage === 0 ? lineTouchText.startConfirm : lineTouchText.endConfirm)
        : lineTouchText.currentConfirm;
      if (dom.touchLineFinishBtn) {
        dom.touchLineFinishBtn.style.display = showLineFinish ? "" : "none";
        dom.touchLineFinishBtn.disabled = !(hasLineDraftPoints || hasBsplineDraftPoints);
        dom.touchLineFinishBtn.textContent = lineTouchText.finishLine;
      }
      if (dom.touchMultiSelectOverlay) {
        dom.touchMultiSelectOverlay.style.display = "none";
      }
      return;
    }
    if (touchMode && tool === "dim") {
      const linearMode = String(state.dimSettings?.linearMode || "single");
      const draft = state.dimDraft || null;
      const touchDraft = state.input?.touchDimDraft || {};
      const hasCandidate = !!(touchDraft.candidatePoint || state.input?.hover?.world || state.input?.hoverWorld);
      const dimType = String(draft?.type || "");
      const isChain = linearMode === "chain" || dimType === "dimchain";
      const isLeader = linearMode === "leader" || dimType === "dimleader";
      const isAngle = linearMode === "angle" || dimType === "dimangle";
      const isCircleDim = dimType === "circleDim";
      const hasFirstTarget = !!(draft?.p1 || draft?.line1Id || draft?.dimRef || (draft?.points || []).length >= 1);
      const hasSecondTarget = !!(draft?.p2 || draft?.line2Id || (isChain && (draft?.points || []).length >= 2));
      const hasPlacementPoint = !!(draft?.place || draft?.tx != null || draft?.ty != null || draft?.x2 != null || draft?.y2 != null || draft?.cx != null);
      const chainPointCount = Array.isArray(draft?.points) ? draft.points.length : 0;
      const chainReady = isChain && hasPlacementPoint && chainPointCount >= 2;
      const leaderReady = isLeader && hasSecondTarget;
      const angleReady = isAngle && Number.isFinite(Number(draft?.cx)) && Number.isFinite(Number(draft?.cy)) && Number.isFinite(Number(draft?.r)) && Number.isFinite(Number(draft?.a1)) && Number.isFinite(Number(draft?.a2));
      const circleReady = isCircleDim && !!draft?.dimRef;
      const singleReady = !isChain && !isLeader && !isAngle && !isCircleDim && !!(draft?.p1 && draft?.p2 && draft?.place);
      let label = dimTouchText.target;
      let enabled = hasCandidate;
      if (isLeader) {
        label = hasFirstTarget && !hasSecondTarget ? dimTouchText.secondTarget : (leaderReady ? dimTouchText.leaderCreate : dimTouchText.target);
        enabled = hasCandidate || leaderReady;
      } else if (isAngle) {
        label = hasFirstTarget && !hasSecondTarget ? dimTouchText.secondTarget : (angleReady ? dimTouchText.angleCreate : dimTouchText.target);
        enabled = hasCandidate || angleReady;
      } else if (isChain) {
        if (!draft?.awaitingPlacement) {
          label = dimTouchText.dimChainAddTarget || dimTouchText.target;
          enabled = hasCandidate;
        } else {
          label = dimTouchText.dimChainGenerate || dimTouchText.dimCreate;
          enabled = chainReady || hasPlacementPoint;
        }
      } else if (isCircleDim) {
        label = circleReady ? dimTouchText.create : dimTouchText.target;
        enabled = hasCandidate || circleReady;
      } else {
        if (!hasFirstTarget) {
          label = dimTouchText.target;
        } else if (!hasSecondTarget) {
          label = dimTouchText.secondTarget;
        } else if (!hasPlacementPoint) {
          label = dimTouchText.placement;
        } else {
          label = dimTouchText.create;
        }
        enabled = hasCandidate || singleReady;
      }
      dom.touchConfirmOverlay.style.display = (isPanelVisible(state, "touchConfirmOverlay")) ? "flex" : "none";
      dom.touchConfirmBtn.style.display = "";
      dom.touchConfirmBtn.disabled = !enabled;
      dom.touchConfirmBtn.textContent = label;
      if (dom.touchLineFinishBtn) {
        const showChainFinish = isChain && !draft?.awaitingPlacement;
        dom.touchLineFinishBtn.style.display = showChainFinish ? "" : "none";
        dom.touchLineFinishBtn.disabled = !(showChainFinish && chainPointCount >= 2);
        dom.touchLineFinishBtn.textContent = dimTouchText.dimChainConfirmTarget || dimTouchText.placement;
      }
      if (dom.touchMultiSelectOverlay) {
        dom.touchMultiSelectOverlay.style.display = "none";
      }
      return;
    }
    if (touchMode && tool === "circle") {
      const circleMode = (circleModeRaw === "fixed" || circleModeRaw === "threepoint" || circleModeRaw === "drag")
        ? circleModeRaw
        : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
      const circleDraft = state.input?.touchCircleDraft || {};
      const circleStage = Number(circleDraft.stage) || 0;
      const circleThreePointCount = Array.isArray(state.input?.circleThreePointRefs) ? state.input.circleThreePointRefs.length : 0;
      const circleConfirmVisible = circleMode !== "fixed";
      const circleConfirmEnabled = circleMode === "drag"
        ? !!(circleDraft.candidatePoint || state.input?.hover?.world)
        : (circleThreePointCount >= 3 || ((state.selection?.ids || []).length > 0));
      const circleButtonText = circleMode === "drag"
        ? (circleStage === 0 ? circleTouchText.centerConfirm : circleTouchText.edgeConfirm)
        : (circleThreePointCount >= 3 ? circleTouchText.createCircle : circleTouchText.addTarget);
      const circlePending = !!(circleDraft.stage || circleDraft.p1 || circleDraft.candidatePoint || circleThreePointCount > 0);
      dom.touchConfirmOverlay.style.display = (isPanelVisible(state, "touchConfirmOverlay")) ? "flex" : "none";
      dom.touchConfirmBtn.style.display = circleConfirmVisible ? "" : "none";
      dom.touchConfirmBtn.disabled = !circleConfirmEnabled;
      dom.touchConfirmBtn.textContent = circleButtonText;
      if (dom.touchLineFinishBtn) dom.touchLineFinishBtn.style.display = "none";
      if (dom.touchMultiSelectOverlay) {
        dom.touchMultiSelectOverlay.style.display = "none";
      }
      return;
    }
    const show = touchMode && (hasLinearDraft || canLineFinalize || isChainDim || (tool === "circle" && circleMode === "threepoint") || tool === "fillet" || tool === "doubleline" || tool === "hatch" || tool === "patterncopy" || tool === "rect" || tool === "text");
    let enabled = false;
    let label = touchText.confirm;
    if (hasLinearDraft) {
      enabled = true;
      label = touchText.finishContinuousLine;
    } else if (canLineFinalize) {
      enabled = !!(state.polylineDraft && (state.polylineDraft.points || []).length >= 2);
      label = (lineMode === "freehand")
        ? touchText.finalizeBSpline
        : touchText.finishContinuousLine;
    } else if (isChainDim) {
      enabled = canPrepareDim || canFinalizeDim;
      label = canFinalizeDim
        ? touchText.finalizeDim
        : touchText.setPlacement;
    } else if (tool === "circle" && circleMode === "threepoint") {
      enabled = canCircleThreePoint;
      label = touchText.createThreePointCircle;
    } else if (tool === "fillet") {
      enabled = canFillet;
      label = touchText.applyFillet;
    } else if (tool === "doubleline") {
      enabled = canDline;
      label = touchText.applyDoubleLine;
    } else if (tool === "hatch") {
      enabled = canHatch;
      label = touchText.applyHatch;
    } else if (tool === "patterncopy") {
      enabled = canPatternCopy;
      label = touchText.runPatternCopy;
    }
    if (tool === "rect") {
      enabled = canRectConfirm;
      label = (Number(rectDraft.stage) === 1)
        ? touchText.createRectangle
        : touchText.confirmFirstPoint;
    } else if (tool === "text") {
      const textDraft = state.input?.touchTextDraft || {};
      enabled = !!textDraft.candidatePoint;
      label = panelLang === "ja" ? "配置" : "Place Text";
    }
    dom.touchConfirmOverlay.style.display = (isPanelVisible(state, "touchConfirmOverlay") && show) ? "flex" : "none";
    dom.touchConfirmBtn.disabled = !enabled;
    dom.touchConfirmBtn.textContent = label;
  }
  if (dom.touchSelectBackOverlay && dom.touchSelectBackBtn) {
    const touchMode = !!state.ui?.touchMode;
    dom.touchSelectBackOverlay.style.display = touchMode ? "flex" : "none";
  }
  if (dom.touchMultiSelectOverlay && dom.touchMultiSelectBtn) {
    const touchMode = !!state.ui?.touchMode;
    const tool = String(state.tool || "");
    const circleModeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const circleMode = (circleModeRaw === "fixed" || circleModeRaw === "threepoint" || circleModeRaw === "drag")
      ? circleModeRaw
      : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
    const needsMultiSelect = (tool === "select" || tool === "hatch" || tool === "doubleline" || tool === "patterncopy");
    const on = !!state.ui?.touchMultiSelect;
    dom.touchMultiSelectOverlay.style.display = (isPanelVisible(state, "touchMultiSelectOverlay") && touchMode && needsMultiSelect) ? "flex" : "none";
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
  if (dom.selectProjectFolderBtn || dom.clearProjectFolderBtn || dom.projectFolderStatus) {
    const info = state.ui?.projectFolder || {};
    const supported = info.supported !== false;
    const linked = !!info.linked;
    if (dom.selectProjectFolderBtn) dom.selectProjectFolderBtn.disabled = !supported;
    if (dom.clearProjectFolderBtn) dom.clearProjectFolderBtn.disabled = !linked;
    if (dom.projectFolderStatus) {
      let text = "Using browser storage only";
      if (!supported) text = "Project folder save is not supported in this browser";
      else if (linked && info.source === "file") text = `Linked: ${String(info.name || "")}`;
      else if (linked) text = `Linked: ${String(info.name || "")} (browser fallback)`;
      dom.projectFolderStatus.textContent = text;
    }
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



