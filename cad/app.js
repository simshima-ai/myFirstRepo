import {
  createState, addShape, nextShapeId, setSelection, clearSelection, setTool,
  pushHistory, pushHistorySnapshot, snapshotModel, restoreModel, undo, redo, removeShapeById,
  addLayer, setActiveLayer, setLayerVisible, setLayerLocked, isLayerVisible, isLayerLocked,
  createGroupFromSelection, getGroup, setActiveGroup, moveGroupOrigin, addGroup, addShapesAsGroup
} from "./state.js";
import { render } from "./render.js";
import { initUi, refreshUi } from "./ui.js";

import {
  ensureUngroupedShapesHaveGroups, selectGroupById,
  getTrimHoverCandidate, hitTestShapes,
  resolveVertexTangentAttribs
} from "./app_selection.js";

import {
  trimClickedLineAtNearestIntersection, saveJsonToFile, loadJsonFromFileDialog,
  createLine, createRect, createCircle, createPosition, createText, createArc,
  applyLineInput, applyRectInput, applyCircleInput, applyFillet,
  setObjectSnapEnabled, setObjectSnapKind, setGridSize, setGridSnap, setGridShow, setGridAuto, setGridAutoThresholds,
  cycleLayerMode, renameActiveLayer, moveSelectionToLayer, setLayerColorize, setEditOnlyActiveLayer,
  deleteActiveGroup, unparentActiveGroup, moveActiveGroup,
  updateSelectedTextSettings, moveSelectedShapes, moveSelectedVertices,
  setGroupRotateSnap, setVertexLinkCoincident, setLineInputs, setRectInputs, setCircleRadiusInput,
  setSelectionCircleCenterMark, setFilletRadius, setFilletLineMode, setVertexMoveInputs,
  executeDoubleLine, exportJsonObject, importJsonObject
} from "./app_tools.js";

import {
  setupInputListeners, getMouseScreen, getMouseWorld, panByScreenDelta, zoomAt
} from "./app_input.js";

const state = createState();
state.buildVersion = "v158-refactor-modular";

