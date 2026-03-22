export const SELECTION_STYLE_TARGET_TYPES = new Set(["line", "polyline", "circle", "arc", "position"]);
export const SELECTION_COLOR_TARGET_TYPES = new Set(["line", "polyline", "rect", "circle", "arc", "position", "text", "dim", "dimchain", "dimangle", "circleDim", "hatch"]);
export const SELECTION_DIM_TYPES = new Set(["dim", "dimchain", "dimangle", "dimleader", "circleDim"]);
export const SELECTION_CIRCLE_TYPES = new Set(["circle", "arc"]);

export function collectSelectedShapes(state) {
  const ids = new Set((state?.selection?.ids || []).map(Number).filter(Number.isFinite));
  return ids.size > 0
    ? (state?.shapes || []).filter((s) => ids.has(Number(s?.id)))
    : [];
}

export function summarizeSelectionShapes(selectedShapes) {
  const shapes = Array.isArray(selectedShapes) ? selectedShapes.filter(Boolean) : [];
  const count = shapes.length;
  const isSingle = count === 1;
  const singleShape = isSingle ? shapes[0] || null : null;
  const singleType = String(singleShape?.type || "");
  const types = shapes.map((s) => String(s.type || ""));
  const typeSet = new Set(types);
  const hasAnyType = (...typesToCheck) => types.some((t) => typesToCheck.includes(t));
  const hasOnlyTypes = (...typesToCheck) => count > 0 && types.every((t) => typesToCheck.includes(t));
  const hasType = (type) => typeSet.has(String(type || ""));
  return {
    shapes,
    count,
    isSingle,
    singleShape,
    singleType,
    types,
    typeSet,
    hasAnyType,
    hasOnlyTypes,
    hasType,
    isSingleType: (type) => isSingle && singleType === String(type || ""),
  };
}

export function getSelectionUiRules(state) {
  const selectedShapes = collectSelectedShapes(state);
  const summary = summarizeSelectionShapes(selectedShapes);
  const panelMode = !summary.isSingle
    ? null
    : (summary.singleType === "text" ? "text" : (summary.singleType === "dimleader" ? "leader" : null));
  const hasOnlyDimSelection = summary.hasOnlyTypes(...SELECTION_DIM_TYPES);
  const hasSelectedText = summary.hasType("text");
  return {
    selectedShapes,
    ...summary,
    panelMode,
    showTextEdit: summary.isSingleType("text"),
    showLeaderStyleEdit: summary.isSingleType("dimleader"),
    textShape: summary.isSingleType("text") ? summary.singleShape : null,
    leaderShape: summary.isSingleType("dimleader") ? summary.singleShape : null,
    hasSelectedText,
    showTextToolContext: !summary.count || summary.isSingleType("text"),
    hasOnlyStyleTargetSelection: summary.hasOnlyTypes(...SELECTION_STYLE_TARGET_TYPES),
    hasOnlyColorTargetSelection: summary.hasOnlyTypes(...SELECTION_COLOR_TARGET_TYPES),
    hasOnlyPositionSelection: summary.hasOnlyTypes("position"),
    hasOnlyImageSelection: summary.hasOnlyTypes("image"),
    hasOnlyCircleSelection: summary.hasOnlyTypes(...SELECTION_CIRCLE_TYPES),
    hasOnlyDimSelection,
    hasOnlyNonDimSelection: summary.count > 0 && !hasOnlyDimSelection,
    hasMixedDimSelection: summary.hasAnyType(...SELECTION_DIM_TYPES) && !hasOnlyDimSelection,
    hasOnlyTextSelection: summary.hasOnlyTypes("text"),
    hasOnlyLeaderSelection: summary.hasOnlyTypes("dimleader"),
  };
}

export function getSelectionEditRules(selectedShapes) {
  return summarizeSelectionShapes(selectedShapes);
}

export function getSelectionContextRules(selectedShapes) {
  const rules = summarizeSelectionShapes(selectedShapes);
  const hasSelectedText = rules.hasType("text");
  return {
    ...rules,
    hasSelectedText,
    showTextToolContext: !rules.count || rules.isSingleType("text"),
  };
}
