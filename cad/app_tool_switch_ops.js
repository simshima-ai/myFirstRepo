export function createToolSwitchOps(config) {
  const {
    state,
    setToolState,
    clearSelection,
    draw,
    updateDimHover,
    hitTestShapes,
    focusRectToolWidthInput,
    focusSelectMoveInput
  } = config || {};

  function focusSelectMoveAction() {
    if (!state.ui || typeof state.ui !== "object") state.ui = {};
    state.ui.pendingFocusSelectMoveInput = true;
    if (typeof focusSelectMoveInput === "function") focusSelectMoveInput();
  }

  function setToolAction(t) {
    const prevTool = String(state.tool || "");
    const nextTool = String(t || "");
    const isTouchMode = !!state.ui?.touchMode;
    const leavingHatchInTouch = isTouchMode && prevTool === "hatch" && nextTool !== "hatch";
    setToolState(state, t);
    if (leavingHatchInTouch) {
      if (!state.hatchDraft || typeof state.hatchDraft !== "object") state.hatchDraft = { boundaryIds: [] };
      state.hatchDraft.boundaryIds = [];
      clearSelection(state);
      state.activeGroupId = null;
    }
    // Entering dimension tool used to run an immediate heavy hover scan here.
    // Defer it to next frame so tool-button response stays consistent with other tools.
    if (t === "dim") {
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => {
          if (String(state.tool || "") !== "dim") return;
          const hwRaw = state.input?.hover?.world || state.input?.hoverWorld || { x: 0, y: 0 };
          const hw = (Number.isFinite(Number(hwRaw?.x)) && Number.isFinite(Number(hwRaw?.y)))
            ? hwRaw
            : (state.input?.hover?.world || state.input?.hoverWorld || { x: 0, y: 0 });
          state.input.hoverWorld = { x: Number(hw.x), y: Number(hw.y) };
          updateDimHover(state, hw, hw, { setStatus: null, hitTestShapes });
          if (!state.input.objectSnapHover) {
            state.input.objectSnapHover = { x: Number(hw.x), y: Number(hw.y), kind: "nearest" };
          }
          draw();
        });
      }
    }
    if (t === "rect" && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (String(state.tool || "") !== "rect") return;
        if (typeof focusRectToolWidthInput === "function") focusRectToolWidthInput();
      });
    }
    if (t === "select" && typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (String(state.tool || "") !== "select") return;
        const hasObjectSelection = Array.isArray(state.selection?.ids) && state.selection.ids.length > 0;
        if (!hasObjectSelection) return;
        focusSelectMoveAction();
      });
    }
    draw();
  }

  return { setToolAction, focusSelectMoveInput: focusSelectMoveAction };
}
