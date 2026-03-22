import { getSelectionUiRules } from "./ui_selection_rules.js";
import { resolveTopContextKey } from "./ui_context_catalog.js";

export function resolveTopActiveContext(state, tool) {
  const isEasyMode = String(state.ui?.displayMode || "cad").toLowerCase() === "easy";
  if (state.ui?.importAdjust?.active) return "importadjust";
  if (String(tool || "") === "doubleline") return "doubleline";

  const selectionRules = getSelectionUiRules(state);
  const key = resolveTopContextKey(state, tool, selectionRules);
  if (key) return key;

  if (String(tool || "") === "select") {
    if (isEasyMode) return "";
    const hasActiveGroup = state.activeGroupId != null;
    if (!selectionRules.count && !hasActiveGroup) return "select";
    if (selectionRules.hasOnlyDimSelection) return "dim";
    if (selectionRules.hasOnlyPositionSelection) return "position";
    if (selectionRules.hasOnlyCircleSelection) return "circle";
    if (selectionRules.hasOnlyTextSelection) return "text";
    if (selectionRules.hasOnlyImageSelection) return "";
    return hasActiveGroup || selectionRules.count > 0 ? "group" : "select";
  }

  return "";
}
