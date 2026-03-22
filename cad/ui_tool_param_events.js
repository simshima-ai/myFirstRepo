export function bindToolParameterEvents(params) {
  const {
    state,
    dom,
    actions,
    bindColorInputPalette,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
  } = params;
  bindColorInputPalette(dom.selectionTextColorInput, (c) => {
    actions.updateSelectedTextSettings?.({ textColor: c });
  });
  bindColorInputPalette(dom.selectionColorInput, (c) => {
    actions.setSelectedColor?.(c);
  });
  bindColorInputPalette(dom.dimSelectionColorInput, (c) => {
    actions.setSelectedColor?.(c);
  });
  const focusInput = (input) => {
    if (!input || typeof input.focus !== "function") return;
    try {
      input.focus({ preventScroll: true });
    } catch (_) {
      input.focus();
    }
    if (typeof input.select === "function") input.select();
  };
  const focusButton = (button) => {
    if (!button || typeof button.focus !== "function") return;
    try {
      button.focus({ preventScroll: true });
    } catch (_) {
      button.focus();
    }
  };
  const isDeleteSelectionKey = (e) =>
    !e.ctrlKey &&
    !e.metaKey &&
    !e.altKey &&
    (e.key === "Delete" || e.code === "Delete" || Number(e.keyCode) === 46);
  const runSelectMoveDeleteKey = (e) => {
    if (!isDeleteSelectionKey(e)) return;
    e.preventDefault();
    actions.delete?.();
  };
  const runSelectMoveByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.target === dom.selectMoveDxInput) {
      focusInput(dom.selectMoveDyInput);
      return;
    }
    if (e.target === dom.selectMoveDyInput) {
      if (e.ctrlKey) {
        focusButton(dom.copySelectedShapesBtn);
        return;
      }
      focusButton(dom.moveSelectedShapesBtn);
      return;
    }
  };
  const runSelectToolMoveByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.target === dom.selectToolDxInput) {
      focusInput(dom.selectToolDyInput);
      return;
    }
    if (e.target === dom.selectToolDyInput) {
      if (e.ctrlKey) {
        focusButton(dom.selectToolCopyBtn);
        return;
      }
      focusButton(dom.selectToolMoveBtn);
      return;
    }
  };
  const runMoveToolByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const dx = Number(dom.moveToolDxInput?.value || 0);
    const dy = Number(dom.moveToolDyInput?.value || 0);
    actions.moveSelectedShapes?.(dx, dy);
  };
  if (dom.selectMoveDxInput) {
    dom.selectMoveDxInput.addEventListener("keydown", runSelectMoveByEnter);
    dom.selectMoveDxInput.addEventListener("keydown", runSelectMoveDeleteKey);
  }
  if (dom.selectMoveDyInput) {
    dom.selectMoveDyInput.addEventListener("keydown", runSelectMoveByEnter);
    dom.selectMoveDyInput.addEventListener("keydown", runSelectMoveDeleteKey);
  }
  if (dom.selectToolDxInput) {
    dom.selectToolDxInput.addEventListener("keydown", runSelectToolMoveByEnter);
    dom.selectToolDxInput.addEventListener("keydown", runSelectMoveDeleteKey);
  }
  if (dom.selectToolDyInput) {
    dom.selectToolDyInput.addEventListener("keydown", runSelectToolMoveByEnter);
    dom.selectToolDyInput.addEventListener("keydown", runSelectMoveDeleteKey);
  }
  if (dom.selectToolMoveBtn) {
    dom.selectToolMoveBtn.addEventListener("click", () => {
      const dx = Number(dom.selectToolDxInput?.value || 0);
      const dy = Number(dom.selectToolDyInput?.value || 0);
      actions.moveSelectedShapes?.(dx, dy);
    });
  }
  if (dom.selectToolCopyBtn) {
    dom.selectToolCopyBtn.addEventListener("click", () => {
      const dx = Number(dom.selectToolDxInput?.value || 0);
      const dy = Number(dom.selectToolDyInput?.value || 0);
      actions.copySelectedShapes?.(dx, dy);
    });
  }
  if (dom.moveToolDxInput) {
    dom.moveToolDxInput.addEventListener("keydown", runMoveToolByEnter);
  }
  if (dom.moveToolDyInput) {
    dom.moveToolDyInput.addEventListener("keydown", runMoveToolByEnter);
  }
  if (dom.moveToolApplyBtn) {
    dom.moveToolApplyBtn.addEventListener("click", () => {
      const dx = Number(dom.moveToolDxInput?.value || 0);
      const dy = Number(dom.moveToolDyInput?.value || 0);
      actions.moveSelectedShapes?.(dx, dy);
    });
  }
  if (dom.moveToolCopyBtn) {
    dom.moveToolCopyBtn.addEventListener("click", () => {
      const dx = Number(dom.moveToolDxInput?.value || 0);
      const dy = Number(dom.moveToolDyInput?.value || 0);
      actions.copySelectedShapes?.(dx, dy);
    });
  }
  if (dom.groupRotateSnapInput) {
    dom.groupRotateSnapInput.addEventListener("change", () => {
      const v = Math.max(0.1, Number(dom.groupRotateSnapInput.value || 5));
      dom.groupRotateSnapInput.value = String(v);
      actions.setGroupRotateSnap(v);
    });
  }
  if (dom.moveVertexBtn) {
    dom.moveVertexBtn.addEventListener("click", () => {
      const dx = Number(dom.vertexMoveDxInput?.value || 0);
      const dy = Number(dom.vertexMoveDyInput?.value || 0);
      actions.moveSelectedVertices(dx, dy);
    });
  }
  if (dom.deleteVertexBtn) {
    dom.deleteVertexBtn.addEventListener("click", () => {
      actions.deleteSelectedVertices?.();
    });
  }
  const runVertexMoveByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const dx = Number(dom.vertexMoveDxInput?.value || 0);
    const dy = Number(dom.vertexMoveDyInput?.value || 0);
    actions.moveSelectedVertices(dx, dy);
  };
  if (dom.vertexMoveDxInput) {
    dom.vertexMoveDxInput.addEventListener("change", () => {
      actions.setVertexMoveInputs(Number(dom.vertexMoveDxInput.value || 0), null);
    });
    dom.vertexMoveDxInput.addEventListener("keydown", runVertexMoveByEnter);
  }
  if (dom.vertexMoveDyInput) {
    dom.vertexMoveDyInput.addEventListener("change", () => {
      actions.setVertexMoveInputs(null, Number(dom.vertexMoveDyInput.value || 0));
    });
    dom.vertexMoveDyInput.addEventListener("keydown", runVertexMoveByEnter);
  }
  if (dom.vertexModeSelect) {
    dom.vertexModeSelect.addEventListener("change", () => {
      const v = String(dom.vertexModeSelect.value || "move").toLowerCase();
      if (!state.vertexEdit) state.vertexEdit = {};
      state.vertexEdit.mode = (v === "insert") ? "insert" : "move";
      if (state.vertexEdit.mode !== "insert") state.vertexEdit.insertCandidate = null;
      actions.draw?.();
    });
  }
  if (dom.vertexLinkCoincidentToggle) {
    dom.vertexLinkCoincidentToggle.checked = state.vertexEdit?.linkCoincident !== false;
    dom.vertexLinkCoincidentToggle.addEventListener("change", () => {
      actions.setVertexLinkCoincident(!!dom.vertexLinkCoincidentToggle.checked);
    });
  }
  if (dom.applyLineInputBtn) {
    dom.applyLineInputBtn.addEventListener("click", () => {
      actions.setLineSizeLocked?.(null);
    });
  }
  if (dom.lineModeSelect) {
    dom.lineModeSelect.addEventListener("change", () => {
      const mode = String(dom.lineModeSelect.value || "segment").toLowerCase();
      const nextMode = (mode === "continuous" || mode === "freehand") ? mode : "segment";
      state.lineSettings.mode = nextMode;
      state.lineSettings.continuous = nextMode === "continuous";
    });
  }
  if (dom.lineTouchFinalizeBtn) {
    dom.lineTouchFinalizeBtn.addEventListener("click", () => {
      const modeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
      const mode = (modeRaw === "continuous" || modeRaw === "freehand") ? modeRaw : "segment";
      if (mode === "continuous") {
        actions.finalizePolylineDraft?.();
      } else if (mode === "freehand") {
        actions.finalizeBsplineDraft?.();
      }
    });
  }
  const runLineApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const len = Number(dom.lineLengthInput?.value || 0);
    const ang = Number(dom.lineAngleInput?.value || 0);
    actions.setLineInputs(len, ang);
  };
  if (dom.lineLengthInput) {
    dom.lineLengthInput.addEventListener("change", () => {
      actions.setLineInputs(Number(dom.lineLengthInput.value || 0), null);
    });
    dom.lineLengthInput.addEventListener("keydown", runLineApplyByEnter);
  }
  if (dom.lineAngleInput) {
    dom.lineAngleInput.addEventListener("change", () => {
      actions.setLineInputs(null, Number(dom.lineAngleInput.value || 0));
    });
    dom.lineAngleInput.addEventListener("keydown", runLineApplyByEnter);
  }
  if (dom.lineAnchorSelect) {
    dom.lineAnchorSelect.addEventListener("change", () => {
      actions.setLineAnchor?.(dom.lineAnchorSelect.value || "endpoint_a");
    });
  }
  if (dom.applyRectInputBtn) {
    dom.applyRectInputBtn.addEventListener("click", () => {
      actions.setRectSizeLocked?.(null);
    });
  }
  const runRectApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.target === dom.rectWidthInput) {
      const w = Number(dom.rectWidthInput?.value || 0);
      actions.setRectInputs(w, null);
      dom.rectHeightInput?.focus?.();
      dom.rectHeightInput?.select?.();
      return;
    }
    if (e.target === dom.rectHeightInput) {
      const h = Number(dom.rectHeightInput?.value || 0);
      actions.setRectInputs(null, h);
      dom.applyRectInputBtn?.focus?.();
      return;
    }
  };
  if (dom.rectWidthInput) {
    dom.rectWidthInput.addEventListener("change", () => {
      actions.setRectInputs(Number(dom.rectWidthInput.value || 0), null);
    });
    dom.rectWidthInput.addEventListener("keydown", runRectApplyByEnter);
  }
  if (dom.rectHeightInput) {
    dom.rectHeightInput.addEventListener("change", () => {
      actions.setRectInputs(null, Number(dom.rectHeightInput.value || 0));
    });
    dom.rectHeightInput.addEventListener("keydown", runRectApplyByEnter);
  }
  if (dom.rectAnchorSelect) {
    dom.rectAnchorSelect.addEventListener("change", () => {
      actions.setRectAnchor?.(dom.rectAnchorSelect.value || "c");
    });
  }
  if (dom.rectAsPolylineToggle) {
    dom.rectAsPolylineToggle.addEventListener("change", () => {
      actions.setRectAsPolyline?.(!!dom.rectAsPolylineToggle.checked);
    });
  }
  if (dom.applyCircleInputBtn) {
    dom.applyCircleInputBtn.addEventListener("click", () => {
      actions.setCircleRadiusLocked?.(null);
    });
  }
  if (dom.circleModeSelect) {
    dom.circleModeSelect.addEventListener("change", () => {
      actions.setCircleMode?.(dom.circleModeSelect.value || "drag");
    });
  }
  if (dom.circleThreePointAddBtn) {
    dom.circleThreePointAddBtn.addEventListener("click", () => {
      actions.registerCircleThreePointTargetFromSelection?.();
    });
  }
  if (dom.circleThreePointRunBtn) {
    dom.circleThreePointRunBtn.addEventListener("click", () => {
      actions.executeCircleThreePointFromTargets?.();
    });
  }
  const runCircleApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const r = Number(dom.circleRadiusInput?.value || 0);
    actions.setCircleRadiusInput(r);
  };
  if (dom.circleRadiusInput) {
    dom.circleRadiusInput.addEventListener("change", () => {
      actions.setCircleRadiusInput(Number(dom.circleRadiusInput.value || 0));
    });
    dom.circleRadiusInput.addEventListener("keydown", runCircleApplyByEnter);
  }
  if (dom.circleCenterMarkToggle) {
    dom.circleCenterMarkToggle.addEventListener("change", () => {
      const on = !!dom.circleCenterMarkToggle.checked;
      state.circleSettings.showCenterMark = on;
      actions.setSelectionCircleCenterMark(on);
    });
  }
  if (dom.filletRadiusInput) {
    dom.filletRadiusInput.addEventListener("input", () => {
      const raw = String(dom.filletRadiusInput.value || "").trim();
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      actions.setFilletRadius(Math.max(0.1, n));
    });
    dom.filletRadiusInput.addEventListener("change", () => {
      const v = Math.max(0.1, Number(dom.filletRadiusInput.value || 20));
      dom.filletRadiusInput.value = String(v);
      actions.setFilletRadius(v);
    });
    dom.filletRadiusInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const r = Number(dom.filletRadiusInput?.value || 0);
      actions.applyFillet(r);
    });
  }
  if (dom.applyFilletBtn) {
    dom.applyFilletBtn.addEventListener("click", () => {
      const r = Number(dom.filletRadiusInput?.value || 0);
      actions.applyFillet(r);
    });
  }
  if (dom.filletLineModeSelect) {
    dom.filletLineModeSelect.addEventListener("change", () => {
      const v = String(dom.filletLineModeSelect.value || "split").toLowerCase();
      actions.setFilletLineMode(v === "split" ? "split" : "trim");
    });
  }
  if (dom.selectionLineWidthInput) {
    const applySelectionLineWidth = () => {
      const v = normalizeLineWidthPreset(dom.selectionLineWidthInput.value);
      dom.selectionLineWidthInput.value = String(v);
      actions.setSelectedLineWidthMm?.(v);
    };
    dom.selectionLineWidthInput.addEventListener("change", applySelectionLineWidth);
    dom.selectionLineWidthInput.addEventListener("input", applySelectionLineWidth);
  }
  if (dom.selectionLineTypeInput) {
    const applySelectionLineType = () => {
      const v = normalizeLineTypePreset(dom.selectionLineTypeInput.value);
      dom.selectionLineTypeInput.value = v;
      actions.setSelectedLineType?.(v);
    };
    dom.selectionLineTypeInput.addEventListener("change", applySelectionLineType);
    dom.selectionLineTypeInput.addEventListener("input", applySelectionLineType);
  }
  if (dom.selectionPositionSizeInput) {
    const applySelectionPositionSize = () => {
      const v = Math.max(1, Number(dom.selectionPositionSizeInput.value || 20));
      dom.selectionPositionSizeInput.value = String(v);
      actions.setPositionSize?.(v);
    };
    dom.selectionPositionSizeInput.addEventListener("change", applySelectionPositionSize);
    dom.selectionPositionSizeInput.addEventListener("input", applySelectionPositionSize);
  }
  if (dom.selectionImageWidthInput) {
    const applySelectionImageWidth = () => {
      const v = Math.max(1, Number(dom.selectionImageWidthInput.value || 1));
      dom.selectionImageWidthInput.value = String(v);
      actions.updateSelectedImageSettings?.({ width: v });
    };
    dom.selectionImageWidthInput.addEventListener("change", applySelectionImageWidth);
    dom.selectionImageWidthInput.addEventListener("input", applySelectionImageWidth);
  }
  if (dom.selectionImageHeightInput) {
    const applySelectionImageHeight = () => {
      const v = Math.max(1, Number(dom.selectionImageHeightInput.value || 1));
      dom.selectionImageHeightInput.value = String(v);
      actions.updateSelectedImageSettings?.({ height: v });
    };
    dom.selectionImageHeightInput.addEventListener("change", applySelectionImageHeight);
    dom.selectionImageHeightInput.addEventListener("input", applySelectionImageHeight);
  }
  if (dom.selectionImageLockAspectToggle) {
    dom.selectionImageLockAspectToggle.addEventListener("change", () => {
      actions.updateSelectedImageSettings?.({ lockAspect: !!dom.selectionImageLockAspectToggle.checked });
    });
  }
  if (dom.selectionImageLockTransformToggle) {
    dom.selectionImageLockTransformToggle.addEventListener("change", () => {
      actions.updateSelectedImageSettings?.({ lockTransform: !!dom.selectionImageLockTransformToggle.checked });
    });
  }
  if (dom.selectionCircleCenterMarkToggle) {
    dom.selectionCircleCenterMarkToggle.addEventListener("change", () => {
      actions.setSelectionCircleCenterMark?.(!!dom.selectionCircleCenterMarkToggle.checked);
    });
  }
  if (dom.selectionApplyCircleRadiusBtn) {
    dom.selectionApplyCircleRadiusBtn.addEventListener("click", () => {
      const r = Number(dom.selectionCircleRadiusInput?.value || 0);
      actions.applyCircleInput?.(r);
    });
  }
  const runSelectionCircleApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const r = Number(dom.selectionCircleRadiusInput?.value || 0);
    actions.applyCircleInput?.(r);
  };
  if (dom.selectionCircleRadiusInput) {
    dom.selectionCircleRadiusInput.addEventListener("keydown", runSelectionCircleApplyByEnter);
  }
  if (dom.filletNoTrimToggle) {
    dom.filletNoTrimToggle.addEventListener("change", () => {
      actions.setFilletNoTrim?.(!!dom.filletNoTrimToggle.checked);
    });
  }
  if (dom.trimNoDeleteToggle) {
    dom.trimNoDeleteToggle.addEventListener("change", () => {
      actions.setTrimNoDelete(!!dom.trimNoDeleteToggle.checked);
    });
  }
  if (dom.objSnapTangentKeepToggle) {
    dom.objSnapTangentKeepToggle.addEventListener("change", () => {
      if (!state.objectSnap) state.objectSnap = {};
      const on = !!dom.objSnapTangentKeepToggle.checked;
      state.objectSnap.keepAttributes = on;
      state.objectSnap.tangentKeep = on; // legacy alias
    });
  }
  if (dom.positionSizeInput) {
    dom.positionSizeInput.addEventListener("change", () => {
      const v = Math.max(1, Number(dom.positionSizeInput.value || 20));
      dom.positionSizeInput.value = String(v);
      actions.setPositionSize(v);
    });
  }

}
