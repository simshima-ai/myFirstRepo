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
    setLanguage,
    setMenuScalePct,
    setFpsDisplay,
    setObjectCountDisplay,
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
