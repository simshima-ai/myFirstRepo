export function createClipboardOps(config) {
  const {
    state,
    pushHistory,
    setSelection,
    nextShapeId,
    setStatus,
    draw,
    getEffectiveGridSize,
    filterRootGroupIds,
    duplicateGroupsByRootIds,
    duplicateShapesByIds
  } = config || {};

  function copyActiveGroup(dx, dy) {
    const srcRootId = Number(state.activeGroupId);
    if (!Number.isFinite(srcRootId)) return;
    pushHistory(state);
    const result = duplicateGroupsByRootIds(state, nextShapeId, [srcRootId], dx, dy);
    if (result.newShapeIds.length) setSelection(state, result.newShapeIds);
    if (result.newRootGroupIds.length) {
      state.selection.groupIds = result.newRootGroupIds.slice();
      state.activeGroupId = Number(result.newRootGroupIds[result.newRootGroupIds.length - 1]);
    }
    draw();
  }

  function copySelectedShapes(dx, dy) {
    pushHistory(state);
    const res = duplicateShapesByIds(state, nextShapeId, (state.selection?.ids || []), dx, dy);
    setSelection(state, res.newShapeIds || []);
    state.activeGroupId = null;
    setStatus(`コピー: ${(res.newShapeIds || []).length} 個`);
    draw();
  }

  function copySelectionToClipboard() {
    const selectedGroupIds = filterRootGroupIds((state.selection?.groupIds || []), (state.groups || []));
    const selectedShapeIds = (state.selection?.ids || []).map(Number).filter(Number.isFinite);
    if (!state.ui) state.ui = {};
    if (selectedGroupIds.length > 0) {
      state.ui.clipboard = { kind: "groups", groupIds: selectedGroupIds.slice(), copiedAt: Date.now() };
      setStatus(`コピー: グループ ${selectedGroupIds.length} 個`);
      return;
    }
    if (selectedShapeIds.length > 0) {
      state.ui.clipboard = { kind: "shapes", shapeIds: selectedShapeIds.slice(), copiedAt: Date.now() };
      setStatus(`コピー: オブジェクト ${selectedShapeIds.length} 個`);
      return;
    }
    setStatus("コピー対象がありません");
  }

  function pasteClipboard() {
    const clip = state.ui?.clipboard;
    if (!clip || !clip.kind) {
      setStatus("貼り付け対象がありません");
      return;
    }
    const dx = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    const dy = 0;
    pushHistory(state);
    if (clip.kind === "groups") {
      const roots = filterRootGroupIds((clip.groupIds || []), (state.groups || []));
      const res = duplicateGroupsByRootIds(state, nextShapeId, roots, dx, dy);
      if (res.newShapeIds.length) {
        setSelection(state, res.newShapeIds);
        state.selection.groupIds = (res.newRootGroupIds || []).slice();
        state.activeGroupId = state.selection.groupIds.length
          ? Number(state.selection.groupIds[state.selection.groupIds.length - 1])
          : null;
        setStatus(`貼り付け: グループ ${state.selection.groupIds.length} 個`);
      } else {
        setStatus("貼り付け対象がありません");
      }
      draw();
      return;
    }
    if (clip.kind === "shapes") {
      const res = duplicateShapesByIds(state, nextShapeId, (clip.shapeIds || []), dx, dy);
      if (res.newShapeIds.length) {
        setSelection(state, res.newShapeIds);
        state.activeGroupId = null;
        setStatus(`貼り付け: オブジェクト ${res.newShapeIds.length} 個`);
      } else {
        setStatus("貼り付け対象がありません");
      }
    }
    draw();
  }

  return {
    copyActiveGroup,
    copySelectedShapes,
    copySelectionToClipboard,
    pasteClipboard
  };
}
