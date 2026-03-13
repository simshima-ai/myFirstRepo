export function refreshGroupContext(state, dom, panelLang) {
  const groupsPanelVisible = state.ui?.panelVisibility?.groupsPanel !== false;
  if (!groupsPanelVisible && state.ui?.selectPickMode === "group") {
    state.ui.selectPickMode = "object";
    state.activeGroupId = null;
  }
  const pickMode = String(state.ui?.selectPickMode || "object");
  if (dom.selectPickObjectBtn) {
    const on = pickMode === "object";
    dom.selectPickObjectBtn.classList.toggle("active", on);
    dom.selectPickObjectBtn.style.fontWeight = on ? "700" : "400";
  }
  if (dom.selectPickGroupBtn) {
    dom.selectPickGroupBtn.style.display = groupsPanelVisible ? "" : "none";
    const on = pickMode === "group";
    dom.selectPickGroupBtn.classList.toggle("active", on);
    dom.selectPickGroupBtn.style.fontWeight = on ? "700" : "400";
  }

  const groupCtxObjectOps = document.getElementById("groupCtxObjectOps");
  const groupCtxGroupOps = document.getElementById("groupCtxGroupOps");
  const groupCtxTitle = document.getElementById("groupCtxTitle");
  const mergeGroupsRow = document.getElementById("mergeGroupsRow");
  const lineCircleMoveOps = document.getElementById("lineCircleMoveOps");
  const selectionStyleOps = document.getElementById("selectionStyleOps");
  const selectionColorOps = document.getElementById("selectionColorOps");
  const selectionPositionOps = document.getElementById("selectionPositionOps");
  const selectionImageOps = document.getElementById("selectionImageOps");
  const selectionCircleOps = document.getElementById("selectionCircleOps");
  const groupRelativeMoveOps = document.getElementById("groupRelativeMoveOps");
  const dimMergeGroupsRow = document.getElementById("dimMergeGroupsRow");
  if (groupCtxObjectOps || groupCtxGroupOps) {
    const selectedCount = (state.selection?.ids || []).length;
    const hasObjectSelection = selectedCount > 0;
    const hasActiveGroup = state.activeGroupId != null;
    const aimPickActive = !!(state.input?.groupAimPick?.active)
      && Number(state.input?.groupAimPick?.groupId) === Number(state.activeGroupId);
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selectedShapes = selIds.size > 0 ? (state.shapes || []).filter(s => selIds.has(Number(s.id))) : [];
    const styleTargetTypes = new Set(["line", "polyline", "circle", "arc", "position"]);
    const colorTargetTypes = new Set(["line", "polyline", "rect", "circle", "arc", "position", "text", "dim", "dimchain", "dimangle", "circleDim", "hatch"]);
    const hasOnlyStyleTargetSelection = selectedShapes.length > 0
      && selectedShapes.every(s => styleTargetTypes.has(String(s.type || "")));
    const hasOnlyColorTargetSelection = selectedShapes.length > 0
      && selectedShapes.every(s => colorTargetTypes.has(String(s.type || "")));
    const hasOnlyPositionSelection = selectedShapes.length > 0
      && selectedShapes.every(s => String(s.type || "") === "position");
    const hasOnlyImageSelection = selectedShapes.length > 0
      && selectedShapes.every(s => String(s.type || "") === "image");
    const hasOnlyCircleSelection = selectedShapes.length > 0
      && selectedShapes.every(s => {
        const t = String(s.type || "");
        return t === "circle" || t === "arc";
      });
    const hasOnlyDimSelection = selectedShapes.length > 0
      && selectedShapes.every(s => s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim");
    if (groupCtxTitle) {
      let title = panelLang === "en" ? "Group" : "Group";
      if (aimPickActive) {
        title = panelLang === "en" ? "Aim Target" : "Aim Target";
      } else if (hasActiveGroup) {
        title = panelLang === "en" ? "Group" : "Group";
      } else if (selectedShapes.length === 1) {
        const t = String(selectedShapes[0]?.type || "");
        if (t === "polyline") title = panelLang === "en" ? "Polyline" : "Polyline";
        if (t === "line") title = panelLang === "en" ? "Line" : "Line";
        else if (t === "circle") title = panelLang === "en" ? "Circle" : "Circle";
        else if (t === "arc") title = panelLang === "en" ? "Arc" : "Arc";
        else if (t === "position") title = panelLang === "en" ? "Position" : "Position";
        else if (t === "rect") title = panelLang === "en" ? "Rectangle" : "Rectangle";
        else if (t === "image") title = panelLang === "en" ? "Image" : "Image";
        else title = panelLang === "en" ? "Object" : "Object";
      } else if (selectedShapes.length >= 2) {
        title = panelLang === "en" ? "Object" : "Object";
      }
      groupCtxTitle.textContent = title;
    }
    const showObjectOps = hasObjectSelection && !aimPickActive;
    if (groupCtxObjectOps) groupCtxObjectOps.style.display = showObjectOps ? "flex" : "none";
    if (groupCtxGroupOps) groupCtxGroupOps.style.display = hasActiveGroup ? "flex" : "none";
    if (lineCircleMoveOps) lineCircleMoveOps.style.display = hasOnlyStyleTargetSelection ? "grid" : "none";
    if (selectionStyleOps) selectionStyleOps.style.display = hasOnlyStyleTargetSelection ? "grid" : "none";
    if (selectionColorOps) selectionColorOps.style.display = hasOnlyColorTargetSelection ? "grid" : "none";
    if (selectionPositionOps) selectionPositionOps.style.display = hasOnlyPositionSelection ? "grid" : "none";
    if (selectionImageOps) selectionImageOps.style.display = hasOnlyImageSelection ? "grid" : "none";
    if (selectionCircleOps) selectionCircleOps.style.display = hasOnlyCircleSelection ? "flex" : "none";
    if (mergeGroupsRow) mergeGroupsRow.style.display = (!hasActiveGroup && selectedCount >= 2) ? "flex" : "none";
    if (dimMergeGroupsRow) dimMergeGroupsRow.style.display = (state.tool === "select" && !hasActiveGroup && selectedCount >= 2 && hasOnlyDimSelection) ? "flex" : "none";
    if (groupRelativeMoveOps) {
      groupRelativeMoveOps.style.display = (showObjectOps && !aimPickActive) ? "grid" : "none";
    }
    if (groupCtxObjectOps && groupCtxGroupOps) {
      groupCtxGroupOps.style.order = "0";
      groupCtxObjectOps.style.order = "1";
    }
  }
}

