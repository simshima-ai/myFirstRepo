export function bindGroupListInitEvents({
  state,
  dom,
  actions,
  refreshUi,
  stopGroupPanelResizeDrag,
  toElementTarget,
  parseDragPayload,
}) {
  if (!dom.groupList) return;

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

  const showLayerRestrictionMessage = (reason) => {
    const lang = String(state.ui?.language || "en").toLowerCase();
    if (reason === "hidden") {
      actions.setStatus?.("Group is hidden.");
      return;
    }
    if (reason === "locked") {
      actions.setStatus?.("Layer is locked.");
      return;
    }
    actions.setStatus?.("Out-of-scope layer.");
  };
  const getLayerMeta = (layerId) => {
    const lid = Number(layerId);
    const layer = (state.layers || []).find((l) => Number(l?.id) === lid);
    return {
      id: lid,
      locked: !!layer?.locked,
    };
  };
  const isEditOnlyActiveLayer = () => !!state.ui?.layerView?.editOnlyActive;
  const isGroupVisibleFromId = (groupId) => {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return true;
    const byId = new Map((state.groups || []).map((g) => [Number(g?.id), g]));
    let cur = byId.get(gid);
    let guard = 0;
    while (cur && guard < 10000) {
      if (cur.visible === false) return false;
      const pid = (cur.parentId == null) ? null : Number(cur.parentId);
      if (!Number.isFinite(pid)) return true;
      cur = byId.get(pid);
      guard += 1;
    }
    return true;
  };
  const resolveShapeGroupId = (shape) => {
    const sid = Number(shape?.id);
    if (!Number.isFinite(sid)) return Number(shape?.groupId);
    for (const g of (state.groups || [])) {
      const shapeIds = Array.isArray(g?.shapeIds) ? g.shapeIds : [];
      if (shapeIds.some((id) => Number(id) === sid)) return Number(g.id);
    }
    return Number(shape?.groupId);
  };
  const getShapePickDenyReason = (shape) => {
    if (!shape) return "outside";
    if (!isGroupVisibleFromId(resolveShapeGroupId(shape))) return "hidden";
    const activeLayerId = Number(state.activeLayerId);
    const lid = Number(shape.layerId ?? activeLayerId);
    const meta = getLayerMeta(lid);
    if (meta.locked) return "locked";
    if (isEditOnlyActiveLayer() && lid !== activeLayerId) return "outside";
    return null;
  };
  const canPickShapeFromGroupPanel = (shapeId) => {
    const sid = Number(shapeId);
    if (!Number.isFinite(sid)) return false;
    const s = (state.shapes || []).find((sh) => Number(sh.id) === sid);
    return getShapePickDenyReason(s) == null;
  };
  const getShapePickDenyReasonFromId = (shapeId) => {
    const sid = Number(shapeId);
    if (!Number.isFinite(sid)) return "outside";
    const s = (state.shapes || []).find((sh) => Number(sh.id) === sid);
    return getShapePickDenyReason(s);
  };
  const canPickGroupFromGroupPanel = (groupId) => {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return false;
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const byParent = new Map();
    for (const g of groups) {
      const pid = g?.parentId == null ? null : Number(g.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(g);
    }
    const groupById = new Map(groups.map((g) => [Number(g.id), g]));
    const root = groupById.get(gid);
    if (!root) return false;
    const q = [gid];
    const seen = new Set();
    while (q.length) {
      const cur = Number(q.shift());
      if (!Number.isFinite(cur) || seen.has(cur)) continue;
      seen.add(cur);
      const g = groupById.get(cur);
      if (!g) continue;
      if (g.visible === false) return false;
      for (const sidRaw of g.shapeIds || []) {
        const sid = Number(sidRaw);
        if (!Number.isFinite(sid)) continue;
        const s = (state.shapes || []).find((sh) => Number(sh.id) === sid);
        if (!s) continue;
        if (getShapePickDenyReason(s) != null) return false;
      }
      for (const child of byParent.get(cur) || []) {
        const cid = Number(child?.id);
        if (Number.isFinite(cid) && !seen.has(cid)) q.push(cid);
      }
    }
    return true;
  };
  const getGroupPickDenyReason = (groupId) => {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return "outside";
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const byParent = new Map();
    for (const g of groups) {
      const pid = g?.parentId == null ? null : Number(g.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(g);
    }
    const groupById = new Map(groups.map((g) => [Number(g.id), g]));
    const root = groupById.get(gid);
    if (!root) return "outside";
    const q = [gid];
    const seen = new Set();
    while (q.length) {
      const cur = Number(q.shift());
      if (!Number.isFinite(cur) || seen.has(cur)) continue;
      seen.add(cur);
      const g = groupById.get(cur);
      if (!g) continue;
      if (g.visible === false) return "hidden";
      for (const sidRaw of g.shapeIds || []) {
        const sid = Number(sidRaw);
        if (!Number.isFinite(sid)) continue;
        const s = (state.shapes || []).find((sh) => Number(sh.id) === sid);
        if (!s) continue;
        const reason = getShapePickDenyReason(s);
        if (reason) return reason;
      }
      for (const child of byParent.get(cur) || []) {
        const cid = Number(child?.id);
        if (Number.isFinite(cid) && !seen.has(cid)) q.push(cid);
      }
    }
    return null;
  };

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
    const visCb = e.target.closest?.("input[data-group-visible]");
    if (visCb) return;
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
      const sid = Number(objRow.dataset.groupShapeRow);
      if (!canPickShapeFromGroupPanel(sid)) {
        showLayerRestrictionMessage(getShapePickDenyReasonFromId(sid));
        return;
      }
      if (e.shiftKey) actions.toggleShapeSelectionById?.(sid);
      else actions.selectShapeById?.(sid);
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
    const visCb = t?.closest?.("input[data-group-visible]");
    if (visCb) {
      const gid = Number(visCb.getAttribute("data-group-visible"));
      if (Number.isFinite(gid)) {
        actions.setGroupVisible?.(gid, !!visCb.checked);
      }
      return;
    }
    const row = t?.closest?.("[data-group-row]");
    if (!row) return;
    const gid = Number(row.dataset.groupRow);
    if (!Number.isFinite(gid)) return;
    if (!canPickGroupFromGroupPanel(gid)) {
      showLayerRestrictionMessage(getGroupPickDenyReason(gid));
      return;
    }
    if (t?.closest?.("button[data-group-toggle]")) return;

    if (groupRowClickTimer) {
      clearTimeout(groupRowClickTimer);
      groupRowClickTimer = null;
    }
    const shiftPressed = !!e.shiftKey;
    if (shiftPressed && typeof actions.toggleGroupSelection === "function") {
      actions.toggleGroupSelection(gid);
      return;
    }
    groupRowClickTimer = setTimeout(() => {
      groupRowClickTimer = null;
      actions.selectGroup(gid);
    }, 220);
  });
  dom.groupList.addEventListener("change", (e) => {
    const t = toElementTarget(e.target);
    const visCb = t?.closest?.("input[data-group-visible]");
    if (!visCb) return;
    const gid = Number(visCb.getAttribute("data-group-visible"));
    if (!Number.isFinite(gid)) return;
    actions.setGroupVisible?.(gid, !!visCb.checked);
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
      if (!canPickShapeFromGroupPanel(sid)) {
        showLayerRestrictionMessage(getShapePickDenyReasonFromId(sid));
        e.preventDefault();
        return;
      }
      if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
      const selectedIds = Array.from(new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite)));
      const multiShapeIds = (selectedIds.length > 1 && selectedIds.includes(sid))
        ? selectedIds.filter((id) => canPickShapeFromGroupPanel(id))
        : [];
      state.ui.groupDragDrop.draggingShapeId = sid;
      state.ui.groupDragDrop.draggingGroupId = null;
      state.ui.groupDragDrop.overGroupId = null;
      state.ui.groupDragDrop.draggingShapeIds = multiShapeIds;
      lastGroupDnDKind = "shape";
      try {
        if (multiShapeIds.length > 1) e.dataTransfer.setData("text/plain", `shapes:${multiShapeIds.join(",")}`);
        else e.dataTransfer.setData("text/plain", `shape:${sid}`);
      } catch (_) {}
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      return;
    }
    const row = t?.closest?.("[data-group-row]");
    if (!row) return;
    const gid = Number(row.dataset.groupRow);
    if (!Number.isFinite(gid)) return;
    if (!canPickGroupFromGroupPanel(gid)) {
      showLayerRestrictionMessage(getGroupPickDenyReason(gid));
      e.preventDefault();
      return;
    }
    if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
    state.ui.groupDragDrop.draggingGroupId = gid;
    state.ui.groupDragDrop.draggingShapeId = null;
    state.ui.groupDragDrop.draggingShapeIds = null;
    state.ui.groupDragDrop.overGroupId = null;
    lastGroupDnDKind = "group";
    try { e.dataTransfer.setData("text/plain", String(gid)); } catch (_) {}
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
    const draggedShapeIds = Array.isArray(payload.shapeIds)
      ? payload.shapeIds.map(Number).filter(Number.isFinite)
      : [];
    actions.debugStatus?.(`drop targetG=${parentId} dragG=${draggedGroupId ?? "null"} dragS=${draggedShapeId ?? "null"}`);
    if (draggedShapeIds.length > 1) {
      actions.moveShapesToGroup?.(draggedShapeIds, parentId);
    } else if (Number.isFinite(draggedShapeId)) {
      actions.moveShapeToGroup?.(draggedShapeId, parentId);
    } else if (Number.isFinite(draggedGroupId)) {
      actions.selectGroup?.(draggedGroupId);
      actions.setActiveGroupParent?.(parentId);
    }
    if (state.ui.groupDragDrop) {
      state.ui.groupDragDrop.draggingGroupId = null;
      state.ui.groupDragDrop.draggingShapeId = null;
      state.ui.groupDragDrop.draggingShapeIds = null;
      state.ui.groupDragDrop.overGroupId = null;
    }
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
    state.ui.groupDragDrop.draggingShapeIds = null;
    state.ui.groupDragDrop.overGroupId = null;
    if (hadAnyDragState) {
      refreshUi(state, dom);
    }
    lastGroupDnDKind = null;
  });
}
