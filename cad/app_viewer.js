import { createState, nextShapeId, setSelection } from "./state.js";
import { renderViewer } from "./app_viewer_render.js";
import { refreshViewerUi } from "./app_viewer_ui.js";
import { createDomRefs } from "./app_dom.js";
import { createViewerFileOpsRuntime } from "./app_viewer_file_ops.js";
import { createViewerViewRuntime } from "./app_viewer_runtime.js";
import { createViewerPersistenceRuntime } from "./app_viewer_persistence.js";
import { getPageFrameWorldSize } from "./app_unit_page.js";
import { applyDisplayModePreset } from "./ui_display_mode_presets.js";
import { localizeStatusText } from "./ui_text.js";
import { panByScreenDelta, zoomAt } from "./app_input_coords.js";

const APP_SETTINGS_KEY = "s-cad:settings:v1";

const state = createState();
const dom = createDomRefs();
const ctx = dom.canvas.getContext("2d");
const persistence = createViewerPersistenceRuntime({
  state,
  appSettingsKey: APP_SETTINGS_KEY,
});

function normalizeViewerGridState() {
  if (!state.grid || typeof state.grid !== "object") state.grid = {};
  state.grid.size = Math.max(1, Number(state.grid.size) || 10);
  state.grid.presetSize = Math.max(1, Number(state.grid.presetSize ?? state.grid.size ?? 10) || 10);
  state.grid.customSizeEnabled = !!state.grid.customSizeEnabled;
  state.grid.customSize = Math.max(1, Number(state.grid.customSize ?? state.grid.size ?? 10) || 10);
  state.grid.show = true;
  state.grid.auto = state.grid.auto !== false;
  state.grid.autoThreshold50 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold50) || 130)));
  state.grid.autoThreshold10 = Math.max(state.grid.autoThreshold50, Math.min(2000, Math.round(Number(state.grid.autoThreshold10) || 180)));
  state.grid.autoThreshold5 = Math.max(state.grid.autoThreshold10, Math.min(2000, Math.round(Number(state.grid.autoThreshold5) || 240)));
  state.grid.autoThreshold1 = Math.max(state.grid.autoThreshold5, Math.min(2000, Math.round(Number(state.grid.autoThreshold1) || 320)));
  state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Number(state.grid.autoTiming) || 35)));
  state.grid.autoLevel = [100, 50, 10, 5, 1].includes(Number(state.grid.autoLevel))
    ? Number(state.grid.autoLevel)
    : 100;
}

function draw() {
  renderViewer(ctx, dom.canvas, state);
  refreshViewerUi(state, dom);
}

function resetViewerImportAdjustState() {
  if (!state.ui) state.ui = {};
  state.ui.importAdjust = {
    active: false,
    groupId: null,
    shapeIds: [],
    originalShapes: [],
    params: { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false },
    sourceKind: "",
    detectedSourceUnit: "",
    baseUnitScale: 1,
  };
}

function setStatus(text) {
  if (!state.ui) state.ui = {};
  state.ui.statusText = localizeStatusText(state, text);
  draw();
}

const fileOps = createViewerFileOpsRuntime({
  state,
  nextShapeId: () => nextShapeId(state),
  setSelection: (ids) => setSelection(state, ids),
  setStatus,
  draw,
});

const viewRuntime = createViewerViewRuntime({
  state,
  dom,
  ctx,
  getPageFrameWorldSize,
  draw,
});

function createSidebarButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function setupViewerSidebar() {
  const sidebarEl = document.querySelector(".sidebar");
  const createSection = dom.toolButtons?.closest?.(".section");
  const editSection = dom.editToolButtons?.closest?.(".section");
  const fileSection = dom.fileToolButtons?.closest?.(".section");
  const manualLink = document.getElementById("openManualBtn");
  if (sidebarEl) sidebarEl.style.display = "flex";
  if (createSection) createSection.style.display = "none";
  if (editSection) editSection.style.display = "none";
  if (fileSection) fileSection.style.display = "";
  if (manualLink) manualLink.style.display = "none";
  if (!dom.fileToolButtons) return;
  dom.fileToolButtons.textContent = "";
  dom.fileToolButtons.appendChild(createSidebarButton("New", () => newFile()));
  dom.fileToolButtons.appendChild(createSidebarButton("Import", () => openImportDialog()));
}

