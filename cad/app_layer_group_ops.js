export function createLayerGroupOps(config) {
  const {
    state,
    pushHistory,
    addLayerToState,
    setActiveLayerInState,
    selectGroupById,
    toggleGroupSelectionById,
    cycleLayerMode,
    renameActiveLayer,
    moveSelectionToLayer,
    deleteActiveLayer,
    moveActiveGroupOrder,
    moveActiveLayerOrder,
    setLayerColorize,
    setGroupColorize,
    setEditOnlyActiveLayer,
    renameActiveGroup,
    deleteActiveGroup,
    unparentActiveGroup,
    moveActiveGroup,
    scheduleSaveAppSettings,
    setStatus,
    draw
  } = config || {};

  const toolHelpers = {
    draw: () => draw?.(),
    setStatus: (msg) => setStatus?.(msg),
    pushHistory: () => pushHistory?.(state)
  };

  function addLayerAction(name) {
    pushHistory?.(state);
    const layer = addLayerToState?.(state, name);
    if (layer) setActiveLayerInState?.(state, layer.id);
    if (!state.ui) state.ui = {};
    if (!state.ui.rightPanelCollapsed) state.ui.rightPanelCollapsed = {};
    state.ui.rightPanelCollapsed.layers = false;
    if (!state.ui.panelLayout) state.ui.panelLayout = {};
    state.ui.panelLayout.layerPanelListHeight = 2000;
    setStatus?.(`Layer created: ${layer?.name ?? ""}`.trim());
    draw?.();
  }

  function setActiveLayerAction(id) {
    setActiveLayerInState?.(state, id);
    if (state.ui?.layerView?.editOnlyActive) {
      const activeLayerId = Number(state.activeLayerId);
      const selIds = Array.isArray(state.selection?.ids) ? state.selection.ids : [];
      state.selection.ids = selIds
        .map(Number)
        .filter((sid) => {
          const s = (state.shapes || []).find(sh => Number(sh.id) === sid);
          if (!s) return false;
          return Number(s.layerId ?? activeLayerId) === activeLayerId;
        });
      if (state.selection) state.selection.groupIds = [];
      state.activeGroupId = null;
    }
    draw?.();
  }

  function selectGroupAction(id) {
    selectGroupById?.(state, id);
    draw?.();
  }

  function toggleGroupSelectionAction(id) {
    toggleGroupSelectionById?.(state, id);
    draw?.();
  }

  function cycleLayerModeAction(id) {
    cycleLayerMode?.(state, toolHelpers, id);
    draw?.();
  }

  function renameActiveLayerAction(name) {
    renameActiveLayer?.(state, toolHelpers, name);
    draw?.();
  }

  function moveSelectionToLayerAction() {
    moveSelectionToLayer?.(state, toolHelpers);
    draw?.();
  }

  function deleteActiveLayerAction() {
    deleteActiveLayer?.(state, toolHelpers);
    draw?.();
  }

  function moveActiveGroupOrderAction(direction) {
    moveActiveGroupOrder?.(state, toolHelpers, direction);
  }

  function moveActiveLayerOrderAction(direction) {
    moveActiveLayerOrder?.(state, toolHelpers, direction);
  }

  function setLayerColorizeAction(val) {
    setLayerColorize?.(state, toolHelpers, val);
    draw?.();
  }

  function setGroupColorizeAction(val) {
    setGroupColorize?.(state, toolHelpers, val);
    draw?.();
  }

  function setGroupCurrentLayerOnlyAction(val) {
    if (!state.ui) state.ui = {};
    if (!state.ui.groupView || typeof state.ui.groupView !== "object") state.ui.groupView = {};
    state.ui.groupView.currentLayerOnly = !!val;
    scheduleSaveAppSettings?.();
    draw?.();
  }

  function setEditOnlyActiveLayerAction(val) {
    setEditOnlyActiveLayer?.(state, toolHelpers, val);
    draw?.();
  }

  function renameActiveGroupAction(name) {
    renameActiveGroup?.(state, toolHelpers, name);
    draw?.();
  }

  function deleteActiveGroupAction() {
    deleteActiveGroup?.(state, toolHelpers);
  }

  function unparentActiveGroupAction() {
    unparentActiveGroup?.(state, toolHelpers);
  }

  function moveActiveGroupAction(dx, dy) {
    moveActiveGroup?.(state, toolHelpers, dx, dy);
  }

  return {
    addLayerAction,
    setActiveLayerAction,
    selectGroupAction,
    toggleGroupSelectionAction,
    cycleLayerModeAction,
    renameActiveLayerAction,
    moveSelectionToLayerAction,
    deleteActiveLayerAction,
    moveActiveGroupOrderAction,
    moveActiveLayerOrderAction,
    setLayerColorizeAction,
    setGroupColorizeAction,
    setGroupCurrentLayerOnlyAction,
    setEditOnlyActiveLayerAction,
    renameActiveGroupAction,
    deleteActiveGroupAction,
    unparentActiveGroupAction,
    moveActiveGroupAction
  };
}
