import {
  applyPanelVisibilityPatch,
  ensurePanelVisibilityState,
  normalizePanelVisibilityKey,
  setPanelVisibleState,
} from "./ui_panel_visibility.js";
import { applyDisplayModePreset, normalizeDisplayMode } from "./ui_display_mode_presets.js";

export function createUiPrefsOps(config) {
  const {
    state,
    draw,
    scheduleSaveAppSettings,
    refreshAutoBackupTimer,
    saveAutoBackup,
    sanitizeToolShortcuts,
    normalizeShortcutKey,
    toolOrder,
    defaultToolShortcuts
  } = config || {};

  function setLanguage(lang) {
    const v = String(lang || "en").toLowerCase();
    state.ui.language = v.startsWith("ja") ? "ja" : "en";
    try {
      if (typeof localStorage !== "undefined") localStorage.setItem("scad-lang", state.ui.language);
    } catch (_) {
      // noop
    }
    scheduleSaveAppSettings();
    draw();
  }

  function setMenuScalePct(pct) {
    const n = Number(pct);
    const snapped = Math.max(50, Math.min(200, Math.round((Number.isFinite(n) ? n : 100) / 5) * 5));
    if (!state.ui) state.ui = {};
    state.ui.menuScalePct = snapped;
    scheduleSaveAppSettings();
    draw();
  }

  function setFpsDisplay(on) {
    if (!state.ui) state.ui = {};
    state.ui.showFps = !!on;
    scheduleSaveAppSettings();
    draw();
  }

  function setObjectCountDisplay(on) {
    if (!state.ui) state.ui = {};
    state.ui.showObjectCount = !!on;
    scheduleSaveAppSettings();
    draw();
  }

  function setAdZoneEnabled(zone, on) {
    if (!state.ui) state.ui = {};
    if (!state.ui.adZones || typeof state.ui.adZones !== "object") {
      state.ui.adZones = { topRight: false, bottomLeft: false, bottomCenter: false };
    }
    const key = String(zone || "");
    if (!(key === "topRight" || key === "bottomLeft" || key === "bottomCenter")) return;
    state.ui.adZones[key] = !!on;
    scheduleSaveAppSettings();
    draw();
  }

  function setAllAdZonesEnabled(on) {
    if (!state.ui) state.ui = {};
    if (!state.ui.adZones || typeof state.ui.adZones !== "object") {
      state.ui.adZones = { topRight: false, bottomLeft: false, bottomCenter: false };
    }
    const nextOn = !!on;
    state.ui.adZones.topRight = nextOn;
    state.ui.adZones.bottomLeft = nextOn;
    state.ui.adZones.bottomCenter = nextOn;
    scheduleSaveAppSettings();
    draw();
    return nextOn;
  }

  function toggleAllAdZones() {
    const zones = state.ui?.adZones || {};
    const allOff =
      zones.topRight === false &&
      zones.bottomLeft === false &&
      zones.bottomCenter === false;
    return setAllAdZonesEnabled(allOff);
  }

  function setPanelVisible(panel, on) {
    ensurePanelVisibilityState(state);
    const applied = setPanelVisibleState(state, panel, on);
    if (applied == null) return null;
    if (String(panel) === "groupsPanel" && !applied) {
      state.ui.selectPickMode = "object";
      state.activeGroupId = null;
    }
    scheduleSaveAppSettings();
    draw();
    return applied;
  }

  function togglePanelVisible(panel) {
    ensurePanelVisibilityState(state);
    const key = normalizePanelVisibilityKey(panel);
    const current = state.ui?.panelVisibility?.[key] !== false;
    return setPanelVisible(panel, !current);
  }

  function setPanelVisibility(patch) {
    ensurePanelVisibilityState(state);
    const next = applyPanelVisibilityPatch(state, patch);
    if (next.groupsPanel === false) {
      state.ui.selectPickMode = "object";
      state.activeGroupId = null;
    }
    scheduleSaveAppSettings();
    draw();
    return next;
  }

  function syncDisplayModeUrl(mode) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("mode", String(mode || "cad").toLowerCase());
      window.history.replaceState({}, "", url.toString());
    } catch (_) {
      // noop
    }
  }

  function setDisplayMode(mode) {
    const preset = applyDisplayModePreset(state, normalizeDisplayMode(mode));
    syncDisplayModeUrl(preset?.mode || "cad");
    refreshAutoBackupTimer();
    scheduleSaveAppSettings();
    draw();
    return preset?.mode || "cad";
  }

  function setAutoBackupEnabled(on) {
    if (!state.ui) state.ui = {};
    state.ui.autoBackupEnabled = !!on;
    if (state.ui.autoBackupEnabled) saveAutoBackup();
    refreshAutoBackupTimer();
    scheduleSaveAppSettings();
    draw();
  }

  function setAutoBackupIntervalSec(sec) {
    if (!state.ui) state.ui = {};
    const n = Number(sec);
    state.ui.autoBackupIntervalSec = Number.isFinite(n) ? Math.max(60, Math.min(600, Math.round(n))) : 60;
    refreshAutoBackupTimer();
    scheduleSaveAppSettings();
    draw();
  }

  function setTouchMode(on) {
    if (!state.ui) state.ui = {};
    state.ui.touchMode = !!on;
    if (!state.ui.touchMode) state.ui.touchMultiSelect = false;
    scheduleSaveAppSettings();
    draw();
  }

  function setTouchMultiSelect(on) {
    if (!state.ui) state.ui = {};
    state.ui.touchMultiSelect = !!on;
    scheduleSaveAppSettings();
    draw();
  }

  function setImportAsPolyline(on) {
    if (!state.ui) state.ui = {};
    state.ui.importAsPolyline = !!on;
    scheduleSaveAppSettings();
    draw();
  }

  function setImportSourceUnit(unit) {
    if (!state.ui) state.ui = {};
    const v = String(unit || "auto").toLowerCase();
    const ok = new Set(["auto", "unitless", "mm", "cm", "m", "inch", "px", "pt"]);
    state.ui.importSourceUnit = ok.has(v) ? v : "auto";
    scheduleSaveAppSettings();
    draw();
  }

  function setToolShortcut(tool, key) {
    const t = String(tool || "").toLowerCase();
    if (!toolOrder.includes(t)) return;
    if (!state.ui) state.ui = {};
    const next = sanitizeToolShortcuts(state.ui.toolShortcuts);
    next[t] = normalizeShortcutKey(key);
    state.ui.toolShortcuts = next;
    scheduleSaveAppSettings();
    draw();
  }

  function resetToolShortcuts() {
    if (!state.ui) state.ui = {};
    state.ui.toolShortcuts = sanitizeToolShortcuts(defaultToolShortcuts);
    scheduleSaveAppSettings();
    draw();
  }

  return {
    setPanelVisible,
    togglePanelVisible,
    setPanelVisibility,
    setDisplayMode,
    setLanguage,
    setMenuScalePct,
    setFpsDisplay,
    setObjectCountDisplay,
    setAdZoneEnabled,
    setAllAdZonesEnabled,
    toggleAllAdZones,
    setAutoBackupEnabled,
    setAutoBackupIntervalSec,
    setTouchMode,
    setTouchMultiSelect,
    setImportSourceUnit,
    setImportAsPolyline,
    setToolShortcut,
    resetToolShortcuts
  };
}





