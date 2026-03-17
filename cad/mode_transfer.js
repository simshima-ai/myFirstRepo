const MODE_TRANSFER_KEY = "s-cad:mode-transfer:v1";

export function saveModeTransferSnapshot(exportJsonObject, state, helpers) {
  try {
    if (typeof sessionStorage === "undefined" || typeof exportJsonObject !== "function") return false;
    const data = exportJsonObject(state, helpers);
    if (!data || data.format !== "s-cad") return false;
    sessionStorage.setItem(MODE_TRANSFER_KEY, JSON.stringify({
      savedAt: Date.now(),
      data,
    }));
    return true;
  } catch (_) {
    return false;
  }
}

export function consumeModeTransferSnapshot(importJsonObject, state, helpers) {
  try {
    if (typeof sessionStorage === "undefined" || typeof importJsonObject !== "function") return false;
    const raw = sessionStorage.getItem(MODE_TRANSFER_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(MODE_TRANSFER_KEY);
    const payload = JSON.parse(raw);
    const data = payload?.data;
    if (!data || data.format !== "s-cad" || !data.model) return false;
    importJsonObject(state, data, helpers);
    return true;
  } catch (_) {
    try {
      if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(MODE_TRANSFER_KEY);
    } catch (_) {
      // noop
    }
    return false;
  }
}
