export function createToolRegistry() {
  return [
    { id: "select", label: "Select" },
    { id: "vertex", label: "Vertex" },
    { id: "line", label: "Line" },
    { id: "polyline", label: "Polyline" },
    { id: "rect", label: "Rect" },
    { id: "circle", label: "Circle" },
    { id: "position", label: "Position" },
    { id: "text", label: "Text" },
    { id: "dim", label: "Dim" },
    { id: "trim", label: "Trim" },
    { id: "fillet", label: "Fillet" },
    { id: "hatch", label: "Hatch" },
    { id: "doubleline", label: "Double Line" },
  ];
}

function createHtmlLikeLeftMenuRegistry() {
  return [
    { type: "tool", id: "select", label: "選択", group: "select" },
    { type: "sep" },
    { type: "tool", id: "line", label: "線", group: "create" },
    { type: "tool", id: "rect", label: "四角", group: "create" },
    { type: "tool", id: "circle", label: "円", group: "create" },
    { type: "tool", id: "position", label: "位置", group: "create" },
    { type: "tool", id: "dim", label: "寸法線", group: "create" },
    { type: "tool", id: "text", label: "テキスト", group: "create" },
    { type: "tool", id: "hatch", label: "ハッチ", implemented: true, group: "create" },
    { type: "sep" },
    { type: "tool", id: "vertex", label: "頂点編集", group: "edit" },
    { type: "tool", id: "fillet", label: "フィレット", group: "edit" },
    { type: "tool", id: "trim", label: "トリム", group: "edit" },
    { type: "tool", id: "doubleline", label: "二重線", implemented: true, group: "edit" },
    { type: "tool", id: "patterncopy", label: "パターンコピー", implemented: true, group: "edit" },
    { type: "action", id: "undo", label: "Undo", implemented: true, group: "edit" },
    { type: "action", id: "redo", label: "Redo", implemented: true, group: "edit" },
    { type: "action", id: "delete", label: "削除", implemented: true, group: "edit" },
    { type: "sep" },
    { type: "action", id: "resetView", label: "表示リセット", implemented: true, group: "view" },
    { type: "action", id: "grid", label: "グリッド", implemented: true, group: "view" },
    { type: "action", id: "layer", label: "レイヤー", implemented: false, group: "view" },
    { type: "sep" },
    { type: "action", id: "loadJson", label: "読込", implemented: true, group: "file" },
    { type: "action", id: "saveJson", label: "保存", implemented: true, group: "file" },
    { type: "action", id: "saveAs", label: "別名で保存", implemented: false, group: "file" },
    { type: "action", id: "pdf", label: "PDF出力", implemented: false, group: "file" },
    { type: "action", id: "settings", label: "設定", implemented: false, group: "file" },
  ];
}

