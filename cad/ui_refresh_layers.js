let _layerListRenderSignature = "";
let _activeLayerSelectSignature = "";

export function refreshLayerPanels(state, dom, panelText, getUiLanguage, getMaxGroupPanelHeight) {
  if (dom.activeLayerSelect) {
    const layerSelectSig = [
      String(getUiLanguage(state)),
      String(state.activeLayerId ?? ""),
      (state.layers || []).map(layer =>
        `${Number(layer.id)}:${String(layer.name || "")}:${layer.visible === false ? 0 : 1}`
      ).join("|"),
    ].join("::");
    if (_activeLayerSelectSignature !== layerSelectSig) {
      _activeLayerSelectSignature = layerSelectSig;
      const prev = dom.activeLayerSelect.value;
      dom.activeLayerSelect.innerHTML = "";
      for (const layer of (state.layers || [])) {
        const opt = document.createElement("option");
        opt.value = String(layer.id);
        opt.textContent = `${layer.name}${layer.visible === false ? panelText.hiddenSuffix : ""}`;
        dom.activeLayerSelect.appendChild(opt);
      }
      dom.activeLayerSelect.value = String(state.activeLayerId ?? prev ?? "");
    } else {
      dom.activeLayerSelect.value = String(state.activeLayerId ?? dom.activeLayerSelect.value ?? "");
    }
  }
  if (dom.renameLayerNameInput) {
    const activeLayer = (state.layers || []).find(l => Number(l.id) === Number(state.activeLayerId));
    if (activeLayer && document.activeElement !== dom.renameLayerNameInput) {
      dom.renameLayerNameInput.value = String(activeLayer.name ?? "");
    }
  }
  if (dom.layerList) {
    const layerListSig = [
      String(getUiLanguage(state)),
      String(state.activeLayerId ?? ""),
      (state.layers || []).map(layer =>
        `${Number(layer.id)}:${String(layer.name || "")}:${layer.visible === false ? 0 : 1}:${layer.locked === true ? 1 : 0}`
      ).join("|"),
    ].join("::");
    if (_layerListRenderSignature !== layerListSig) {
      _layerListRenderSignature = layerListSig;
      dom.layerList.innerHTML = "";
      for (const layer of (state.layers || [])) {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1fr auto";
        row.style.gap = "4px";
        row.style.alignItems = "center";
        const isActive = (Number(layer.id) === Number(state.activeLayerId));
        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.dataset.layerNameBtn = String(layer.id);
        nameBtn.textContent = layer.name;
        nameBtn.title = panelText.setAsCurrentLayerTitle;
        nameBtn.style.textAlign = "left";
        nameBtn.style.width = "100%";
        nameBtn.style.fontSize = "11px";
        nameBtn.style.padding = "3px 6px";
        nameBtn.style.background = isActive ? "rgba(219,234,254,0.9)" : "rgba(255,255,255,0.75)";
        nameBtn.style.border = isActive ? "1px solid rgba(37,99,235,0.45)" : "1px solid rgba(148,163,184,0.25)";
        nameBtn.style.color = isActive ? "var(--ink)" : "var(--muted)";
        nameBtn.style.fontWeight = isActive ? "700" : "500";
        const modeBtn = document.createElement("button");
        modeBtn.type = "button";
        modeBtn.dataset.layerModeCycle = String(layer.id);
        modeBtn.style.fontSize = "10px";
        modeBtn.style.padding = "2px 6px";
        const visible = layer.visible !== false;
        const locked = layer.locked === true;
        modeBtn.textContent = visible ? (locked ? "LOCK" : "ON") : "OFF";
        modeBtn.title = panelText.toggleLayerModeTitle;
        if (!visible) {
          modeBtn.style.background = "rgba(148,163,184,0.16)";
          modeBtn.style.color = "var(--muted)";
        } else if (locked) {
          modeBtn.style.background = "rgba(251,191,36,0.14)";
          modeBtn.style.color = "#92400e";
          modeBtn.style.borderColor = "rgba(251,191,36,0.35)";
        } else {
          modeBtn.style.background = "rgba(34,197,94,0.10)";
          modeBtn.style.color = "#166534";
          modeBtn.style.borderColor = "rgba(34,197,94,0.30)";
        }
        row.append(nameBtn, modeBtn);
        dom.layerList.appendChild(row);
      }
    }
  }
  if (dom.renameLayerBtn) dom.renameLayerBtn.disabled = (state.activeLayerId == null);
  if (dom.moveSelectionLayerBtn) {
    const selectedShapeIds = new Set((state.selection?.ids || []).map(Number));
    const hasSelectedObjects = selectedShapeIds.size > 0 && (state.shapes || []).some(s => selectedShapeIds.has(Number(s.id)));
    dom.moveSelectionLayerBtn.disabled = !hasSelectedObjects;
    dom.moveSelectionLayerBtn.textContent = panelText.moveObjectsToLayer;
  }
  if (dom.deleteLayerBtn) {
    const layers = state.layers || [];
    dom.deleteLayerBtn.disabled = (state.activeLayerId == null) || (layers.length <= 1);
  }
  if (dom.moveLayerUpBtn || dom.moveLayerDownBtn) {
    const layers = state.layers || [];
    const idx = layers.findIndex(l => Number(l.id) === Number(state.activeLayerId));
    const canUp = idx > 0;
    const canDown = idx >= 0 && idx < (layers.length - 1);
    if (dom.moveLayerUpBtn) dom.moveLayerUpBtn.disabled = !canUp;
    if (dom.moveLayerDownBtn) dom.moveLayerDownBtn.disabled = !canDown;
  }
  if (dom.layerColorizeToggle) {
    dom.layerColorizeToggle.checked = !!state.ui?.layerView?.colorize;
  }
  if (dom.groupColorizeToggle) {
    dom.groupColorizeToggle.checked = !!state.ui?.groupView?.colorize;
  }
  if (dom.groupCurrentLayerOnlyToggle) {
    dom.groupCurrentLayerOnlyToggle.checked = !!state.ui?.groupView?.currentLayerOnly;
  }
  if (dom.editOnlyActiveLayerToggle) {
    dom.editOnlyActiveLayerToggle.checked = !!state.ui?.layerView?.editOnlyActive;
  }
  for (const panel of document.querySelectorAll("[data-layer-inner-panel]")) {
    const key = panel.getAttribute("data-layer-inner-panel");
    if (!key) continue;
    const collapsed = !!state.ui?.layerPanelInnerCollapsed?.[key];
    panel.style.display = collapsed ? "none" : "flex";
  }
  for (const btn of document.querySelectorAll("[data-layer-inner-toggle]")) {
    const key = btn.getAttribute("data-layer-inner-toggle");
    if (!key) continue;
    const collapsed = !!state.ui?.layerPanelInnerCollapsed?.[key];
    btn.classList.toggle("is-collapsed", collapsed);
    if (!btn.dataset.innerLabel) {
      btn.dataset.innerLabel = String(btn.textContent || "").replace(/^[▾▸]\s*/, "");
    }
    btn.innerHTML = `<span class="inner-arrow">${collapsed ? "▸" : "▾"}</span><span class="inner-label">${btn.dataset.innerLabel}</span>`;
  }
  for (const sec of document.querySelectorAll(".right-stack .section[data-panel-id], .left-aux-stack .section[data-panel-id], .sidebar .section[data-panel-id]")) {
    const panelId = sec.getAttribute("data-panel-id");
    const collapsed = !!state.ui?.rightPanelCollapsed?.[panelId];
    sec.classList.toggle("collapsed", collapsed);
  }
  const groupsSectionEl = document.querySelector(".right-stack .section[data-panel-id='groups']");
  if (groupsSectionEl) {
    const h = Number(state.ui?.panelLayout?.groupPanelHeight);
    const collapsed = !!state.ui?.rightPanelCollapsed?.groups;
    const isGroupPanelEmpty = ((state.groups || []).length === 0) && ((state.shapes || []).length === 0);
    if (collapsed) {
      groupsSectionEl.style.removeProperty("height");
      groupsSectionEl.style.removeProperty("max-height");
    } else if (isGroupPanelEmpty) {
      groupsSectionEl.style.removeProperty("height");
      groupsSectionEl.style.removeProperty("max-height");
    } else if (Number.isFinite(h) && h > 0) {
      const maxGroupH = getMaxGroupPanelHeight(groupsSectionEl);
      const cappedH = Math.max(120, Math.min(maxGroupH, Math.round(h)));
      groupsSectionEl.style.height = `${cappedH}px`;
      groupsSectionEl.style.maxHeight = `${cappedH}px`;
    } else {
      groupsSectionEl.style.removeProperty("height");
      groupsSectionEl.style.removeProperty("max-height");
    }
  }
  const layersSectionEl = document.querySelector(".right-stack .section[data-panel-id='layers']");
  if (layersSectionEl) {
    const collapsed = !!state.ui?.rightPanelCollapsed?.layers;
    if (collapsed) {
      layersSectionEl.style.removeProperty("height");
      layersSectionEl.style.removeProperty("max-height");
    } else {
      const layerListEl = dom.layerList;
      layersSectionEl.style.minHeight = "0";
      layersSectionEl.style.display = "flex";
      layersSectionEl.style.flexDirection = "column";
      if (layerListEl) {
        const currentListH = Math.max(0, layerListEl.clientHeight || 0);
        let chromeH = 0;
        for (const child of Array.from(layersSectionEl.children || [])) {
          if (!(child instanceof HTMLElement)) continue;
          if (child === layerListEl) continue;
          // Absolute resize handles should not contribute to layout height.
          if (child.classList.contains("panel-resize-handle")) continue;
          const style = window.getComputedStyle(child);
          if (style.display === "none") continue;
          chromeH += child.offsetHeight;
          const mt = parseFloat(style.marginTop || "0");
          const mb = parseFloat(style.marginBottom || "0");
          if (Number.isFinite(mt)) chromeH += mt;
          if (Number.isFinite(mb)) chromeH += mb;
        }
        chromeH = Math.max(0, Math.round(chromeH));
        const listNaturalH = Math.max(0, layerListEl.scrollHeight || 0);
        // Small slack avoids clipping the last row due to rounding/borders.
        const maxListH = Math.max(40, listNaturalH + 16);
        if (!state.ui.panelLayout) state.ui.panelLayout = {};
        let desiredListH = Number(state.ui.panelLayout.layerPanelListHeight);
        if (!Number.isFinite(desiredListH) || desiredListH <= 0) {
          const fallbackOld = Number(state.ui.panelLayout.layerPanelHeight);
          desiredListH = (Number.isFinite(fallbackOld) && fallbackOld > chromeH)
            ? (fallbackOld - chromeH)
            : Math.min(maxListH, Math.max(80, currentListH || listNaturalH || 120));
        }
        desiredListH = Math.max(40, Math.min(maxListH, Math.round(desiredListH)));
        state.ui.panelLayout.layerPanelListHeight = desiredListH;
        const targetH = chromeH + desiredListH + 8;
        layersSectionEl.style.height = `min(calc(var(--app-vh) - 20px), ${targetH}px)`;
        layersSectionEl.style.maxHeight = `min(calc(var(--app-vh) - 20px), ${targetH}px)`;
      } else {
        layersSectionEl.style.removeProperty("height");
        layersSectionEl.style.removeProperty("max-height");
      }
    }
  }

}
