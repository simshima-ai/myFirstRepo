export const DEFAULT_PANEL_VISIBILITY = {
  sidebar: true,
  snapPanel: true,
  attrPanel: true,
  createToolsPanel: true,
  editToolsPanel: true,
  fileToolsPanel: true,
  topContext: true,
  rightPanels: true,
  groupsPanel: true,
  layersPanel: true,
  topOverlay: true,
  statusOverlay: true,
  scaleOverlay: true,
  debugConsole: true,
  touchConfirmOverlay: true,
  touchMultiSelectOverlay: true,
  touchSelectBackOverlay: true,
};

const PANEL_KEY_ALIASES = {
  snap: "snapPanel",
  attrs: "attrPanel",
  tools: "createToolsPanel",
  editTools: "editToolsPanel",
  fileTools: "fileToolsPanel",
  groups: "groupsPanel",
  layers: "layersPanel",
  overlay: "topOverlay",
  status: "statusOverlay",
  scale: "scaleOverlay",
  debug: "debugConsole",
  touchConfirm: "touchConfirmOverlay",
  touchMultiSelect: "touchMultiSelectOverlay",
  touchSelectBack: "touchSelectBackOverlay",
};

export function normalizePanelVisibilityKey(key) {
  const raw = String(key || "").trim();
  if (!raw) return "";
  return PANEL_KEY_ALIASES[raw] || raw;
}

export function ensurePanelVisibilityState(state) {
  if (!state.ui) state.ui = {};
  const next = { ...DEFAULT_PANEL_VISIBILITY };
  const current = state.ui.panelVisibility;
  if (current && typeof current === "object") {
    for (const [key, value] of Object.entries(current)) {
      const normalized = normalizePanelVisibilityKey(key);
      if (!normalized || !Object.prototype.hasOwnProperty.call(DEFAULT_PANEL_VISIBILITY, normalized)) continue;
      next[normalized] = value !== false;
    }
  }
  state.ui.panelVisibility = next;
  return next;
}

export function isPanelVisible(state, key) {
  const normalized = normalizePanelVisibilityKey(key);
  const visibility = ensurePanelVisibilityState(state);
  if (!Object.prototype.hasOwnProperty.call(visibility, normalized)) return true;
  return visibility[normalized] !== false;
}

export function setPanelVisibleState(state, key, on) {
  const normalized = normalizePanelVisibilityKey(key);
  if (!normalized || !Object.prototype.hasOwnProperty.call(DEFAULT_PANEL_VISIBILITY, normalized)) return null;
  const visibility = ensurePanelVisibilityState(state);
  visibility[normalized] = !!on;
  return visibility[normalized];
}

export function applyPanelVisibilityPatch(state, patch) {
  const visibility = ensurePanelVisibilityState(state);
  if (!patch || typeof patch !== "object") return { ...visibility };
  for (const [key, value] of Object.entries(patch)) {
    const normalized = normalizePanelVisibilityKey(key);
    if (!normalized || !Object.prototype.hasOwnProperty.call(DEFAULT_PANEL_VISIBILITY, normalized)) continue;
    visibility[normalized] = value !== false;
  }
  return { ...visibility };
}
