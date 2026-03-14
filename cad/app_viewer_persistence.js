export function createViewerPersistenceRuntime(config) {
  const { state, appSettingsKey } = config || {};

  function loadAppSettingsAtStartup() {
    try {
      if (typeof localStorage === "undefined") return false;
      const raw = localStorage.getItem(appSettingsKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
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
        state.ui.language = String(data.ui.language || state.ui.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
        state.ui.importSourceUnit = String(data.ui.importSourceUnit || state.ui.importSourceUnit || "auto");
        const legacyPoly = !!(data.ui.importDxfAsPolyline || data.ui.importSvgAsPolyline);
        state.ui.importAsPolyline = !!(data.ui.importAsPolyline ?? state.ui.importAsPolyline ?? legacyPoly);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    loadAppSettingsAtStartup,
  };
}
