export const TOP_CONTEXT_DEFS = [
  { key: "patterncopy", titleKey: "patterncopy", matches: ({ tool }) => tool === "patterncopy" },
  { key: "vertex", titleKey: "vertex", matches: ({ tool }) => tool === "vertex" },
  { key: "move", titleKey: "move", matches: ({ tool }) => tool === "move" },
  { key: "line", titleKey: "line", matches: ({ tool }) => tool === "line" },
  { key: "rect", titleKey: "rect", matches: ({ tool }) => tool === "rect" },
  { key: "circle", titleKey: "circle", matches: ({ tool, selectionRules, matchRules }) => tool === "circle" || (!matchRules.isSelect && selectionRules.hasOnlyCircleSelection) },
  { key: "position", titleKey: "position", matches: ({ tool, selectionRules, matchRules }) => tool === "position" || (!matchRules.isSelect && selectionRules.hasOnlyPositionSelection) },
  { key: "text", titleKey: "text", matches: ({ tool, selectionRules }) => tool === "text" && selectionRules.showTextToolContext },
  { key: "dim", titleKey: "dim", matches: ({ tool, selectionRules, matchRules }) => {
    if (tool === "dim") return true;
    if (selectionRules.hasOnlyDimSelection) return true;
    if (!matchRules.isSelect && selectionRules.hasAnyType("dim", "dimchain", "dimangle", "circleDim")) return true;
    return false;
  } },
  { key: "fillet", titleKey: "fillet", matches: ({ tool }) => tool === "fillet" },
  { key: "trim", titleKey: "trim", matches: ({ tool }) => tool === "trim" },
  { key: "hatch", titleKey: "hatch", matches: ({ tool, selectionRules, matchRules }) => tool === "hatch" || selectionRules.hasOnlyTypes("hatch") || (!matchRules.isSelect && selectionRules.hasAnyType("hatch")) },
  { key: "importadjust", titleKey: "importadjust", matches: ({ state }) => !!state.ui?.importAdjust?.active },
  { key: "trace", titleKey: "trace", matches: ({ state }) => !!state.ui?.traceImage?.active },
  { key: "group", titleKey: "group", matches: ({ state, matchRules, selectionRules }) => {
    if (matchRules.isEasyMode) return false;
    return matchRules.isSelect && (selectionRules.hasOnlyNonDimSelection || selectionRules.hasOnlyDimSelection || selectionRules.count > 0 || state.activeGroupId != null);
  } },
  { key: "preview", titleKey: "preview", matches: ({ tool }) => tool === "preview" },
  { key: "settings", titleKey: "settings", matches: ({ tool }) => tool === "settings" },
  { key: "doubleline", titleKey: "doubleline", matches: ({ tool }) => tool === "doubleline" },
];

export const GROUP_CONTEXT_TYPE_TITLE_KEYS = {
  polyline: "polyline",
  line: "line",
  circle: "circle",
  arc: "arc",
  position: "position",
  rect: "rectangle",
  image: "image",
  object: "object",
  group: "group",
  aimTarget: "aimTarget",
};

export const SELECTION_EDIT_PANEL_KEYS = {
  text: "text",
  leader: "leader",
};

export function getTopContextMatchRules(state, tool, selectionRules) {
  const isSelect = String(tool || "") === "select";
  const hasCircleSelected = selectionRules.hasAnyType("circle", "arc");
  const hasPositionSelected = selectionRules.hasAnyType("position");
  const hasDimSelected = selectionRules.hasAnyType("dim", "dimchain", "dimangle", "circleDim");
  const hasHatchSelected = selectionRules.hasAnyType("hatch");
  const hasOnlyDimSelection = selectionRules.hasOnlyTypes("dim", "dimchain", "dimangle", "circleDim");
  return {
    isSelect,
    hasCircleSelected,
    hasPositionSelected,
    hasDimSelected,
    hasHatchSelected,
    hasOnlyDimSelection,
    isEasyMode: String(state.ui?.displayMode || "cad").toLowerCase() === "easy",
  };
}

export function resolveTopContextKey(state, tool, selectionRules) {
  const matchRules = getTopContextMatchRules(state, tool, selectionRules);
  for (const def of TOP_CONTEXT_DEFS) {
    if (typeof def.matches === "function" && def.matches({ state, tool, selectionRules, matchRules })) {
      return def.key;
    }
  }
  return "";
}
