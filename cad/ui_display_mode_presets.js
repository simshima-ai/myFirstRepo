import { DEFAULT_PANEL_VISIBILITY } from "./ui_panel_visibility.js";

export const DISPLAY_MODES = Object.freeze(["viewer", "easy", "cad"]);

const ALL_LEFT_MENU_KEYS = Object.freeze([
  "tool:select",
  "action:resetView",
  "tool:line",
  "tool:rect",
  "tool:circle",
  "tool:position",
  "tool:dim",
  "tool:text",
  "tool:hatch",
  "tool:vertex",
  "tool:fillet",
  "tool:trim",
  "tool:doubleline",
  "tool:patterncopy",
  "action:lineToPolyline",
  "action:undo",
  "action:redo",
  "action:delete",
  "action:newFile",
  "action:saveJson",
  "action:saveJsonAs",
  "action:loadJson",
  "action:importJson",
  "action:export",
  "tool:settings",
  "snap:grid",
  "snap:onCurve",
  "snap:endpoint",
  "snap:midpoint",
  "snap:center",
  "snap:intersection",
  "snap:tangent",
  "snap:vector",
  "snap:keepAttr",
]);

function buildLeftMenuVisibility(visibleKeys) {
  const visibleSet = new Set((visibleKeys || []).map((key) => String(key || "")));
  const map = {};
  for (const key of ALL_LEFT_MENU_KEYS) map[key] = visibleSet.has(key);
  map["tool:settings"] = true;
  return map;
}

function buildPanelVisibility(patch = {}) {
  return { ...DEFAULT_PANEL_VISIBILITY, ...patch };
}

export function normalizeDisplayMode(mode) {
  const raw = String(mode || "cad").toLowerCase();
  if (raw === "viewer" || raw === "easy" || raw === "cad") return raw;
  return "cad";
}

export function getDisplayModePreset(mode) {
  const normalized = normalizeDisplayMode(mode);
  if (normalized === "viewer") {
    return {
      mode: "viewer",
      panelVisibility: buildPanelVisibility({
        snapPanel: false,
        attrPanel: false,
        createToolsPanel: false,
        editToolsPanel: false,
        fileToolsPanel: false,
        topContext: false,
        rightPanels: false,
        groupsPanel: false,
        layersPanel: false,
        statusOverlay: false,
        scaleOverlay: false,
        debugConsole: false,
      }),
      adZones: {
        topRight: false,
        bottomLeft: false,
        bottomCenter: false,
      },
      leftMenuVisibility: buildLeftMenuVisibility([
        "tool:select",
        "action:resetView",
        "action:loadJson",
        "tool:settings",
        "snap:grid",
        "snap:endpoint",
      ]),
      objectSnap: {
        enabled: true,
        endpoint: true,
        midpoint: false,
        center: false,
        intersection: false,
        tangent: false,
        vector: false,
        tangentKeep: false,
        keepAttributes: false,
      },
      grid: { snap: true },
      tool: "select",
      selectPickMode: "object",
    };
  }
  if (normalized === "easy") {
    return {
      mode: "easy",
      panelVisibility: buildPanelVisibility({
        groupsPanel: false,
        layersPanel: false,
      }),
      adZones: {
        topRight: false,
        bottomLeft: false,
        bottomCenter: false,
      },
      leftMenuVisibility: buildLeftMenuVisibility([
        "tool:select",
        "action:resetView",
        "tool:line",
        "tool:rect",
        "tool:circle",
        "tool:dim",
        "tool:text",
        "tool:vertex",
        "tool:trim",
        "action:undo",
        "action:redo",
        "action:delete",
        "action:newFile",
        "action:saveJson",
        "action:loadJson",
        "tool:settings",
        "snap:grid",
        "snap:endpoint",
      ]),
      objectSnap: {
        enabled: true,
        endpoint: true,
        midpoint: false,
        center: false,
        intersection: false,
        tangent: false,
        vector: false,
        tangentKeep: false,
        keepAttributes: false,
      },
      grid: { snap: true },
      tool: "select",
      selectPickMode: "object",
    };
  }
  return {
    mode: "cad",
    panelVisibility: buildPanelVisibility(),
    adZones: {
      topRight: false,
      bottomLeft: false,
      bottomCenter: false,
    },
    leftMenuVisibility: null,
    objectSnap: {
      enabled: true,
      endpoint: true,
      midpoint: false,
      center: true,
      intersection: true,
      tangent: false,
      vector: false,
      tangentKeep: false,
      keepAttributes: false,
    },
    grid: { snap: true },
    tool: null,
    selectPickMode: "object",
  };
}

export function applyDisplayModePreset(state, mode) {
  const preset = getDisplayModePreset(mode);
  if (!state.ui) state.ui = {};
  state.ui.displayMode = preset.mode;
  state.ui.panelVisibility = { ...preset.panelVisibility };
  state.ui.adZones = (preset.adZones && typeof preset.adZones === "object")
    ? { ...preset.adZones }
    : { topRight: false, bottomLeft: false, bottomCenter: false };
  if (preset.leftMenuVisibility) {
    state.ui.leftMenuVisibility = { ...preset.leftMenuVisibility };
  } else {
    state.ui.leftMenuVisibility = {};
  }
  if (!state.objectSnap || typeof state.objectSnap !== "object") state.objectSnap = {};
  Object.assign(state.objectSnap, preset.objectSnap || {});
  if (!state.grid || typeof state.grid !== "object") state.grid = {};
  if (preset.grid && Object.prototype.hasOwnProperty.call(preset.grid, "snap")) {
  state.ui.selectPickMode = String(preset.selectPickMode || "object") === "group" ? "group" : "object";
  if (state.ui.selectPickMode !== "group") state.activeGroupId = null;
    state.grid.snap = !!preset.grid.snap;
  }
  if (preset.tool) state.tool = preset.tool;
  return preset;
}

