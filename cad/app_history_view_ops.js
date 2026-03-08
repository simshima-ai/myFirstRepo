export function createHistoryViewOps(config) {
  const {
    state,
    stateUndo,
    stateRedo,
    setToolState,
    resetView,
    setStatus,
    draw,
    getResetViewFlashTimer,
    setResetViewFlashTimer
  } = config || {};

  function undoAction() {
    if (stateUndo(state)) {
      if (!state.ui) state.ui = {};
      state.ui._needsTangentResolve = true;
      setStatus("Undo");
      draw();
      return;
    }
    setStatus("Nothing to undo");
    draw();
  }

  function redoAction() {
    if (stateRedo(state)) {
      if (!state.ui) state.ui = {};
      state.ui._needsTangentResolve = true;
      setStatus("Redo");
      draw();
      return;
    }
    setStatus("Nothing to redo");
    draw();
  }

  function resetViewAction() {
    resetView();
    if (!state.ui) state.ui = {};
    state.ui.flashAction = {
      id: "resetView",
      until: Date.now() + 1000,
    };
    const prevTimer = getResetViewFlashTimer?.();
    if (prevTimer) clearTimeout(prevTimer);
    const timer = setTimeout(() => {
      if (!state.ui) state.ui = {};
      state.ui.flashAction = null;
      setToolState(state, "select");
      draw();
    }, 1000);
    setResetViewFlashTimer?.(timer);
    draw();
  }

  function refitViewToPageAction() {
    // Refit without switching tool; safe for settings panel interactions.
    resetView();
    draw();
  }

  return {
    undoAction,
    redoAction,
    resetViewAction,
    refitViewToPageAction
  };
}
