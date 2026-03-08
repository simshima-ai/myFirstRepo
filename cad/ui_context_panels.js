export function resolveTopActiveContext(state, tool) {
  const selIds = state.selection?.ids || [];
  let selShapeTypeMap = null;
  const getSelShapeTypes = () => {
    if (!selShapeTypeMap) {
      selShapeTypeMap = new Map();
      if (selIds.length > 0) {
        const idSet = new Set(selIds.map(Number));
        for (const s of (state.shapes || [])) {
          if (idSet.has(Number(s.id))) selShapeTypeMap.set(Number(s.id), s.type);
        }
      }
    }
    return selShapeTypeMap;
  };
  const hasSelType = (...types) => {
    const m = getSelShapeTypes();
    for (const t of m.values()) {
      if (types.includes(t)) return true;
    }
    return false;
  };
  const allSelType = (...types) => {
    if (!selIds.length) return false;
    const m = getSelShapeTypes();
    for (const t of m.values()) {
      if (!types.includes(t)) return false;
    }
    return true;
  };

  let activeCtx = "";
  if (tool === "patterncopy") activeCtx = "patterncopy";
  if (tool === "vertex") activeCtx = "vertex";
  if (tool === "line") activeCtx = "line";
  if (tool === "rect") activeCtx = "rect";
  const hasCircleSelected = hasSelType("circle", "arc");
  if (!activeCtx && (tool === "circle" || (tool !== "select" && hasCircleSelected))) activeCtx = "circle";
  const hasPositionSelected = hasSelType("position");
  if (!activeCtx && (tool === "position" || (tool !== "select" && hasPositionSelected))) activeCtx = "position";
  if (!activeCtx && tool === "text") activeCtx = "text";
  const hasDimSelected = hasSelType("dim", "dimchain", "dimangle", "circleDim");
  const hasOnlyDimSelectionGlobal = selIds.length > 0 && allSelType("dim", "dimchain", "dimangle", "circleDim");
  const hasMixedDimSelection = hasDimSelected && !hasOnlyDimSelectionGlobal;
  if (!activeCtx && (tool === "dim" || (tool !== "select" && hasDimSelected))) activeCtx = "dim";
  if (!activeCtx && tool === "fillet") activeCtx = "fillet";
  if (!activeCtx && tool === "trim") activeCtx = "trim";
  if (tool === "settings") activeCtx = "settings";
  if (!activeCtx && tool === "doubleline") activeCtx = "doubleline";

  const hasHatchSelected = hasSelType("hatch");
  if (!activeCtx && (tool === "hatch" || hasHatchSelected)) activeCtx = "hatch";
  if (hasMixedDimSelection) activeCtx = "group";
  if (tool === "select") {
    const hasActiveGroup = state.activeGroupId != null;
    const hasNonDimSelection = selIds.length > 0 && !allSelType("dim", "dimchain", "dimangle", "circleDim");
    const hasOnlyDimSelection = selIds.length > 0 && allSelType("dim", "dimchain", "dimangle", "circleDim");
    if (!activeCtx && (hasNonDimSelection || hasActiveGroup) && !hasOnlyDimSelection) activeCtx = "group";
    if (!activeCtx && hasOnlyDimSelection) activeCtx = "dim";
    if (!activeCtx && hasPositionSelected) activeCtx = "position";
    if (!activeCtx && hasCircleSelected) activeCtx = "circle";
    if (!activeCtx && hasHatchSelected) activeCtx = "hatch";
    if (!activeCtx && !selIds.length && !hasActiveGroup) activeCtx = "select";
  }
  return activeCtx;
}
