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
persistence.loadAppSettingsAtStartup();
applyDisplayModePreset(state, "viewer");
if (!state.ui) state.ui = {};
state.ui.autoBackupEnabled = false;
state.tool = "select";

function draw() {
  renderViewer(ctx, dom.canvas, state);
  refreshViewerUi(state, dom);
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
  dom.resetViewBtn?.addEventListener("click", () => viewRuntime.resetView());
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

function setDisplayMode(mode) {
  const next = String(mode || "").toLowerCase();
  if (!next || next === "viewer") return;
  window.location.href = `./cad.html?mode=${next}`;
}


bindViewerImportControls();
bindViewerNavigation();
viewRuntime.resizeCanvas();
viewRuntime.resetView();
draw();

window.cadApp = {
  __mode: "viewer-lite",
  state,
  dom,
  importDroppedFiles,
  setDisplayMode,
};