function bindViewerImportControls() {
  dom.importAdjustScaleInput?.addEventListener("input", () => {
    fileOps.setImportAdjustParam({ scale: Number(dom.importAdjustScaleInput.value || 1) || 1 });
  });
  dom.importAdjustDxInput?.addEventListener("input", () => {
    fileOps.setImportAdjustParam({ dx: Number(dom.importAdjustDxInput.value || 0) || 0 });
  });
  dom.importAdjustDyInput?.addEventListener("input", () => {
    fileOps.setImportAdjustParam({ dy: Number(dom.importAdjustDyInput.value || 0) || 0 });
  });
  dom.importAdjustFlipXToggle?.addEventListener("change", () => {
    fileOps.setImportAdjustParam({ flipX: !!dom.importAdjustFlipXToggle.checked });
  });
  dom.importAdjustFlipYToggle?.addEventListener("change", () => {
    fileOps.setImportAdjustParam({ flipY: !!dom.importAdjustFlipYToggle.checked });
  });
  dom.importAdjustApplyBtn?.addEventListener("click", () => fileOps.applyImportAdjust());
  dom.importAdjustCancelBtn?.addEventListener("click", () => fileOps.cancelImportAdjust());
  dom.importAsPolylineToggle?.addEventListener("change", () => {
    if (!state.ui) state.ui = {};
    state.ui.importAsPolyline = !!dom.importAsPolylineToggle.checked;
    draw();
  });
  dom.importSourceUnitSelect?.addEventListener("change", () => {
    if (!state.ui) state.ui = {};
    state.ui.importSourceUnit = String(dom.importSourceUnitSelect.value || "auto");
    draw();
  });
  dom.resetViewBtn?.addEventListener("click", () => viewRuntime.animateResetView());
  [dom.viewerImportScaleBtn1, dom.viewerImportScaleBtn2, dom.viewerImportScaleBtn3].forEach((btn) => {
    btn?.addEventListener("click", () => {
      const scale = Number(btn.dataset.scale);
      if (!Number.isFinite(scale) || scale <= 0) return;
      const ok = fileOps.applySuggestedImportScale(scale);
      if (ok) {
        viewRuntime.animateResetView();
      }
    });
  });
  dom.viewerImportResetViewBtn?.addEventListener("click", () => viewRuntime.animateResetView());
}

function bindViewerFileInput() {
  dom.jsonFileInput?.addEventListener("change", async () => {
    const file = dom.jsonFileInput.files && dom.jsonFileInput.files[0];
    if (!file) return;
    try {
      await importDroppedFiles([file]);
    } catch (err) {
      setStatus(`Import failed: ${err?.message || err}`);
    } finally {
      dom.jsonFileInput.value = "";
    }
  });
}

function bindViewerNavigation() {
  let panning = false;
  let lastX = 0;
  let lastY = 0;
  dom.canvas?.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.button !== 1) return;
    panning = true;
    lastX = Number(e.clientX) || 0;
    lastY = Number(e.clientY) || 0;
    dom.canvas.setPointerCapture?.(e.pointerId);
  });
  dom.canvas?.addEventListener("pointermove", (e) => {
    if (!panning) return;
    const x = Number(e.clientX) || 0;
    const y = Number(e.clientY) || 0;
    panByScreenDelta(state, x - lastX, y - lastY);
    lastX = x;
    lastY = y;
    draw();
  });
  const stopPan = (e) => {
    panning = false;
    dom.canvas?.releasePointerCapture?.(e.pointerId);
  };
  dom.canvas?.addEventListener("pointerup", stopPan);
  dom.canvas?.addEventListener("pointercancel", stopPan);
  dom.canvas?.addEventListener("wheel", (e) => {
    if (e.cancelable) e.preventDefault();
    const rect = dom.canvas.getBoundingClientRect();
    const sx = Number(e.clientX) - Number(rect.left || 0);
    const sy = Number(e.clientY) - Number(rect.top || 0);
    const factor = e.deltaY < 0 ? 1.1 : (1 / 1.1);
    zoomAt(state, sx, sy, factor);
    draw();
  }, { passive: false });
  window.addEventListener("resize", () => viewRuntime.resizeCanvas());
}

async function importDroppedFiles(files) {
  await fileOps.importDroppedFiles(files);
  viewRuntime.resetView();
  draw();
}

function openImportDialog() {
  if (!dom.jsonFileInput) return;
  dom.jsonFileInput.accept = ".dxf,.svg,image/svg+xml";
  dom.jsonFileInput.value = "";
  dom.jsonFileInput.click();
}

function newFile() {
  const msg = "Create a new file? Imported data will be cleared.";
  if (typeof window !== "undefined" && typeof window.confirm === "function") {
    if (!window.confirm(msg)) return false;
  }
  const fresh = createState();
  state.shapes = [];
  state.nextShapeId = Number(fresh.nextShapeId) || 1;
  state.groups = [];
  state.nextGroupId = Number(fresh.nextGroupId) || 1;
  state.activeGroupId = null;
  state.selection.ids = [];
  state.selection.groupIds = [];
  state.selection.box.active = false;
  state.selection.drag.active = false;
  state.selection.drag.moved = false;
  state.selection.drag.startWorldRaw = null;
  state.selection.drag.shapeSnapshots = null;
  state.selection.drag.modelSnapshotBeforeMove = null;
  state.selection.drag.mode = null;
  state.selection.drag.resizeShapeId = null;
  state.selection.drag.resizeCorner = null;
  state.selection.drag.resizeAnchor = null;
  state.preview = null;
  state.importMeta = null;
  resetViewerImportAdjustState();
  setStatus("New file created");
  viewRuntime.resetView();
  draw();
  return true;
}

function setDisplayMode(mode) {
  const next = String(mode || "").toLowerCase();
  if (!next || next === "viewer") return;
  window.location.href = `./cad.html?mode=${next}`;
}


async function initViewer() {
  await persistence.loadAppSettingsAtStartup();
  applyDisplayModePreset(state, "viewer");
  if (!state.ui) state.ui = {};
  normalizeViewerGridState();
  resetViewerImportAdjustState();
  state.ui.autoBackupEnabled = false;
  state.tool = "select";
  setupViewerSidebar();
  bindViewerImportControls();
  bindViewerFileInput();
  bindViewerNavigation();
  viewRuntime.resizeCanvas();
  viewRuntime.resetView();
  draw();
}

void initViewer();

window.cadApp = {
  __mode: "viewer-lite",
  state,
  dom,
  importDroppedFiles,
  openImportDialog,
  newFile,
  setDisplayMode,
};