const dom = {
  canvas: document.getElementById("cadCanvas"),
  toolButtons: document.getElementById("toolButtons"),
  gridSizeInput: document.getElementById("gridSizeInput"),
  gridSizeContextInput: document.getElementById("gridSizeContextInput"),
  gridSnapToggle: document.getElementById("gridSnapToggle"),
  gridSnapContextToggle: document.getElementById("gridSnapContextToggle"),
  gridShowToggle: document.getElementById("gridShowToggle"),
  gridShowContextToggle: document.getElementById("gridShowContextToggle"),
  gridAutoToggle: document.getElementById("gridAutoToggle"),
  gridAutoContextToggle: document.getElementById("gridAutoContextToggle"),
  gridAutoThreshold50ContextInput: document.getElementById("gridAutoThreshold50ContextInput"),
  gridAutoThreshold10ContextInput: document.getElementById("gridAutoThreshold10ContextInput"),
  objSnapToggle: document.getElementById("objSnapToggle"),
  objSnapEndpointToggle: document.getElementById("objSnapEndpointToggle"),
  objSnapCenterToggle: document.getElementById("objSnapCenterToggle"),
  objSnapIntersectionToggle: document.getElementById("objSnapIntersectionToggle"),
  objSnapTangentToggle: document.getElementById("objSnapTangentToggle"),
  objSnapVectorToggle: document.getElementById("objSnapVectorToggle"),
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  saveJsonBtn: document.getElementById("saveJsonBtn"),
  loadJsonBtn: document.getElementById("loadJsonBtn"),
  jsonFileInput: document.getElementById("jsonFileInput"),
  activeLayerSelect: document.getElementById("activeLayerSelect"),
  newLayerNameInput: document.getElementById("newLayerNameInput"),
  addLayerBtn: document.getElementById("addLayerBtn"),
  renameLayerNameInput: document.getElementById("renameLayerNameInput"),
  renameLayerBtn: document.getElementById("renameLayerBtn"),
  moveSelectionLayerBtn: document.getElementById("moveSelectionLayerBtn"),
  layerColorizeToggle: document.getElementById("layerColorizeToggle"),
  editOnlyActiveLayerToggle: document.getElementById("editOnlyActiveLayerToggle"),
  layerPanelInnerOpsToggle: document.querySelector("[data-layer-inner-toggle='ops']"),
  layerPanelInnerOps: document.querySelector("[data-layer-inner-panel='ops']"),
  layerList: document.getElementById("layerList"),
  newGroupNameInput: document.getElementById("newGroupNameInput"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  mergeGroupsBtn: document.getElementById("mergeGroupsBtn"),
  deleteGroupBtn: document.getElementById("deleteGroupBtn"),
  unparentGroupBtn: document.getElementById("unparentGroupBtn"),
  groupList: document.getElementById("groupList"),
  groupRotateSnapInput: document.getElementById("groupRotateSnapInput"),
  groupMoveDxInput: document.getElementById("groupMoveDxInput"),
  groupMoveDyInput: document.getElementById("groupMoveDyInput"),
  moveGroupBtn: document.getElementById("moveGroupBtn"),
  moveGroupOriginOnlyBtn: document.getElementById("moveGroupOriginOnlyBtn"),
  selectMoveDxInput: document.getElementById("selectMoveDxInput"),
  selectMoveDyInput: document.getElementById("selectMoveDyInput"),
  moveSelectedShapesBtn: document.getElementById("moveSelectedShapesBtn"),

  patternCopyModeSelect: document.getElementById("patternCopyModeSelect"),
  patternCopyArrayOptions: document.getElementById("patternCopyArrayOptions"),
  patternCopyArrayDxInput: document.getElementById("patternCopyArrayDxInput"),
  patternCopyArrayDyInput: document.getElementById("patternCopyArrayDyInput"),
  patternCopyArrayCountXInput: document.getElementById("patternCopyArrayCountXInput"),
  patternCopyArrayCountYInput: document.getElementById("patternCopyArrayCountYInput"),
  patternCopyRotateOptions: document.getElementById("patternCopyRotateOptions"),
  patternCopyRotateAngleInput: document.getElementById("patternCopyRotateAngleInput"),
  patternCopyRotateCountInput: document.getElementById("patternCopyRotateCountInput"),
  patternCopySetCenterBtn: document.getElementById("patternCopySetCenterBtn"),
  patternCopyCenterStatus: document.getElementById("patternCopyCenterStatus"),
  patternCopyMirrorOptions: document.getElementById("patternCopyMirrorOptions"),
  patternCopySetAxisBtn: document.getElementById("patternCopySetAxisBtn"),
  patternCopyAxisStatus: document.getElementById("patternCopyAxisStatus"),
  patternCopyApplyBtn: document.getElementById("patternCopyApplyBtn"),

  selectionTextEdit: document.getElementById("selectionTextEdit"),
  selectionTextContentInput: document.getElementById("selectionTextContentInput"),
  selectionTextSizePtInput: document.getElementById("selectionTextSizePtInput"),
  selectionTextRotateInput: document.getElementById("selectionTextRotateInput"),
  selectionTextFontFamilyInput: document.getElementById("selectionTextFontFamilyInput"),
  selectionTextBoldInput: document.getElementById("selectionTextBoldInput"),
  selectionTextItalicInput: document.getElementById("selectionTextItalicInput"),
  selectionTextColorInput: document.getElementById("selectionTextColorInput"),
  vertexMoveDxInput: document.getElementById("vertexMoveDxInput"),
  vertexMoveDyInput: document.getElementById("vertexMoveDyInput"),
  moveVertexBtn: document.getElementById("moveVertexBtn"),
  vertexLinkCoincidentToggle: document.getElementById("vertexLinkCoincidentToggle"),
  lineLengthInput: document.getElementById("lineLengthInput"),
  lineAngleInput: document.getElementById("lineAngleInput"),
  applyLineInputBtn: document.getElementById("applyLineInputBtn"),
  rectWidthInput: document.getElementById("rectWidthInput"),
  rectHeightInput: document.getElementById("rectHeightInput"),
  applyRectInputBtn: document.getElementById("applyRectInputBtn"),
  circleRadiusInput: document.getElementById("circleRadiusInput"),
  circleCenterMarkToggle: document.getElementById("circleCenterMarkToggle"),
  applyCircleInputBtn: document.getElementById("applyCircleInputBtn"),
  filletRadiusInput: document.getElementById("filletRadiusInput"),
  filletLineModeSelect: document.getElementById("filletLineModeSelect"),
  applyFilletBtn: document.getElementById("applyFilletBtn"),
  trimNoDeleteToggle: document.getElementById("trimNoDeleteToggle"),
  objSnapTangentKeepToggle: document.getElementById("objSnapTangentKeepToggle"),
  positionSizeInput: document.getElementById("positionSizeInput"),
  textContentInput: document.getElementById("textContentInput"),
  textSizePtInput: document.getElementById("textSizePtInput"),
  textRotateInput: document.getElementById("textRotateInput"),
  textFontFamilyInput: document.getElementById("textFontFamilyInput"),
  textBoldInput: document.getElementById("textBoldInput"),
  textItalicInput: document.getElementById("textItalicInput"),
  textColorInput: document.getElementById("textColorInput"),
  dimPrecisionSelect: document.getElementById("dimPrecisionSelect"),
  applyDimPrecisionBtn: document.getElementById("applyDimPrecisionBtn"),
  dimLinearModeSelect: document.getElementById("dim-linear-mode-select"),
  dimLinearModeChainOption: document.getElementById("dim-linear-mode-chain-option"),
  dimSnapModeSelect: document.getElementById("dim-snap-mode-select"),
  dimCircleModeSelect: document.getElementById("dim-circle-mode-select"),
  dimTextRotateInput: document.getElementById("dim-text-rotate-input"),
  dimExtOffsetInput: document.getElementById("dim-ext-offset-input"),
  dimExtOverInput: document.getElementById("dim-ext-over-input"),
  dimROvershootInput: document.getElementById("dim-r-overshoot-input"),
  popDimChainPointBtn: document.getElementById("pop-dim-chain-point-btn"),
  previewPrecisionSelect: document.getElementById("previewPrecisionSelect"),
  pageSizeSelect: document.getElementById("pageSizeSelect"),
  pageOrientationSelect: document.getElementById("pageOrientationSelect"),
  pageScaleInput: document.getElementById("pageScaleInput"),
  pageUnitSelect: document.getElementById("pageUnitSelect"),
  pageShowFrameToggle: document.getElementById("pageShowFrameToggle"),
  pageInnerMarginInput: document.getElementById("pageInnerMarginInput"),
  hatchPitchInput: document.getElementById("hatchPitchInput"),
  hatchAngleInput: document.getElementById("hatchAngleInput"),
  hatchPatternSelect: document.getElementById("hatchPatternSelect"),
  hatchCrossAngleInput: document.getElementById("hatchCrossAngleInput"),
  hatchPaddingInput: document.getElementById("hatchPaddingInput"),
  hatchLineTypeSelect: document.getElementById("hatchLineTypeSelect"),
  hatchDashMmInput: document.getElementById("hatchDashMmInput"),
  hatchGapMmInput: document.getElementById("hatchGapMmInput"),
  applyHatchBtn: document.getElementById("applyHatchBtn"),
  dlineOffsetInput: document.getElementById("dlineOffsetInput"),
  dlineModeSelect: document.getElementById("dlineModeSelect"),
  applyDLineBtn: document.getElementById("applyDLineBtn"),
  resetViewBtn: document.getElementById("resetViewBtn"),
  buildBadge: document.getElementById("buildBadge"),
  statusText: document.getElementById("statusText"),
};
const ctx = dom.canvas.getContext("2d");

function setStatus(text) {
  if (dom.statusText) dom.statusText.textContent = text;
}

function draw() {
  // Resolve tangent constraints on every render — covers undo/redo, group ops, JSON load, trim, etc.
  if (state.vertexEdit?.drag?.active) {
    // During vertex drag, exclude shapes being directly edited to avoid fighting user input
    const excludeIds = new Set((state.vertexEdit.drag.baseShapeSnapshots || []).map(it => Number(it.id)));
    resolveVertexTangentAttribs(state, excludeIds);
  } else {
    resolveVertexTangentAttribs(state);
  }
  render(ctx, dom.canvas, state);
  refreshUi(state, dom);
}

function resizeCanvas() {
  const rect = dom.canvas.getBoundingClientRect();
  if (!rect) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  dom.canvas.width = Math.round(rect.width * dpr);
  dom.canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function resetView() {
  state.view.offsetX = 0;
  state.view.offsetY = 0;
  state.view.scale = 1.0;
  draw();
}

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
  finalizeDimDraft: () => finalizeDimDraft(state, helpers),
  trimClickedLineAtNearestIntersection: (st, wr, h) => trimClickedLineAtNearestIntersection(st, wr, h),
  getTrimHoverCandidate: (st, wr) => getTrimHoverCandidate(st, wr, dom),
  hitTestShapes: (st, wr, d) => hitTestShapes(st, wr, d || dom),
  resizeCanvas,
  beginOrAdvanceDim: (wr) => beginOrAdvanceDim(state, wr, helpers),
  updateDimHover: (wr) => updateDimHover(state, wr, helpers),
  beginOrExtendPolyline: (w) => beginOrExtendPolyline(state, w),
  updatePolylineHover: (w) => updatePolylineHover(state, w),
  finalizePolylineDraft: () => finalizePolylineDraft(state, helpers),
  executeHatch: () => executeHatch(state, helpers),
  trimateFillet: (r, h) => trimateFillet(state, r, h, helpers),
  setTool: (t) => { setTool(state, t); draw(); },
  undo: () => { if (undo(state)) { setStatus("Undo"); draw(); } },
  redo: () => { if (redo(state)) { setStatus("Redo"); draw(); } },
  delete: () => {
    if (state.selection.ids.length > 0) {
      pushHistory(state);
      for (const id of [...state.selection.ids]) removeShapeById(state, id);
      setSelection(state, []);
      setStatus("Deleted selection");
      draw();
    }
  },
  resetView,
  loadJson: () => loadJsonFromFileDialog(state, dom),
  saveJson: () => saveJsonToFile(state, helpers),

  createLine: (p1, p2) => createLine(p1, p2),
  createRect: (p1, p2) => createRect(p1, p2),
  createCircle: (c, e) => createCircle(c, e),
  createPosition: (p) => createPosition(p),
  createText: (p, s) => createText(p, s),
  createArc: (c, r, a1, a2, ccw) => createArc(c, r, a1, a2, ccw),

  applyLineInput: (len, ang) => applyLineInput(state, helpers, len, ang),
  applyRectInput: (w, h) => applyRectInput(state, helpers, w, h),
  applyCircleInput: (r) => applyCircleInput(state, helpers, r),
  applyFillet: (r) => applyFillet(state, helpers, r),

  setObjectSnapEnabled: (v) => { setObjectSnapEnabled(state, v); draw(); },
  setObjectSnapKind: (k, v) => { setObjectSnapKind(state, k, v); draw(); },
  setGridSize: (v) => { setGridSize(state, v); draw(); },
  setGridSnap: (v) => { setGridSnap(state, v); draw(); },
  setGridShow: (v) => { setGridShow(state, v); draw(); },
  setGridAuto: (v) => { setGridAuto(state, v); draw(); },
  setGridAutoThresholds: (t50, t10) => { setGridAutoThresholds(state, t50, t10); draw(); },

  setActiveLayer: (id) => { setActiveLayer(state, id); draw(); },
  selectGroup: (id) => { selectGroupById(state, id); draw(); },
  selectShapeById: (id) => { setSelection(state, [id]); draw(); },
  cycleLayerMode: (id) => { cycleLayerMode(state, helpers, id); draw(); },
  renameActiveLayer: (n) => { renameActiveLayer(state, helpers, n); draw(); },
  moveSelectionToLayer: () => { moveSelectionToLayer(state, helpers); draw(); },
  setLayerColorize: (v) => { setLayerColorize(state, helpers, v); draw(); },
  setEditOnlyActiveLayer: (v) => { setEditOnlyActiveLayer(state, helpers, v); draw(); },
  deleteActiveGroup: () => deleteActiveGroup(state, helpers),
  unparentActiveGroup: () => unparentActiveGroup(state, helpers),
  moveActiveGroup: (dx, dy) => moveActiveGroup(state, helpers, dx, dy),
  setActiveGroupParent: (pid) => { pushHistory(state); const g = getGroup(state, state.selection.activeGroupId); if (g) g.parentId = pid; draw(); },
  moveShapeToGroup: (sid, gid) => { pushHistory(state); const s = state.shapes.find(sh => sh.id === sid); if (s) s.groupId = gid; draw(); },
  createGroupFromSelection: (name) => { pushHistory(state); const g = createGroupFromSelection(state, name); draw(); return g; },

  updateSelectedTextSettings: (s) => updateSelectedTextSettings(state, helpers, s),
  moveSelectedShapes: (dx, dy) => moveSelectedShapes(state, helpers, dx, dy),
  moveSelectedVertices: (dx, dy) => moveSelectedVertices(state, helpers, dx, dy),

  setGroupRotateSnap: (v) => { setGroupRotateSnap(state, v); draw(); },
  setVertexLinkCoincident: (v) => { setVertexLinkCoincident(state, v); draw(); },
  setLineInputs: (l, a) => { setLineInputs(state, l, a); draw(); },
  setRectInputs: (w, h) => { setRectInputs(state, w, h); draw(); },
  setCircleRadiusInput: (r) => { setCircleRadiusInput(state, r); draw(); },
  setSelectionCircleCenterMark: (on) => { setSelectionCircleCenterMark(state, helpers, on); draw(); },
  setFilletRadius: (v) => { setFilletRadius(state, v); draw(); },
  setFilletLineMode: (m) => { setFilletLineMode(state, m); draw(); },
  setTrimNoDelete: (v) => { state.trimSettings.noDelete = !!v; draw(); },
  setPageSetup: (patch) => { Object.assign(state.pageSetup, patch); draw(); },
  setDimSettings: (patch) => { Object.assign(state.dimSettings, patch); draw(); },
  setHatchSettings: (patch) => { Object.assign(state.hatchSettings, patch); draw(); },
  setVertexMoveInputs: (dx, dy) => { setVertexMoveInputs(state, dx, dy); draw(); },
  executeDoubleLine: () => { pushHistory(state); executeDoubleLine(state); draw(); },
  beginMoveActiveGroupOriginOnly: () => {
    if (state.activeGroupId != null) {
      state.input.groupOriginPick.active = !state.input.groupOriginPick.active;
      if (setStatus) setStatus(state.input.groupOriginPick.active ? "Click or drag to move group origin" : "Ready");
      draw();
    }
  },
};

// Initialize UI
initUi(state, dom, helpers);

// setupInputListeners
setupInputListeners(state, dom, helpers);

ensureUngroupedShapesHaveGroups(state);
resetView();
resizeCanvas();

// Handle exports for manual access if needed
window.cadApp = { state, dom, helpers, exportJsonObject, importJsonObject };