export function initUi(state, dom, actions) {
  let currentGroupDropHoverRow = null;
  let groupRowClickTimer = null;
  let suppressGroupListClickUntil = 0;
  let lastGroupDnDKind = null; // "group" | "shape" | null
  const clearGroupDropHoverRow = () => {
    if (!currentGroupDropHoverRow) return;
    currentGroupDropHoverRow.classList.remove("dnd-over");
    currentGroupDropHoverRow = null;
  };
  const setGroupDropHoverRow = (row) => {
    if (currentGroupDropHoverRow === row) return;
    clearGroupDropHoverRow();
    if (!row) return;
    row.classList.add("dnd-over");
    currentGroupDropHoverRow = row;
  };
  const toElementTarget = (node) => {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  };
  const parseDragPayload = (e) => {
    const rawG = state.ui?.groupDragDrop?.draggingGroupId;
    const rawS = state.ui?.groupDragDrop?.draggingShapeId;
    let groupId = (rawG != null && Number.isFinite(Number(rawG))) ? Number(rawG) : null;
    let shapeId = (rawS != null && Number.isFinite(Number(rawS))) ? Number(rawS) : null;
    try {
      const raw = e?.dataTransfer?.getData?.("text/plain");
      if (typeof raw === "string" && raw.length) {
        if (raw.startsWith("shape:")) {
          const sid = Number(raw.slice(6));
          if (Number.isFinite(sid)) shapeId = sid;
        } else {
          const gid = Number(raw);
          if (Number.isFinite(gid)) groupId = gid;
        }
      }
    } catch (_) { }
    return { groupId, shapeId };
  };
  const resolveGroupDropTarget = (fromEl) => {
    const el = toElementTarget(fromEl);
    const groupRow = el?.closest?.("[data-group-row]");
    if (groupRow) {
      const gid = Number(groupRow.dataset.groupRow);
      return Number.isFinite(gid) ? { gid, row: groupRow } : null;
    }
    const objRow = el?.closest?.("[data-group-shape-row]");
    if (objRow) {
      const ownerGid = Number(objRow.dataset.ownerGroupId);
      if (!Number.isFinite(ownerGid)) return null;
      const ownerRow = dom.groupList?.querySelector?.(`[data-group-row="${ownerGid}"]`) || null;
      return { gid: ownerGid, row: ownerRow };
    }
    return null;
  };
  const refreshUiDeferred = () => {
    setTimeout(() => { refreshUi(state, dom); }, 0);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => refreshUi(state, dom)));
    }
  };
  let groupPanelResizeDrag = null;
  const onGroupPanelResizeMove = (e) => {
    if (!groupPanelResizeDrag) return;
    if (!state.ui.panelLayout) state.ui.panelLayout = {};
    const dx = e.clientX - groupPanelResizeDrag.startX;
    const dy = e.clientY - groupPanelResizeDrag.startY;
    if (groupPanelResizeDrag.mode === "width" || groupPanelResizeDrag.mode === "both") {
      state.ui.panelLayout.rightPanelWidth = Math.max(180, Math.min(900, Math.round(groupPanelResizeDrag.startWidth - dx)));
    }
    if (groupPanelResizeDrag.mode === "height" || groupPanelResizeDrag.mode === "both") {
      state.ui.panelLayout.groupPanelHeight = Math.max(180, Math.min(2000, Math.round(groupPanelResizeDrag.startHeight - dy)));
    }
    if (groupPanelResizeDrag.mode === "layerHeight") {
      const nextListH = Math.max(40, Math.min(2000, Math.round((groupPanelResizeDrag.startListHeight ?? 120) - dy)));
      state.ui.panelLayout.layerPanelListHeight = nextListH;
    }
    refreshUi(state, dom);
  };
  const stopGroupPanelResizeDrag = () => {
    if (!groupPanelResizeDrag) return;
    groupPanelResizeDrag = null;
    window.removeEventListener("mousemove", onGroupPanelResizeMove);
    window.removeEventListener("mouseup", stopGroupPanelResizeDrag);
  };

  dom.toolButtons.innerHTML = "";
  for (const item of createHtmlLikeLeftMenuRegistry()) {
    if (item.type === "sep") {
      const sep = document.createElement("div");
      sep.className = "left-sep";
      dom.toolButtons.appendChild(sep);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    if (item.group) btn.dataset.menuGroup = item.group;
    if (item.type === "tool") {
      btn.dataset.tool = item.id;
      btn.addEventListener("click", () => actions.setTool(item.id));
    } else {
      btn.dataset.action = item.id;
      const fn = actions[item.id];
      if (typeof fn === "function") {
        btn.addEventListener("click", () => fn());
      } else {
        btn.disabled = true;
        if (item.implemented === false) btn.title = "未実装";
      }
    }
    dom.toolButtons.appendChild(btn);
  }

  const panelStacks = document.querySelectorAll(".right-stack, .left-aux-stack");
  panelStacks.forEach((stack) => {
    stack.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".panel-toggle.section-title");
      if (!btn) return;
      const sec = btn.closest?.(".section[data-panel-id]");
      const panelId = sec?.getAttribute?.("data-panel-id");
      if (!panelId) return;
      e.preventDefault();
      if (!state.ui.rightPanelCollapsed) state.ui.rightPanelCollapsed = {};
      state.ui.rightPanelCollapsed[panelId] = !state.ui.rightPanelCollapsed[panelId];
      refreshUi(state, dom);
    });
    stack.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-layer-inner-toggle]");
      if (!btn) return;
      e.preventDefault();
      const key = btn.getAttribute("data-layer-inner-toggle");
      if (!key) return;
      if (!state.ui.layerPanelInnerCollapsed) state.ui.layerPanelInnerCollapsed = {};
      state.ui.layerPanelInnerCollapsed[key] = !state.ui.layerPanelInnerCollapsed[key];
      refreshUi(state, dom);
    });
  });

  const rightStack = document.querySelector(".right-stack");
  if (rightStack) {
    const groupsSection = rightStack.querySelector(".section[data-panel-id='groups']");
    const groupsHeader = groupsSection?.querySelector?.(".panel-toggle.section-title");
    const bindPanelResizeHandle = (el, mode, sectionEl = groupsSection) => {
      if (!el) return;
      el.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const secRect = sectionEl.getBoundingClientRect();
        const stackRect = rightStack.getBoundingClientRect();
        groupPanelResizeDrag = {
          mode,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: Math.round(stackRect.width),
          startHeight: Math.round(secRect.height),
          startListHeight: (mode === "layerHeight")
            ? Math.round(sectionEl?.querySelector?.("#layerList")?.clientHeight || 0)
            : 0,
        };
        window.addEventListener("mousemove", onGroupPanelResizeMove);
        window.addEventListener("mouseup", stopGroupPanelResizeDrag);
      });
    };
    bindPanelResizeHandle(groupsSection?.querySelector?.("#groupPanelResizeHandleTop"), "height", groupsSection);
    bindPanelResizeHandle(groupsSection?.querySelector?.("#groupPanelResizeHandleLeft"), "width", groupsSection);
    const layersSection = rightStack.querySelector(".section[data-panel-id='layers']");
    bindPanelResizeHandle(layersSection?.querySelector?.("#layerPanelResizeHandleTop"), "layerHeight", layersSection);
    bindPanelResizeHandle(layersSection?.querySelector?.("#layerPanelResizeHandleLeft"), "width", layersSection);
    if (groupsHeader) {
      groupsHeader.addEventListener("dragover", (e) => {
        const payload = parseDragPayload(e);
        if (!Number.isFinite(payload.groupId) && !Number.isFinite(payload.shapeId)) return;
        e.preventDefault();
        clearGroupDropHoverRow();
        groupsSection.classList.add("dnd-over-root");
        if (state.ui.groupDragDrop) state.ui.groupDragDrop.overGroupId = null;
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });
      groupsHeader.addEventListener("dragleave", (e) => {
        const related = e.relatedTarget;
        if (related && groupsSection.contains?.(related)) return;
        groupsSection.classList.remove("dnd-over-root");
      });
      groupsHeader.addEventListener("drop", (e) => {
        const payload = parseDragPayload(e);
        const draggedGroupId = payload.groupId;
        const draggedShapeId = payload.shapeId;
        if (!Number.isFinite(draggedGroupId) && !Number.isFinite(draggedShapeId)) return;
        e.preventDefault();
        groupsSection.classList.remove("dnd-over-root");
        clearGroupDropHoverRow();
        if (Number.isFinite(draggedShapeId)) {
          // Root drop for shape is currently unsupported; just clear DnD state.
        } else if (Number.isFinite(draggedGroupId)) {
          actions.selectGroup?.(draggedGroupId);
          actions.unparentActiveGroup?.();
        }
        if (state.ui.groupDragDrop) {
          state.ui.groupDragDrop.draggingGroupId = null;
          state.ui.groupDragDrop.draggingShapeId = null;
          state.ui.groupDragDrop.overGroupId = null;
        }
        // Group/shape actions already call draw()+refreshUi(); avoid duplicate expensive refreshes.
      });
    }
  }

  dom.gridSizeInput.value = String(state.grid.size);
  dom.gridSizeInput.addEventListener("change", () => {
    const v = Math.max(1, Math.round(Number(dom.gridSizeInput.value) || 100));
    dom.gridSizeInput.value = String(v);
    if (dom.gridSizeContextInput) dom.gridSizeContextInput.value = String(v);
    actions.setGridSize(v);
  });
  if (dom.gridSizeContextInput) {
    dom.gridSizeContextInput.value = String(state.grid.size);
    dom.gridSizeContextInput.addEventListener("change", () => {
      const v = Math.max(1, Math.round(Number(dom.gridSizeContextInput.value) || 100));
      dom.gridSizeContextInput.value = String(v);
      dom.gridSizeInput.value = String(v);
      actions.setGridSize(v);
    });
  }

  dom.gridSnapToggle.checked = !!state.grid.snap;
  dom.gridSnapToggle.addEventListener("change", () => {
    if (dom.gridSnapContextToggle) dom.gridSnapContextToggle.checked = !!dom.gridSnapToggle.checked;
    actions.setGridSnap(!!dom.gridSnapToggle.checked);
  });
  if (dom.gridSnapContextToggle) {
    dom.gridSnapContextToggle.checked = !!state.grid.snap;
    dom.gridSnapContextToggle.addEventListener("change", () => {
      dom.gridSnapToggle.checked = !!dom.gridSnapContextToggle.checked;
      actions.setGridSnap(!!dom.gridSnapContextToggle.checked);
    });
  }
  if (dom.gridShowToggle) {
    dom.gridShowToggle.checked = !!state.grid.show;
    dom.gridShowToggle.addEventListener("change", () => { if (dom.gridShowContextToggle) dom.gridShowContextToggle.checked = !!dom.gridShowToggle.checked; actions.setGridShow(!!dom.gridShowToggle.checked); });
  }
  if (dom.gridShowContextToggle) {
    dom.gridShowContextToggle.checked = !!state.grid.show;
    dom.gridShowContextToggle.addEventListener("change", () => { if (dom.gridShowToggle) dom.gridShowToggle.checked = !!dom.gridShowContextToggle.checked; actions.setGridShow(!!dom.gridShowContextToggle.checked); });
  }
  if (dom.gridAutoToggle) {
    dom.gridAutoToggle.checked = !!state.grid.auto;
    dom.gridAutoToggle.addEventListener("change", () => { if (dom.gridAutoContextToggle) dom.gridAutoContextToggle.checked = !!dom.gridAutoToggle.checked; actions.setGridAuto(!!dom.gridAutoToggle.checked); });
  }
  if (dom.gridAutoContextToggle) {
    dom.gridAutoContextToggle.checked = !!state.grid.auto;
    dom.gridAutoContextToggle.addEventListener("change", () => { if (dom.gridAutoToggle) dom.gridAutoToggle.checked = !!dom.gridAutoContextToggle.checked; actions.setGridAuto(!!dom.gridAutoContextToggle.checked); });
  }
  if (dom.gridAutoThreshold50ContextInput && dom.gridAutoThreshold10ContextInput) {
    dom.gridAutoThreshold50ContextInput.value = String(Math.max(1, Math.min(1000, Math.round(Number(state.grid.autoThreshold50 ?? 30)))));
    dom.gridAutoThreshold10ContextInput.value = String(Math.max(1, Math.min(1000, Math.round(Number(state.grid.autoThreshold10 ?? 60)))));
    const onGridAutoThresholdChange = () => {
      const t50 = Math.max(1, Math.min(1000, Math.round(Number(dom.gridAutoThreshold50ContextInput.value) || 30)));
      const t10 = Math.max(1, Math.min(1000, Math.round(Number(dom.gridAutoThreshold10ContextInput.value) || 60)));
      dom.gridAutoThreshold50ContextInput.value = String(t50);
      dom.gridAutoThreshold10ContextInput.value = String(t10);
      actions.setGridAutoThresholds?.(t50, t10);
    };
    dom.gridAutoThreshold50ContextInput.addEventListener("change", onGridAutoThresholdChange);
    dom.gridAutoThreshold10ContextInput.addEventListener("change", onGridAutoThresholdChange);
  }
  if (dom.objSnapToggle) {
    dom.objSnapToggle.checked = state.objectSnap?.enabled !== false;
    dom.objSnapToggle.addEventListener("change", () => actions.setObjectSnapEnabled(!!dom.objSnapToggle.checked));
  }
  if (dom.objSnapEndpointToggle) {
    dom.objSnapEndpointToggle.checked = state.objectSnap?.endpoint !== false;
    dom.objSnapEndpointToggle.addEventListener("change", () => actions.setObjectSnapKind("endpoint", !!dom.objSnapEndpointToggle.checked));
  }
  if (dom.objSnapCenterToggle) {
    dom.objSnapCenterToggle.checked = state.objectSnap?.center !== false;
    dom.objSnapCenterToggle.addEventListener("change", () => actions.setObjectSnapKind("center", !!dom.objSnapCenterToggle.checked));
  }
  if (dom.objSnapIntersectionToggle) {
    dom.objSnapIntersectionToggle.checked = state.objectSnap?.intersection !== false;
    dom.objSnapIntersectionToggle.addEventListener("change", () => actions.setObjectSnapKind("intersection", !!dom.objSnapIntersectionToggle.checked));
  }
  if (dom.objSnapTangentToggle) {
    dom.objSnapTangentToggle.checked = !!state.objectSnap?.tangent;
    dom.objSnapTangentToggle.addEventListener("change", () => actions.setObjectSnapKind("tangent", !!dom.objSnapTangentToggle.checked));
  }
  if (dom.objSnapVectorToggle) {
    dom.objSnapVectorToggle.checked = !!state.objectSnap?.vector;
    dom.objSnapVectorToggle.addEventListener("change", () => actions.setObjectSnapKind("vector", !!dom.objSnapVectorToggle.checked));
  }

  if (dom.resetViewBtn) dom.resetViewBtn.addEventListener("click", () => actions.resetView());
  if (dom.undoBtn) dom.undoBtn.addEventListener("click", () => actions.undo());
  if (dom.redoBtn) dom.redoBtn.addEventListener("click", () => actions.redo());
  if (dom.saveJsonBtn) dom.saveJsonBtn.addEventListener("click", () => actions.saveJson());
  if (dom.loadJsonBtn) dom.loadJsonBtn.addEventListener("click", () => actions.loadJson());
  if (dom.activeLayerSelect) {
    dom.activeLayerSelect.addEventListener("change", () => actions.setActiveLayer(Number(dom.activeLayerSelect.value)));
  }
  if (dom.addLayerBtn) {
    dom.addLayerBtn.addEventListener("click", () => actions.addLayer(dom.newLayerNameInput?.value || ""));
  }
  if (dom.newLayerNameInput) {
    dom.newLayerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.addLayer(dom.newLayerNameInput.value || "");
      }
    });
  }
  if (dom.renameLayerBtn) {
    dom.renameLayerBtn.addEventListener("click", () => actions.renameActiveLayer?.(dom.renameLayerNameInput?.value || ""));
  }
  if (dom.renameLayerNameInput) {
    dom.renameLayerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.renameActiveLayer?.(dom.renameLayerNameInput.value || "");
      }
    });
  }
  if (dom.moveSelectionLayerBtn) {
    dom.moveSelectionLayerBtn.addEventListener("click", () => actions.moveSelectionToLayer?.());
  }
  if (dom.layerColorizeToggle) {
    dom.layerColorizeToggle.addEventListener("change", () => actions.setLayerColorize?.(!!dom.layerColorizeToggle.checked));
  }
  if (dom.editOnlyActiveLayerToggle) {
    dom.editOnlyActiveLayerToggle.addEventListener("change", () => actions.setEditOnlyActiveLayer?.(!!dom.editOnlyActiveLayerToggle.checked));
  }
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
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.addEventListener("click", () => actions.createGroupFromSelection(dom.newGroupNameInput?.value || ""));
  }
  if (dom.deleteGroupBtn) {
    dom.deleteGroupBtn.addEventListener("click", () => actions.deleteActiveGroup?.());
  }
  if (dom.unparentGroupBtn) {
    dom.unparentGroupBtn.addEventListener("click", () => actions.unparentActiveGroup?.());
  }
  if (dom.newGroupNameInput) {
    dom.newGroupNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.createGroupFromSelection(dom.newGroupNameInput.value || "");
      }
    });
  }
  if (dom.groupList) {
    const toggleGroupTreeExpandedByRow = (row, e) => {
      if (!row) return false;
      stopGroupPanelResizeDrag();
      const id = Number(row.dataset.groupRow);
      if (!Number.isFinite(id)) return false;
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      if (!state.ui.groupTreeExpanded) state.ui.groupTreeExpanded = {};
      state.ui.groupTreeExpanded[id] = !state.ui.groupTreeExpanded[id];
      if (e) e.preventDefault();
      refreshUi(state, dom);
      return true;
    };
    dom.groupList.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.detail < 2) return;
      const objRow = e.target.closest?.("[data-group-shape-row]");
      if (objRow) return;
      const toggle = e.target.closest?.("button[data-group-toggle]");
      if (toggle) return;
      const row = e.target.closest?.("[data-group-row]");
      if (!row) return;
      toggleGroupTreeExpandedByRow(row, e);
    });
    dom.groupList.addEventListener("click", (e) => {
      if (Date.now() < suppressGroupListClickUntil) {
        e.preventDefault();
        return;
      }
      const t = toElementTarget(e.target);
      const objRow = t?.closest?.("[data-group-shape-row]");
      if (objRow) {
        actions.selectShapeById?.(Number(objRow.dataset.groupShapeRow));
        return;
      }
      const toggle = t?.closest?.("button[data-group-toggle]");
      if (toggle) {
        const id = Number(toggle.dataset.groupToggle);
        if (!state.ui.groupTreeExpanded) state.ui.groupTreeExpanded = {};
        state.ui.groupTreeExpanded[id] = !state.ui.groupTreeExpanded[id];
        refreshUi(state, dom);
        return;
      }
      const row = t?.closest?.("[data-group-row]");
      if (!row) return;
      const gid = Number(row.dataset.groupRow);
      if (!Number.isFinite(gid)) return;

      // Toggleボタンがクリックされた場合は、既に処理されているため帰る
      if (t?.closest?.("button[data-group-toggle]")) return;

      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      groupRowClickTimer = setTimeout(() => {
        groupRowClickTimer = null;
        actions.selectGroup(gid);
      }, 220);
    });
    dom.groupList.addEventListener("dblclick", (e) => {
      const t = toElementTarget(e.target);
      const objRow = t?.closest?.("[data-group-shape-row]");
      if (objRow) return;
      const row = t?.closest?.("[data-group-row]");
      if (!row) return;
      toggleGroupTreeExpandedByRow(row, e);
    });
    dom.groupList.addEventListener("dragstart", (e) => {
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      const t = toElementTarget(e.target);
      const objRow = t?.closest?.("[data-group-shape-row]");
      if (objRow) {
        const sid = Number(objRow.dataset.groupShapeRow);
        if (!Number.isFinite(sid)) return;
        if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
        state.ui.groupDragDrop.draggingShapeId = sid;
        state.ui.groupDragDrop.draggingGroupId = null;
        state.ui.groupDragDrop.overGroupId = null;
        lastGroupDnDKind = "shape";
        try { e.dataTransfer.setData("text/plain", `shape:${sid}`); } catch (_) { }
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        return;
      }
      const row = t?.closest?.("[data-group-row]");
      if (!row) return;
      const gid = Number(row.dataset.groupRow);
      if (!Number.isFinite(gid)) return;
      if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
      state.ui.groupDragDrop.draggingGroupId = gid;
      state.ui.groupDragDrop.draggingShapeId = null;
      state.ui.groupDragDrop.overGroupId = null;
      lastGroupDnDKind = "group";
      try { e.dataTransfer.setData("text/plain", String(gid)); } catch (_) { }
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    dom.groupList.addEventListener("dragover", (e) => {
      const target = resolveGroupDropTarget(e.target);
      if (!target) return;
      e.preventDefault();
      const row = target.row;
      const sec = row?.closest?.(".section[data-panel-id='groups']") || dom.groupList.closest?.(".section[data-panel-id='groups']");
      sec?.classList.remove("dnd-over-root");
      const gid = Number(target.gid);
      if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
      if (state.ui.groupDragDrop.overGroupId !== gid) {
        state.ui.groupDragDrop.overGroupId = gid;
      }
      setGroupDropHoverRow(row);
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    dom.groupList.addEventListener("dragleave", (e) => {
      const target = resolveGroupDropTarget(e.target);
      if (!target) return;
      const row = target.row;
      const related = e.relatedTarget;
      if (related && row && row.contains?.(related)) return;
      if (!state.ui.groupDragDrop) return;
      const gid = Number(target.gid);
      if (state.ui.groupDragDrop.overGroupId === gid) {
        state.ui.groupDragDrop.overGroupId = null;
      }
      if (row && currentGroupDropHoverRow === row) clearGroupDropHoverRow();
    });
    dom.groupList.addEventListener("drop", (e) => {
      if (lastGroupDnDKind === "shape") suppressGroupListClickUntil = Date.now() + 250;
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      const target = resolveGroupDropTarget(e.target);
      if (!target) return;
      e.preventDefault();
      clearGroupDropHoverRow();
      const row = target.row;
      const sec = row?.closest?.(".section[data-panel-id='groups']") || dom.groupList.closest?.(".section[data-panel-id='groups']");
      sec?.classList.remove("dnd-over-root");
      const parentId = Number(target.gid);
      const payload = parseDragPayload(e);
      const draggedGroupId = payload.groupId;
      const draggedShapeId = payload.shapeId;
      actions.debugStatus?.(`drop targetG=${parentId} dragG=${draggedGroupId ?? "null"} dragS=${draggedShapeId ?? "null"}`);
      if (Number.isFinite(draggedShapeId)) {
        actions.moveShapeToGroup?.(draggedShapeId, parentId);
      } else if (Number.isFinite(draggedGroupId)) {
        actions.selectGroup?.(draggedGroupId);
        actions.setActiveGroupParent?.(parentId);
      }
      if (state.ui.groupDragDrop) {
        state.ui.groupDragDrop.draggingGroupId = null;
        state.ui.groupDragDrop.draggingShapeId = null;
        state.ui.groupDragDrop.overGroupId = null;
      }
      // actions.setActiveGroupParent / actions.moveShapeToGroup already refresh.
    });
    dom.groupList.addEventListener("dragend", () => {
      if (lastGroupDnDKind === "shape") suppressGroupListClickUntil = Date.now() + 250;
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      clearGroupDropHoverRow();
      const sec = dom.groupList.closest?.(".section[data-panel-id='groups']");
      sec?.classList.remove("dnd-over-root");
      if (!state.ui.groupDragDrop) return;
      const _g = state.ui.groupDragDrop.draggingGroupId;
      const _s = state.ui.groupDragDrop.draggingShapeId;
      const _o = state.ui.groupDragDrop.overGroupId;
      const hadAnyDragState =
        (_g != null && Number.isFinite(Number(_g))) ||
        (_s != null && Number.isFinite(Number(_s))) ||
        (_o != null && Number.isFinite(Number(_o)));
      state.ui.groupDragDrop.draggingGroupId = null;
      state.ui.groupDragDrop.draggingShapeId = null;
      state.ui.groupDragDrop.overGroupId = null;
      if (hadAnyDragState) {
        refreshUi(state, dom);
      }
      lastGroupDnDKind = null;
    });
  }
  if (dom.moveGroupBtn) {
    dom.moveGroupBtn.addEventListener("click", () => {
      const dx = Number(dom.groupMoveDxInput?.value || 0);
      const dy = Number(dom.groupMoveDyInput?.value || 0);
      actions.moveActiveGroup(dx, dy);
    });
  }
  if (dom.moveGroupOriginOnlyBtn) {
    dom.moveGroupOriginOnlyBtn.addEventListener("click", () => {
      actions.beginMoveActiveGroupOriginOnly?.();
    });
  }
  if (dom.moveSelectedShapesBtn) {
    dom.moveSelectedShapesBtn.addEventListener("click", () => {
      const dx = Number(dom.selectMoveDxInput?.value || 0);
      const dy = Number(dom.selectMoveDyInput?.value || 0);
      actions.moveSelectedShapes?.(dx, dy);
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
  if (dom.selectionTextColorInput) {
    dom.selectionTextColorInput.addEventListener("input", (e) => {
      actions.updateSelectedTextSettings?.({ textColor: e.target.value });
    });
  }
  const runSelectMoveByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const dx = Number(dom.selectMoveDxInput?.value || 0);
    const dy = Number(dom.selectMoveDyInput?.value || 0);
    actions.moveSelectedShapes?.(dx, dy);
  };
  if (dom.selectMoveDxInput) {
    dom.selectMoveDxInput.addEventListener("keydown", runSelectMoveByEnter);
  }
  if (dom.selectMoveDyInput) {
    dom.selectMoveDyInput.addEventListener("keydown", runSelectMoveByEnter);
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
  if (dom.vertexLinkCoincidentToggle) {
    dom.vertexLinkCoincidentToggle.checked = state.vertexEdit?.linkCoincident !== false;
    dom.vertexLinkCoincidentToggle.addEventListener("change", () => {
      actions.setVertexLinkCoincident(!!dom.vertexLinkCoincidentToggle.checked);
    });
  }
  if (dom.applyLineInputBtn) {
    dom.applyLineInputBtn.addEventListener("click", () => {
      const len = Number(dom.lineLengthInput?.value || 0);
      const ang = Number(dom.lineAngleInput?.value || 0);
      actions.applyLineInput(len, ang);
    });
  }
  const runLineApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const len = Number(dom.lineLengthInput?.value || 0);
    const ang = Number(dom.lineAngleInput?.value || 0);
    actions.applyLineInput(len, ang);
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
  if (dom.applyRectInputBtn) {
    dom.applyRectInputBtn.addEventListener("click", () => {
      const w = Number(dom.rectWidthInput?.value || 0);
      const h = Number(dom.rectHeightInput?.value || 0);
      actions.applyRectInput(w, h);
    });
  }
  const runRectApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const w = Number(dom.rectWidthInput?.value || 0);
    const h = Number(dom.rectHeightInput?.value || 0);
    actions.applyRectInput(w, h);
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
  if (dom.applyCircleInputBtn) {
    dom.applyCircleInputBtn.addEventListener("click", () => {
      const r = Number(dom.circleRadiusInput?.value || 0);
      actions.applyCircleInput(r);
    });
  }
  const runCircleApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const r = Number(dom.circleRadiusInput?.value || 0);
    actions.applyCircleInput(r);
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
  if (dom.applyFilletBtn) {
    dom.applyFilletBtn.addEventListener("click", () => {
      const r = Number(dom.filletRadiusInput?.value || 0);
      actions.applyFillet(r);
    });
  }
  if (dom.filletRadiusInput) {
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
  if (dom.filletLineModeSelect) {
    dom.filletLineModeSelect.addEventListener("change", () => {
      const v = String(dom.filletLineModeSelect.value || "trim").toLowerCase();
      actions.setFilletLineMode(v === "split" ? "split" : "trim");
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
      state.objectSnap.tangentKeep = !!dom.objSnapTangentKeepToggle.checked;
    });
  }
  if (dom.positionSizeInput) {
    dom.positionSizeInput.addEventListener("change", () => {
      const v = Math.max(1, Number(dom.positionSizeInput.value || 20));
      dom.positionSizeInput.value = String(v);
      actions.setPositionSize(v);
    });
  }
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
  if (dom.textColorInput) {
    dom.textColorInput.addEventListener("input", () => actions.setTextSettings({ color: dom.textColorInput.value }));
  }
  if (dom.dimLinearMode) dom.dimLinearMode.addEventListener("change", () => actions.setDimSettings({ linearMode: dom.dimLinearMode.value }));
  if (dom.dimSnapMode) dom.dimSnapMode.addEventListener("change", () => actions.setDimSettings({ snapMode: dom.dimSnapMode.value }));
  if (dom.dimCircleMode) dom.dimCircleMode.addEventListener("change", () => actions.setDimSettings({ circleMode: dom.dimCircleMode.value }));
  if (dom.dimPrecisionSelect) {
    dom.dimPrecisionSelect.addEventListener("change", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.dimPrecisionSelect.value) || 0)));
      actions.setDimSettings({ precision: p });
    });
  }
  if (dom.dimTextRotateInput) dom.dimTextRotateInput.addEventListener("change", () => actions.setDimSettings({ textRotate: Number(dom.dimTextRotateInput.value) || 0 }));
  if (dom.dimExtOffsetInput) dom.dimExtOffsetInput.addEventListener("change", () => actions.setDimSettings({ extOffset: Number(dom.dimExtOffsetInput.value) || 4 }));
  if (dom.dimExtOverInput) dom.dimExtOverInput.addEventListener("change", () => actions.setDimSettings({ extOver: Number(dom.dimExtOverInput.value) || 4 }));
  if (dom.dimROvershootInput) dom.dimROvershootInput.addEventListener("change", () => actions.setDimSettings({ rOvershoot: Number(dom.dimROvershootInput.value) || 5 }));
  if (dom.dimChainPopBtn) dom.dimChainPopBtn.addEventListener("click", () => actions.popDimChainPoint());
  if (dom.applyDimSettingsBtn) {
    dom.applyDimSettingsBtn.addEventListener("click", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.dimPrecisionSelect?.value) || 0)));
      actions.applyDimSettingsToSelection({
        precision: p,
        textRotate: Number(dom.dimTextRotateInput?.value) || 0,
        extOffset: Number(dom.dimExtOffsetInput?.value) || 4,
        extOver: Number(dom.dimExtOverInput?.value) || 4,
      });
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
    dom.pageSizeSelect.addEventListener("change", () => actions.setPageSetup({ size: dom.pageSizeSelect.value }));
  }
  if (dom.pageOrientationSelect) {
    dom.pageOrientationSelect.addEventListener("change", () => actions.setPageSetup({ orientation: dom.pageOrientationSelect.value }));
  }
  if (dom.pageScaleInput) {
    dom.pageScaleInput.addEventListener("change", () => {
      const v = Math.max(0.0001, Number(dom.pageScaleInput.value || 1));
      dom.pageScaleInput.value = String(v);
      actions.setPageSetup({ scale: v });
    });
  }
  if (dom.pageUnitSelect) {
    dom.pageUnitSelect.addEventListener("change", () => actions.setPageSetup({ unit: dom.pageUnitSelect.value }));
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
  if (dom.hatchPatternSelect) {
    dom.hatchPatternSelect.addEventListener("change", () => actions.setHatchSettings({ pattern: dom.hatchPatternSelect.value }));
  }
  if (dom.hatchCrossAngleInput) {
    dom.hatchCrossAngleInput.addEventListener("change", () => actions.setHatchSettings({ crossAngleDeg: Number(dom.hatchCrossAngleInput.value) || 90 }));
  }
  if (dom.hatchPaddingInput) {
    dom.hatchPaddingInput.addEventListener("change", () => actions.setHatchSettings({ repetitionPaddingMm: Number(dom.hatchPaddingInput.value) || 0 }));
  }
  if (dom.hatchLineTypeSelect) {
    dom.hatchLineTypeSelect.addEventListener("change", () => actions.setHatchSettings({ lineType: dom.hatchLineTypeSelect.value }));
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

  if (dom.dlineOffsetInput) {
    dom.dlineOffsetInput.addEventListener("input", () => {
      state.dlineSettings.offset = Number(dom.dlineOffsetInput.value) || 10;
      refreshUiDeferred();
    });
  }
  if (dom.dlineModeSelect) {
    dom.dlineModeSelect.addEventListener("change", () => {
      state.dlineSettings.mode = dom.dlineModeSelect.value;
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
}

export function refreshUi(state, dom) {
  dom.buildBadge.textContent = `Build ${state.buildVersion}`;
  dom.statusText.textContent = state.ui.statusText || "";
  const rightStackEl = document.querySelector(".right-stack");
  if (rightStackEl) {
    const w = Number(state.ui?.panelLayout?.rightPanelWidth);
    if (Number.isFinite(w) && w > 0) {
      rightStackEl.style.width = `min(${w}px, calc(100% - 230px))`;
    } else {
      rightStackEl.style.removeProperty("width");
    }
  }
  const tool = String(state.tool || "");
  const topContext = document.getElementById("topContext");
  const topContextHelp = document.getElementById("topContextHelp");
  if (topContext) {
    const visibleCtx = new Set();
    if (tool === "vertex") visibleCtx.add("vertex");
    if (tool === "line") { visibleCtx.add("line"); visibleCtx.add("preview"); }
    if (tool === "rect") { visibleCtx.add("rect"); visibleCtx.add("preview"); }
    const hasCircleSelected = (state.selection?.ids || []).some(id => {
      const s = state.shapes.find(sh => Number(sh.id) === Number(id));
      return s && (s.type === "circle" || s.type === "arc");
    });
    if (tool === "circle" || hasCircleSelected) { visibleCtx.add("circle"); visibleCtx.add("preview"); }
    if (tool === "position") visibleCtx.add("position");
    if (tool === "text") visibleCtx.add("text");
    const hasDimSelected = (state.selection?.ids || []).some(id => {
      const s = state.shapes.find(sh => Number(sh.id) === Number(id));
      return s && (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle");
    });
    if (tool === "dim" || hasDimSelected) visibleCtx.add("dim");
    if (tool === "fillet") visibleCtx.add("fillet");
    if (tool === "trim") visibleCtx.add("trim");
    if (tool === "grid") visibleCtx.add("grid");
    if (tool === "settings") visibleCtx.add("settings");
    if (tool === "patterncopy") visibleCtx.add("patterncopy");
    if (tool === "doubleline") visibleCtx.add("doubleline");

    // 選択中にハッチがあればハッチパネルを出す
    const hasHatchSelected = (state.selection?.ids || []).some(id => {
      const s = state.shapes.find(sh => sh.id === id);
      return s && s.type === "hatch";
    });
    if (tool === "hatch" || hasHatchSelected) visibleCtx.add("hatch");
    if (tool === "select") {
      const hasObjectSelection = ((state.selection?.ids || []).length > 0);
      const hasActiveGroup = state.activeGroupId != null;
      if (hasObjectSelection || hasActiveGroup) visibleCtx.add("group");
    }
    let visibleCount = 0;
    for (const el of topContext.querySelectorAll("[data-context]")) {
      const key = el.getAttribute("data-context") || "";
      const on = visibleCtx.has(key);
      el.style.display = on ? "flex" : "none";
      if (on) visibleCount++;
    }
    const helpMap = {
      vertex: "頂点をクリック/ドラッグして編集。Shiftで複数選択。Enterで dX/dY 移動を実行。",
      line: "1点目クリック後、2点目をクリック。Length / Angle の数値入力も使えます。",
      rect: "始点クリック後、対角点をクリック。Width / Height の数値入力で確定できます。",
      circle: "中心クリック後、半径をクリックまたは Radius 入力で確定。",
      position: "クリックで位置マーカーを配置します。Size は左パネル設定を使用。",
      dim: "2点クリックまたはオブジェクト選択で寸法線を作成。直列モードでは連続配置可能。",
      fillet: "対象を選択して候補を確定。line-circle/arc-line は段階的に残す側を選べます。",
      trim: "図形をクリックしてトリムを実行。削除せずに分割のみ行うことも可能です。",
      grid: "グリッドサイズ、可変グリッドの設定をします。",
      text: "キャンバスをクリックしてテキストを配置。配置後、上部パネルで内容、サイズ、色などを変更できます。",
      hatch: "境界をクリックして選択。Enter または Apply でハッチングを実行します。",
      patterncopy: "パターンコピーを実行します。モードを選択し、必要であれば中心点や軸線をキャンバス上でクリックしてから Apply を押してください。",
      doubleline: "選択した線分から二重線（オフセット線）を生成します。Offset値やMode（片側/両側）を調整し、ApplyまたはEnterで確定します。",
    };
    const helpText = helpMap[tool] || "";
    if (topContextHelp) {
      topContextHelp.textContent = helpText;
      topContextHelp.style.display = (visibleCount > 0 && helpText) ? "flex" : "none";
    }
    topContext.style.display = visibleCount > 0 ? "grid" : "none";

    // Show Space handling message if something is selected
    const selectedCount = (state.selection?.ids || []).length;
    if (selectedCount > 0 || state.activeGroupId != null) {
      if (topContextHelp) {
        const baseTxt = helpMap[tool] || "";
        topContextHelp.textContent = (baseTxt ? baseTxt + " | " : "") + "Space: 選択解除";
        topContextHelp.style.display = "flex";
      }
      topContext.style.display = "grid";
    }
  }

  if (dom.statusText) {
    const toolText = `Tool: ${state.tool ? state.tool.toUpperCase() : "NONE"}`;
    const x = state.input.hoverWorld?.x ?? 0;
    const y = state.input.hoverWorld?.y ?? 0;
    const coordText = `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`;
    const isDraggingSelection = state.selection?.drag?.active && state.selection?.drag?.moved;
    const isDraggingVertex = state.vertexEdit?.drag?.active && state.vertexEdit?.drag?.moved;
    const dragHint = (isDraggingSelection || isDraggingVertex) ? "  |  Enter to confirm" : "";
    dom.statusText.textContent = `${toolText} | ${coordText}${dragHint}`;
  }
  const groupCtxObjectOps = document.getElementById("groupCtxObjectOps");
  const groupCtxGroupOps = document.getElementById("groupCtxGroupOps");
  if (groupCtxObjectOps || groupCtxGroupOps) {
    const selectedCount = (state.selection?.ids || []).length;
    const hasObjectSelection = selectedCount > 0;
    const hasActiveGroup = state.activeGroupId != null;
    if (groupCtxObjectOps) groupCtxObjectOps.style.display = hasObjectSelection ? "flex" : "none";
    if (groupCtxGroupOps) groupCtxGroupOps.style.display = hasActiveGroup ? "flex" : "none";
  }
  for (const btn of dom.toolButtons.querySelectorAll("button[data-tool]")) {
    btn.classList.toggle("active", btn.dataset.tool === state.tool);
  }
  if (dom.undoBtn) {
    for (const btn of dom.toolButtons.querySelectorAll("button[data-action='undo']")) {
      btn.disabled = !(state.history?.past?.length > 0);
    }
  }
  if (dom.redoBtn) {
    for (const btn of dom.toolButtons.querySelectorAll("button[data-action='redo']")) {
      btn.disabled = !(state.history?.future?.length > 0);
    }
  }
  if (dom.undoBtn) dom.undoBtn.disabled = !(state.history?.past?.length > 0);
  if (dom.redoBtn) dom.redoBtn.disabled = !(state.history?.future?.length > 0);
  if (dom.gridSizeInput) dom.gridSizeInput.value = String(state.grid.size);
  if (dom.gridSizeContextInput) dom.gridSizeContextInput.value = String(state.grid.size);
  if (dom.gridSnapToggle) dom.gridSnapToggle.checked = !!state.grid.snap;
  if (dom.gridSnapContextToggle) dom.gridSnapContextToggle.checked = !!state.grid.snap;
  if (dom.gridShowToggle) dom.gridShowToggle.checked = !!state.grid.show;
  if (dom.gridShowContextToggle) dom.gridShowContextToggle.checked = !!state.grid.show;
  if (dom.gridAutoToggle) dom.gridAutoToggle.checked = !!state.grid.auto;
  if (dom.gridAutoContextToggle) dom.gridAutoContextToggle.checked = !!state.grid.auto;
  if (dom.gridAutoThreshold50ContextInput) dom.gridAutoThreshold50ContextInput.value = String(Math.max(1, Math.min(1000, Math.round(Number(state.grid.autoThreshold50 ?? 30)))));
  if (dom.gridAutoThreshold10ContextInput) dom.gridAutoThreshold10ContextInput.value = String(Math.max(1, Math.min(1000, Math.round(Number(state.grid.autoThreshold10 ?? 60)))));
  if (dom.objSnapToggle) dom.objSnapToggle.checked = state.objectSnap?.enabled !== false;
  if (dom.objSnapEndpointToggle) dom.objSnapEndpointToggle.checked = state.objectSnap?.endpoint !== false;
  if (dom.objSnapCenterToggle) dom.objSnapCenterToggle.checked = state.objectSnap?.center !== false;
  if (dom.objSnapIntersectionToggle) dom.objSnapIntersectionToggle.checked = state.objectSnap?.intersection !== false;
  if (dom.objSnapTangentToggle) dom.objSnapTangentToggle.checked = !!state.objectSnap?.tangent;
  if (dom.objSnapTangentKeepToggle) dom.objSnapTangentKeepToggle.checked = !!state.objectSnap?.tangentKeep;
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
  if (dom.textSizePtInput) dom.textSizePtInput.value = String(state.textSettings.sizePt);
  if (dom.textRotateInput) dom.textRotateInput.value = String(state.textSettings.rotate);
  if (dom.textFontFamilyInput) dom.textFontFamilyInput.value = state.textSettings.fontFamily;
  if (dom.textBoldInput) dom.textBoldInput.checked = !!state.textSettings.bold;
  if (dom.textItalicInput) dom.textItalicInput.checked = !!state.textSettings.italic;
  if (dom.textColorInput) dom.textColorInput.value = state.textSettings.color;

  if (dom.hatchPitchInput) dom.hatchPitchInput.value = String(state.hatchSettings.pitchMm);
  if (dom.hatchAngleInput) dom.hatchAngleInput.value = String(state.hatchSettings.angleDeg);
  if (dom.hatchPatternSelect) dom.hatchPatternSelect.value = state.hatchSettings.pattern;
  if (dom.hatchCrossAngleInput) dom.hatchCrossAngleInput.value = String(state.hatchSettings.crossAngleDeg);
  if (dom.hatchPaddingInput) dom.hatchPaddingInput.value = String(state.hatchSettings.repetitionPaddingMm);
  if (dom.hatchLineTypeSelect) dom.hatchLineTypeSelect.value = state.hatchSettings.lineType;
  if (dom.hatchDashMmInput) dom.hatchDashMmInput.value = String(state.hatchSettings.lineDashMm);
  if (dom.hatchGapMmInput) dom.hatchGapMmInput.value = String(state.hatchSettings.lineGapMm);
  if (dom.applyHatchBtn) dom.applyHatchBtn.disabled = !(state.tool === "hatch" && state.hatchDraft?.boundaryIds?.length > 0);

  if (dom.patternCopyModeSelect) dom.patternCopyModeSelect.value = state.patternCopySettings.mode;
  if (dom.patternCopyArrayOptions) dom.patternCopyArrayOptions.style.display = state.patternCopySettings.mode === "array" ? "block" : "none";
  if (dom.patternCopyRotateOptions) dom.patternCopyRotateOptions.style.display = state.patternCopySettings.mode === "rotate" ? "block" : "none";
  if (dom.patternCopyMirrorOptions) dom.patternCopyMirrorOptions.style.display = state.patternCopySettings.mode === "mirror" ? "block" : "none";

  if (dom.patternCopyArrayDxInput) dom.patternCopyArrayDxInput.value = String(state.patternCopySettings.arrayDx);
  if (dom.patternCopyArrayDyInput) dom.patternCopyArrayDyInput.value = String(state.patternCopySettings.arrayDy);
  if (dom.patternCopyArrayCountXInput) dom.patternCopyArrayCountXInput.value = String(state.patternCopySettings.arrayCountX);
  if (dom.patternCopyArrayCountYInput) dom.patternCopyArrayCountYInput.value = String(state.patternCopySettings.arrayCountY);
  if (dom.patternCopyRotateAngleInput) dom.patternCopyRotateAngleInput.value = String(state.patternCopySettings.rotateAngleDeg);
  if (dom.patternCopyRotateCountInput) dom.patternCopyRotateCountInput.value = String(state.patternCopySettings.rotateCount);

  if (dom.patternCopyCenterStatus) {
    const cid = state.input.patternCopyFlow.centerPositionId;
    dom.patternCopyCenterStatus.textContent = cid ? `設定済み: 点 #${cid}` : "未設定 (キャンバスの点を選択)";
    if (dom.patternCopySetCenterBtn) {
      dom.patternCopySetCenterBtn.textContent = cid ? "中心解除" : "中心として設定";
    }
  }
  if (dom.patternCopyAxisStatus) {
    const aid = state.input.patternCopyFlow.axisLineId;
    dom.patternCopyAxisStatus.textContent = aid ? `設定済み: 線 #${aid}` : "未設定 (キャンバスの線を選択)";
    if (dom.patternCopySetAxisBtn) {
      dom.patternCopySetAxisBtn.textContent = aid ? "軸設定を解除" : "軸として設定";
    }
  }

  if (dom.patternCopyApplyBtn) {
    const hasSelection = (state.selection?.ids || []).length > 0;
    const mode = state.patternCopySettings.mode;
    let ok = hasSelection;
    if (mode === "rotate") ok = ok && !!state.input.patternCopyFlow.centerPositionId;
    if (mode === "mirror") ok = ok && !!state.input.patternCopyFlow.axisLineId;
    dom.patternCopyApplyBtn.disabled = !ok;
  }

  const selectedShapes = (state.shapes || []).filter(s => (state.selection?.ids || []).map(Number).includes(Number(s.id)));
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

  if (dom.activeLayerSelect) {
    const prev = dom.activeLayerSelect.value;
    dom.activeLayerSelect.innerHTML = "";
    for (const layer of (state.layers || [])) {
      const opt = document.createElement("option");
      opt.value = String(layer.id);
      opt.textContent = `${layer.name}${layer.visible === false ? "（非表示）" : ""}`;
      dom.activeLayerSelect.appendChild(opt);
    }
    dom.activeLayerSelect.value = String(state.activeLayerId ?? prev ?? "");
  }
  if (dom.renameLayerNameInput) {
    const activeLayer = (state.layers || []).find(l => Number(l.id) === Number(state.activeLayerId));
    if (activeLayer && document.activeElement !== dom.renameLayerNameInput) {
      dom.renameLayerNameInput.value = String(activeLayer.name ?? "");
    }
  }
  if (dom.layerList) {
    dom.layerList.innerHTML = "";
    for (const layer of (state.layers || [])) {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "1fr auto";
      row.style.gap = "6px";
      row.style.alignItems = "center";
      const isActive = (Number(layer.id) === Number(state.activeLayerId));
      const nameBtn = document.createElement("button");
      nameBtn.type = "button";
      nameBtn.dataset.layerNameBtn = String(layer.id);
      nameBtn.textContent = layer.name;
      nameBtn.title = "ダブルクリックで現在レイヤーに設定";
      nameBtn.style.textAlign = "left";
      nameBtn.style.width = "100%";
      nameBtn.style.fontSize = "11px";
      nameBtn.style.background = isActive ? "rgba(219,234,254,0.9)" : "rgba(255,255,255,0.75)";
      nameBtn.style.border = isActive ? "1px solid rgba(37,99,235,0.45)" : "1px solid rgba(148,163,184,0.25)";
      nameBtn.style.color = isActive ? "var(--ink)" : "var(--muted)";
      nameBtn.style.fontWeight = isActive ? "700" : "500";
      const modeBtn = document.createElement("button");
      modeBtn.type = "button";
      modeBtn.dataset.layerModeCycle = String(layer.id);
      modeBtn.style.fontSize = "10px";
      const visible = layer.visible !== false;
      const locked = layer.locked === true;
      modeBtn.textContent = visible ? (locked ? "LOCK" : "ON") : "OFF";
      modeBtn.title = "Toggle ON / OFF / LOCK";
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
  if (dom.renameLayerBtn) dom.renameLayerBtn.disabled = (state.activeLayerId == null);
  if (dom.moveSelectionLayerBtn) {
    const selectedShapeIds = new Set((state.selection?.ids || []).map(Number));
    const hasSelectedObjects = state.tool === "select" && (state.shapes || []).some(s => selectedShapeIds.has(Number(s.id)));
    dom.moveSelectionLayerBtn.disabled = !hasSelectedObjects;
    dom.moveSelectionLayerBtn.textContent = "????????";
  }
  if (dom.layerColorizeToggle) {
    dom.layerColorizeToggle.checked = !!state.ui?.layerView?.colorize;
  }
  if (dom.editOnlyActiveLayerToggle) {
    dom.editOnlyActiveLayerToggle.checked = !!state.ui?.layerView?.editOnlyActive;
  }
  if (dom.layerPanelInnerOps) {
    const collapsed = !!state.ui?.layerPanelInnerCollapsed?.ops;
    dom.layerPanelInnerOps.style.display = collapsed ? "none" : "flex";
  }
  if (dom.layerPanelInnerOpsToggle) {
    const collapsed = !!state.ui?.layerPanelInnerCollapsed?.ops;
    dom.layerPanelInnerOpsToggle.textContent = collapsed ? "▸ レイヤー操作" : "▾ レイヤー操作";
  }
  for (const sec of document.querySelectorAll(".right-stack .section[data-panel-id], .left-aux-stack .section[data-panel-id]")) {
    const panelId = sec.getAttribute("data-panel-id");
    const collapsed = !!state.ui?.rightPanelCollapsed?.[panelId];
    sec.classList.toggle("collapsed", collapsed);
  }
  const groupsSectionEl = document.querySelector(".right-stack .section[data-panel-id='groups']");
  if (groupsSectionEl) {
    const h = Number(state.ui?.panelLayout?.groupPanelHeight);
    const collapsed = !!state.ui?.rightPanelCollapsed?.groups;
    if (collapsed) {
      groupsSectionEl.style.removeProperty("height");
      groupsSectionEl.style.removeProperty("max-height");
    } else if (Number.isFinite(h) && h > 0) {
      groupsSectionEl.style.height = `min(calc(100vh - 20px), ${h}px)`;
      groupsSectionEl.style.maxHeight = `min(calc(100vh - 20px), ${h}px)`;
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
        layersSectionEl.style.height = `min(calc(100vh - 20px), ${targetH}px)`;
        layersSectionEl.style.maxHeight = `min(calc(100vh - 20px), ${targetH}px)`;
      } else {
        layersSectionEl.style.removeProperty("height");
        layersSectionEl.style.removeProperty("max-height");
      }
    }
  }
  if (dom.groupList) {
    dom.groupList.innerHTML = "";
    const groups = (state.groups || []).map(g => ({ ...g, parentId: g.parentId == null ? null : Number(g.parentId) }));
    const byParent = new Map();
    for (const g of groups) {
      const pid = g.parentId == null ? null : Number(g.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(g);
    }
    // Groups are displayed in state.groups array order (no sorting)
    if (!state.ui.groupTreeExpanded) state.ui.groupTreeExpanded = {};
    const rows = [];
    const visited = new Set();
    const walk = (pid, depth) => {
      const children = byParent.get(pid) || [];
      for (const g of children) {
        if (visited.has(Number(g.id))) continue;
        visited.add(Number(g.id));
        rows.push({ group: g, depth, hasChildren: (byParent.get(Number(g.id)) || []).length > 0 });
        const expanded = state.ui.groupTreeExpanded[Number(g.id)] !== false;
        if (expanded) walk(Number(g.id), depth + 1);
      }
    };
    walk(null, 0);
    // Fallback for orphan groups (invalid parent only)
    const allGroupIds = new Set(groups.map(g => Number(g.id)));
    for (const g of groups) {
      if (visited.has(Number(g.id))) continue;
      const pid = g.parentId == null ? null : Number(g.parentId);
      const parentMissing = pid != null && !allGroupIds.has(pid);
      if (!parentMissing) continue;
      rows.push({ group: g, depth: 0, hasChildren: (byParent.get(Number(g.id)) || []).length > 0 });
    }
    // Also account for shapes not in any group
    const inAnyGroup = new Set();
    for (const g of groups) {
      for (const sid of (g.shapeIds || [])) inAnyGroup.add(Number(sid));
    }
    const unGroupedShapes = (state.shapes || []).filter(s => !inAnyGroup.has(Number(s.id)));

    if (rows.length === 0 && unGroupedShapes.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No objects";
      empty.style.color = "var(--muted)";
      empty.style.fontSize = "12px";
      empty.style.padding = "4px 2px";
      dom.groupList.appendChild(empty);
    }

    // Render Ungrouped section if any
    if (unGroupedShapes.length > 0) {
      const unGroupHeader = document.createElement("div");
      unGroupHeader.style.display = "grid";
      unGroupHeader.style.gridTemplateColumns = "20px 1fr";
      unGroupHeader.style.gap = "6px";
      unGroupHeader.style.alignItems = "center";
      unGroupHeader.style.padding = "4px 5px";
      unGroupHeader.style.color = "var(--muted)";
      unGroupHeader.style.fontSize = "12px";
      unGroupHeader.style.fontWeight = "600";

      const icon = document.createElement("div");
      icon.textContent = "•";
      icon.style.textAlign = "center";
      const name = document.createElement("div");
      name.textContent = `Ungrouped (${unGroupedShapes.length})`;
      unGroupHeader.append(icon, name);
      dom.groupList.appendChild(unGroupHeader);

      for (const s of unGroupedShapes) {
        renderShapeRow(dom.groupList, s, 1, null);
      }

      // Add separator if there are also groups
      if (rows.length > 0) {
        const sep = document.createElement("div");
        sep.style.height = "1px";
        sep.style.background = "rgba(148,163,184,0.1)";
        sep.style.margin = "4px 8px";
        dom.groupList.appendChild(sep);
      }
    }
    for (const { group, depth, hasChildren } of rows) {
      const row = document.createElement("div");
      row.dataset.groupRow = String(group.id);
      row.draggable = true;
      row.style.display = "grid";
      row.style.gridTemplateColumns = "auto 1fr";
      row.style.gap = "6px";
      row.style.alignItems = "center";
      const isActiveGroup = Number(group.id) === Number(state.activeGroupId);
      row.style.border = isActiveGroup ? "1px solid rgba(37,99,235,0.35)" : "1px solid rgba(148,163,184,0.22)";
      row.style.background = isActiveGroup ? "rgba(219,234,254,0.7)" : "rgba(255,255,255,0.65)";
      const overGroupId = Number(state.ui?.groupDragDrop?.overGroupId);
      const draggingGroupId = Number(state.ui?.groupDragDrop?.draggingGroupId);
      if (Number.isFinite(overGroupId) && overGroupId === Number(group.id) && draggingGroupId !== Number(group.id)) {
        row.style.border = "1px solid rgba(22,163,74,0.45)";
        row.style.background = "rgba(220,252,231,0.72)";
      }
      row.style.borderRadius = "8px";
      row.style.padding = "4px 5px";
      const treeBtn = document.createElement("button");
      treeBtn.type = "button";
      treeBtn.dataset.groupToggle = String(group.id);
      treeBtn.style.width = "20px";
      treeBtn.style.minWidth = "20px";
      treeBtn.style.padding = "2px 0";
      treeBtn.style.visibility = hasChildren ? "visible" : "hidden";
      const expanded = state.ui.groupTreeExpanded[Number(group.id)] !== false;
      treeBtn.textContent = hasChildren ? (expanded ? "▾" : "▸") : "";
      const name = document.createElement("div");
      name.textContent = `${group.name} (${(group.shapeIds || []).length})`;
      name.style.color = isActiveGroup ? "var(--ink)" : "var(--muted)";
      name.style.fontWeight = isActiveGroup ? "600" : "400";
      name.style.paddingLeft = `${depth * 12}px`;
      row.style.cursor = "pointer";
      row.title = isActiveGroup ? "Active" : "Click to select";
      row.append(treeBtn, name);
      dom.groupList.appendChild(row);

      // Show child objects when this group is expanded (HTML迚亥ｯ・○縺ｮ陦ｨ遉ｺ蠑ｷ蛹・
      if (expanded) {
        const shapeIds = Array.isArray(group.shapeIds) ? group.shapeIds : [];
        for (const sid of shapeIds) {
          const s = (state.shapes || []).find(ss => Number(ss.id) === Number(sid));
          if (!s) continue;
          renderShapeRow(dom.groupList, s, depth + 1, group.id);
        }
      }
    }
  }

  function renderShapeRow(parent, s, depth, ownerGroupId) {
    const objRow = document.createElement("div");
    objRow.dataset.groupShapeRow = String(s.id);
    if (ownerGroupId != null) objRow.dataset.ownerGroupId = String(ownerGroupId);
    objRow.style.display = "grid";
    objRow.draggable = true;
    objRow.style.gridTemplateColumns = "auto 1fr";
    objRow.style.gap = "6px";
    objRow.style.alignItems = "center";
    objRow.style.border = "1px dashed rgba(148,163,184,0.20)";
    objRow.style.borderRadius = "8px";
    objRow.style.padding = "3px 5px";
    const isShapeSelected = (state.selection?.ids || []).map(Number).includes(Number(s.id));
    objRow.style.background = isShapeSelected
      ? "rgba(254,215,170,0.72)"
      : "rgba(255,255,255,0.50)";
    if (isShapeSelected) {
      objRow.style.border = "1px solid rgba(249,115,22,0.45)";
    }
    objRow.style.marginLeft = `${depth * 12}px`;
    objRow.style.cursor = "pointer";
    objRow.title = "Click to select object";

    const bullet = document.createElement("div");
    bullet.textContent = "•";
    bullet.style.color = "var(--muted)";
    bullet.style.fontSize = "12px";
    bullet.style.lineHeight = "1";

    const label = document.createElement("div");
    const typeEnMap = {
      line: "Line",
      rect: "Rect",
      circle: "Circle",
      arc: "Arc",
      dim: "Dim",
      dimchain: "DimChain",
      dimangle: "DimAngle",
      position: "Position",
      text: "Text",
      hatch: "Hatch",
      dline: "DLine",
    };
    label.textContent = `${typeEnMap[s.type] || s.type} #${s.id}`;
    label.style.fontSize = "11px";
    label.style.color = isShapeSelected ? "var(--ink)" : "var(--muted)";

    objRow.append(bullet, label);
    parent.appendChild(objRow);
  }
  if (dom.deleteGroupBtn) dom.deleteGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.unparentGroupBtn) {
    const g = (state.groups || []).find(gg => Number(gg.id) === Number(state.activeGroupId));
    dom.unparentGroupBtn.disabled = !(g && g.parentId != null);
  }
  if (dom.moveGroupBtn) dom.moveGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.moveGroupOriginOnlyBtn) {
    const active = !!(state.input?.groupOriginPick?.active);
    dom.moveGroupOriginOnlyBtn.disabled = (state.activeGroupId == null);
    dom.moveGroupOriginOnlyBtn.classList.toggle("is-active", active);
    dom.moveGroupOriginOnlyBtn.textContent = active ? "基準点を移動中..." : "基準点を移動";
  }
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.disabled = !(state.tool === "select" && (state.selection?.ids?.length > 0));
  }
  const selIdsForObjMove = new Set((state.selection?.ids || []).map(Number));
  const hasObjectSelectionForMove = state.tool === "select" && (state.shapes || []).some(s => selIdsForObjMove.has(Number(s.id)));
  if (dom.moveSelectedShapesBtn) {
    dom.moveSelectedShapesBtn.disabled = !hasObjectSelectionForMove;
  }
  if (dom.groupRotateSnapInput) {
    const v = Number(state.input?.groupRotate?.snapDeg || 5);
    if (String(v) !== dom.groupRotateSnapInput.value) dom.groupRotateSnapInput.value = String(v);
  }
  if (dom.selectMoveDxInput && (dom.selectMoveDxInput.value == null || dom.selectMoveDxInput.value === "")) {
    dom.selectMoveDxInput.value = "0";
  }
  if (dom.selectMoveDyInput && (dom.selectMoveDyInput.value == null || dom.selectMoveDyInput.value === "")) {
    dom.selectMoveDyInput.value = "0";
  }
  if (dom.vertexMoveDxInput) {
    const v = Number(state.vertexEdit?.moveDx || 0);
    if (String(v) !== dom.vertexMoveDxInput.value) dom.vertexMoveDxInput.value = String(v);
  }
  if (dom.vertexMoveDyInput) {
    const v = Number(state.vertexEdit?.moveDy || 0);
    if (String(v) !== dom.vertexMoveDyInput.value) dom.vertexMoveDyInput.value = String(v);
  }
  if (dom.moveVertexBtn) {
    dom.moveVertexBtn.disabled = !(state.vertexEdit?.selectedVertices?.length > 0);
  }
  if (dom.vertexLinkCoincidentToggle) {
    dom.vertexLinkCoincidentToggle.checked = state.vertexEdit?.linkCoincident !== false;
  }
  if (dom.lineLengthInput) {
    const v = Number(state.lineSettings?.length || 0);
    if (String(v) !== dom.lineLengthInput.value) dom.lineLengthInput.value = String(v);
  }
  if (dom.lineAngleInput) {
    const v = Number(state.lineSettings?.angleDeg || 0);
    if (String(v) !== dom.lineAngleInput.value) dom.lineAngleInput.value = String(v);
  }
  if (dom.applyLineInputBtn) {
    dom.applyLineInputBtn.disabled = !(state.tool === "line" && state.preview?.type === "line");
  }
  if (dom.rectWidthInput) {
    const v = Number(state.rectSettings?.width || 0);
    if (String(v) !== dom.rectWidthInput.value) dom.rectWidthInput.value = String(v);
  }
  if (dom.rectHeightInput) {
    const v = Number(state.rectSettings?.height || 0);
    if (String(v) !== dom.rectHeightInput.value) dom.rectHeightInput.value = String(v);
  }
  if (dom.applyRectInputBtn) {
    dom.applyRectInputBtn.disabled = !(state.tool === "rect" && state.preview?.type === "rect");
  }
  if (dom.circleRadiusInput) {
    const v = Number(state.circleSettings?.radius || 0);
    if (String(v) !== dom.circleRadiusInput.value) dom.circleRadiusInput.value = String(v);
  }
  if (dom.applyCircleInputBtn) {
    dom.applyCircleInputBtn.disabled = !(state.tool === "circle" && state.preview?.type === "circle");
  }
  if (dom.filletRadiusInput) {
    const v = Number(state.filletSettings?.radius || 20);
    if (String(v) !== dom.filletRadiusInput.value) dom.filletRadiusInput.value = String(v);
  }
  if (dom.filletLineModeSelect) {
    const v = (String(state.filletSettings?.lineMode || "trim").toLowerCase() === "split") ? "split" : "trim";
    if (dom.filletLineModeSelect.value !== v) dom.filletLineModeSelect.value = v;
  }
  if (dom.trimNoDeleteToggle) {
    dom.trimNoDeleteToggle.checked = !!state.trimSettings?.noDelete;
  }
  if (dom.applyFilletBtn) {
    const sel = (state.shapes || []).filter(s => new Set((state.selection?.ids || []).map(Number)).has(Number(s.id)));
    const lineCount = sel.filter(s => s.type === "line").length;
    const circleCount = sel.filter(s => s.type === "circle").length;
    const arcCount = sel.filter(s => s.type === "arc").length;
    const okPair = (sel.length === 2) && (
      (lineCount === 2) ||
      (lineCount === 1 && circleCount === 1) ||
      (lineCount === 1 && arcCount === 1) ||
      (arcCount === 2)
    );
    dom.applyFilletBtn.disabled = !(state.tool === "fillet" && okPair);
  }
  if (dom.dlineOffsetInput) {
    const v = Number(state.dlineSettings?.offset || 10);
    if (String(v) !== dom.dlineOffsetInput.value) dom.dlineOffsetInput.value = String(v);
  }
  if (dom.dlineModeSelect) {
    const v = state.dlineSettings?.mode || "both";
    if (dom.dlineModeSelect.value !== v) dom.dlineModeSelect.value = v;
  }
  if (dom.applyDLineBtn) {
    dom.applyDLineBtn.disabled = !(state.tool === "doubleline" && state.dlinePreview && state.dlinePreview.length > 0);
  }
  if (dom.positionSizeInput) {
    const v = Number(state.positionSettings?.size || 20);
    if (String(v) !== dom.positionSizeInput.value) dom.positionSizeInput.value = String(v);
  }
  if (dom.dimLinearMode) dom.dimLinearMode.value = state.dimSettings.linearMode || "single";
  if (dom.dimSnapMode) dom.dimSnapMode.value = state.dimSettings.snapMode || "object";
  if (dom.dimCircleMode) dom.dimCircleMode.value = state.dimSettings.circleMode || "radius";
  if (dom.dimPrecisionSelect) {
    dom.dimPrecisionSelect.value = String(Math.max(0, Math.min(3, Number(state.dimSettings?.precision ?? 1))));
  }
  if (dom.dimTextRotateInput) dom.dimTextRotateInput.value = String(state.dimSettings.textRotate || 0);
  if (dom.dimExtOffsetInput) dom.dimExtOffsetInput.value = String(state.dimSettings.extOffset || 4);
  if (dom.dimExtOverInput) dom.dimExtOverInput.value = String(state.dimSettings.extOver || 4);
  if (dom.dimROvershootInput) dom.dimROvershootInput.value = String(state.dimSettings.rOvershoot || 5);

  const dimChainOps = document.getElementById("dimChainOps");
  if (dimChainOps) {
    dimChainOps.style.display = (state.tool === "dim" && state.dimSettings.linearMode === "chain") ? "block" : "none";
  }

  if (dom.applyDimSettingsBtn) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let hasDim = false;
    for (const s of (state.shapes || [])) {
      if (ids.has(Number(s.id)) && s.type === "dim") { hasDim = true; break; }
    }
    dom.applyDimSettingsBtn.disabled = !hasDim;
  }
  if (dom.previewPrecisionSelect) {
    dom.previewPrecisionSelect.value = String(Math.max(0, Math.min(3, Number(state.previewSettings?.precision ?? 2))));
  }
  if (dom.pageSizeSelect) {
    const v = String(state.pageSetup?.size || "A4");
    if (dom.pageSizeSelect.value !== v) dom.pageSizeSelect.value = v;
  }
  if (dom.pageOrientationSelect) {
    const v = (String(state.pageSetup?.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
    if (dom.pageOrientationSelect.value !== v) dom.pageOrientationSelect.value = v;
  }
  if (dom.pageScaleInput) {
    const v = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
    if (String(v) !== dom.pageScaleInput.value) dom.pageScaleInput.value = String(v);
  }
  if (dom.pageUnitSelect) {
    const v = String(state.pageSetup?.unit || "mm");
    if (dom.pageUnitSelect.value !== v) dom.pageUnitSelect.value = v;
  }
  if (dom.pageShowFrameToggle) {
    dom.pageShowFrameToggle.checked = state.pageSetup?.showFrame !== false;
  }
  if (dom.pageInnerMarginInput) {
    const v = Math.max(0, Number(state.pageSetup?.innerMarginMm ?? 10) || 0);
    if (String(v) !== dom.pageInnerMarginInput.value) dom.pageInnerMarginInput.value = String(v);
  }
}





