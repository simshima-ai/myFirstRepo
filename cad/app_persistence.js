import {
  clearProjectDirectoryHandle,
  isProjectFolderApiSupported,
  loadProjectDirectoryHandle,
  queryProjectDirectoryPermission,
  readProjectSettingsFile,
  requestProjectDirectoryPermission,
  saveProjectDirectoryHandle,
  writeProjectSettingsFile,
} from "./app_project_folder.js";

export function createPersistenceRuntime(config) {
  const {
    state,
    dom,
    sanitizeToolShortcuts,
    appSettingsKey,
    autoBackupKey,
    defaultAutoBackupIntervalMs = 15000
  } = config || {};

  let autoBackupTimer = null;
  let autoBackupBadgeTimer = null;
  let settingsSaveTimer = null;
  let projectDirHandle = null;

  function normalizeAdZones(raw) {
    return {
      topRight: raw?.topRight === true,
      bottomLeft: raw?.bottomLeft === true,
      bottomCenter: raw?.bottomCenter === true,
    };
  }

  function ensureProjectFolderState() {
    if (!state.ui) state.ui = {};
    if (!state.ui.projectFolder || typeof state.ui.projectFolder !== "object") {
      state.ui.projectFolder = {
        linked: false,
        name: "",
        source: "localStorage",
        supported: isProjectFolderApiSupported(),
      };
    }
    state.ui.projectFolder.supported = isProjectFolderApiSupported();
    return state.ui.projectFolder;
  }

  function updateProjectFolderState(handle, source = "localStorage") {
    const info = ensureProjectFolderState();
    info.linked = !!handle;
    info.name = handle ? String(handle.name || "") : "";
    info.source = handle ? String(source || "file") : "localStorage";
    return info;
  }

  function applyLoadedSettings(data) {
    if (!data || typeof data !== "object") return false;
    if (data.pageSetup && typeof data.pageSetup === "object") {
      state.pageSetup.size = String(data.pageSetup.size || state.pageSetup.size || "A4");
      state.pageSetup.customSizeEnabled = !!(data.pageSetup.customSizeEnabled ?? state.pageSetup.customSizeEnabled);
      state.pageSetup.customWidthMm = Math.max(1, Number(data.pageSetup.customWidthMm ?? state.pageSetup.customWidthMm ?? 297) || 297);
      state.pageSetup.customHeightMm = Math.max(1, Number(data.pageSetup.customHeightMm ?? state.pageSetup.customHeightMm ?? 210) || 210);
      state.pageSetup.orientation = (String(data.pageSetup.orientation || state.pageSetup.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
      state.pageSetup.scale = Math.max(0.0001, Number(data.pageSetup.scale ?? state.pageSetup.scale ?? 1) || 1);
      state.pageSetup.presetScale = Math.max(0.0001, Number(data.pageSetup.presetScale ?? state.pageSetup.presetScale ?? state.pageSetup.scale ?? 1) || 1);
      state.pageSetup.customScaleEnabled = !!(data.pageSetup.customScaleEnabled ?? state.pageSetup.customScaleEnabled);
      state.pageSetup.customScale = Math.max(0.0001, Number(data.pageSetup.customScale ?? state.pageSetup.customScale ?? state.pageSetup.scale ?? 1) || 1);
      state.pageSetup.unit = String(data.pageSetup.unit || state.pageSetup.unit || "mm");
      state.pageSetup.showFrame = data.pageSetup.showFrame !== false;
      state.pageSetup.innerMarginMm = Math.max(0, Number(data.pageSetup.innerMarginMm ?? state.pageSetup.innerMarginMm ?? 10) || 0);
    }
    if (data.grid && typeof data.grid === "object") {
      if (Number.isFinite(Number(data.grid.size))) state.grid.size = Math.max(1, Number(data.grid.size));
      state.grid.presetSize = Math.max(1, Number(data.grid.presetSize ?? state.grid.presetSize ?? state.grid.size ?? 10) || 10);
      state.grid.customSizeEnabled = !!(data.grid.customSizeEnabled ?? state.grid.customSizeEnabled);
      state.grid.customSize = Math.max(1, Number(data.grid.customSize ?? state.grid.customSize ?? state.grid.size ?? 10) || 10);
      state.grid.snap = !!data.grid.snap;
      state.grid.show = data.grid.show !== false;
      state.grid.auto = data.grid.auto !== false;
      if (Number.isFinite(Number(data.grid.autoTiming))) {
        state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Number(data.grid.autoTiming))));
      }
    }
    if (data.ui && typeof data.ui === "object") {
      if (!state.ui) state.ui = {};
      if (!state.ui.groupView || typeof state.ui.groupView !== "object") state.ui.groupView = {};
      state.ui.language = String(data.ui.language || state.ui.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
      state.ui.displayMode = String(data.ui.displayMode || state.ui.displayMode || "cad");
      state.ui.groupView.currentLayerOnly = !!(data.ui.groupCurrentLayerOnly ?? state.ui.groupView.currentLayerOnly);
      state.ui.menuScalePct = Math.max(50, Math.min(200, Math.round(Number(data.ui.menuScalePct ?? state.ui.menuScalePct ?? 100) / 5) * 5));
      state.ui.touchMode = !!(data.ui.touchMode ?? state.ui.touchMode);
      state.ui.touchMultiSelect = !!(data.ui.touchMultiSelect ?? state.ui.touchMultiSelect);
      state.ui.importSourceUnit = String(data.ui.importSourceUnit || state.ui.importSourceUnit || "auto");
      const legacyPoly = !!(data.ui.importDxfAsPolyline || data.ui.importSvgAsPolyline);
      state.ui.importAsPolyline = !!(data.ui.importAsPolyline ?? state.ui.importAsPolyline ?? legacyPoly);
      state.ui.leftMenuVisibility = (data.ui.leftMenuVisibility && typeof data.ui.leftMenuVisibility === "object")
        ? { ...data.ui.leftMenuVisibility }
        : (state.ui.leftMenuVisibility || {});
      state.ui.showFps = !!data.ui.showFps;
      state.ui.showObjectCount = !!data.ui.showObjectCount;
      state.ui.panelVisibility = (data.ui.panelVisibility && typeof data.ui.panelVisibility === "object")
        ? { ...(state.ui.panelVisibility || {}), ...data.ui.panelVisibility }
        : (state.ui.panelVisibility || {});
      state.ui.adZones = normalizeAdZones(data.ui?.adZones);
      state.ui.autoBackupEnabled = data.ui.autoBackupEnabled !== false;
      state.ui.autoBackupIntervalSec = Math.max(60, Math.min(600, Math.round(Number(data.ui.autoBackupIntervalSec ?? state.ui.autoBackupIntervalSec ?? 60) || 60)));
      state.ui.toolShortcuts = sanitizeToolShortcuts(data.ui.toolShortcuts ?? state.ui.toolShortcuts);
    }
    return true;
  }

  async function syncProjectHandleFromStorage(writable = false) {
    if (!isProjectFolderApiSupported()) {
      updateProjectFolderState(null, "localStorage");
      return null;
    }
    if (!projectDirHandle) {
      projectDirHandle = await loadProjectDirectoryHandle();
    }
    if (!projectDirHandle) {
      updateProjectFolderState(null, "localStorage");
      return null;
    }
    let permission = await queryProjectDirectoryPermission(projectDirHandle, writable);
    if (permission !== "granted" && writable) {
      permission = await requestProjectDirectoryPermission(projectDirHandle, true);
    }
    if (permission !== "granted") {
      updateProjectFolderState(projectDirHandle, "localStorage");
      return null;
    }
    updateProjectFolderState(projectDirHandle, "file");
    return projectDirHandle;
  }

  function buildSettingsSnapshot() {
    return {
      pageSetup: { ...(state.pageSetup || {}) },
      grid: {
        size: Number(state.grid?.size ?? 10),
        presetSize: Number(state.grid?.presetSize ?? state.grid?.size ?? 10),
        customSizeEnabled: !!state.grid?.customSizeEnabled,
        customSize: Number(state.grid?.customSize ?? state.grid?.size ?? 10),
        snap: !!state.grid?.snap,
        show: state.grid?.show !== false,
        auto: state.grid?.auto !== false,
        autoTiming: Number(state.grid?.autoTiming ?? 35),
      },
      ui: {
        language: String(state.ui?.language || "ja"),
        displayMode: String(state.ui?.displayMode || "cad"),
        menuScalePct: Number(state.ui?.menuScalePct ?? 100),
        touchMode: !!state.ui?.touchMode,
        touchMultiSelect: !!state.ui?.touchMultiSelect,
        importSourceUnit: String(state.ui?.importSourceUnit || "auto"),
        importAsPolyline: !!state.ui?.importAsPolyline,
        groupCurrentLayerOnly: !!state.ui?.groupView?.currentLayerOnly,
        leftMenuVisibility: (state.ui?.leftMenuVisibility && typeof state.ui.leftMenuVisibility === "object")
          ? { ...state.ui.leftMenuVisibility }
          : {},
        showFps: !!state.ui?.showFps,
        showObjectCount: !!state.ui?.showObjectCount,
        panelVisibility: (state.ui?.panelVisibility && typeof state.ui.panelVisibility === "object")
          ? { ...state.ui.panelVisibility }
          : {},
        adZones: normalizeAdZones(state.ui?.adZones),
        autoBackupEnabled: state.ui?.autoBackupEnabled !== false,
        autoBackupIntervalSec: Number(state.ui?.autoBackupIntervalSec ?? 60),
        toolShortcuts: sanitizeToolShortcuts(state.ui?.toolShortcuts),
      },
    };
  }

  async function saveAppSettingsNow() {
    try {
      const snapshot = buildSettingsSnapshot();
      if (typeof localStorage === "undefined") return false;
      localStorage.setItem(appSettingsKey, JSON.stringify(snapshot));
      const dirHandle = await syncProjectHandleFromStorage(true);
      if (dirHandle) {
        await writeProjectSettingsFile(dirHandle, snapshot);
        updateProjectFolderState(dirHandle, "file");
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function scheduleSaveAppSettings() {
    if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
    settingsSaveTimer = setTimeout(() => {
      void saveAppSettingsNow();
      settingsSaveTimer = null;
    }, 180);
  }

  async function loadAppSettingsAtStartup() {
    try {
      const dirHandle = await syncProjectHandleFromStorage(false);
      if (dirHandle) {
        const dataFromFile = await readProjectSettingsFile(dirHandle);
        if (applyLoadedSettings(dataFromFile)) {
          updateProjectFolderState(dirHandle, "file");
          return true;
        }
      }
      if (typeof localStorage === "undefined") return false;
      const raw = localStorage.getItem(appSettingsKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const ok = applyLoadedSettings(data);
      updateProjectFolderState(projectDirHandle, ok && dirHandle ? "file" : "localStorage");
      return ok;
    } catch (_) {
      return false;
    }
  }

  async function chooseProjectFolder() {
    if (!isProjectFolderApiSupported()) return { ok: false, reason: "unsupported" };
    try {
      const handle = await window.showDirectoryPicker({ mode: "readwrite" });
      if (!handle) return { ok: false, reason: "canceled" };
      const permission = await requestProjectDirectoryPermission(handle, true);
      if (permission !== "granted") return { ok: false, reason: "denied" };
      await saveProjectDirectoryHandle(handle);
      projectDirHandle = handle;
      updateProjectFolderState(handle, "file");
      await saveAppSettingsNow();
      return { ok: true, name: String(handle.name || "") };
    } catch (err) {
      if (String(err?.name || "") === "AbortError") return { ok: false, reason: "canceled" };
      return { ok: false, reason: "error", error: err };
    }
  }

  async function clearProjectFolder() {
    try {
      await clearProjectDirectoryHandle();
      projectDirHandle = null;
      updateProjectFolderState(null, "localStorage");
      await saveAppSettingsNow();
      return true;
    } catch (_) {
      return false;
    }
  }

  function detectInitialUiLanguage() {
    try {
      if (typeof localStorage !== "undefined") {
        const saved = String(localStorage.getItem("scad-lang") || "").toLowerCase();
        if (saved.startsWith("ja")) return "ja";
        if (saved.startsWith("en")) return "en";
      }
      const cands = [];
      if (typeof navigator !== "undefined") {
        if (Array.isArray(navigator.languages)) cands.push(...navigator.languages);
        cands.push(navigator.language, navigator.userLanguage, navigator.browserLanguage);
      }
      for (const cand of cands) {
        const lang = String(cand || "").toLowerCase();
        if (!lang) continue;
        if (lang.startsWith("ja")) return "ja";
        if (lang.startsWith("en")) return "en";
      }
    } catch (_) {
      // noop
    }
    return "en";
  }

  function saveAutoBackup(exportJsonObject, helpers) {
    try {
      if (typeof localStorage === "undefined") return false;
      if (String(state.ui?.displayMode || "cad").toLowerCase() === "viewer") return false;
      if (state.ui?.autoBackupEnabled === false) return false;
      const data = exportJsonObject(state, helpers);
      const payload = {
        savedAt: Date.now(),
        data,
      };
      localStorage.setItem(autoBackupKey, JSON.stringify(payload));
      if (!state.ui) state.ui = {};
      state.ui.lastAutoBackupAt = payload.savedAt;
      if (dom.autoBackupBadge) {
        const lang = String(state.ui?.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
        dom.autoBackupBadge.textContent = lang === "ja" ? "\u81ea\u52d5\u30d0\u30c3\u30af\u30a2\u30c3\u30d7\u4fdd\u5b58" : "Auto backup saved";
        dom.autoBackupBadge.style.display = "";
        if (autoBackupBadgeTimer) clearTimeout(autoBackupBadgeTimer);
        autoBackupBadgeTimer = setTimeout(() => {
          if (dom.autoBackupBadge) dom.autoBackupBadge.style.display = "none";
        }, 1400);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function getAutoBackupIntervalMs() {
    const fallbackSec = Math.round(Number(defaultAutoBackupIntervalMs || 15000) / 1000);
    const secRaw = Number(state.ui?.autoBackupIntervalSec ?? fallbackSec);
    const sec = Number.isFinite(secRaw) ? Math.max(60, Math.min(600, Math.round(secRaw))) : 60;
    if (!state.ui) state.ui = {};
    state.ui.autoBackupIntervalSec = sec;
    return sec * 1000;
  }

  function refreshAutoBackupTimer(saveAutoBackupFn) {
    if (autoBackupTimer) {
      clearInterval(autoBackupTimer);
      autoBackupTimer = null;
    }
    if (String(state.ui?.displayMode || "cad").toLowerCase() === "viewer") return;
    if (state.ui?.autoBackupEnabled === false) return;
    autoBackupTimer = setInterval(() => {
      try { saveAutoBackupFn(); } catch (_) { /* noop */ }
    }, getAutoBackupIntervalMs());
  }

  function restoreAutoBackupAtStartup(importJsonObject, helpers, setStatus) {
    try {
      if (typeof localStorage === "undefined") return false;
      const raw = localStorage.getItem(autoBackupKey);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      const data = payload?.data;
      if (!data || data.format !== "s-cad") return false;
      importJsonObject(state, data, { ...helpers, setStatus: null, draw: null });
      if (!state.ui) state.ui = {};
      state.ui.lastAutoBackupAt = Number(payload?.savedAt) || null;
      if (Number.isFinite(state.ui.lastAutoBackupAt)) {
        const dt = new Date(state.ui.lastAutoBackupAt);
        const hh = String(dt.getHours()).padStart(2, "0");
        const mm = String(dt.getMinutes()).padStart(2, "0");
        const ss = String(dt.getSeconds()).padStart(2, "0");
        setStatus(`Auto backup restored (${hh}:${mm}:${ss})`);
      } else {
        setStatus("Auto backup restored");
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    saveAppSettingsNow,
    scheduleSaveAppSettings,
    loadAppSettingsAtStartup,
    chooseProjectFolder,
    clearProjectFolder,
    syncProjectHandleFromStorage,
    detectInitialUiLanguage,
    saveAutoBackup,
    getAutoBackupIntervalMs,
    refreshAutoBackupTimer,
    restoreAutoBackupAtStartup
  };
}







