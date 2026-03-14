let _groupListRenderSignature = "";
let _inAnyGroupCacheSig = "";
let _inAnyGroupCache = null;
let _unGroupedShapesCacheSig = "";
let _unGroupedShapesCache = null;

export function refreshGroupListPanel(state, dom, panelText, getUiLanguage, getMaxGroupPanelHeight) {
  if (dom.groupList) {
    const selectedShapeIdSet = new Set((state.selection?.ids || []).map(Number));
    const selectedGroupIdSet = new Set((state.selection?.groupIds || []).map(Number));
    if (!selectedGroupIdSet.size && state.activeGroupId != null) selectedGroupIdSet.add(Number(state.activeGroupId));
    const showCurrentLayerOnly = !!state.ui?.groupView?.currentLayerOnly;
    const activeLayerId = Number(state.activeLayerId);
    const shapeByIdFast = new Map((state.shapes || []).map(s => [Number(s.id), s]));
    const isShapeInActiveLayer = (shape) => {
      if (!shape) return false;
      const lid = Number(shape.layerId ?? activeLayerId);
      return Number.isFinite(lid) && lid === activeLayerId;
    };
    const isShapeInActiveLayerById = (sid) => isShapeInActiveLayer(shapeByIdFast.get(Number(sid)));
    const groups = (state.groups || []).map(g => ({ ...g, parentId: g.parentId == null ? null : Number(g.parentId) }));
    const groupsById = new Map(groups.map(g => [Number(g.id), g]));
    const byParent = new Map();
    for (const g of groups) {
      const pid = g.parentId == null ? null : Number(g.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(g);
    }
    const activeGroupShapeIdSet = new Set();
    for (const selectedGroupId of selectedGroupIdSet) {
      const stack = [Number(selectedGroupId)];
      const seen = new Set();
      while (stack.length) {
        const gid = Number(stack.pop());
        if (!Number.isFinite(gid) || seen.has(gid)) continue;
        seen.add(gid);
        const g = groupsById.get(gid);
        if (!g) continue;
        for (const sid of (g.shapeIds || [])) activeGroupShapeIdSet.add(Number(sid));
        const children = byParent.get(gid) || [];
        for (const ch of children) stack.push(Number(ch.id));
      }
    }
    // Groups are displayed in state.groups array order (no sorting)
    if (!state.ui.groupTreeExpanded) state.ui.groupTreeExpanded = {};
    const groupSubtreeLayerMatchMemo = new Map();
    const hasLayerMatchInGroupSubtree = (groupId) => {
      const gid = Number(groupId);
      if (groupSubtreeLayerMatchMemo.has(gid)) return !!groupSubtreeLayerMatchMemo.get(gid);
      const g = groupsById.get(gid);
      if (!g) {
        groupSubtreeLayerMatchMemo.set(gid, false);
        return false;
      }
      const ownMatch = (g.shapeIds || []).some((sid) => isShapeInActiveLayerById(sid));
      let childMatch = false;
      for (const ch of (byParent.get(gid) || [])) {
        if (hasLayerMatchInGroupSubtree(ch.id)) {
          childMatch = true;
          break;
        }
      }
      const matched = ownMatch || childMatch;
      groupSubtreeLayerMatchMemo.set(gid, matched);
      return matched;
    };
    const isEmptyLeafGroup = (groupId) => {
      const gid = Number(groupId);
      const g = groupsById.get(gid);
      if (!g) return false;
      const ownCount = Array.isArray(g.shapeIds) ? g.shapeIds.length : 0;
      const childCount = (byParent.get(gid) || []).length;
      return ownCount === 0 && childCount === 0;
    };
    const rows = [];
    const visited = new Set();
    const walk = (pid, depth) => {
      const children = byParent.get(pid) || [];
      for (const g of children) {
        const gid = Number(g.id);
        if (visited.has(gid)) continue;
        visited.add(gid);
        if (showCurrentLayerOnly && !hasLayerMatchInGroupSubtree(gid) && !isEmptyLeafGroup(gid)) continue;
        const childGroups = byParent.get(gid) || [];
        const visibleShapeIds = showCurrentLayerOnly
          ? (g.shapeIds || []).filter((sid) => isShapeInActiveLayerById(sid))
          : (Array.isArray(g.shapeIds) ? g.shapeIds : []);
        const hasChildGroups = showCurrentLayerOnly
          ? childGroups.some((ch) => hasLayerMatchInGroupSubtree(ch.id))
          : childGroups.length > 0;
        const hasShapes = visibleShapeIds.length > 0;
        rows.push({ group: g, depth, hasChildren: (hasChildGroups || hasShapes), visibleShapeCount: visibleShapeIds.length });
        const expanded = state.ui.groupTreeExpanded[Number(g.id)] !== false;
        if (expanded) walk(gid, depth + 1);
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
      const gid = Number(g.id);
      if (showCurrentLayerOnly && !hasLayerMatchInGroupSubtree(gid) && !isEmptyLeafGroup(gid)) continue;
      const childGroups = byParent.get(gid) || [];
      const visibleShapeIds = showCurrentLayerOnly
        ? (g.shapeIds || []).filter((sid) => isShapeInActiveLayerById(sid))
        : (Array.isArray(g.shapeIds) ? g.shapeIds : []);
      const hasChildGroups = showCurrentLayerOnly
        ? childGroups.some((ch) => hasLayerMatchInGroupSubtree(ch.id))
        : childGroups.length > 0;
      const hasShapes = visibleShapeIds.length > 0;
      rows.push({ group: g, depth: 0, hasChildren: (hasChildGroups || hasShapes), visibleShapeCount: visibleShapeIds.length });
    }
    // Also account for shapes not in any group.
    // Cache inAnyGroup to avoid O(totalShapeIds) rebuild on every refreshUi when groups haven't changed.
    const inAnyGroupQuickSig = groups.map(g => `${Number(g.id)}:${(g.shapeIds || []).length}`).join(",");
    if (_inAnyGroupCacheSig !== inAnyGroupQuickSig || _inAnyGroupCache === null) {
      _inAnyGroupCacheSig = inAnyGroupQuickSig;
      _inAnyGroupCache = new Set();
      for (const g of groups) {
        for (const sid of (g.shapeIds || [])) _inAnyGroupCache.add(Number(sid));
      }
    }
    const inAnyGroup = _inAnyGroupCache;
    // Also cache unGroupedShapes using shapes count + inAnyGroup sig as key
    const unGroupedSig = `${inAnyGroupQuickSig}|${(state.shapes || []).length}`;
    if (_unGroupedShapesCacheSig !== unGroupedSig || _unGroupedShapesCache === null) {
      _unGroupedShapesCacheSig = unGroupedSig;
      _unGroupedShapesCache = (state.shapes || []).filter(s => !inAnyGroup.has(Number(s.id)));
    }
    const unGroupedShapes = showCurrentLayerOnly
      ? _unGroupedShapesCache.filter((s) => isShapeInActiveLayer(s))
      : _unGroupedShapesCache;

    const groupListSig = [
      String(getUiLanguage(state)),
      String(state.activeGroupId ?? ""),
      (state.selection?.ids || []).map(Number).sort((a, b) => a - b).join(","),
      (state.selection?.groupIds || []).map(Number).sort((a, b) => a - b).join(","),
      String(state.ui?.groupDragDrop?.draggingGroupId ?? ""),
      String(state.ui?.groupDragDrop?.draggingShapeId ?? ""),
      String(state.ui?.groupDragDrop?.overGroupId ?? ""),
      String(showCurrentLayerOnly ? 1 : 0),
      String(activeLayerId),
      rows.map(({ group, depth, visibleShapeCount }) => {
        const gid = Number(group.id);
        const expanded = state.ui.groupTreeExpanded[gid] !== false ? 1 : 0;
        const visible = group.visible !== false ? 1 : 0;
        const sids = `${visibleShapeCount}`;
        return `${gid}:${depth}:${expanded}:${visible}:${String(group.name || "")}:${String(group.parentId ?? "")}:${sids}`;
      }).join("|"),
      // Use count + first ID as cheap proxy to avoid O(n) string for large ungrouped sets
      `${unGroupedShapes.length}:${Number(unGroupedShapes[0]?.id ?? -1)}`,
    ].join("::");

    if (_groupListRenderSignature !== groupListSig) {
      _groupListRenderSignature = groupListSig;
      // Build shapeById map only when DOM actually needs updating
      const shapeById = new Map((state.shapes || []).map(s => [Number(s.id), s]));
      dom.groupList.innerHTML = "";
      if (rows.length === 0 && unGroupedShapes.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = panelText.noObjects;
      empty.style.color = "var(--muted)";
      empty.style.fontSize = "12px";
      empty.style.padding = "4px 2px";
      dom.groupList.appendChild(empty);
      }

      for (const { group, depth, hasChildren, visibleShapeCount } of rows) {
      const row = document.createElement("div");
      row.dataset.groupRow = String(group.id);
      row.draggable = true;
      row.style.display = "flex";
      row.style.gap = "4px";
      row.style.alignItems = "center";
      const isActiveGroup = Number(group.id) === Number(state.activeGroupId);
      const isSelectedGroup = selectedGroupIdSet.has(Number(group.id));
      row.style.border = isActiveGroup
        ? "1px solid rgba(37,99,235,0.42)"
        : (isSelectedGroup ? "1px solid rgba(96,165,250,0.45)" : "1px solid rgba(148,163,184,0.22)");
      row.style.background = isActiveGroup
        ? "rgba(219,234,254,0.7)"
        : (isSelectedGroup ? "rgba(239,246,255,0.78)" : "rgba(255,255,255,0.65)");
      const overGroupId = Number(state.ui?.groupDragDrop?.overGroupId);
      const draggingGroupId = Number(state.ui?.groupDragDrop?.draggingGroupId);
      if (Number.isFinite(overGroupId) && overGroupId === Number(group.id) && draggingGroupId !== Number(group.id)) {
        row.style.border = "1px solid rgba(22,163,74,0.45)";
        row.style.background = "rgba(220,252,231,0.72)";
      }
      row.style.borderRadius = "8px";
      row.style.padding = "3px 4px";
      const nameWrap = document.createElement("div");
      nameWrap.style.display = "flex";
      nameWrap.style.alignItems = "center";
      nameWrap.style.gap = "4px";
      nameWrap.style.paddingLeft = `${depth * 12}px`;
      const treeBtn = document.createElement("button");
      treeBtn.type = "button";
      treeBtn.dataset.groupToggle = String(group.id);
      treeBtn.style.width = "22px";
      treeBtn.style.minWidth = "22px";
      treeBtn.style.padding = "0";
      treeBtn.style.border = "none";
      treeBtn.style.background = "transparent";
      treeBtn.style.boxShadow = "none";
      treeBtn.style.color = "#64748b";
      treeBtn.style.display = "inline-flex";
      treeBtn.style.alignItems = "center";
      treeBtn.style.justifyContent = "center";
      treeBtn.style.lineHeight = "1";
      treeBtn.style.visibility = hasChildren ? "visible" : "hidden";
      const expanded = state.ui.groupTreeExpanded[Number(group.id)] !== false;
      treeBtn.innerHTML = hasChildren
        ? (expanded
          ? '<svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4h8L6 8z" fill="currentColor"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2v8l4-4z" fill="currentColor"/></svg>')
        : "";
      const name = document.createElement("div");
      name.textContent = `${group.name}`;
      const groupHasSelectedObject = (!selectedGroupIdSet.size)
        && (group.shapeIds || []).some(sid => selectedShapeIdSet.has(Number(sid)));
      name.style.color = groupHasSelectedObject ? "#16a34a" : "var(--muted)";
      name.style.fontWeight = isActiveGroup ? "600" : "400";
      if (group.visible === false) {
        name.style.opacity = "0.55";
      }
      name.style.fontSize = "11px";
      name.style.flex = "1";
      row.style.cursor = "pointer";
      row.title = isActiveGroup ? panelText.active : panelText.clickToSelect;
      nameWrap.append(treeBtn, name);
      const visWrap = document.createElement("label");
      visWrap.style.display = "inline-flex";
      visWrap.style.alignItems = "center";
      visWrap.style.gap = "4px";
      visWrap.style.marginLeft = "auto";
      visWrap.style.cursor = "pointer";
      visWrap.title = (group.visible === false) ? panelText.showGroup : panelText.hideGroup;
      visWrap.addEventListener("click", (ev) => ev.stopPropagation());
      visWrap.addEventListener("mousedown", (ev) => ev.stopPropagation());
      const visCb = document.createElement("input");
      visCb.type = "checkbox";
      visCb.setAttribute("data-group-visible", String(group.id));
      visCb.checked = group.visible !== false;
      visCb.style.margin = "0";
      visCb.addEventListener("click", (ev) => ev.stopPropagation());
      visCb.addEventListener("mousedown", (ev) => ev.stopPropagation());
      visWrap.append(visCb);
      row.append(nameWrap, visWrap);
      dom.groupList.appendChild(row);

      // Show child objects when this group is expanded.
      // Cap to MAX_GROUP_ROWS to avoid DOM explosion with large groups.
      if (expanded) {
        const MAX_GROUP_ROWS = 200;
        const shapeIds = Array.isArray(group.shapeIds) ? group.shapeIds : [];
        const visibleShapeIds = showCurrentLayerOnly
          ? shapeIds.filter((sid) => isShapeInActiveLayerById(sid))
          : shapeIds;
        const limit = Math.min(visibleShapeIds.length, MAX_GROUP_ROWS);
        for (let i = 0; i < limit; i++) {
          const s = shapeById.get(Number(visibleShapeIds[i]));
          if (!s) continue;
          renderShapeRow(dom.groupList, s, depth + 1, group.id, activeGroupShapeIdSet, selectedShapeIdSet);
        }
        if (visibleShapeIds.length > MAX_GROUP_ROWS) {
          const more = document.createElement("div");
          more.style.cssText = "padding:2px 8px 2px 24px;font-size:10px;color:var(--muted);";
          more.textContent = `...and ${visibleShapeIds.length - MAX_GROUP_ROWS} more`;
          dom.groupList.appendChild(more);
        }
      }
      }

      // Render Ungrouped section after groups so newly created groups stay at top.
      if (unGroupedShapes.length > 0) {
      // Add separator if there are also groups
      if (rows.length > 0) {
        const sep = document.createElement("div");
        sep.style.height = "1px";
        sep.style.background = "rgba(148,163,184,0.1)";
        sep.style.margin = "4px 8px";
        dom.groupList.appendChild(sep);
      }

      const unGroupHeader = document.createElement("div");
      unGroupHeader.style.display = "grid";
      unGroupHeader.style.gridTemplateColumns = "20px 1fr";
      unGroupHeader.style.gap = "4px";
      unGroupHeader.style.alignItems = "center";
      unGroupHeader.style.padding = "3px 4px";
      unGroupHeader.style.color = "var(--muted)";
      unGroupHeader.style.fontSize = "12px";
      unGroupHeader.style.fontWeight = "600";

      const icon = document.createElement("div");
      icon.textContent = "*";
      icon.style.textAlign = "center";
      const name = document.createElement("div");
      name.textContent = `${panelText.ungrouped} (${unGroupedShapes.length})`;
      unGroupHeader.append(icon, name);
      dom.groupList.appendChild(unGroupHeader);

        const MAX_UNGROUPED_ROWS = 200;
        const ugLimit = Math.min(unGroupedShapes.length, MAX_UNGROUPED_ROWS);
        for (let i = 0; i < ugLimit; i++) {
          renderShapeRow(dom.groupList, unGroupedShapes[i], 1, null, activeGroupShapeIdSet, selectedShapeIdSet);
        }
        if (unGroupedShapes.length > MAX_UNGROUPED_ROWS) {
          const more = document.createElement("div");
          more.style.cssText = "padding:2px 8px 2px 16px;font-size:10px;color:var(--muted);";
          more.textContent = `...and ${unGroupedShapes.length - MAX_UNGROUPED_ROWS} more`;
          dom.groupList.appendChild(more);
        }
      }
    }

    // Auto-grow group panel upward when expanded content no longer fits.
    // Cap by drawing area height so it never grows beyond the main viewport.
    const groupsSectionAuto = document.querySelector(".right-stack .section[data-panel-id='groups']");
    const groupsCollapsed = !!state.ui?.rightPanelCollapsed?.groups;
    if (groupsSectionAuto && !groupsCollapsed) {
      const listEl = dom.groupList;
      const currentListH = Math.max(0, listEl.clientHeight || 0);
      const neededListH = Math.max(0, listEl.scrollHeight || 0);
      let chromeH = 0;
      for (const child of Array.from(groupsSectionAuto.children || [])) {
        if (!(child instanceof HTMLElement)) continue;
        if (child === listEl) continue;
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
      // Keep extra bottom slack so the last row is never visually clipped.











    }
  }

  function renderShapeRow(parent, s, depth, ownerGroupId, activeGroupShapeIdSet, selectedShapeIdSetArg = null) {
    const objRow = document.createElement("div");
    objRow.dataset.groupShapeRow = String(s.id);
    if (ownerGroupId != null) objRow.dataset.ownerGroupId = String(ownerGroupId);
    objRow.style.display = "grid";
    objRow.draggable = true;
    objRow.style.gridTemplateColumns = "auto 1fr";
    objRow.style.gap = "4px";
    objRow.style.alignItems = "center";
    objRow.style.border = "1px dashed rgba(148,163,184,0.20)";
    objRow.style.borderRadius = "8px";
    objRow.style.padding = "2px 4px";
    const selectedSet = selectedShapeIdSetArg || new Set((state.selection?.ids || []).map(Number));
    const isShapeSelected = selectedSet.has(Number(s.id));
    const inActiveGroupSelection = !!activeGroupShapeIdSet?.has?.(Number(s.id));
    const isDirectObjectSelection = isShapeSelected && !inActiveGroupSelection;
    objRow.style.background = isDirectObjectSelection
      ? "rgba(254,215,170,0.72)"
      : "rgba(255,255,255,0.50)";
    if (isDirectObjectSelection) {
      objRow.style.border = "1px solid rgba(249,115,22,0.45)";
    }
    objRow.style.marginLeft = `${depth * 12}px`;
    objRow.style.cursor = "pointer";
    objRow.title = panelText.clickToSelectObject;

    const bullet = document.createElement("div");
    bullet.textContent = "*";
    bullet.style.color = "var(--muted)";
    bullet.style.fontSize = "12px";
    bullet.style.lineHeight = "1";

    const label = document.createElement("div");
    const lang = typeof getUiLanguage === "function" ? getUiLanguage(state) : String(state.ui?.language || "en");
    const isJa = String(lang || "en").toLowerCase().startsWith("ja");
    const typeLabelMap = isJa
      ? {
          line: "\u30e9\u30a4\u30f3",
          rect: "\u77e9\u5f62",
          circle: "\u5186",
          arc: "\u5186\u5f27",
          dim: "\u5bf8\u6cd5",
          dimchain: "\u9023\u7d9a\u5bf8\u6cd5",
          dimangle: "\u89d2\u5ea6\u5bf8\u6cd5",
          position: "\u4f4d\u7f6e",
          text: "\u6587\u5b57",
          hatch: "\u30cf\u30c3\u30c1\u30f3\u30b0",
          dline: "\u8907\u7dda",
        }
      : {
          line: "Line",
          rect: "Rect",
          circle: "Circle",
          arc: "Arc",
          dim: "Dim",
          dimchain: "DimChain",
          dimangle: "DimAngle",
          position: "Position",
          text: "Text",
          hatch: "Hatching",
          dline: "DLine",
        };
    label.textContent = `${typeLabelMap[s.type] || s.type} #${s.id}`;
    label.style.fontSize = "11px";
    label.style.color = inActiveGroupSelection ? "#16a34a" : (isShapeSelected ? "var(--ink)" : "var(--muted)");

    objRow.append(bullet, label);
    parent.appendChild(objRow);
  }

}
