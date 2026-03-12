export function bindLayerAndGroupBasicEvents(state, dom, actions) {
  if (dom.layerList) {
    dom.layerList.addEventListener("click", (e) => {
      const btn = e.target.closest?.("button[data-layer-mode-cycle]");
      if (!btn) return;
      actions.cycleLayerMode?.(Number(btn.dataset.layerModeCycle));
    });
    dom.layerList.addEventListener("dblclick", (e) => {
      const btn = e.target.closest?.("button[data-layer-name-btn]");
      if (!btn) return;
      e.preventDefault();
      actions.setActiveLayer(Number(btn.dataset.layerNameBtn));
    });
  }
  if (dom.createGroupBtn) {
    dom.createGroupBtn.addEventListener("click", () => actions.createGroupFromSelection(dom.newGroupNameInput?.value || ""));
  }
  if (dom.deleteGroupBtn) {
    dom.deleteGroupBtn.addEventListener("click", () => actions.deleteActiveGroup?.());
  }
  if (dom.unparentGroupBtn) {
    dom.unparentGroupBtn.addEventListener("click", () => actions.unparentActiveGroup?.());
  }
  if (dom.selectPickObjectBtn) {
    dom.selectPickObjectBtn.addEventListener("click", () => actions.setSelectPickMode?.("object"));
  }
  if (dom.selectPickGroupBtn) {
    dom.selectPickGroupBtn.addEventListener("click", () => actions.setSelectPickMode?.("group"));
  }
  if (dom.newGroupNameInput) {
    dom.newGroupNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.createGroupFromSelection(dom.newGroupNameInput.value || "");
      }
    });
  }
}

