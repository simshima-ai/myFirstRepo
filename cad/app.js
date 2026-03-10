import {
  createState, addShape, nextShapeId, setSelection, clearSelection, setTool,
  pushHistory, pushHistorySnapshot, snapshotModel, restoreModel, undo as stateUndo, redo as stateRedo, removeShapeById,
  addLayer, setActiveLayer, setLayerVisible, setLayerLocked, isLayerVisible, isLayerLocked,
  createGroupFromSelection, getGroup, setActiveGroup, moveGroupOrigin, addGroup, addShapesAsGroup,
  DEFAULT_TOOL_SHORTCUTS, TOOL_SHORTCUT_TOOL_ORDER, sanitizeToolShortcuts, normalizeShortcutKey
} from "./state.js";
import { render } from "./render.js";
import { initUi, refreshUi } from "./ui.js";
import { buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";
import { chooseEndsForLineByKeepEnd, getObjectSnapPoint } from "./solvers.js";

import {
  ensureUngroupedShapesHaveGroups, selectGroupById, toggleGroupSelectionById,
  getTrimHoverCandidate, hitTestShapes, collectGroupTreeShapeIds, collectDescendantGroupIds,
  resolveVertexTangentAttribs, resolveDimensionSnapAttribs, deleteSelectedPolylineVertices
} from "./app_selection.js";

import {
  trimClickedLineAtNearestIntersection, saveJsonToFile, saveJsonAsToFile, loadJsonFromFileDialog,
  createLine, createRect, createCircle, createPosition, createText, createArc,
  applyLineInput, applyRectInput, applyCircleInput, applyFillet,
  setObjectSnapEnabled, setObjectSnapKind, setGridSize, setGridSnap, setGridShow, setGridAuto, setGridAutoThresholds,
  cycleLayerMode, renameActiveLayer, renameActiveGroup, moveSelectionToLayer, setLayerColorize, setGroupColorize, setEditOnlyActiveLayer,
  moveActiveGroupOrder, moveActiveLayerOrder, deleteActiveLayer,
  deleteActiveGroup, unparentActiveGroup, moveActiveGroup,
  updateSelectedTextSettings, updateSelectedImageSettings, moveSelectedShapes, moveSelectedVertices,
  setGroupRotateSnap, setVertexLinkCoincident, setLineInputs, setLineSizeLocked, setLineAnchor, setRectInputs, setRectSizeLocked, setRectAnchor, setCircleRadiusInput,
  setCircleMode, setCircleRadiusLocked,
  setPositionSize, setSelectionCircleCenterMark, setFilletRadius, setFilletLineMode, setVertexMoveInputs,
  setLineWidthMm, setToolLineType, setSelectedLineWidthMm, setSelectedLineType,
  setSelectedColor, setToolColor,
  setFilletNoTrim,
  buildDoubleLinePreview, executeDoubleLine, buildDoubleLineTargetLineIntersections, exportJsonObject, importJsonObject, importJsonObjectAppend, exportPdf, exportSvg, exportDxf,
  beginOrAdvanceDim, updateDimHover, finalizeDimDraft,
  beginOrExtendPolyline, updatePolylineHover, finalizePolylineDraft,
  executeHatch, validateHatchBoundary, trimateFillet, applyDimSettingsToSelection, mergeSelectedShapesToGroup,
  lineToPolyline,
  setPatternCopyMode, setPatternCopyCenterFromSelection, clearPatternCopyCenter,
  setPatternCopyAxisFromSelection, clearPatternCopyAxis, executePatternCopy
} from "./app_tools.js";

import {
  setupInputListeners, panByScreenDelta, zoomAt
} from "./app_input.js";
import { getEffectiveGridSize } from "./geom.js";
import {
  clearDoubleLineTrimPendingState,
  hasAnyVertexSnapBinding,
  convertStateUnitKeepingPhysicalSize,
  getPageFrameWorldSize
} from "./app_unit_page.js";
import {
  normalizeAimConstraint,
  normalizeDeltaDeg,
  rotatePointAroundDeg,
  rotateShapeAroundForAim
} from "./app_aim_utils.js";
import {
  filterRootGroupIds,
  duplicateGroupsByRootIds,
  duplicateShapesByIds
} from "./app_duplicate_utils.js";
import {
  getCircleThreePointRefFromShape,
  solveCircleBy3CenterRefs
} from "./app_circle3p.js";
import {
  syncAimCandidateFromSelection,
  resolveGroupAimConstraints
} from "./app_group_aim_runtime.js";
import { createPersistenceRuntime } from "./app_persistence.js";
import { createFileOpsRuntime } from "./app_file_ops.js";
import { createDrawRuntime } from "./app_draw_runtime.js";
import { createViewRuntime } from "./app_view_runtime.js";
import { createClipboardOps } from "./app_clipboard_ops.js";
import { createDocumentOps } from "./app_document_ops.js";
import { createGroupAimOps } from "./app_group_aim_ops.js";
import { createGroupStructureOps } from "./app_group_structure_ops.js";
import { createUiPrefsOps } from "./app_ui_prefs_ops.js";
import { createSelectionVisibilityOps } from "./app_selection_visibility_ops.js";
import { createAttributeOps } from "./app_attribute_ops.js";
import { createDoubleLineOps } from "./app_doubleline_ops.js";
import { createToolSwitchOps } from "./app_tool_switch_ops.js";
import { createHistoryViewOps } from "./app_history_view_ops.js";
import { createLayerGroupOps } from "./app_layer_group_ops.js";
import { createDomRefs } from "./app_dom.js";

const state = createState();
let resetViewFlashTimer = null;
const AIM_RUNTIME_DEPS = {
  normalizeAimConstraint,
  normalizeDeltaDeg,
  collectDescendantGroupIds,
  rotatePointAroundDeg,
  rotateShapeAroundForAim
};
state.buildVersion = "v158-refactor-modular";
const AUTO_BACKUP_KEY = "s-cad:auto-backup:v1";
const AUTO_BACKUP_INTERVAL_MS = 15000;
const APP_SETTINGS_KEY = "s-cad:settings:v1";

const dom = createDomRefs();
const ctx = dom.canvas.getContext("2d");

function setStatus(text) {
  if (dom.statusText) dom.statusText.textContent = text;
}

const persistence = createPersistenceRuntime({
  state,
  dom,
  sanitizeToolShortcuts,
  appSettingsKey: APP_SETTINGS_KEY,
  autoBackupKey: AUTO_BACKUP_KEY,
  defaultAutoBackupIntervalMs: AUTO_BACKUP_INTERVAL_MS
});
const saveAppSettingsNow = () => persistence.saveAppSettingsNow();
const scheduleSaveAppSettings = () => persistence.scheduleSaveAppSettings();
const loadAppSettingsAtStartup = () => persistence.loadAppSettingsAtStartup();
const detectInitialUiLanguage = () => persistence.detectInitialUiLanguage();
const saveAutoBackup = () => persistence.saveAutoBackup(exportJsonObject, helpers);
const refreshAutoBackupTimer = () => persistence.refreshAutoBackupTimer(() => persistence.saveAutoBackup(exportJsonObject, helpers));
const restoreAutoBackupAtStartup = () => persistence.restoreAutoBackupAtStartup(importJsonObject, helpers, setStatus);

const drawRuntime = createDrawRuntime({
  state,
  dom,
  ctx,
  render,
  refreshUi,
  hasAnyVertexSnapBinding,
  resolveVertexTangentAttribs,
  resolveDimensionSnapAttribs,
  getGroup,
  syncAimCandidateFromSelection,
  resolveGroupAimConstraints,
  aimRuntimeDeps: AIM_RUNTIME_DEPS
});
function draw(opts = null) {
  drawRuntime.draw(opts);
}

const viewRuntime = createViewRuntime({
  state,
  dom,
  ctx,
  getPageFrameWorldSize,
  draw
});
function resizeCanvas() {
  viewRuntime.resizeCanvas();
}
function resetView() {
  viewRuntime.resetView();
}

function getPrimarySelectedShape() {
  const sel = new Set((state.selection?.ids || []).map(Number));
  if (!sel.size) return null;
  for (const s of (state.shapes || [])) {
    if (sel.has(Number(s.id))) return s;
  }
  return null;
}

function buildRectAsLines(p1, p2) {
  return [
    { type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p1.y },
    { type: "line", x1: p2.x, y1: p1.y, x2: p2.x, y2: p2.y },
    { type: "line", x1: p2.x, y1: p2.y, x2: p1.x, y2: p2.y },
    { type: "line", x1: p1.x, y1: p2.y, x2: p1.x, y2: p1.y }
  ];
}

const clipboardOps = createClipboardOps({
  state,
  pushHistory,
  setSelection,
  nextShapeId,
  setStatus,
  draw,
  getEffectiveGridSize,
  filterRootGroupIds,
  duplicateGroupsByRootIds,
  duplicateShapesByIds
});
const documentOps = createDocumentOps({
  state,
  dom,
  createState,
  loadJsonFromFileDialog,
  setTool,
  setStatus,
  draw
});
const groupAimOps = createGroupAimOps({
  state,
  getGroup,
  normalizeAimConstraint,
  pushHistory,
  setStatus,
  draw
});
const groupStructureOps = createGroupStructureOps({
  state,
  getGroup,
  pushHistory,
  draw
});
const uiPrefsOps = createUiPrefsOps({
  state,
  draw,
  scheduleSaveAppSettings,
  refreshAutoBackupTimer,
  saveAutoBackup,
  sanitizeToolShortcuts,
  normalizeShortcutKey,
  toolOrder: TOOL_SHORTCUT_TOOL_ORDER,
  defaultToolShortcuts: DEFAULT_TOOL_SHORTCUTS
});
const selectionVisibilityOps = createSelectionVisibilityOps({
  state,
  filterRootGroupIds,
  collectDescendantGroupIds,
  collectGroupTreeShapeIds,
  removeShapeById,
  normalizeAimConstraint,
  getGroup,
  setSelection,
  pushHistory,
  setStatus,
  draw
});
const attributeOps = createAttributeOps({
  state,
  getPrimarySelectedShape,
  pushHistory,
  draw
});
const doubleLineOps = createDoubleLineOps({
  state,
  helpers: {
    snapshotModel: () => snapshotModel(state),
    pushHistorySnapshot: (snap) => pushHistorySnapshot(state, snap),
    setStatus,
    pushHistory: () => pushHistory(state),
    nextShapeId: () => nextShapeId(state),
    addShape: (s) => addShape(state, s),
    removeShapeById: (id) => removeShapeById(state, id),
    clearSelection: () => clearSelection(state),
    setSelection: (ids) => setSelection(state, ids),
    getTrimHoverCandidate: (st, wr) => getTrimHoverCandidate(st, wr, dom),
    hitTestShapes: (st, wr, d) => hitTestShapes(st, wr, d || dom),
  },
  executeDoubleLineGeom: executeDoubleLine,
  buildDoubleLinePreviewGeom: buildDoubleLinePreview,
  buildDoubleLineTargetLineIntersections,
  trimClickedLineAtNearestIntersection,
  clearDoubleLineTrimPendingState,
  setStatus,
  draw
});
const toolSwitchOps = createToolSwitchOps({
  state,
  setToolState: setTool,
  clearSelection,
  draw,
  updateDimHover,
  hitTestShapes: (st, wr) => hitTestShapes(st, wr, dom)
});
const historyViewOps = createHistoryViewOps({
  state,
  stateUndo,
  stateRedo,
  setToolState: setTool,
  resetView,
  setStatus,
  draw,
  getResetViewFlashTimer: () => resetViewFlashTimer,
  setResetViewFlashTimer: (t) => { resetViewFlashTimer = t; }
});
const layerGroupOps = createLayerGroupOps({
  state,
  pushHistory,
  addLayerToState: addLayer,
  setActiveLayerInState: setActiveLayer,
  selectGroupById,
  toggleGroupSelectionById,
  cycleLayerMode,
  renameActiveLayer,
  moveSelectionToLayer,
  deleteActiveLayer,
  moveActiveGroupOrder,
  moveActiveLayerOrder,
  setLayerColorize,
  setGroupColorize,
  setEditOnlyActiveLayer,
  renameActiveGroup,
  deleteActiveGroup,
  unparentActiveGroup,
  moveActiveGroup,
  scheduleSaveAppSettings,
  setStatus,
  draw
});

const helpers = {
  draw,
  setStatus,
  pushHistory: () => pushHistory(state),
  pushHistorySnapshot: (snap) => pushHistorySnapshot(state, snap),
  snapshotModel: () => snapshotModel(state),
  restoreModel: (st, data) => restoreModel(st, data),
  cloneShapeForDrag: (s) => JSON.parse(JSON.stringify(s)),
  addShape: (s) => addShape(state, s),
  addShapesAsGroup: (ss) => addShapesAsGroup(state, ss),
  nextShapeId: () => nextShapeId(state),
  setSelection: (ids) => setSelection(state, ids),
  clearSelection: () => clearSelection(state),
  removeShapeById: (id) => removeShapeById(state, id),
  popDimChainPoint: () => popDimChainPoint(state, helpers),
  finalizeDimDraft: () => finalizeDimDraft(state, helpers),
  trimClickedLineAtNearestIntersection: (st, wr, h) => trimClickedLineAtNearestIntersection(st, wr, h),
  getTrimHoverCandidate: (st, wr) => getTrimHoverCandidate(st, wr, dom),
  hitTestShapes: (st, wr, d) => hitTestShapes(st, wr, d || dom),
  resizeCanvas,
  beginOrAdvanceDim: (wr) => beginOrAdvanceDim(state, wr, helpers),
  updateDimHover: (wr, ws) => updateDimHover(state, wr, ws, helpers),
  beginOrExtendPolyline: (w) => beginOrExtendPolyline(state, w),
  updatePolylineHover: (w) => updatePolylineHover(state, w),
  finalizePolylineDraft: () => finalizePolylineDraft(state, helpers),
  executeHatch: () => executeHatch(state, helpers),
  validateHatchBoundary: () => validateHatchBoundary(state, helpers),
  trimateFillet: (r, h) => trimateFillet(state, helpers, r, h),
  buildHatchLoopsFromBoundaryIds,
  chooseEndsForLineByKeepEnd,
  createGroupFromSelection: (st, name) => createGroupFromSelection(st, name),
  setTool: (t) => toolSwitchOps.setToolAction(t),
  undo: () => historyViewOps.undoAction(),
  redo: () => historyViewOps.redoAction(),
  delete: () => {
    if (state.tool === "vertex") return deleteSelectedPolylineVertices(state, helpers);
    return selectionVisibilityOps.deleteSelection();
  },
  deleteSelectedVertices: () => deleteSelectedPolylineVertices(state, helpers),
  resetView: () => historyViewOps.resetViewAction(),
  refitViewToPage: () => historyViewOps.refitViewToPageAction(),
  loadJson: () => documentOps.loadJson(),
  newFile: () => documentOps.newFile(),
  importJson: () => documentOps.importJson(),
  traceImage: () => fileOps.openTracePanel(),
  closeTracePanel: () => fileOps.closeTracePanel(),
  traceRegenerate: () => fileOps.traceSelectedImageUsingStateParams(),
  setImportAdjustParam: (patch) => fileOps.setImportAdjustParam(patch),
  applyImportAdjust: () => fileOps.applyImportAdjust(),
  cancelImportAdjust: () => fileOps.cancelImportAdjust(),
  setTraceParams: (patch) => {
    fileOps.setTraceParam(patch);
    scheduleSaveAppSettings();
    draw();
  },
  saveJson: () => saveJsonToFile(state, helpers),
  saveJsonAs: () => saveJsonAsToFile(state, helpers),
  pdf: () => exportPdf(state, helpers),
  svg: () => exportSvg(state, helpers),
  dxf: () => exportDxf(state, helpers),

  createLine: (p1, p2) => createLine(p1, p2),
  createRect: (p1, p2) => createRect(p1, p2),
  createCircle: (c, e) => createCircle(c, e),
  createPosition: (p) => createPosition(p),
  createText: (p, s) => createText(p, s),
  createArc: (c, r, a1, a2, ccw) => createArc(c, r, a1, a2, ccw),

  applyLineInput: (len, ang) => applyLineInput(state, helpers, len, ang),
  applyRectInput: (w, h) => applyRectInput(state, helpers, w, h),
  applyCircleInput: (r) => applyCircleInput(state, helpers, r),
  applyFillet: (r, worldHint = null) => applyFillet(state, helpers, r, worldHint),

  setObjectSnapEnabled: (v) => { setObjectSnapEnabled(state, v); draw(); },
  setObjectSnapKind: (k, v) => { setObjectSnapKind(state, k, v); draw(); },
  setGridSize: (v) => { setGridSize(state, v); scheduleSaveAppSettings(); draw(); },
  setGridSnap: (v) => { setGridSnap(state, v); scheduleSaveAppSettings(); draw(); },
  setGridShow: (v) => { setGridShow(state, v); scheduleSaveAppSettings(); draw(); },
  setGridAuto: (v) => { setGridAuto(state, v); scheduleSaveAppSettings(); draw(); },
  setGridAutoThresholds: (t50, t10, t5, t1, timing) => { setGridAutoThresholds(state, t50, t10, t5, t1, timing); scheduleSaveAppSettings(); draw(); },
  setLanguage: (lang) => uiPrefsOps.setLanguage(lang),
  setMenuScalePct: (pct) => uiPrefsOps.setMenuScalePct(pct),

  addLayer: (name) => layerGroupOps.addLayerAction(name),
  setActiveLayer: (id) => layerGroupOps.setActiveLayerAction(id),
  selectGroup: (id) => layerGroupOps.selectGroupAction(id),
  toggleGroupSelection: (id) => layerGroupOps.toggleGroupSelectionAction(id),
  setGroupVisible: (groupId, on) => selectionVisibilityOps.setGroupVisible(groupId, on),
  selectShapeById: (id) => { setSelection(state, [id]); draw(); },
  toggleShapeSelectionById: (id) => selectionVisibilityOps.toggleShapeSelectionById(id),
  cycleLayerMode: (id) => layerGroupOps.cycleLayerModeAction(id),
  renameActiveLayer: (n) => layerGroupOps.renameActiveLayerAction(n),
  moveSelectionToLayer: () => layerGroupOps.moveSelectionToLayerAction(),
  deleteActiveLayer: () => layerGroupOps.deleteActiveLayerAction(),
  moveActiveGroupOrder: (direction) => layerGroupOps.moveActiveGroupOrderAction(direction),
  moveActiveLayerOrder: (direction) => layerGroupOps.moveActiveLayerOrderAction(direction),
  setLayerColorize: (v) => layerGroupOps.setLayerColorizeAction(v),
  setGroupColorize: (v) => layerGroupOps.setGroupColorizeAction(v),
  setGroupCurrentLayerOnly: (v) => layerGroupOps.setGroupCurrentLayerOnlyAction(v),
  setEditOnlyActiveLayer: (v) => layerGroupOps.setEditOnlyActiveLayerAction(v),
  renameActiveGroup: (n) => layerGroupOps.renameActiveGroupAction(n),
  deleteActiveGroup: () => layerGroupOps.deleteActiveGroupAction(),
  unparentActiveGroup: () => layerGroupOps.unparentActiveGroupAction(),
  moveActiveGroup: (dx, dy) => layerGroupOps.moveActiveGroupAction(dx, dy),
  copyActiveGroup: (dx, dy) => clipboardOps.copyActiveGroup(dx, dy),
  setActiveGroupAimEnabled: (on) => groupAimOps.setActiveGroupAimEnabled(on),
  beginPickActiveGroupAimTarget: () => groupAimOps.beginPickActiveGroupAimTarget(),
  confirmActiveGroupAimTarget: () => groupAimOps.confirmActiveGroupAimTarget(),
  pickOrConfirmActiveGroupAimTarget: () => groupAimOps.pickOrConfirmActiveGroupAimTarget(),
  clearActiveGroupAimTarget: () => groupAimOps.clearActiveGroupAimTarget(),
  setActiveGroupParent: (pid) => groupStructureOps.setActiveGroupParent(pid),
  moveShapeToGroup: (sid, gid) => groupStructureOps.moveShapeToGroup(sid, gid),
  moveShapesToGroup: (shapeIds, gid) => groupStructureOps.moveShapesToGroup(shapeIds, gid),
  createGroupFromSelection: (name) => { pushHistory(state); const g = createGroupFromSelection(state, name); draw(); return g; },
  mergeSelectedShapesToGroup: () => mergeSelectedShapesToGroup(state, helpers),
  lineToPolyline: () => lineToPolyline(state, helpers),

  updateSelectedTextSettings: (s) => updateSelectedTextSettings(state, helpers, s),
  updateSelectedImageSettings: (s) => updateSelectedImageSettings(state, helpers, s),
  moveSelectedShapes: (dx, dy) => moveSelectedShapes(state, helpers, dx, dy),
  copySelectedShapes: (dx, dy) => clipboardOps.copySelectedShapes(dx, dy),
  copySelectionToClipboard: () => clipboardOps.copySelectionToClipboard(),
  pasteClipboard: () => clipboardOps.pasteClipboard(),
  moveSelectedVertices: (dx, dy) => moveSelectedVertices(state, helpers, dx, dy),
  deleteSelectedVertices: () => deleteSelectedPolylineVertices(state, helpers),

  setGroupRotateSnap: (v) => { setGroupRotateSnap(state, v); draw(); },
  setVertexLinkCoincident: (v) => { setVertexLinkCoincident(state, v); draw(); },
  setLineInputs: (l, a) => { setLineInputs(state, l, a); draw(); },
  setLineSizeLocked: (on = null) => { setLineSizeLocked(state, helpers, on); draw(); },
  setLineAnchor: (anchor) => { setLineAnchor(state, anchor); draw(); },
  setRectInputs: (w, h) => { setRectInputs(state, w, h); draw(); },
  setRectSizeLocked: (on = null) => { setRectSizeLocked(state, helpers, on); draw(); },
  setRectAnchor: (anchor) => { setRectAnchor(state, anchor); draw(); },
  setCircleMode: (mode) => { setCircleMode(state, helpers, mode); draw(); },
  executeCircleThreePointFromTargets: () => {
    const mode = String(state.circleSettings?.mode || "").toLowerCase();
    if (mode !== "threepoint") {
      setStatus("・ｽ~・ｽ・ｬ: ・ｽO・ｽ_・ｽw・ｽ・ｽ・ｽ・ｽ・ｽ[・ｽh・ｽﾅ使・ｽp・ｽ・ｽ・ｽﾄゑｿｽ・ｽ・ｽ・ｽ・ｽ・ｽ・ｽ");
      draw();
      return;
    }
    const refs = Array.isArray(state.input.circleThreePointRefs) ? state.input.circleThreePointRefs.slice(0, 3) : [];
    if (refs.length < 3) {
      setStatus(`・ｽO・ｽ_・ｽw・ｽ・ｽ: ${refs.length}/3 ・ｽ_・ｽB・ｽ・ｽﾉタ・ｽ[・ｽQ・ｽb・ｽg・ｽ・ｽo・ｽ^・ｽ・ｽ・ｽﾄゑｿｽ・ｽ・ｽ・ｽ・ｽ・ｽ・ｽ`);
      draw();
      return;
    }
    const hint = refs[refs.length - 1] || null;
    const sol = solveCircleBy3CenterRefs(refs, hint);
    if (!sol) {
      state.input.circleThreePointRefs = [];
      setStatus("・ｽO・ｽ_・ｽw・ｽ・ｽ: ・ｽO・ｽﾚ円・ｽ・ｽv・ｽZ・ｽﾅゑｿｽ・ｽﾜゑｿｽ・ｽ・ｽﾅゑｿｽ・ｽ・ｽ");
      draw();
      return;
    }
    pushHistory(state);
    const shape = createCircle({ x: sol.cx, y: sol.cy }, { x: sol.cx + sol.r, y: sol.cy });
    shape.showCenterMark = !!state.circleSettings?.showCenterMark;
    shape.id = nextShapeId(state);
    shape.layerId = state.activeLayerId;
    shape.lineWidthMm = Math.max(0.01, Number(state.circleSettings?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
    shape.lineType = String(state.circleSettings?.lineType || "solid");
    shape.color = String(state.circleSettings?.color || "#0f172a");
    addShape(state, shape);
    clearSelection(state);
    state.activeGroupId = null;
    state.input.circleThreePointRefs = [];
    setStatus("CIRCLE created (・ｽO・ｽ_・ｽw・ｽ・ｽ)");
    draw();
  },
  registerCircleThreePointTargetFromSelection: () => {
    const mode = String(state.circleSettings?.mode || "").toLowerCase();
    if (mode !== "threepoint") {
      setStatus("・ｽ~・ｽ・ｬ: ・ｽO・ｽ_・ｽw・ｽ・ｽ・ｽ・ｽ・ｽ[・ｽh・ｽﾅ使・ｽp・ｽ・ｽ・ｽﾄゑｿｽ・ｽ・ｽ・ｽ・ｽ・ｽ・ｽ");
      draw();
      return;
    }
    const selIds = new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite));
    const selectedShapes = (state.shapes || []).filter(s => selIds.has(Number(s.id)));
    const refs = selectedShapes
      .map(getCircleThreePointRefFromShape)
      .filter(r => !!r);
    if (!refs.length) {
      setStatus("・ｽﾎ象ゑｿｽI・ｽ・ｽ・ｽ・ｽﾄゑｿｽ・ｽ・ｽ・ｽ・ｽ・ｽ・ｽ (・ｽﾊ置/・ｽ~/・ｽ~・ｽ・ｽ)・ｽBShift・ｽﾅ包ｿｽ・ｽ・ｽ・ｽI・ｽ・ｽﾅゑｿｽ・ｽﾜゑｿｽ");
      draw();
      return;
    }
    if (!Array.isArray(state.input.circleThreePointRefs)) state.input.circleThreePointRefs = [];
    const existingIds = new Set(state.input.circleThreePointRefs.map(r => Number(r.shapeId)));
    let added = [];
    let duplicateCount = 0;
    let full = false;
    for (const ref of refs) {
      if (state.input.circleThreePointRefs.length >= 3) { full = true; break; }
      const sid = Number(ref.shapeId);
      if (existingIds.has(sid)) { duplicateCount++; continue; }
      state.input.circleThreePointRefs.push(ref);
      existingIds.add(sid);
      added.push(ref);
    }
    if (!added.length && duplicateCount > 0) {
      setStatus("・ｽO・ｽ_・ｽw・ｽ・ｽ: ・ｽI・ｽ・ｽﾎ象はゑｿｽ・ｽﾗて登・ｽ^・ｽﾏみでゑｿｽ");
      draw();
      return;
    }
    const ids = state.input.circleThreePointRefs.map(r => Number(r.shapeId)).filter(Number.isFinite).join(", ");
    if (added.length === 1) {
      const a = added[0];
      const label = (a.type === "position") ? "・ｽﾊ置" : ((a.type === "circle") ? "・ｽ~" : "・ｽ~・ｽ・ｽ");
      setStatus(`・ｽO・ｽ_・ｽw・ｽ・ｽ: ${label} #${Number(a.shapeId)} ・ｽ・ｽo・ｽ^ (${state.input.circleThreePointRefs.length}/3) [${ids}]`);
    } else {
      setStatus(`・ｽO・ｽ_・ｽw・ｽ・ｽ: ${added.length}・ｽ・ｽ・ｽ・ｽo・ｽ^ (${state.input.circleThreePointRefs.length}/3) [${ids}]${full ? " / ・ｽ・ｽ・ｽ・ｽ・ｽ・ｽB" : ""}`);
    }
    draw();
  },
  setCircleRadiusInput: (r) => { setCircleRadiusInput(state, r); draw(); },
  setCircleRadiusLocked: (on = null) => { setCircleRadiusLocked(state, helpers, on); draw(); },
  setPositionSize: (v) => setPositionSize(state, helpers, v),
  setTextSettings: (patch = {}) => {
    if (!state.textSettings) state.textSettings = {};
    const next = { ...state.textSettings };
    if (Object.prototype.hasOwnProperty.call(patch, "content")) next.content = String(patch.content ?? "");
    if (Object.prototype.hasOwnProperty.call(patch, "sizePt")) next.sizePt = Math.max(1, Number(patch.sizePt) || 12);
    if (Object.prototype.hasOwnProperty.call(patch, "rotate")) next.rotate = Number(patch.rotate) || 0;
    if (Object.prototype.hasOwnProperty.call(patch, "fontFamily")) next.fontFamily = String(patch.fontFamily || "Yu Gothic UI");
    if (Object.prototype.hasOwnProperty.call(patch, "bold")) next.bold = !!patch.bold;
    if (Object.prototype.hasOwnProperty.call(patch, "italic")) next.italic = !!patch.italic;
    if (Object.prototype.hasOwnProperty.call(patch, "color")) next.color = String(patch.color || "#0f172a");
    state.textSettings = next;
    draw();
  },
  setLineWidthMm: (v, toolKey = null) => setLineWidthMm(state, helpers, v, toolKey),
  setToolLineType: (v, toolKey = null) => setToolLineType(state, helpers, v, toolKey),
  setSelectedLineWidthMm: (v) => setSelectedLineWidthMm(state, helpers, v),
  setSelectedLineType: (v) => setSelectedLineType(state, helpers, v),
  setSelectedColor: (v) => setSelectedColor(state, helpers, v),
  setToolColor: (v, toolKey = null) => setToolColor(state, helpers, v, toolKey),
  setSelectPickMode: (mode) => {
    if (!state.ui) state.ui = {};
    state.ui.selectPickMode = (String(mode) === "group") ? "group" : "object";
    draw();
  },
  setSelectionCircleCenterMark: (on) => { setSelectionCircleCenterMark(state, helpers, on); draw(); },
  setFilletRadius: (v) => { setFilletRadius(state, v); draw(); },
  setFilletLineMode: (m) => { setFilletLineMode(state, m); draw(); },
  setFilletNoTrim: (on) => { setFilletNoTrim(state, on); draw(); },
  setTrimNoDelete: (v) => { state.trimSettings.noDelete = !!v; draw(); },
  setPageSetup: (patch) => {
    const prevUnit = String(state.pageSetup?.unit || "mm");
    const p = { ...(patch || {}) };
    if (Object.prototype.hasOwnProperty.call(p, "scale")) {
      const sc = Math.max(0.0001, Number(p.scale) || 1);
      p.scale = sc;
      if (!state.pageSetup?.customScaleEnabled && !Object.prototype.hasOwnProperty.call(p, "presetScale")) {
        p.presetScale = sc;
      }
    }
    if (Object.prototype.hasOwnProperty.call(p, "customScale")) {
      p.customScale = Math.max(0.0001, Number(p.customScale) || 1);
    }
    if (Object.prototype.hasOwnProperty.call(p, "presetScale")) {
      p.presetScale = Math.max(0.0001, Number(p.presetScale) || 1);
    }
    if (Object.prototype.hasOwnProperty.call(p, "customWidthMm")) {
      p.customWidthMm = Math.max(1, Number(p.customWidthMm) || 1);
    }
    if (Object.prototype.hasOwnProperty.call(p, "customHeightMm")) {
      p.customHeightMm = Math.max(1, Number(p.customHeightMm) || 1);
    }
    if (Object.prototype.hasOwnProperty.call(p, "customScaleEnabled")) {
      const on = !!p.customScaleEnabled;
      if (on && !Object.prototype.hasOwnProperty.call(p, "scale")) {
        p.scale = Math.max(0.0001, Number(p.customScale ?? state.pageSetup?.customScale ?? state.pageSetup?.scale ?? 1) || 1);
      }
      if (!on && !Object.prototype.hasOwnProperty.call(p, "scale")) {
        p.scale = Math.max(0.0001, Number(p.presetScale ?? state.pageSetup?.presetScale ?? state.pageSetup?.scale ?? 1) || 1);
      }
    }
    Object.assign(state.pageSetup, p);
    const nextUnit = String(state.pageSetup?.unit || "mm");
    if (patch && Object.prototype.hasOwnProperty.call(patch, "unit") && nextUnit !== prevUnit) {
      convertStateUnitKeepingPhysicalSize(state, prevUnit, nextUnit);
    }
    scheduleSaveAppSettings();
    draw();
  },
  setMaxZoomScale: (v) => {
    const next = Math.max(state.view.minScale, Number(v) || state.view.maxScale);
    state.view.maxScale = next;
    if (state.view.scale > next) state.view.scale = next;
    scheduleSaveAppSettings();
    draw();
  },
  setFpsDisplay: (on) => uiPrefsOps.setFpsDisplay(on),
  setObjectCountDisplay: (on) => uiPrefsOps.setObjectCountDisplay(on),
  setAutoBackupEnabled: (on) => uiPrefsOps.setAutoBackupEnabled(on),
  setAutoBackupIntervalSec: (sec) => uiPrefsOps.setAutoBackupIntervalSec(sec),
  setTouchMode: (on) => uiPrefsOps.setTouchMode(on),
  setTouchMultiSelect: (on) => uiPrefsOps.setTouchMultiSelect(on),
  setImportDxfAsPolyline: (on) => uiPrefsOps.setImportDxfAsPolyline(on),
  confirmTouchRectStep: () => {
    if (!(String(state.tool || "") === "rect" && !!state.ui?.touchMode)) return false;
    if (!state.input.touchRectDraft || typeof state.input.touchRectDraft !== "object") {
      state.input.touchRectDraft = { stage: 0, p1: null, candidateStart: null, candidateEnd: null };
    }
    const d = state.input.touchRectDraft;
    if (Number(d.stage) === 1 && d.p1 && d.candidateEnd) {
      const p1 = { x: Number(d.p1.x), y: Number(d.p1.y) };
      const p2 = { x: Number(d.candidateEnd.x), y: Number(d.candidateEnd.y) };
      const lines = buildRectAsLines(p1, p2);
      lines.forEach((l) => {
        l.id = nextShapeId(state);
        l.layerId = state.activeLayerId;
        l.color = "#0f172a";
        l.lineWidthMm = Math.max(0.01, Number(state.rectSettings?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        l.lineType = String(state.rectSettings?.lineType || "solid");
      });
      pushHistory(state);
      addShapesAsGroup(state, lines);
      clearSelection(state);
      state.activeGroupId = null;
      state.preview = null;
      state.input.dragStartWorld = null;
      state.input.touchRectDraft = { stage: 0, p1: null, candidateStart: null, candidateEnd: null };
      setStatus("RECT created");
      draw();
      return true;
    }
    if (d.candidateStart) {
      d.p1 = { x: Number(d.candidateStart.x), y: Number(d.candidateStart.y) };
      d.stage = 1;
      d.candidateEnd = null;
      state.input.dragStartWorld = { x: Number(d.p1.x), y: Number(d.p1.y) };
      state.preview = createPosition(d.p1);
      state.preview.positionPreviewMode = "marker";
      setStatus("RECT: second point candidate, then Confirm");
      draw();
      return true;
    }
    setStatus("RECT: tap first point candidate");
    draw();
    return false;
  },
  cancelTouchPending: () => {
    let changed = false;
    if (state.polylineDraft) {
      state.polylineDraft = null;
      changed = true;
    }
    if (state.dimDraft) {
      state.dimDraft = null;
      changed = true;
    }
    if (Array.isArray(state.input?.circleThreePointRefs) && state.input.circleThreePointRefs.length) {
      state.input.circleThreePointRefs = [];
      changed = true;
    }
    if (state.hatchDraft?.boundaryIds?.length) {
      state.hatchDraft.boundaryIds = [];
      changed = true;
    }
    if (state.input?.touchRectDraft) {
      const d = state.input.touchRectDraft;
      if (d.stage || d.p1 || d.candidateStart || d.candidateEnd) changed = true;
    }
    state.input.touchRectDraft = { stage: 0, p1: null, candidateStart: null, candidateEnd: null };
    state.input.dragStartWorld = null;
    state.preview = null;
    if (changed) {
      setStatus("Canceled");
      draw();
      return true;
    }
    return false;
  },
  setToolShortcut: (tool, key) => uiPrefsOps.setToolShortcut(tool, key),
  resetToolShortcuts: () => uiPrefsOps.resetToolShortcuts(),
  setPatternCopyMode: (mode) => {
    setPatternCopyMode(state, mode);
    draw();
  },
  setPatternCopyCenterFromSelection: () => setPatternCopyCenterFromSelection(state, helpers),
  clearPatternCopyCenter: () => clearPatternCopyCenter(state, helpers),
  setPatternCopyAxisFromSelection: () => setPatternCopyAxisFromSelection(state, helpers),
  clearPatternCopyAxis: () => clearPatternCopyAxis(state, helpers),
  executePatternCopy: () => executePatternCopy(state, helpers),
  setDimSettings: (patch) => { Object.assign(state.dimSettings, patch); draw(); },
  applyDimSettingsToSelection: (patch) => applyDimSettingsToSelection(state, helpers, patch),
  setHatchSettings: (patch) => {
    const p = patch || {};
    Object.assign(state.hatchSettings, p);
    const selIds = new Set((state.selection?.ids || []).map(Number));
    if (selIds.size) {
      for (const s of (state.shapes || [])) {
        if (!selIds.has(Number(s.id)) || s.type !== "hatch") continue;
        if (Object.prototype.hasOwnProperty.call(p, "pitchMm")) s.pitchMm = Number(p.pitchMm);
        if (Object.prototype.hasOwnProperty.call(p, "angleDeg")) {
          s.angleDeg = Number(p.angleDeg);
          s.hatchAngleDeg = Number(p.angleDeg);
        }
        if (Object.prototype.hasOwnProperty.call(p, "pattern")) {
          s.pattern = String(p.pattern);
          s.hatchPattern = String(p.pattern);
        }
        if (Object.prototype.hasOwnProperty.call(p, "crossAngleDeg")) {
          s.crossAngleDeg = Number(p.crossAngleDeg);
          s.hatchCrossAngleDeg = Number(p.crossAngleDeg);
        }
        if (Object.prototype.hasOwnProperty.call(p, "lineShiftMm")) s.lineShiftMm = Number(p.lineShiftMm);
        if (Object.prototype.hasOwnProperty.call(p, "repetitionPaddingMm")) s.repetitionPaddingMm = Number(p.repetitionPaddingMm);
        if (Object.prototype.hasOwnProperty.call(p, "lineDashMm")) s.lineDashMm = Number(p.lineDashMm);
        if (Object.prototype.hasOwnProperty.call(p, "lineGapMm")) s.lineGapMm = Number(p.lineGapMm);
        if (Object.prototype.hasOwnProperty.call(p, "lineType")) {
          s.lineType = String(p.lineType);
        }
        if (Object.prototype.hasOwnProperty.call(p, "lineWidthMm")) {
          s.lineWidthMm = Math.max(0.01, Number(p.lineWidthMm) || 0.25);
        }
        if (Object.prototype.hasOwnProperty.call(p, "fillEnabled")) {
          s.fillEnabled = !!p.fillEnabled;
        }
        if (Object.prototype.hasOwnProperty.call(p, "fillColor")) {
          s.fillColor = String(p.fillColor || "#dbeafe");
        }
        if (Object.prototype.hasOwnProperty.call(p, "lineColor")) {
          s.lineColor = String(p.lineColor || "#0f172a");
        }
      }
    }
    draw();
  },
  addSelectedAttribute: (name, value, target = "object") => attributeOps.addSelectedAttribute(name, value, target),
  removeSelectedAttribute: (attrId) => attributeOps.removeSelectedAttribute(attrId),
  updateSelectedAttribute: (attrId, patch) => attributeOps.updateSelectedAttribute(attrId, patch),
  setVertexMoveInputs: (dx, dy) => { setVertexMoveInputs(state, dx, dy); draw(); },
  executeDoubleLine: () => doubleLineOps.executeDoubleLineAction(),
  cancelDoubleLineTrimPending: () => doubleLineOps.cancelDoubleLineTrimPendingAction(),
  beginMoveActiveGroupOriginOnly: () => {
    if (state.activeGroupId != null) {
      state.input.groupOriginPick.active = !state.input.groupOriginPick.active;
      if (setStatus) setStatus(state.input.groupOriginPick.active ? "Click or drag to move group origin" : "Ready");
      draw();
    }
  },
  render,
};
const fileOps = createFileOpsRuntime({
  state,
  dom,
  getPageFrameWorldSize,
  nextShapeId,
  pushHistory,
  addShape,
  setSelection,
  setStatus,
  draw,
  importJsonObject,
  importJsonObjectAppend,
  helpers
});

// Initialize UI
const loadedAppSettings = loadAppSettingsAtStartup();
if (!loadedAppSettings) {
  if (!state.ui) state.ui = {};
  state.ui.language = detectInitialUiLanguage();
  saveAppSettingsNow();
}
initUi(state, dom, helpers);

// setupInputListeners
setupInputListeners(state, dom, helpers);

ensureUngroupedShapesHaveGroups(state);
const restoredFromAutoBackup = restoreAutoBackupAtStartup();
resizeCanvas();
if (!restoredFromAutoBackup) resetView();
if (!state.ui) state.ui = {};
state.ui._needsTangentResolve = true;
draw();

if (typeof state.ui.autoBackupEnabled !== "boolean") state.ui.autoBackupEnabled = true;
state.ui.toolShortcuts = sanitizeToolShortcuts(state.ui.toolShortcuts);
if (!Number.isFinite(Number(state.ui.autoBackupIntervalSec))) {
  state.ui.autoBackupIntervalSec = Math.round(AUTO_BACKUP_INTERVAL_MS / 1000);
}
refreshAutoBackupTimer();

window.addEventListener("beforeunload", () => {
  saveAppSettingsNow();
  saveAutoBackup();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveAutoBackup();
});

fileOps.bindJsonFileInputChange();
fileOps.bindDropImport();

// Handle exports for manual access if needed
window.cadApp = { state, dom, helpers, exportJsonObject, importJsonObject };




