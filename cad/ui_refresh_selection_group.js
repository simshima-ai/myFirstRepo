export function refreshSelectionAndGroupPanels(state, dom, panelLang, panelText, helpers) {
  const { syncInputValue, normalizeLineWidthPreset, normalizeLineTypePreset } = helpers;
  if (dom.deleteGroupBtn) dom.deleteGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.unparentGroupBtn) {
    const g = (state.groups || []).find(gg => Number(gg.id) === Number(state.activeGroupId));
    dom.unparentGroupBtn.disabled = !(g && g.parentId != null);
  }
  if (dom.moveGroupBtn) dom.moveGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.copyGroupBtn) dom.copyGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.renameGroupBtn) dom.renameGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.renameGroupNameInput) {
    const activeGroup = (state.groups || []).find(g => Number(g.id) === Number(state.activeGroupId));
    if (!activeGroup) {
      if (document.activeElement !== dom.renameGroupNameInput) dom.renameGroupNameInput.value = "";
    } else if (document.activeElement !== dom.renameGroupNameInput) {
      dom.renameGroupNameInput.value = String(activeGroup.name || "");
    }
  }
  if (dom.moveGroupUpBtn || dom.moveGroupDownBtn) {
    const groups = state.groups || [];
    const idx = groups.findIndex(g => Number(g.id) === Number(state.activeGroupId));
    const canUp = idx > 0;
    const canDown = idx >= 0 && idx < (groups.length - 1);
    if (dom.moveGroupUpBtn) dom.moveGroupUpBtn.disabled = !canUp;
    if (dom.moveGroupDownBtn) dom.moveGroupDownBtn.disabled = !canDown;
  }
  if (dom.moveGroupOriginOnlyBtn) {
    const active = !!(state.input?.groupOriginPick?.active);
    dom.moveGroupOriginOnlyBtn.disabled = (state.activeGroupId == null);
    dom.moveGroupOriginOnlyBtn.classList.toggle("is-active", active);
    dom.moveGroupOriginOnlyBtn.textContent = active ? panelText.movingOrigin : panelText.moveOrigin;
  }
  const activeGroup = (state.groups || []).find((g) => Number(g.id) === Number(state.activeGroupId)) || null;
  if (dom.groupRotationLabel) {
    dom.groupRotationLabel.textContent = (panelLang === "en") ? "Rotation" : "回転角";
  }
  if (dom.groupRotationValue) {
    if (!activeGroup) {
      dom.groupRotationValue.textContent = "-";
    } else {
      const deg = Number(activeGroup.rotationDeg) || 0;
      const rounded = Math.round(deg * 100) / 100;
      dom.groupRotationValue.textContent = `${rounded.toFixed(2)}°`;
    }
  }
  if (dom.groupScaleEnableToggle) {
    const scOpt = (activeGroup && activeGroup.scaleOptions && typeof activeGroup.scaleOptions === "object")
      ? activeGroup.scaleOptions
      : { allowScale: false, keepAspect: false };
    const allowScale = !!scOpt.allowScale;
    if (dom.groupScaleEnableToggle) {
      dom.groupScaleEnableToggle.disabled = (state.activeGroupId == null);
      dom.groupScaleEnableToggle.checked = allowScale;
    }
    if (dom.groupScaleFactorInput) {
      const sf = Math.max(1e-9, Number(scOpt.scaleFactor) || 1);
      const sfRounded = Math.round(sf * 1000) / 1000;
      if (document.activeElement !== dom.groupScaleFactorInput) syncInputValue(dom.groupScaleFactorInput, sfRounded);
      dom.groupScaleFactorInput.disabled = (state.activeGroupId == null) || !allowScale;
    }
    if (dom.groupScaleApplyBtn) {
      dom.groupScaleApplyBtn.disabled = (state.activeGroupId == null) || !allowScale;
    }
  }
  const aim = activeGroup?.aimConstraint || {};
  const aimEnabled = !!aim.enabled;
  const aimTargetType = String(aim.targetType || "");
  const aimTargetId = Number(aim.targetId);
  const aimPickActive = !!(state.input?.groupAimPick?.active)
    && Number(state.input?.groupAimPick?.groupId) === Number(state.activeGroupId);
  const aimCandidateType = String(state.input?.groupAimPick?.candidateType || "");
  const aimCandidateId = Number(state.input?.groupAimPick?.candidateId);
  if (dom.groupAimEnableToggle) {
    dom.groupAimEnableToggle.disabled = (state.activeGroupId == null);
    dom.groupAimEnableToggle.checked = aimEnabled;
  }
  if (dom.groupAimPickBtn) {
    dom.groupAimPickBtn.disabled = (state.activeGroupId == null);
    dom.groupAimPickBtn.classList.toggle("is-active", aimPickActive);
    dom.groupAimPickBtn.textContent = aimPickActive
      ? ((panelLang === "en") ? "Confirm" : "決定")
      : ((panelLang === "en") ? "Pick Target" : "注視先を指定");
  }
  if (dom.groupAimClearBtn) {
    const hasAimTarget = aimTargetType.length > 0 && Number.isFinite(aimTargetId);
    dom.groupAimClearBtn.disabled = (state.activeGroupId == null) || (!hasAimTarget && !aimEnabled);
  }
  if (dom.groupAimStatus) {
    let text = (panelLang === "en") ? "Target: None" : "ターゲット: なし";
    if (aimTargetType === "group" && Number.isFinite(aimTargetId)) {
      text = (panelLang === "en") ? `Target: Group #${aimTargetId}` : `ターゲット: グループ #${aimTargetId}`;
    } else if (aimTargetType === "position" && Number.isFinite(aimTargetId)) {
      text = (panelLang === "en") ? `Target: Position #${aimTargetId}` : `ターゲット: 位置 #${aimTargetId}`;
    }
    if (aimPickActive) {
      if (aimCandidateType === "group" && Number.isFinite(aimCandidateId)) {
        text = (panelLang === "en") ? `Candidate: Group #${aimCandidateId}` : `候補: グループ #${aimCandidateId}`;
      } else if (aimCandidateType === "position" && Number.isFinite(aimCandidateId)) {
        text = (panelLang === "en") ? `Candidate: Position #${aimCandidateId}` : `候補: 位置 #${aimCandidateId}`;
      } else {
        text = (panelLang === "en") ? "Picking target..." : "クリック待機中...";
      }
    }
    if (aimEnabled && !aimPickActive) text += (panelLang === "en") ? " (ON)" : " (ON)";
    dom.groupAimStatus.textContent = text;
  }
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.disabled = !(state.tool === "select" && (state.selection?.ids?.length > 1) && state.activeGroupId == null);
  }
  if (dom.dimMergeGroupsBtn) {
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selectedShapes = selIds.size > 0 ? (state.shapes || []).filter(s => selIds.has(Number(s.id))) : [];
    const hasOnlyDims = selectedShapes.length > 0
      && selectedShapes.every(s => s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim");
    dom.dimMergeGroupsBtn.disabled = !(state.tool === "select" && (state.selection?.ids?.length > 1) && state.activeGroupId == null && hasOnlyDims);
  }
  const selIdsForObjMove = new Set((state.selection?.ids || []).map(Number));
  const selectedShapesForMove = selIdsForObjMove.size > 0 ? (state.shapes || []).filter(s => selIdsForObjMove.has(Number(s.id))) : [];
  const hasObjectSelectionForMove = state.tool === "select" && selectedShapesForMove.length > 0;
  const canCopyLineCircle = state.tool === "select"
    && selectedShapesForMove.length > 0
    && selectedShapesForMove.every(s => s.type === "line" || s.type === "polyline" || s.type === "circle" || s.type === "arc");
  if (dom.moveSelectedShapesBtn) {
    dom.moveSelectedShapesBtn.disabled = !hasObjectSelectionForMove;
  }
  if (dom.copySelectedShapesBtn) {
    dom.copySelectedShapesBtn.disabled = !canCopyLineCircle;
  }
  if (dom.groupRotateSnapInput) {
    const v = Number(state.input?.groupRotate?.snapDeg || 5);
    syncInputValue(dom.groupRotateSnapInput, v);
  }
  if (dom.selectMoveDxInput && (dom.selectMoveDxInput.value == null || dom.selectMoveDxInput.value === "")) {
    dom.selectMoveDxInput.value = "0";
  }
  if (dom.selectMoveDyInput && (dom.selectMoveDyInput.value == null || dom.selectMoveDyInput.value === "")) {
    dom.selectMoveDyInput.value = "0";
  }
  if (dom.vertexMoveDxInput) {
    const v = Number(state.vertexEdit?.moveDx || 0);
    syncInputValue(dom.vertexMoveDxInput, v);
  }
  if (dom.vertexMoveDyInput) {
    const v = Number(state.vertexEdit?.moveDy || 0);
    syncInputValue(dom.vertexMoveDyInput, v);
  }
  if (dom.moveVertexBtn) {
    const insertMode = String(state.vertexEdit?.mode || "move").toLowerCase() === "insert";
    dom.moveVertexBtn.disabled = insertMode || !(state.vertexEdit?.selectedVertices?.length > 0);
  }
  if (dom.deleteVertexBtn) {
    const selected = Array.isArray(state.vertexEdit?.selectedVertices) ? state.vertexEdit.selectedVertices : [];
    const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    let canDelete = false;
    for (const v of selected) {
      const sid = Number(v?.shapeId);
      const key = String(v?.key || "");
      const s = shapeById.get(sid);
      if (!s || String(s.type || "") !== "polyline" || !Array.isArray(s.points) || s.points.length <= 2) continue;
      if (/^v\d+$/.test(key)) {
        canDelete = true;
        break;
      }
    }
    dom.deleteVertexBtn.disabled = !canDelete;
  }
  if (dom.vertexLinkCoincidentToggle) {
    dom.vertexLinkCoincidentToggle.checked = state.vertexEdit?.linkCoincident !== false;
  }
  if (dom.vertexModeSelect) {
    const vm = String(state.vertexEdit?.mode || "move").toLowerCase();
    dom.vertexModeSelect.value = (vm === "insert") ? "insert" : "move";
  }
  if (dom.lineLengthInput) {
    const v = Number(state.lineSettings?.length || 0);
    syncInputValue(dom.lineLengthInput, v);
  }
  if (dom.lineAngleInput) {
    const v = Number(state.lineSettings?.angleDeg || 0);
    syncInputValue(dom.lineAngleInput, v);
  }
  if (dom.applyLineInputBtn) {
    const on = !!state.lineSettings?.sizeLocked;
    dom.applyLineInputBtn.disabled = !(state.tool === "line");
    dom.applyLineInputBtn.textContent = on
      ? (panelLang === "en" ? "Unlock Size" : "サイズ固定解除")
      : (panelLang === "en" ? "Lock Size" : "サイズ固定");
    dom.applyLineInputBtn.classList.toggle("active", on);
  }
  if (dom.lineAnchorSelect) {
    const v = String(state.lineSettings?.anchor || "endpoint_a");
    if (dom.lineAnchorSelect.value !== v) dom.lineAnchorSelect.value = v;
  }
  if (dom.rectWidthInput) {
    const v = Number(state.rectSettings?.width || 0);
    syncInputValue(dom.rectWidthInput, v);
  }
  if (dom.rectHeightInput) {
    const v = Number(state.rectSettings?.height || 0);
    syncInputValue(dom.rectHeightInput, v);
  }
  if (dom.applyRectInputBtn) {
    const on = !!state.rectSettings?.sizeLocked;
    dom.applyRectInputBtn.disabled = !(state.tool === "rect");
    dom.applyRectInputBtn.textContent = on
      ? (panelLang === "en" ? "Unlock Size" : "サイズ固定解除")
      : (panelLang === "en" ? "Lock Size" : "サイズ固定");
    dom.applyRectInputBtn.classList.toggle("active", on);
  }
  if (dom.rectAnchorSelect) {
    const v = String(state.rectSettings?.anchor || "c");
    if (dom.rectAnchorSelect.value !== v) dom.rectAnchorSelect.value = v;
  }
  if (dom.circleRadiusInput) {
    const v = Number(state.circleSettings?.radius || 0);
    syncInputValue(dom.circleRadiusInput, v);
  }
  if (dom.circleModeSelect) {
    const modeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const mode = (modeRaw === "fixed" || modeRaw === "threepoint" || modeRaw === "drag")
      ? modeRaw
      : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
    if (dom.circleModeSelect.value !== mode) dom.circleModeSelect.value = mode;
    if (dom.circleRadiusRow) dom.circleRadiusRow.style.display = (mode === "threepoint") ? "none" : "grid";
    if (dom.circleThreePointHint) dom.circleThreePointHint.style.display = (mode === "threepoint") ? "block" : "none";
    if (dom.circleThreePointOps) dom.circleThreePointOps.style.display = (mode === "threepoint") ? "block" : "none";
    if (dom.circleThreePointRunBtn) {
      const touchMode = !!state.ui?.touchMode;
      const count = Array.isArray(state.input?.circleThreePointRefs) ? state.input.circleThreePointRefs.length : 0;
      dom.circleThreePointRunBtn.style.display = touchMode ? "none" : "";
      dom.circleThreePointRunBtn.disabled = !(mode === "threepoint" && count >= 3);
    }
  }
  if (dom.applyCircleInputBtn) {
    const modeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const on = (modeRaw === "fixed") || (!!state.circleSettings?.radiusLocked && modeRaw !== "drag" && modeRaw !== "threepoint");
    dom.applyCircleInputBtn.disabled = !(state.tool === "circle");
    dom.applyCircleInputBtn.textContent = on
      ? (panelLang === "en" ? "Unlock Radius" : "半径固定解除")
      : (panelLang === "en" ? "Lock Radius" : "半径固定");
    dom.applyCircleInputBtn.classList.toggle("active", on);
  }
  if (dom.filletRadiusInput) {
    const v = Number(state.filletSettings?.radius || 20);
    syncInputValue(dom.filletRadiusInput, v);
  }
  if (dom.filletLineModeSelect) {
    const v = (String(state.filletSettings?.lineMode || "split").toLowerCase() === "split") ? "split" : "trim";
    if (dom.filletLineModeSelect.value !== v) dom.filletLineModeSelect.value = v;
  }
  if (dom.filletNoTrimToggle) {
    dom.filletNoTrimToggle.checked = !!state.filletSettings?.noTrim;
  }
  if (dom.trimNoDeleteToggle) {
    dom.trimNoDeleteToggle.checked = !!state.trimSettings?.noDelete;
  }
  if (dom.applyFilletBtn) {
    const touchMode = !!state.ui?.touchMode;
    dom.applyFilletBtn.style.display = (!touchMode && state.tool === "fillet") ? "" : "none";
    dom.applyFilletBtn.disabled = !((state.selection?.ids || []).length >= 2);
  }
  if (dom.dlineOffsetInput) {
    const v = Number(state.dlineSettings?.offset || 5);
    syncInputValue(dom.dlineOffsetInput, v);
  }
  if (dom.dlineModeSelect) {
    const v = state.dlineSettings?.mode || "both";
    if (dom.dlineModeSelect.value !== v) dom.dlineModeSelect.value = v;
  }
  if (dom.dlineAsPolylineToggle) {
    dom.dlineAsPolylineToggle.checked = !!state.dlineSettings?.asPolyline;
  }
  if (dom.applyDLineBtn) {
    const touchMode = !!state.ui?.touchMode;
    const ready = !!(state.tool === "doubleline" && state.dlinePreview && state.dlinePreview.length > 0);
    dom.applyDLineBtn.style.display = touchMode ? "none" : "";
    dom.applyDLineBtn.disabled = !ready;
  }
  if (dom.positionSizeInput) {
    const selectedPosition = (() => {
      const ids = new Set((state.selection?.ids || []).map(Number));
      if (!ids.size) return null;
      for (const s of (state.shapes || [])) {
        if (!ids.has(Number(s.id))) continue;
        if (s.type === "position") return s;
      }
      return null;
    })();
    const v = Number(selectedPosition?.size ?? state.positionSettings?.size ?? 3);
    syncInputValue(dom.positionSizeInput, v);
  }
  if (dom.selectionLineWidthInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    const selected = [];
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "line" && s.type !== "polyline" && s.type !== "circle" && s.type !== "arc" && s.type !== "position" && s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim") continue;
      selected.push(s);
    }
    const first = selected[0] || null;
    const v = normalizeLineWidthPreset(first?.lineWidthMm ?? state.lineWidthMm ?? 0.25);
    syncInputValue(dom.selectionLineWidthInput, v);
    dom.selectionLineWidthInput.disabled = !selected.length;
  }
  if (dom.selectionLineTypeInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "line" && s.type !== "polyline" && s.type !== "circle" && s.type !== "arc" && s.type !== "position" && s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim") continue;
      first = s;
      break;
    }
    dom.selectionLineTypeInput.value = normalizeLineTypePreset(first?.lineType ?? "solid");
    dom.selectionLineTypeInput.disabled = !first;
  }
  if (dom.selectionColorInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      first = s;
      break;
    }
    const color = (() => {
      if (!first) return "#0f172a";
      if (first.type === "text") return String(first.textColor || "#0f172a");
      if (first.type === "hatch") return String(first.lineColor || "#0f172a");
      return String(first.color || "#0f172a");
    })();
    dom.selectionColorInput.value = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f172a";
    dom.selectionColorInput.disabled = !first;
  }
  if (dom.dimSelectionColorInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let firstDim = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim") continue;
      firstDim = s;
      break;
    }
    const color = String(firstDim?.color || "#0f172a");
    dom.dimSelectionColorInput.value = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f172a";
    dom.dimSelectionColorInput.disabled = !firstDim;
    const wrap = document.getElementById("dimSelectionColorWrap");
    if (wrap) wrap.style.display = firstDim ? "inline-flex" : "none";
  }
  if (dom.selectionPositionSizeInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "position") continue;
      first = s;
      break;
    }
    const v = Math.max(1, Number(first?.size ?? state.positionSettings?.size ?? 3));
    syncInputValue(dom.selectionPositionSizeInput, v);
    dom.selectionPositionSizeInput.disabled = !first;
  }
  if (dom.selectionImageWidthInput || dom.selectionImageHeightInput || dom.selectionImageLockAspectToggle || dom.selectionImageLockTransformToggle) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "image") continue;
      first = s;
      break;
    }
    if (dom.selectionImageWidthInput) {
      const v = Math.max(1, Number(first?.width || 1));
      syncInputValue(dom.selectionImageWidthInput, v);
      dom.selectionImageWidthInput.disabled = !first;
    }
    if (dom.selectionImageHeightInput) {
      const v = Math.max(1, Number(first?.height || 1));
      syncInputValue(dom.selectionImageHeightInput, v);
      dom.selectionImageHeightInput.disabled = !first;
    }
    if (dom.selectionImageLockAspectToggle) {
      dom.selectionImageLockAspectToggle.checked = !!first?.lockAspect;
      dom.selectionImageLockAspectToggle.disabled = !first;
    }
    if (dom.selectionImageLockTransformToggle) {
      dom.selectionImageLockTransformToggle.checked = !!first?.lockTransform;
      dom.selectionImageLockTransformToggle.disabled = !first;
    }
    const transformLocked = !!first?.lockTransform;
    if (dom.selectionImageWidthInput) dom.selectionImageWidthInput.disabled = !first || transformLocked;
    if (dom.selectionImageHeightInput) dom.selectionImageHeightInput.disabled = !first || transformLocked;
    if (dom.selectionImageLockAspectToggle) dom.selectionImageLockAspectToggle.disabled = !first || transformLocked;
  }
  if (dom.selectionCircleCenterMarkToggle) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    const circles = (state.shapes || []).filter(s => {
      if (!ids.has(Number(s.id))) return false;
      return s.type === "circle" || s.type === "arc";
    });
    if (circles.length > 0) {
      dom.selectionCircleCenterMarkToggle.checked = circles.every(s => !!s.showCenterMark);
      dom.selectionCircleCenterMarkToggle.disabled = false;
    } else {
      dom.selectionCircleCenterMarkToggle.checked = !!state.circleSettings?.showCenterMark;
      dom.selectionCircleCenterMarkToggle.disabled = true;
    }
  }
  if (dom.selectionCircleRadiusInput || dom.selectionApplyCircleRadiusBtn) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    const circles = (state.shapes || []).filter(s => ids.has(Number(s.id)) && (s.type === "circle" || s.type === "arc"));
    const first = circles[0] || null;
    if (dom.selectionCircleRadiusInput) {
      const v = Math.max(0, Number(first?.r ?? state.circleSettings?.radius ?? 50) || 0);
      syncInputValue(dom.selectionCircleRadiusInput, v);
      dom.selectionCircleRadiusInput.disabled = !first;
    }
    if (dom.selectionApplyCircleRadiusBtn) {
      dom.selectionApplyCircleRadiusBtn.disabled = !first;
    }
  }
}