export function bindDimSettingsEvents(state, dom, actions) {
  if (dom.dimLinearMode) dom.dimLinearMode.addEventListener("change", () => actions.setDimSettings({ linearMode: dom.dimLinearMode.value }));
  if (dom.dimIgnoreGridSnapToggle) dom.dimIgnoreGridSnapToggle.addEventListener("change", () => actions.setDimSettings({ ignoreGridSnap: !!dom.dimIgnoreGridSnapToggle.checked }));
  if (dom.dimCircleMode) dom.dimCircleMode.addEventListener("change", () => actions.setDimSettings({ circleMode: dom.dimCircleMode.value }));
  if (dom.dimCircleArrowSide) {
    dom.dimCircleArrowSide.addEventListener("change", () => {
      const v = (dom.dimCircleArrowSide.value === "inside") ? "inside" : "outside";
      actions.setDimSettings({ circleArrowSide: v });
      actions.applyDimSettingsToSelection({ circleArrowSide: v });
    });
  }
  if (dom.dimPrecisionSelect) {
    dom.dimPrecisionSelect.addEventListener("change", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.dimPrecisionSelect.value) || 0)));
      actions.setDimSettings({ precision: p });
      actions.applyDimSettingsToSelection({ precision: p });
    });
  }
  if (dom.dimArrowTypeSelect) {
    dom.dimArrowTypeSelect.addEventListener("change", () => {
      const raw = String(dom.dimArrowTypeSelect.value || "open").toLowerCase();
      const v = (raw === "closed" || raw === "hollow" || raw === "circle" || raw === "circle_filled") ? raw : "open";
      actions.setDimSettings({ dimArrowType: v });
      actions.applyDimSettingsToSelection({ dimArrowType: v });
    });
  }
  if (dom.dimArrowSizeInput) {
    dom.dimArrowSizeInput.addEventListener("change", () => {
      const v = Math.max(1, Number(dom.dimArrowSizeInput.value) || 10);
      dom.dimArrowSizeInput.value = String(v);
      actions.setDimSettings({ dimArrowSize: v });
      actions.applyDimSettingsToSelection({ dimArrowSizePt: v });
    });
  }
  if (dom.dimArrowDirectionSelect) {
    dom.dimArrowDirectionSelect.addEventListener("change", () => {
      const v = (String(dom.dimArrowDirectionSelect.value) === "reverse") ? "reverse" : "normal";
      actions.setDimSettings({ dimArrowDirection: v });
      actions.applyDimSettingsToSelection({ dimArrowDirection: v });
    });
  }
  if (dom.dimFontSizeInput) {
    dom.dimFontSizeInput.addEventListener("change", () => {
      const v = Math.max(1, Number(dom.dimFontSizeInput.value) || 12);
      dom.dimFontSizeInput.value = String(v);
      actions.setDimSettings({ fontSize: v });
      actions.applyDimSettingsToSelection({ fontSize: v });
    });
  }
  if (dom.dimTextRotateInput) dom.dimTextRotateInput.addEventListener("change", () => {
    const val = dom.dimTextRotateInput.value;
    const tv = val === "auto" ? "auto" : (Number(val) || 0);
    actions.setDimSettings({ textRotate: tv });
    actions.applyDimSettingsToSelection({ textRotate: tv });
  });
  if (dom.dimExtOffsetInput) dom.dimExtOffsetInput.addEventListener("change", () => {
    const v = Number(dom.dimExtOffsetInput.value) || 0;
    actions.setDimSettings({ extOffset: v });
    actions.applyDimSettingsToSelection({ extOffset: v });
  });
  if (dom.dimExtOverInput) dom.dimExtOverInput.addEventListener("change", () => {
    const v = Number(dom.dimExtOverInput.value) || 0;
    actions.setDimSettings({ extOver: v });
    actions.applyDimSettingsToSelection({ extOver: v });
  });
  if (dom.dimROvershootInput) dom.dimROvershootInput.addEventListener("change", () => {
    const n = Number(dom.dimROvershootInput.value);
    const v = Number.isFinite(n) ? Math.max(0, n) : 5;
    dom.dimROvershootInput.value = String(v);
    actions.setDimSettings({ rOvershoot: v });
    actions.applyDimSettingsToSelection({ rOverrun: v });
  });
  if (dom.dimChainPopBtn) dom.dimChainPopBtn.addEventListener("click", () => actions.popDimChainPoint());
  if (dom.dimChainPrepareBtn) {
    dom.dimChainPrepareBtn.addEventListener("click", () => {
      if (state.tool !== "dim" || String(state.dimSettings?.linearMode || "single") !== "chain") return;
      if (!state.dimDraft || state.dimDraft.type !== "dimchain") return;
      if ((state.dimDraft.points || []).length < 2) return;
      state.dimDraft.awaitingPlacement = true;
      actions.setStatus?.("Chain dim: click to place dimension line.");
      actions.render?.();
    });
  }
  if (dom.dimChainFinalizeBtn) {
    dom.dimChainFinalizeBtn.addEventListener("click", () => {
      if (state.tool !== "dim" || String(state.dimSettings?.linearMode || "single") !== "chain") return;
      if (!state.dimDraft || state.dimDraft.type !== "dimchain") return;
      if (!(state.dimDraft.awaitingPlacement && state.dimDraft.place)) return;
      actions.finalizeDimDraft?.();
      actions.setStatus?.("Dim finished");
      actions.render?.();
    });
  }
  if (dom.applyDimSettingsBtn) {
    dom.applyDimSettingsBtn.addEventListener("click", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.dimPrecisionSelect?.value) || 0)));
      const tv = dom.dimTextRotateInput?.value;
      actions.applyDimSettingsToSelection({
        precision: p,
        circleArrowSide: (dom.dimCircleArrowSide?.value === "inside") ? "inside" : "outside",
        fontSize: Math.max(1, Number(dom.dimFontSizeInput?.value) || 12),
        textRotate: tv === "auto" ? "auto" : (Number(tv) || 0),
        extOffset: Number(dom.dimExtOffsetInput?.value) || 0,
        extOver: Number(dom.dimExtOverInput?.value) || 0,
      });
    });
  }
}

