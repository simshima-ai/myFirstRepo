export function createToolSwitchOps(config) {
  const {
    state,
    setToolState,
    clearSelection,
    draw,
    updateDimHover,
    hitTestShapes
  } = config || {};

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
    draw();
  }

  return { setToolAction };
}