export function bindPageAndPatternEvents(state, dom, actions, helpers) {
  const { refreshUi, refreshUiDeferred, normalizeLineWidthPreset, normalizeLineTypePreset, bindColorInputPalette } = helpers;
  if (dom.pageUnitSelect) {
    dom.pageUnitSelect.addEventListener("change", () => actions.setPageSetup({ unit: dom.pageUnitSelect.value }));
  }
  if (dom.toolShortcutList) {
    dom.toolShortcutList.addEventListener("change", (e) => {
      const sel = e.target?.closest?.("select[data-tool-shortcut]");
      if (!sel) return;
      const tool = String(sel.dataset.toolShortcut || "");
      const key = String(sel.value || "").toUpperCase();
      actions.setToolShortcut?.(tool, key);
    });
  }
  if (dom.resetToolShortcutsBtn) {
    dom.resetToolShortcutsBtn.addEventListener("click", () => {
      actions.resetToolShortcuts?.();
      refreshUi(state, dom);
    });
  }
  const toolStrokeControls = [
    { tool: "line", width: dom.lineToolLineWidthInput, type: dom.lineToolLineTypeInput, color: dom.lineToolColorInput },
    { tool: "rect", width: dom.rectToolLineWidthInput, type: dom.rectToolLineTypeInput, color: dom.rectToolColorInput },
    { tool: "circle", width: dom.circleToolLineWidthInput, type: dom.circleToolLineTypeInput, color: dom.circleToolColorInput },
    { tool: "fillet", width: dom.filletToolLineWidthInput, type: dom.filletToolLineTypeInput, color: null },
    { tool: "position", width: dom.positionToolLineWidthInput, type: dom.positionToolLineTypeInput, color: dom.positionToolColorInput },
    { tool: "text", width: dom.textToolLineWidthInput, type: dom.textToolLineTypeInput, color: null },
    { tool: "dim", width: dom.dimToolLineWidthInput, type: dom.dimToolLineTypeInput, color: dom.dimToolColorInput },
    { tool: "hatch", width: dom.hatchToolLineWidthInput, type: null, color: null },
    { tool: "doubleline", width: dom.dlineToolLineWidthInput, type: dom.dlineToolLineTypeInput, color: null },
  ];
  for (const ctl of toolStrokeControls) {
    if (ctl.width) {
      const applyLineWidth = () => {
        const v = normalizeLineWidthPreset(ctl.width.value);
        ctl.width.value = String(v);
        actions.setLineWidthMm?.(v, ctl.tool);
        if (ctl.tool === "dim") {
          actions.applyDimSettingsToSelection?.({ lineWidthMm: v });
        }
      };
      ctl.width.addEventListener("change", applyLineWidth);
      ctl.width.addEventListener("input", applyLineWidth);
    }
    if (ctl.type) {
      const applyLineType = () => {
        const v = normalizeLineTypePreset(ctl.type.value);
        ctl.type.value = v;
        actions.setToolLineType?.(v, ctl.tool);
        if (ctl.tool === "dim") {
          actions.applyDimSettingsToSelection?.({ lineType: v });
        }
      };
      ctl.type.addEventListener("change", applyLineType);
      ctl.type.addEventListener("input", applyLineType);
    }
    if (ctl.color) {
      bindColorInputPalette(ctl.color, (c) => {
        actions.setToolColor?.(c, ctl.tool);
        if (ctl.tool === "dim") {
          actions.applyDimSettingsToSelection?.({ color: c });
        }
      });
    }
  }
  if (dom.pageShowFrameToggle) {
    dom.pageShowFrameToggle.addEventListener("change", () => actions.setPageSetup({ showFrame: !!dom.pageShowFrameToggle.checked }));
  }
  if (dom.pageInnerMarginInput) {
    dom.pageInnerMarginInput.addEventListener("change", () => {
      const v = Math.max(0, Number(dom.pageInnerMarginInput.value || 0));
      dom.pageInnerMarginInput.value = String(v);
      actions.setPageSetup({ innerMarginMm: v });
    });
  }
  if (dom.hatchPitchInput) {
    dom.hatchPitchInput.addEventListener("change", () => actions.setHatchSettings({ pitchMm: Number(dom.hatchPitchInput.value) || 5 }));
  }
  if (dom.hatchAngleInput) {
    dom.hatchAngleInput.addEventListener("change", () => actions.setHatchSettings({ angleDeg: Number(dom.hatchAngleInput.value) || 0 }));
  }
  if (dom.hatchPaddingInput) {
    dom.hatchPaddingInput.addEventListener("change", () => actions.setHatchSettings({ repetitionPaddingMm: Number(dom.hatchPaddingInput.value) || 0 }));
  }
  if (dom.hatchAltShiftInput) {
    dom.hatchAltShiftInput.addEventListener("change", () => actions.setHatchSettings({ lineShiftMm: Number(dom.hatchAltShiftInput.value) || 0 }));
  }
  if (dom.hatchFillToggle) {
    dom.hatchFillToggle.addEventListener("change", () => actions.setHatchSettings({ fillEnabled: !!dom.hatchFillToggle.checked }));
  }
  bindColorInputPalette(dom.hatchFillColorInput, (c) => {
    actions.setHatchSettings({ fillColor: c });
  });
  bindColorInputPalette(dom.hatchLineColorInput, (c) => {
    actions.setHatchSettings({ lineColor: c });
  });
  if (dom.hatchToolLineWidthInput) {
    const applyHatchLineWidth = () => {
      const v = normalizeLineWidthPreset(dom.hatchToolLineWidthInput.value);
      dom.hatchToolLineWidthInput.value = String(v);
      actions.setHatchSettings({ lineWidthMm: v });
    };
    dom.hatchToolLineWidthInput.addEventListener("change", applyHatchLineWidth);
    dom.hatchToolLineWidthInput.addEventListener("input", applyHatchLineWidth);
  }
  if (dom.hatchDashMmInput) {
    dom.hatchDashMmInput.addEventListener("change", () => actions.setHatchSettings({ lineDashMm: Number(dom.hatchDashMmInput.value) || 5 }));
  }
  if (dom.hatchGapMmInput) {
    dom.hatchGapMmInput.addEventListener("change", () => actions.setHatchSettings({ lineGapMm: Number(dom.hatchGapMmInput.value) || 2 }));
  }
  if (dom.applyHatchBtn) {
    dom.applyHatchBtn.addEventListener("click", () => actions.executeHatch());
  }
  if (dom.hatchValidateBtn) {
    dom.hatchValidateBtn.addEventListener("click", () => actions.validateHatchBoundary?.());
  }
  if (dom.dlineOffsetInput) {
    dom.dlineOffsetInput.addEventListener("input", () => {
      if (actions.cancelDoubleLineTrimPending) actions.cancelDoubleLineTrimPending();
      state.dlineSettings.offset = Number(dom.dlineOffsetInput.value) || 5;
      refreshUiDeferred();
    });
  }
  if (dom.dlineModeSelect) {
    dom.dlineModeSelect.addEventListener("change", () => {
      if (actions.cancelDoubleLineTrimPending) actions.cancelDoubleLineTrimPending();
      state.dlineSettings.mode = dom.dlineModeSelect.value;
      refreshUiDeferred();
    });
  }
  if (dom.dlineAsPolylineToggle) {
    dom.dlineAsPolylineToggle.addEventListener("change", () => {
      state.dlineSettings.asPolyline = !!dom.dlineAsPolylineToggle.checked;
      refreshUiDeferred();
    });
  }
  if (dom.applyDLineBtn) {
    dom.applyDLineBtn.addEventListener("click", () => actions.executeDoubleLine());
  }
  if (dom.patternCopyModeSelect) {
    dom.patternCopyModeSelect.addEventListener("change", () => actions.setPatternCopyMode(dom.patternCopyModeSelect.value));
  }
  if (dom.patternCopyArrayDxInput) {
    dom.patternCopyArrayDxInput.addEventListener("change", () => {
      state.patternCopySettings.arrayDx = Number(dom.patternCopyArrayDxInput.value) || 0;
    });
  }
  if (dom.patternCopyArrayDyInput) {
    dom.patternCopyArrayDyInput.addEventListener("change", () => {
      state.patternCopySettings.arrayDy = Number(dom.patternCopyArrayDyInput.value) || 0;
    });
  }
  if (dom.patternCopyArrayCountXInput) {
    dom.patternCopyArrayCountXInput.addEventListener("change", () => {
      state.patternCopySettings.arrayCountX = Math.max(1, Math.round(Number(dom.patternCopyArrayCountXInput.value) || 1));
    });
  }
  if (dom.patternCopyArrayCountYInput) {
    dom.patternCopyArrayCountYInput.addEventListener("change", () => {
      state.patternCopySettings.arrayCountY = Math.max(1, Math.round(Number(dom.patternCopyArrayCountYInput.value) || 1));
    });
  }
  if (dom.patternCopyRotateAngleInput) {
    dom.patternCopyRotateAngleInput.addEventListener("change", () => {
      state.patternCopySettings.rotateAngleDeg = Number(dom.patternCopyRotateAngleInput.value) || 0;
    });
  }
  if (dom.patternCopyRotateCountInput) {
    dom.patternCopyRotateCountInput.addEventListener("change", () => {
      state.patternCopySettings.rotateCount = Math.max(1, Math.round(Number(dom.patternCopyRotateCountInput.value) || 1));
    });
  }
  if (dom.patternCopySetCenterBtn) {
    dom.patternCopySetCenterBtn.addEventListener("click", () => {
      if (state.input.patternCopyFlow.centerPositionId) {
        actions.clearPatternCopyCenter();
      } else {
        actions.setPatternCopyCenterFromSelection();
      }
    });
  }
  if (dom.patternCopySetAxisBtn) {
    dom.patternCopySetAxisBtn.addEventListener("click", () => {
      if (state.input.patternCopyFlow.axisLineId) {
        actions.clearPatternCopyAxis();
      } else {
        actions.setPatternCopyAxisFromSelection();
      }
    });
  }
  if (dom.patternCopyApplyBtn) {
    dom.patternCopyApplyBtn.addEventListener("click", () => actions.executePatternCopy());
  }
  if (dom.attrAddBtn) {
    dom.attrAddBtn.addEventListener("click", () => {
      const name = String(dom.attrNameInput?.value || "").trim();
      if (!name) return;
      const value = String(dom.attrValueInput?.value || "");
      actions.addSelectedAttribute?.(name, value, "object");
      if (dom.attrNameInput) dom.attrNameInput.value = "";
      if (dom.attrValueInput) dom.attrValueInput.value = "";
    });
  }
  if (dom.attrList) {
    dom.attrList.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-attr-remove]");
      if (!btn) return;
      const attrId = btn.getAttribute("data-attr-remove");
      if (!attrId) return;
      actions.removeSelectedAttribute?.(attrId);
    });
    dom.attrList.addEventListener("change", (e) => {
      const inp = e.target.closest?.("input[data-attr-id][data-attr-field]");
      if (!inp) return;
      const attrId = inp.getAttribute("data-attr-id");
      const field = inp.getAttribute("data-attr-field");
      if (!attrId || !field) return;
      if (field === "name") actions.updateSelectedAttribute?.(attrId, { name: inp.value });
      if (field === "value") actions.updateSelectedAttribute?.(attrId, { value: inp.value });
    });
  }
}
