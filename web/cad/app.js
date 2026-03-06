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
  resolveVertexTangentAttribs
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
  setSelectedColor,
  setFilletNoTrim,
  executeDoubleLine, buildDoubleLineTargetLineIntersections, exportJsonObject, importJsonObject, importJsonObjectAppend, exportPdf, exportSvg,
  beginOrAdvanceDim, updateDimHover, finalizeDimDraft,
  beginOrExtendPolyline, updatePolylineHover, finalizePolylineDraft,
  executeHatch, trimateFillet, applyDimSettingsToSelection, mergeSelectedShapesToGroup,
  setPatternCopyMode, setPatternCopyCenterFromSelection, clearPatternCopyCenter,
  setPatternCopyAxisFromSelection, clearPatternCopyAxis, executePatternCopy
} from "./app_tools.js";

import {
  setupInputListeners, getMouseScreen, getMouseWorld, panByScreenDelta, zoomAt
} from "./app_input.js";
import { getEffectiveGridSize } from "./geom.js";

const state = createState();
let resetViewFlashTimer = null;
let autoBackupTimer = null;
let autoBackupBadgeTimer = null;
let settingsSaveTimer = null;
state.buildVersion = "v158-refactor-modular";
const AUTO_BACKUP_KEY = "s-cad:auto-backup:v1";
const AUTO_BACKUP_INTERVAL_MS = 15000;
const APP_SETTINGS_KEY = "s-cad:settings:v1";

const dom = {
  canvas: document.getElementById("cadCanvas"),
  toolButtons: document.getElementById("toolButtons"),
  editToolButtons: document.getElementById("editToolButtons"),
  fileToolButtons: document.getElementById("fileToolButtons"),
  gridSizeInput: document.getElementById("gridSizeInput"),
  gridSizeContextInput: document.getElementById("gridSizeContextInput"),
  gridSnapToggle: document.getElementById("gridSnapToggle"),
  gridSnapContextToggle: document.getElementById("gridSnapContextToggle"),
  gridShowToggle: document.getElementById("gridShowToggle"),
  gridShowContextToggle: document.getElementById("gridShowContextToggle"),
  gridAutoToggle: document.getElementById("gridAutoToggle"),
  gridAutoContextToggle: document.getElementById("gridAutoContextToggle"),
  gridAutoTimingSlider: document.getElementById("gridAutoTimingSlider"),
  gridAutoTimingLabel: document.getElementById("gridAutoTimingLabel"),
  gridAutoTimingHint: document.getElementById("gridAutoTimingHint"),
  objSnapToggle: document.getElementById("objSnapToggle"),
  objSnapEndpointToggle: document.getElementById("objSnapEndpointToggle"),
  objSnapMidpointToggle: document.getElementById("objSnapMidpointToggle"),
  objSnapCenterToggle: document.getElementById("objSnapCenterToggle"),
  objSnapIntersectionToggle: document.getElementById("objSnapIntersectionToggle"),
  objSnapTangentToggle: document.getElementById("objSnapTangentToggle"),
  objSnapVectorToggle: document.getElementById("objSnapVectorToggle"),
  attrPanel: document.getElementById("attrPanel"),
  attrList: document.getElementById("attrList"),
  attrNameInput: document.getElementById("attrNameInput"),
  attrValueInput: document.getElementById("attrValueInput"),
  attrAddBtn: document.getElementById("attrAddBtn"),
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
  deleteLayerBtn: document.getElementById("deleteLayerBtn"),
  layerColorizeToggle: document.getElementById("layerColorizeToggle"),
  editOnlyActiveLayerToggle: document.getElementById("editOnlyActiveLayerToggle"),
  layerPanelInnerOpsToggle: document.querySelector("[data-layer-inner-toggle='ops']"),
  layerPanelInnerOps: document.querySelector("[data-layer-inner-panel='ops']"),
  groupPanelInnerOpsToggle: document.querySelector("[data-layer-inner-toggle='groupOps']"),
  groupPanelInnerOps: document.querySelector("[data-layer-inner-panel='groupOps']"),
  layerList: document.getElementById("layerList"),
  moveGroupUpBtn: document.getElementById("moveGroupUpBtn"),
  moveGroupDownBtn: document.getElementById("moveGroupDownBtn"),
  selectPickObjectBtn: document.getElementById("selectPickObjectBtn"),
  selectPickGroupBtn: document.getElementById("selectPickGroupBtn"),
  renameGroupNameInput: document.getElementById("renameGroupNameInput"),
  renameGroupBtn: document.getElementById("renameGroupBtn"),
  groupColorizeToggle: document.getElementById("groupColorizeToggle"),
  moveLayerUpBtn: document.getElementById("moveLayerUpBtn"),
  moveLayerDownBtn: document.getElementById("moveLayerDownBtn"),
  newGroupNameInput: document.getElementById("newGroupNameInput"),
  createGroupBtn: document.getElementById("createGroupBtn"),
  mergeGroupsBtn: document.getElementById("mergeGroupsBtn"),
  dimMergeGroupsBtn: document.getElementById("dimMergeGroupsBtn"),
  deleteGroupBtn: document.getElementById("deleteGroupBtn"),
  unparentGroupBtn: document.getElementById("unparentGroupBtn"),
  groupList: document.getElementById("groupList"),
  groupRotateSnapInput: document.getElementById("groupRotateSnapInput"),
  groupMoveDxInput: document.getElementById("groupMoveDxInput"),
  groupMoveDyInput: document.getElementById("groupMoveDyInput"),
  moveGroupBtn: document.getElementById("moveGroupBtn"),
  copyGroupBtn: document.getElementById("copyGroupBtn"),
  moveGroupOriginOnlyBtn: document.getElementById("moveGroupOriginOnlyBtn"),
  groupAimEnableToggle: document.getElementById("groupAimEnableToggle"),
  groupAimPickBtn: document.getElementById("groupAimPickBtn"),
  groupAimClearBtn: document.getElementById("groupAimClearBtn"),
  groupAimStatus: document.getElementById("groupAimStatus"),
  selectMoveDxInput: document.getElementById("selectMoveDxInput"),
  selectMoveDyInput: document.getElementById("selectMoveDyInput"),
  moveSelectedShapesBtn: document.getElementById("moveSelectedShapesBtn"),
  copySelectedShapesBtn: document.getElementById("copySelectedShapesBtn"),

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
  selectionLineWidthInput: document.getElementById("selectionLineWidthInput"),
  selectionLineTypeInput: document.getElementById("selectionLineTypeInput"),
  selectionColorInput: document.getElementById("selectionColorInput"),
  selectionPositionSizeInput: document.getElementById("selectionPositionSizeInput"),
  selectionImageWidthInput: document.getElementById("selectionImageWidthInput"),
  selectionImageHeightInput: document.getElementById("selectionImageHeightInput"),
  selectionImageLockAspectToggle: document.getElementById("selectionImageLockAspectToggle"),
  selectionImageLockTransformToggle: document.getElementById("selectionImageLockTransformToggle"),
  selectionCircleRadiusInput: document.getElementById("selectionCircleRadiusInput"),
  selectionApplyCircleRadiusBtn: document.getElementById("selectionApplyCircleRadiusBtn"),
  selectionCircleCenterMarkToggle: document.getElementById("selectionCircleCenterMarkToggle"),
  vertexMoveDxInput: document.getElementById("vertexMoveDxInput"),
  vertexMoveDyInput: document.getElementById("vertexMoveDyInput"),
  moveVertexBtn: document.getElementById("moveVertexBtn"),
  vertexLinkCoincidentToggle: document.getElementById("vertexLinkCoincidentToggle"),
  lineLengthInput: document.getElementById("lineLengthInput"),
  lineAngleInput: document.getElementById("lineAngleInput"),
  lineAnchorSelect: document.getElementById("lineAnchorSelect"),
  lineModeSelect: document.getElementById("lineModeSelect"),
  lineToolLineWidthInput: document.getElementById("lineToolLineWidthInput"),
  lineToolLineTypeInput: document.getElementById("lineToolLineTypeInput"),
  applyLineInputBtn: document.getElementById("applyLineInputBtn"),
  lineTouchFinalizeBtn: document.getElementById("lineTouchFinalizeBtn"),
  rectWidthInput: document.getElementById("rectWidthInput"),
  rectHeightInput: document.getElementById("rectHeightInput"),
  rectAnchorSelect: document.getElementById("rectAnchorSelect"),
  rectToolLineWidthInput: document.getElementById("rectToolLineWidthInput"),
  rectToolLineTypeInput: document.getElementById("rectToolLineTypeInput"),
  applyRectInputBtn: document.getElementById("applyRectInputBtn"),
  circleRadiusInput: document.getElementById("circleRadiusInput"),
  circleModeSelect: document.getElementById("circleModeSelect"),
  circleRadiusRow: document.getElementById("circleRadiusRow"),
  circleThreePointHint: document.getElementById("circleThreePointHint"),
  circleThreePointOps: document.getElementById("circleThreePointOps"),
  circleThreePointAddBtn: document.getElementById("circleThreePointAddBtn"),
  circleThreePointRunBtn: document.getElementById("circleThreePointRunBtn"),
  circleCenterMarkToggle: document.getElementById("circleCenterMarkToggle"),
  circleToolLineWidthInput: document.getElementById("circleToolLineWidthInput"),
  circleToolLineTypeInput: document.getElementById("circleToolLineTypeInput"),
  applyCircleInputBtn: document.getElementById("applyCircleInputBtn"),
  filletRadiusInput: document.getElementById("filletRadiusInput"),
  filletLineModeSelect: document.getElementById("filletLineModeSelect"),
  filletNoTrimToggle: document.getElementById("filletNoTrimToggle"),
  filletToolLineWidthInput: document.getElementById("filletToolLineWidthInput"),
  filletToolLineTypeInput: document.getElementById("filletToolLineTypeInput"),
  applyFilletBtn: document.getElementById("applyFilletBtn"),
  trimNoDeleteToggle: document.getElementById("trimNoDeleteToggle"),
  objSnapTangentKeepToggle: document.getElementById("objSnapTangentKeepToggle"),
  positionSizeInput: document.getElementById("positionSizeInput"),
  positionToolLineWidthInput: document.getElementById("positionToolLineWidthInput"),
  positionToolLineTypeInput: document.getElementById("positionToolLineTypeInput"),
  textContentInput: document.getElementById("textContentInput"),
  textSizePtInput: document.getElementById("textSizePtInput"),
  textRotateInput: document.getElementById("textRotateInput"),
  textFontFamilyInput: document.getElementById("textFontFamilyInput"),
  textBoldInput: document.getElementById("textBoldInput"),
  textItalicInput: document.getElementById("textItalicInput"),
  textColorInput: document.getElementById("textColorInput"),
  textToolLineWidthInput: document.getElementById("textToolLineWidthInput"),
  textToolLineTypeInput: document.getElementById("textToolLineTypeInput"),
  dimPrecisionSelect: document.getElementById("dimPrecisionSelect"),
  dimArrowTypeSelect: document.getElementById("dimArrowTypeSelect"),
  dimArrowSizeInput: document.getElementById("dimArrowSizeInput"),
  dimArrowDirectionSelect: document.getElementById("dimArrowDirectionSelect"),
  dimFontSizeInput: document.getElementById("dimFontSizeInput"),
  applyDimPrecisionBtn: document.getElementById("applyDimPrecisionBtn"),
  dimLinearMode: document.getElementById("dimLinearMode"),
  dimSnapMode: document.getElementById("dimSnapMode"),
  dimIgnoreGridSnapToggle: document.getElementById("dimIgnoreGridSnapToggle"),
  dimCircleMode: document.getElementById("dimCircleMode"),
  dimCircleArrowSide: document.getElementById("dimCircleArrowSide"),
  dimTextRotateInput: document.getElementById("dimTextRotateInput"),
  dimExtOffsetInput: document.getElementById("dimExtOffsetInput"),
  dimExtOverInput: document.getElementById("dimExtOverInput"),
  dimROvershootInput: document.getElementById("dimROvershootInput"),
  dimToolLineWidthInput: document.getElementById("dimToolLineWidthInput"),
  dimToolLineTypeInput: document.getElementById("dimToolLineTypeInput"),
  dimChainPopBtn: document.getElementById("dimChainPopBtn"),
  dimChainPrepareBtn: document.getElementById("dimChainPrepareBtn"),
  dimChainFinalizeBtn: document.getElementById("dimChainFinalizeBtn"),
  applyDimSettingsBtn: document.getElementById("applyDimSettingsBtn"),
  previewPrecisionSelect: document.getElementById("previewPrecisionSelect"),
  pageSizeSelect: document.getElementById("pageSizeSelect"),
  pageOrientationSelect: document.getElementById("pageOrientationSelect"),
  pageScaleInput: document.getElementById("pageScaleInput"),
  maxZoomInput: document.getElementById("maxZoomInput"),
  uiLanguageSelect: document.getElementById("uiLanguageSelect"),
  menuScaleSelect: document.getElementById("menuScaleSelect"),
  touchModeToggle: document.getElementById("touchModeToggle"),
  leftMenuVisibilityList: document.getElementById("leftMenuVisibilityList"),
  shortcutSettingsLabel: document.getElementById("shortcutSettingsLabel"),
  shortcutSettingsHint: document.getElementById("shortcutSettingsHint"),
  toolShortcutList: document.getElementById("toolShortcutList"),
  resetToolShortcutsBtn: document.getElementById("resetToolShortcutsBtn"),
  fpsDisplayToggle: document.getElementById("fpsDisplayToggle"),
  objectCountDisplayToggle: document.getElementById("objectCountDisplayToggle"),
  autoBackupToggle: document.getElementById("autoBackupToggle"),
  autoBackupIntervalSelect: document.getElementById("autoBackupIntervalSelect"),
  pageUnitSelect: document.getElementById("pageUnitSelect"),
  pageShowFrameToggle: document.getElementById("pageShowFrameToggle"),
  pageInnerMarginInput: document.getElementById("pageInnerMarginInput"),
  hatchPitchInput: document.getElementById("hatchPitchInput"),
  hatchAngleInput: document.getElementById("hatchAngleInput"),
  hatchPaddingInput: document.getElementById("hatchPaddingInput"),
  hatchAltShiftInput: document.getElementById("hatchAltShiftInput"),
  hatchFillToggle: document.getElementById("hatchFillToggle"),
  hatchFillColorInput: document.getElementById("hatchFillColorInput"),
  hatchLineColorInput: document.getElementById("hatchLineColorInput"),
  hatchColorPalette: document.getElementById("hatchColorPalette"),
  hatchPaletteTargetSelect: document.getElementById("hatchPaletteTargetSelect"),
  hatchDashMmInput: document.getElementById("hatchDashMmInput"),
  hatchGapMmInput: document.getElementById("hatchGapMmInput"),
  hatchToolLineWidthInput: document.getElementById("hatchToolLineWidthInput"),
  applyHatchBtn: document.getElementById("applyHatchBtn"),
  dlineOffsetInput: document.getElementById("dlineOffsetInput"),
  dlineModeSelect: document.getElementById("dlineModeSelect"),
  dlineNoTrimToggle: document.getElementById("dlineNoTrimToggle"),
  dlineToolLineWidthInput: document.getElementById("dlineToolLineWidthInput"),
  dlineToolLineTypeInput: document.getElementById("dlineToolLineTypeInput"),
  applyDLineBtn: document.getElementById("applyDLineBtn"),
  resetViewBtn: document.getElementById("resetViewBtn"),
  buildBadge: document.getElementById("buildBadge"),
  fpsBadge: document.getElementById("fpsBadge"),
  objectCountBadge: document.getElementById("objectCountBadge"),
  autoBackupBadge: document.getElementById("autoBackupBadge"),
  statusText: document.getElementById("statusText"),
  touchConfirmOverlay: document.getElementById("touchConfirmOverlay"),
  touchConfirmBtn: document.getElementById("touchConfirmBtn"),
  touchSelectBackOverlay: document.getElementById("touchSelectBackOverlay"),
  touchSelectBackBtn: document.getElementById("touchSelectBackBtn"),
  gridScaleIndicator: document.getElementById("gridScaleIndicator"),
  gridScaleBar: document.getElementById("gridScaleBar"),
  gridScaleText: document.getElementById("gridScaleText"),
  gridAutoDebugText: document.getElementById("gridAutoDebugText"),
  colorPalettePopup: document.getElementById("colorPalettePopup"),
};
const ctx = dom.canvas.getContext("2d");

const PAGE_SIZES_MM = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
};
const MM_PER_UNIT = { mm: 1, cm: 10, m: 1000, inch: 25.4, in: 25.4, ft: 304.8 };

const WORLD_NUMERIC_KEYS = new Set([
  "x", "y", "x1", "y1", "x2", "y2",
  "width", "height",
  "cx", "cy", "r",
  "px", "py",
  "tx", "ty",
  "tdx", "tdy",
  "off1", "off2",
  "dimOffset", "extOffset", "extOver", "textOffset", "textAlong", "rOverrun",
  "originX", "originY",
  "arrayDx", "arrayDy",
  "dx", "dy",
]);

function mmPerCadUnit(unit) {
  return MM_PER_UNIT[String(unit || "mm").toLowerCase()] || 1;
}

function scaleWorldNumericFieldsDeep(node, factor) {
  if (!node || !Number.isFinite(factor) || Math.abs(factor - 1) <= 1e-12) return;
  if (Array.isArray(node)) {
    for (const item of node) scaleWorldNumericFieldsDeep(item, factor);
    return;
  }
  if (typeof node !== "object") return;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (WORLD_NUMERIC_KEYS.has(k) && typeof v === "number" && Number.isFinite(v)) {
      node[k] = v * factor;
      continue;
    }
    if (v && typeof v === "object") scaleWorldNumericFieldsDeep(v, factor);
  }
}

function clearDoubleLineTrimPendingState(state) {
  state.dlineTrimPending = false;
  state.dlineTrimPendingPreview = null;
  state.dlineTrimCandidates = null;
  state.dlineTrimIntersections = null;
}

function convertStateUnitKeepingPhysicalSize(state, fromUnit, toUnit) {
  const fromMm = mmPerCadUnit(fromUnit);
  const toMm = mmPerCadUnit(toUnit);
  const factor = fromMm / Math.max(1e-9, toMm);
  if (!Number.isFinite(factor) || Math.abs(factor - 1) <= 1e-12) return;

  // Persisted model coordinates
  scaleWorldNumericFieldsDeep(state.shapes, factor);
  if (Array.isArray(state.groups)) {
    for (const g of state.groups) {
      if (!g) continue;
      if (Number.isFinite(Number(g.originX))) g.originX = Number(g.originX) * factor;
      if (Number.isFinite(Number(g.originY))) g.originY = Number(g.originY) * factor;
    }
  }

  // World-unit based settings/inputs
  if (state.grid && Number.isFinite(Number(state.grid.size))) state.grid.size = Number(state.grid.size) * factor;
  if (state.lineSettings && Number.isFinite(Number(state.lineSettings.length))) state.lineSettings.length = Number(state.lineSettings.length) * factor;
  if (state.rectSettings) {
    if (Number.isFinite(Number(state.rectSettings.width))) state.rectSettings.width = Number(state.rectSettings.width) * factor;
    if (Number.isFinite(Number(state.rectSettings.height))) state.rectSettings.height = Number(state.rectSettings.height) * factor;
  }
  if (state.circleSettings && Number.isFinite(Number(state.circleSettings.radius))) state.circleSettings.radius = Number(state.circleSettings.radius) * factor;
  if (state.filletSettings && Number.isFinite(Number(state.filletSettings.radius))) state.filletSettings.radius = Number(state.filletSettings.radius) * factor;
  if (state.positionSettings && Number.isFinite(Number(state.positionSettings.size))) state.positionSettings.size = Number(state.positionSettings.size) * factor;
  if (state.dlineSettings && Number.isFinite(Number(state.dlineSettings.offset))) state.dlineSettings.offset = Number(state.dlineSettings.offset) * factor;
  if (state.patternCopySettings) {
    if (Number.isFinite(Number(state.patternCopySettings.arrayDx))) state.patternCopySettings.arrayDx = Number(state.patternCopySettings.arrayDx) * factor;
    if (Number.isFinite(Number(state.patternCopySettings.arrayDy))) state.patternCopySettings.arrayDy = Number(state.patternCopySettings.arrayDy) * factor;
  }
  if (state.dimSettings) {
    if (Number.isFinite(Number(state.dimSettings.extOffset))) state.dimSettings.extOffset = Number(state.dimSettings.extOffset) * factor;
    if (Number.isFinite(Number(state.dimSettings.extOver))) state.dimSettings.extOver = Number(state.dimSettings.extOver) * factor;
    if (Number.isFinite(Number(state.dimSettings.rOvershoot))) state.dimSettings.rOvershoot = Number(state.dimSettings.rOvershoot) * factor;
  }
  if (state.vertexEdit) {
    if (Number.isFinite(Number(state.vertexEdit.moveDx))) state.vertexEdit.moveDx = Number(state.vertexEdit.moveDx) * factor;
    if (Number.isFinite(Number(state.vertexEdit.moveDy))) state.vertexEdit.moveDy = Number(state.vertexEdit.moveDy) * factor;
  }

  // Draft/temporary world geometry
  scaleWorldNumericFieldsDeep(state.preview, factor);
  scaleWorldNumericFieldsDeep(state.dimDraft, factor);
  scaleWorldNumericFieldsDeep(state.polylineDraft, factor);
  scaleWorldNumericFieldsDeep(state.dlinePreview, factor);
  scaleWorldNumericFieldsDeep(state.dlineTrimPendingPreview, factor);
  scaleWorldNumericFieldsDeep(state.dlineTrimCandidates, factor);
  scaleWorldNumericFieldsDeep(state.dlineTrimIntersections, factor);
  // Input cache can contain mixed screen/world coordinates; clear transient values safely.
  if (state.input) {
    state.input.objectSnapHover = null;
    state.input.trimHover = null;
    state.input.filletHover = null;
    state.input.hatchHover = null;
    state.input.dimHoverPreview = null;
    state.input.dimHoveredShapeId = null;
    state.input.dragStartWorld = null;
    if (state.input.groupDrag) state.input.groupDrag.active = false;
    if (state.input.groupRotate) state.input.groupRotate.active = false;
    if (state.input.groupOriginPick) state.input.groupOriginPick.active = false;
    if (state.input.dimHandleDrag) state.input.dimHandleDrag.active = false;
    if (state.input.dimLineDrag) state.input.dimLineDrag.active = false;
  }

  // Keep current on-screen size unchanged after unit conversion.
  const inv = 1 / factor;
  if (state.view) {
    if (Number.isFinite(Number(state.view.scale))) state.view.scale = Number(state.view.scale) * inv;
    if (Number.isFinite(Number(state.view.minScale))) state.view.minScale = Number(state.view.minScale) * inv;
    if (Number.isFinite(Number(state.view.maxScale))) state.view.maxScale = Number(state.view.maxScale) * inv;
  }
}

function getPageFrameWorldSize(pageSetup) {
  const key = String(pageSetup?.size || "A4");
  const [w, h] = PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4;
  const isPortrait = String(pageSetup?.orientation || "landscape") === "portrait";
  const mmW = isPortrait ? Math.min(w, h) : Math.max(w, h);
  const mmH = isPortrait ? Math.max(w, h) : Math.min(w, h);
  const scale = Math.max(0.0001, Number(pageSetup?.scale ?? 1) || 1);
  const unit = String(pageSetup?.unit || "mm");
  const mmPerUnit = MM_PER_UNIT[unit] || 1;
  return { cadW: mmW * scale / mmPerUnit, cadH: mmH * scale / mmPerUnit };
}

function setStatus(text) {
  if (dom.statusText) dom.statusText.textContent = text;
}

function buildSettingsSnapshot() {
  return {
    pageSetup: { ...(state.pageSetup || {}) },
    grid: {
      size: Number(state.grid?.size ?? 10),
      snap: !!state.grid?.snap,
      show: state.grid?.show !== false,
      auto: state.grid?.auto !== false,
      autoTiming: Number(state.grid?.autoTiming ?? 35),
    },
    ui: {
      language: String(state.ui?.language || "ja"),
      menuScalePct: Number(state.ui?.menuScalePct ?? 100),
      touchMode: !!state.ui?.touchMode,
      leftMenuVisibility: (state.ui?.leftMenuVisibility && typeof state.ui.leftMenuVisibility === "object")
        ? { ...state.ui.leftMenuVisibility }
        : {},
      showFps: !!state.ui?.showFps,
      showObjectCount: !!state.ui?.showObjectCount,
      autoBackupEnabled: state.ui?.autoBackupEnabled !== false,
      autoBackupIntervalSec: Number(state.ui?.autoBackupIntervalSec ?? 60),
      toolShortcuts: sanitizeToolShortcuts(state.ui?.toolShortcuts),
    },
  };
}

function saveAppSettingsNow() {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(buildSettingsSnapshot()));
    return true;
  } catch (_) {
    return false;
  }
}

function scheduleSaveAppSettings() {
  if (settingsSaveTimer) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    saveAppSettingsNow();
    settingsSaveTimer = null;
  }, 180);
}

function loadAppSettingsAtStartup() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return false;

    if (data.pageSetup && typeof data.pageSetup === "object") {
      state.pageSetup.size = String(data.pageSetup.size || state.pageSetup.size || "A4");
      state.pageSetup.orientation = (String(data.pageSetup.orientation || state.pageSetup.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
      state.pageSetup.scale = Math.max(0.0001, Number(data.pageSetup.scale ?? state.pageSetup.scale ?? 1) || 1);
      state.pageSetup.unit = String(data.pageSetup.unit || state.pageSetup.unit || "mm");
      state.pageSetup.showFrame = data.pageSetup.showFrame !== false;
      state.pageSetup.innerMarginMm = Math.max(0, Number(data.pageSetup.innerMarginMm ?? state.pageSetup.innerMarginMm ?? 10) || 0);
    }
    if (data.grid && typeof data.grid === "object") {
      if (Number.isFinite(Number(data.grid.size))) state.grid.size = Math.max(1, Number(data.grid.size));
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
      state.ui.menuScalePct = Math.max(50, Math.min(200, Math.round(Number(data.ui.menuScalePct ?? state.ui.menuScalePct ?? 100) / 5) * 5));
      state.ui.touchMode = !!(data.ui.touchMode ?? state.ui.touchMode);
      state.ui.leftMenuVisibility = (data.ui.leftMenuVisibility && typeof data.ui.leftMenuVisibility === "object")
        ? { ...data.ui.leftMenuVisibility }
        : (state.ui.leftMenuVisibility || {});
      state.ui.showFps = !!data.ui.showFps;
      state.ui.showObjectCount = !!data.ui.showObjectCount;
      state.ui.autoBackupEnabled = data.ui.autoBackupEnabled !== false;
      state.ui.autoBackupIntervalSec = Math.max(60, Math.min(600, Math.round(Number(data.ui.autoBackupIntervalSec ?? state.ui.autoBackupIntervalSec ?? 60) || 60)));
      state.ui.toolShortcuts = sanitizeToolShortcuts(data.ui.toolShortcuts ?? state.ui.toolShortcuts);
    }
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

function saveAutoBackup() {
  try {
    if (typeof localStorage === "undefined") return false;
    if (state.ui?.autoBackupEnabled === false) return false;
    const data = exportJsonObject(state, helpers);
    const payload = {
      savedAt: Date.now(),
      data,
    };
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(payload));
    if (!state.ui) state.ui = {};
    state.ui.lastAutoBackupAt = payload.savedAt;
    if (dom.autoBackupBadge) {
      const lang = String(state.ui?.language || "ja").toLowerCase();
      dom.autoBackupBadge.textContent = (lang === "en") ? "Auto backup saved" : "自動バックアップ保存";
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
  const secRaw = Number(state.ui?.autoBackupIntervalSec ?? 60);
  const sec = Number.isFinite(secRaw) ? Math.max(60, Math.min(600, Math.round(secRaw))) : 60;
  if (!state.ui) state.ui = {};
  state.ui.autoBackupIntervalSec = sec;
  return sec * 1000;
}

function refreshAutoBackupTimer() {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }
  if (state.ui?.autoBackupEnabled === false) return;
  autoBackupTimer = setInterval(() => {
    saveAutoBackup();
  }, getAutoBackupIntervalMs());
}

function restoreAutoBackupAtStartup() {
  try {
    if (typeof localStorage === "undefined") return false;
    const raw = localStorage.getItem(AUTO_BACKUP_KEY);
    if (!raw) return false;
    const payload = JSON.parse(raw);
    const data = payload?.data;
    if (!data || data.format !== "s-cad") return false;
    importJsonObject(state, data, { ...helpers, setStatus: null, draw: null });
    if (!state.ui) state.ui = {};
    state.ui.lastAutoBackupAt = Number(payload?.savedAt) || null;
    const lang = String(state.ui?.language || "ja").toLowerCase();
    if (Number.isFinite(state.ui.lastAutoBackupAt)) {
      const dt = new Date(state.ui.lastAutoBackupAt);
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      const ss = String(dt.getSeconds()).padStart(2, "0");
      setStatus(lang === "en"
        ? `Auto backup restored (${hh}:${mm}:${ss})`
        : `自動バックアップを復元しました (${hh}:${mm}:${ss})`);
    } else {
      setStatus(lang === "en" ? "Auto backup restored" : "自動バックアップを復元しました");
    }
    return true;
  } catch (_) {
    return false;
  }
}

function isImageLikeFile(file) {
  if (!file) return false;
  const type = String(file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const name = String(file.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(fr.error || new Error("Failed to read file"));
    fr.readAsDataURL(file);
  });
}

function loadImageMeta(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = Number(img.naturalWidth || img.width || 0);
      const h = Number(img.naturalHeight || img.height || 0);
      if (!(w > 0 && h > 0)) {
        reject(new Error("Invalid image size"));
        return;
      }
      resolve({ width: w, height: h });
    };
    img.onerror = () => reject(new Error("Image decode failed"));
    img.src = dataUrl;
  });
}

async function importImageFile(file) {
  if (!file) return false;
  const dataUrl = await readFileAsDataUrl(file);
  const meta = await loadImageMeta(dataUrl);
  const frame = getPageFrameWorldSize(state.pageSetup);
  const maxW = Math.max(10, Number(frame.cadW) * 0.5);
  const maxH = Math.max(10, Number(frame.cadH) * 0.5);
  const fitScale = Math.min(1, maxW / Math.max(1, meta.width), maxH / Math.max(1, meta.height));
  const w = Math.max(1, meta.width * fitScale);
  const h = Math.max(1, meta.height * fitScale);
  const viewW = Math.max(1, Number(state.view?.viewportWidth || 1));
  const viewH = Math.max(1, Number(state.view?.viewportHeight || 1));
  const centerWorldX = (viewW * 0.5 - Number(state.view.offsetX || 0)) / Math.max(1e-9, Number(state.view.scale || 1));
  const centerWorldY = (viewH * 0.5 - Number(state.view.offsetY || 0)) / Math.max(1e-9, Number(state.view.scale || 1));
  const shape = {
    id: nextShapeId(state),
    type: "image",
    x: centerWorldX - w * 0.5,
    y: centerWorldY - h * 0.5,
    width: w,
    height: h,
    rotationDeg: 0,
    lockAspect: true,
    lockTransform: false,
    naturalWidth: meta.width,
    naturalHeight: meta.height,
    imageName: String(file.name || "image"),
    src: dataUrl,
    layerId: state.activeLayerId,
  };
  pushHistory(state);
  addShape(state, shape);
  setSelection(state, [shape.id]);
  state.activeGroupId = null;
  setStatus(`画像を読み込みました: ${shape.imageName}`);
  draw();
  return true;
}

function normalizeAimConstraint(raw) {
  const targetTypeRaw = String(raw?.targetType || "").toLowerCase();
  const targetType = (targetTypeRaw === "group" || targetTypeRaw === "position") ? targetTypeRaw : null;
  const targetIdNum = Number(raw?.targetId);
  return {
    enabled: !!raw?.enabled,
    targetType,
    targetId: Number.isFinite(targetIdNum) ? targetIdNum : null,
  };
}

function normalizeRadLocal(a) {
  let x = Number(a) || 0;
  while (x < 0) x += Math.PI * 2;
  while (x >= Math.PI * 2) x -= Math.PI * 2;
  return x;
}

function normalizeDeltaDeg(delta) {
  let d = Number(delta) || 0;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function rotatePointAroundDeg(x, y, ox, oy, deltaDeg) {
  const r = (Number(deltaDeg) || 0) * Math.PI / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const dx = (Number(x) || 0) - (Number(ox) || 0);
  const dy = (Number(y) || 0) - (Number(oy) || 0);
  return {
    x: (Number(ox) || 0) + dx * c - dy * s,
    y: (Number(oy) || 0) + dx * s + dy * c,
  };
}

function rotateShapeAroundForAim(shape, ox, oy, deltaDeg) {
  if (!shape) return;
  const d = (Number(deltaDeg) || 0) * Math.PI / 180;
  if (shape.type === "line" || shape.type === "rect") {
    const p1 = rotatePointAroundDeg(shape.x1, shape.y1, ox, oy, deltaDeg);
    const p2 = rotatePointAroundDeg(shape.x2, shape.y2, ox, oy, deltaDeg);
    shape.x1 = p1.x; shape.y1 = p1.y; shape.x2 = p2.x; shape.y2 = p2.y;
    return;
  }
  if (shape.type === "circle") {
    const c = rotatePointAroundDeg(shape.cx, shape.cy, ox, oy, deltaDeg);
    shape.cx = c.x; shape.cy = c.y;
    return;
  }
  if (shape.type === "arc") {
    const c = rotatePointAroundDeg(shape.cx, shape.cy, ox, oy, deltaDeg);
    shape.cx = c.x; shape.cy = c.y;
    shape.a1 = normalizeRadLocal((Number(shape.a1) || 0) + d);
    shape.a2 = normalizeRadLocal((Number(shape.a2) || 0) + d);
    return;
  }
  if (shape.type === "position") {
    const p = rotatePointAroundDeg(shape.x, shape.y, ox, oy, deltaDeg);
    shape.x = p.x; shape.y = p.y;
    return;
  }
  if (shape.type === "dim") {
    const p1 = rotatePointAroundDeg(shape.x1, shape.y1, ox, oy, deltaDeg);
    const p2 = rotatePointAroundDeg(shape.x2, shape.y2, ox, oy, deltaDeg);
    const pp = rotatePointAroundDeg(shape.px, shape.py, ox, oy, deltaDeg);
    shape.x1 = p1.x; shape.y1 = p1.y;
    shape.x2 = p2.x; shape.y2 = p2.y;
    shape.px = pp.x; shape.py = pp.y;
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "dimchain") {
    if (Array.isArray(shape.points)) {
      shape.points = shape.points.map((pt) => rotatePointAroundDeg(Number(pt?.x), Number(pt?.y), ox, oy, deltaDeg));
    }
    if (Number.isFinite(Number(shape.px)) && Number.isFinite(Number(shape.py))) {
      const pp = rotatePointAroundDeg(shape.px, shape.py, ox, oy, deltaDeg);
      shape.px = pp.x; shape.py = pp.y;
    }
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "circleDim") {
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "dimangle") {
    if (Number.isFinite(Number(shape.cx)) && Number.isFinite(Number(shape.cy))) {
      const cp = rotatePointAroundDeg(shape.cx, shape.cy, ox, oy, deltaDeg);
      shape.cx = cp.x; shape.cy = cp.y;
    }
    shape.a1 = normalizeRadLocal((Number(shape.a1) || 0) + d);
    shape.a2 = normalizeRadLocal((Number(shape.a2) || 0) + d);
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      const tp = rotatePointAroundDeg(shape.tx, shape.ty, ox, oy, deltaDeg);
      shape.tx = tp.x; shape.ty = tp.y;
    }
    return;
  }
  if (shape.type === "text") {
    const p = rotatePointAroundDeg(shape.x1, shape.y1, ox, oy, deltaDeg);
    shape.x1 = p.x; shape.y1 = p.y;
    shape.textRotate = (Number(shape.textRotate) || 0) + Number(deltaDeg || 0);
    return;
  }
  if (shape.type === "image") {
    const p = rotatePointAroundDeg(shape.x, shape.y, ox, oy, deltaDeg);
    shape.x = p.x; shape.y = p.y;
    shape.rotationDeg = (Number(shape.rotationDeg) || 0) + Number(deltaDeg || 0);
    return;
  }
  if (shape.type === "bspline") {
    if (Array.isArray(shape.controlPoints)) {
      shape.controlPoints = shape.controlPoints.map((cp) => rotatePointAroundDeg(Number(cp?.x), Number(cp?.y), ox, oy, deltaDeg));
    }
  }
}

function resolveAimCandidateFromSelection(ownerGroupId) {
  const owner = Number(ownerGroupId);
  if (!Number.isFinite(owner)) return { type: null, id: null };
  const selectedGroupIds = Array.isArray(state.selection?.groupIds)
    ? state.selection.groupIds.map(Number).filter(Number.isFinite)
    : [];
  for (let i = selectedGroupIds.length - 1; i >= 0; i--) {
    const gid = Number(selectedGroupIds[i]);
    if (gid !== owner) return { type: "group", id: gid };
  }
  const selectedShapeIds = Array.isArray(state.selection?.ids)
    ? state.selection.ids.map(Number).filter(Number.isFinite)
    : [];
  const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
  const shapeToGroup = new Map();
  for (const g of (state.groups || [])) {
    const gid = Number(g?.id);
    if (!Number.isFinite(gid)) continue;
    for (const sid of (g?.shapeIds || [])) {
      const sidNum = Number(sid);
      if (!Number.isFinite(sidNum)) continue;
      shapeToGroup.set(sidNum, gid);
    }
  }
  for (let i = selectedShapeIds.length - 1; i >= 0; i--) {
    const sid = Number(selectedShapeIds[i]);
    const sh = shapeById.get(sid);
    if (!sh) continue;
    if (String(sh.type || "") === "position") return { type: "position", id: sid };
    const gidFromMap = Number(shapeToGroup.get(sid));
    const gid = Number.isFinite(gidFromMap) ? gidFromMap : Number(sh.groupId);
    if (Number.isFinite(gid) && gid !== owner) return { type: "group", id: gid };
  }
  return { type: null, id: null };
}

function syncAimCandidateFromSelection() {
  const pick = state.input?.groupAimPick;
  if (!pick?.active) return;
  const ownerGroupId = Number(pick.groupId);
  if (!Number.isFinite(ownerGroupId)) return;
  const ownerGroup = getGroup(state, ownerGroupId);
  if (!ownerGroup) {
    pick.active = false;
    pick.groupId = null;
    pick.candidateType = null;
    pick.candidateId = null;
    return;
  }
  const cand = resolveAimCandidateFromSelection(ownerGroupId);
  pick.candidateType = cand.type;
  pick.candidateId = Number.isFinite(Number(cand.id)) ? Number(cand.id) : null;
}

function resolveGroupAimConstraints() {
  const groups = Array.isArray(state.groups) ? state.groups : [];
  if (!groups.length) return;
  const byId = new Map(groups.map((g) => [Number(g.id), g]));
  const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
  for (const g of groups) {
    if (!g) continue;
    const aim = normalizeAimConstraint(g.aimConstraint);
    g.aimConstraint = aim;
    if (!aim.enabled || !aim.targetType || !Number.isFinite(aim.targetId)) continue;
    let tx = NaN;
    let ty = NaN;
    if (aim.targetType === "group") {
      const targetGroup = byId.get(Number(aim.targetId));
      if (!targetGroup || Number(targetGroup.id) === Number(g.id)) continue;
      tx = Number(targetGroup.originX);
      ty = Number(targetGroup.originY);
    } else if (aim.targetType === "position") {
      const targetShape = shapeById.get(Number(aim.targetId));
      if (!targetShape || String(targetShape.type || "") !== "position") continue;
      tx = Number(targetShape.x);
      ty = Number(targetShape.y);
    }
    const ox = Number(g.originX);
    const oy = Number(g.originY);
    if (![ox, oy, tx, ty].every(Number.isFinite)) continue;
    const dx = tx - ox;
    const dy = ty - oy;
    if (Math.hypot(dx, dy) < 1e-9) continue;
    const targetDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    const currentDeg = Number(g.rotationDeg) || 0;
    const delta = normalizeDeltaDeg(targetDeg - currentDeg);
    if (Math.abs(delta) < 1e-7) {
      g.rotationDeg = targetDeg;
      continue;
    }
    const rotatingByHandle = !!(state.input?.groupRotate?.active)
      && Number(state.input?.groupRotate?.groupId) === Number(g.id);
    if (rotatingByHandle) continue;
    const subGroupIds = collectDescendantGroupIds(state, Number(g.id)).map(Number).filter(Number.isFinite);
    if (!subGroupIds.length) continue;
    const subSet = new Set(subGroupIds);
    for (const gg of groups) {
      const gid = Number(gg?.id);
      if (!subSet.has(gid)) continue;
      if (gid !== Number(g.id)) {
        const rp = rotatePointAroundDeg(Number(gg.originX), Number(gg.originY), ox, oy, delta);
        gg.originX = rp.x;
        gg.originY = rp.y;
      }
      gg.rotationDeg = (Number(gg.rotationDeg) || 0) + delta;
    }
    g.rotationDeg = targetDeg;
    for (const gg of groups) {
      if (!subSet.has(Number(gg?.id))) continue;
      for (const sidRaw of (gg?.shapeIds || [])) {
        const sh = shapeById.get(Number(sidRaw));
        if (!sh) continue;
        rotateShapeAroundForAim(sh, ox, oy, delta);
      }
    }
  }
}

function drawNow(opts = null) {
  const skipUi = !!(opts && opts.skipUi);
  const perfNow = (typeof performance !== "undefined" && typeof performance.now === "function")
    ? performance.now.bind(performance)
    : Date.now;
  const t0 = perfNow();
  // Resolve tangent constraints only when needed; running this every frame is expensive on huge models.
  const needResolveTangent =
    !!state.vertexEdit?.drag?.active ||
    !!state.ui?._needsTangentResolve ||
    String(state.tool || "") === "vertex";
  if (state.vertexEdit?.drag?.active) {
    // During vertex drag, exclude shapes being directly edited to avoid fighting user input
    const excludeIds = new Set((state.vertexEdit.drag.baseShapeSnapshots || []).map(it => Number(it.id)));
    resolveVertexTangentAttribs(state, excludeIds);
  } else if (needResolveTangent) {
    resolveVertexTangentAttribs(state);
  }
  if (state.input?.groupAimPick?.active) {
    const ownerGroupId = Number(state.input.groupAimPick.groupId);
    if (Number.isFinite(ownerGroupId) && getGroup(state, ownerGroupId)) {
      state.activeGroupId = ownerGroupId;
    }
    syncAimCandidateFromSelection();
  }
  if (state.ui) state.ui._needsTangentResolve = false;
  resolveGroupAimConstraints();
  render(ctx, dom.canvas, state);
  if (!state.ui) state.ui = {};
  const now = perfNow();
  const minUiRefreshMs = 90;
  const lastUiRefreshTs = Number(state.ui._lastUiRefreshTs || 0);
  const needUiRefresh = !skipUi || !Number.isFinite(lastUiRefreshTs) || ((now - lastUiRefreshTs) >= minUiRefreshMs);
  if (needUiRefresh) {
    refreshUi(state, dom);
    state.ui._lastUiRefreshTs = now;
  }
  const t1 = perfNow();
  if (!state.ui.perfStats) {
    state.ui.perfStats = {
      lastTs: t1,
      accumMs: 0,
      frameCount: 0,
      fps: 0,
      drawMs: 0,
    };
  }
  const ps = state.ui.perfStats;
  const dt = Math.max(0, Number(t1) - Number(ps.lastTs || t1));
  ps.lastTs = t1;
  ps.accumMs += dt;
  ps.frameCount += 1;
  ps.drawMs = Math.max(0, Number(t1) - Number(t0));
  if (ps.accumMs >= 500) {
    ps.fps = (ps.frameCount * 1000) / Math.max(1e-9, ps.accumMs);
    ps.accumMs = 0;
    ps.frameCount = 0;
  }
  if (dom.fpsBadge) {
    const show = !!state.ui?.showFps;
    dom.fpsBadge.style.display = show ? "" : "none";
    if (show) {
      dom.fpsBadge.textContent = `FPS ${Number(ps.fps || 0).toFixed(1)} | Draw ${Number(ps.drawMs || 0).toFixed(1)}ms`;
    }
  }
  if (dom.objectCountBadge) {
    const show = !!state.ui?.showObjectCount;
    dom.objectCountBadge.style.display = show ? "" : "none";
    if (show) {
      const count = Array.isArray(state.shapes) ? state.shapes.length : 0;
      const lang = String(state.ui?.language || "ja").toLowerCase();
      dom.objectCountBadge.textContent = (lang === "en")
        ? `Objects ${count}`
        : `オブジェクト数 ${count}`;
    }
  }
}

let drawRafId = null;
let pendingDrawOpts = null;
function mergeDrawOpts(base, incoming) {
  if (!base && !incoming) return null;
  const bSkip = !!(base && base.skipUi);
  const iSkip = !!(incoming && incoming.skipUi);
  // If either request needs full UI refresh, full refresh wins.
  return { skipUi: bSkip && iSkip };
}
function draw(opts = null) {
  if (typeof requestAnimationFrame !== "function") {
    drawNow(opts);
    return;
  }
  pendingDrawOpts = mergeDrawOpts(pendingDrawOpts, opts);
  if (drawRafId != null) return;
  drawRafId = requestAnimationFrame(() => {
    drawRafId = null;
    const nextOpts = pendingDrawOpts;
    pendingDrawOpts = null;
    drawNow(nextOpts);
  });
}

function resizeCanvas() {
  const rect = dom.canvas.getBoundingClientRect();
  if (!rect) return;
  state.view.viewportWidth = Math.max(1, Number(rect.width) || 1);
  state.view.viewportHeight = Math.max(1, Number(rect.height) || 1);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  dom.canvas.width = Math.round(rect.width * dpr);
  dom.canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}

function resetView() {
  const rect = dom.canvas.getBoundingClientRect();
  const vw = Math.max(1, rect?.width || 0);
  const vh = Math.max(1, rect?.height || 0);
  const canvasLeft = Number(rect?.left || 0);
  const canvasRight = Number(rect?.right || (canvasLeft + vw));
  const panelMargin = 8;
  let leftInset = 0;
  let rightInset = 0;
  const updateInsetsFromPanel = (el) => {
    if (!el) return;
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return;
    const pr = el.getBoundingClientRect();
    if (!pr || pr.width <= 0 || pr.height <= 0) return;
    const panelMidX = (Number(pr.left) + Number(pr.right)) * 0.5;
    const canvasMidX = (canvasLeft + canvasRight) * 0.5;
    if (panelMidX <= canvasMidX) {
      const overlapL = Math.max(0, Number(pr.right) - canvasLeft);
      leftInset = Math.max(leftInset, overlapL);
    } else {
      const overlapR = Math.max(0, canvasRight - Number(pr.left));
      rightInset = Math.max(rightInset, overlapR);
    }
  };
  updateInsetsFromPanel(document.querySelector(".sidebar"));
  updateInsetsFromPanel(document.querySelector(".right-stack"));
  leftInset = Math.min(vw * 0.45, leftInset > 0 ? (leftInset + panelMargin) : 0);
  rightInset = Math.min(vw * 0.45, rightInset > 0 ? (rightInset + panelMargin) : 0);
  const fitW = Math.max(1, vw - leftInset - rightInset);
  const { cadW, cadH } = getPageFrameWorldSize(state.pageSetup);
  const fitScale = Math.max(0.0001, Math.min(fitW / Math.max(1e-9, cadW), vh / Math.max(1e-9, cadH)));
  state.view.scale = fitScale;
  // Center page within visible canvas area excluding side panels.
  state.view.offsetX = leftInset + (fitW * 0.5);
  state.view.offsetY = vh * 0.5;
  state.grid.autoBasePxAtReset = Math.max(1e-9, (Number(state.grid?.size) || 100) * state.view.scale);
  state.grid.autoLevel = 100;
  draw();
}

function getPrimarySelectedShape() {
  const sel = new Set((state.selection?.ids || []).map(Number));
  if (!sel.size) return null;
  for (const s of (state.shapes || [])) {
    if (sel.has(Number(s.id))) return s;
  }
  return null;
}

const SHIFT_KEYS_X = new Set(["x", "x1", "x2", "cx", "px", "tx", "originX"]);
const SHIFT_KEYS_Y = new Set(["y", "y1", "y2", "cy", "py", "ty", "originY"]);

function shiftShapeDeep(node, dx, dy) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) shiftShapeDeep(item, dx, dy);
    return;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (SHIFT_KEYS_X.has(k)) node[k] = v + Number(dx || 0);
      else if (SHIFT_KEYS_Y.has(k)) node[k] = v + Number(dy || 0);
      continue;
    }
    if (v && typeof v === "object") shiftShapeDeep(v, dx, dy);
  }
}

function remapShapeRefsDeep(node, shapeIdMap, groupIdMap = null) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) remapShapeRefsDeep(item, shapeIdMap, groupIdMap);
    return;
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      if (k !== "id" && k !== "groupId" && k !== "layerId" && k.toLowerCase().endsWith("id")) {
        const mappedShape = shapeIdMap.get(Number(v));
        if (Number.isFinite(Number(mappedShape))) {
          node[k] = Number(mappedShape);
          continue;
        }
      }
      if (groupIdMap && k === "groupId") {
        const mappedGroup = groupIdMap.get(Number(v));
        if (Number.isFinite(Number(mappedGroup))) node[k] = Number(mappedGroup);
      }
      continue;
    }
    if (Array.isArray(v) && k.toLowerCase().endsWith("ids")) {
      node[k] = v.map((vv) => {
        const n = Number(vv);
        if (shapeIdMap.has(n)) return Number(shapeIdMap.get(n));
        if (groupIdMap && groupIdMap.has(n)) return Number(groupIdMap.get(n));
        return vv;
      });
      continue;
    }
    if (v && typeof v === "object") remapShapeRefsDeep(v, shapeIdMap, groupIdMap);
  }
}

function collectGroupSubtreeIds(groups, rootId) {
  const byParent = new Map();
  for (const g of (groups || [])) {
    const pid = (g.parentId == null) ? null : Number(g.parentId);
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push(Number(g.id));
  }
  const out = [];
  const seen = new Set();
  const stack = [Number(rootId)];
  while (stack.length) {
    const gid = Number(stack.pop());
    if (!Number.isFinite(gid) || seen.has(gid)) continue;
    seen.add(gid);
    out.push(gid);
    const kids = byParent.get(gid) || [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push(Number(kids[i]));
  }
  return out;
}

function filterRootGroupIds(groupIds, groups) {
  const selected = new Set((groupIds || []).map(Number).filter(Number.isFinite));
  const byId = new Map((groups || []).map(g => [Number(g.id), g]));
  const roots = [];
  for (const id of selected) {
    let cur = byId.get(id);
    let hasSelectedAncestor = false;
    while (cur && cur.parentId != null) {
      const pid = Number(cur.parentId);
      if (selected.has(pid)) { hasSelectedAncestor = true; break; }
      cur = byId.get(pid);
    }
    if (!hasSelectedAncestor) roots.push(id);
  }
  return roots;
}

function normalizeLayerIdForClone(sourceLayerId) {
  const src = Number(sourceLayerId);
  const layers = Array.isArray(state.layers) ? state.layers : [];
  if (Number.isFinite(src) && layers.some(l => Number(l.id) === src)) return src;
  const active = Number(state.activeLayerId);
  if (Number.isFinite(active) && layers.some(l => Number(l.id) === active)) return active;
  const first = Number(layers[0]?.id);
  return Number.isFinite(first) ? first : 1;
}

function makeCopiedGroupName(baseName, usedNameKeys) {
  const base = String(baseName || "Group").trim() || "Group";
  let i = 1;
  while (i < 1000000) {
    const cand = `${base}_${i}`;
    const key = cand.toLowerCase();
    if (!usedNameKeys.has(key)) {
      usedNameKeys.add(key);
      return cand;
    }
    i += 1;
  }
  return `${base}_${Date.now()}`;
}

function duplicateGroupsByRootIds(rootGroupIds, dx, dy) {
  const groups = Array.isArray(state.groups) ? state.groups : [];
  const byId = new Map(groups.map(g => [Number(g.id), g]));
  const validRoots = (rootGroupIds || []).map(Number).filter(id => byId.has(id));
  if (!validRoots.length) return { newShapeIds: [], newRootGroupIds: [] };

  const subtreeIds = [];
  const subtreeSet = new Set();
  for (const rootId of validRoots) {
    const ids = collectGroupSubtreeIds(groups, rootId);
    for (const gid of ids) {
      if (subtreeSet.has(gid)) continue;
      subtreeSet.add(gid);
      subtreeIds.push(gid);
    }
  }
  if (!subtreeIds.length) return { newShapeIds: [], newRootGroupIds: [] };

  const groupIdMap = new Map();
  for (const oldGid of subtreeIds) {
    const newGid = Number(state.nextGroupId) || 1;
    state.nextGroupId = newGid + 1;
    groupIdMap.set(oldGid, newGid);
  }

  const shapeIdMap = new Map();
  const clonedShapes = [];
  for (const oldGid of subtreeIds) {
    const g = byId.get(oldGid);
    const shapeIds = Array.isArray(g?.shapeIds) ? g.shapeIds : [];
    for (const sidRaw of shapeIds) {
      const sid = Number(sidRaw);
      if (!Number.isFinite(sid) || shapeIdMap.has(sid)) continue;
      const srcShape = (state.shapes || []).find(s => Number(s.id) === sid);
      if (!srcShape) continue;
      const newSid = nextShapeId(state);
      shapeIdMap.set(sid, newSid);
      const clone = JSON.parse(JSON.stringify(srcShape));
      clone.id = newSid;
      clone.groupId = groupIdMap.get(oldGid);
      clone.layerId = normalizeLayerIdForClone(srcShape.layerId);
      shiftShapeDeep(clone, dx, dy);
      clonedShapes.push(clone);
    }
  }
  for (const s of clonedShapes) remapShapeRefsDeep(s, shapeIdMap, groupIdMap);
  if (clonedShapes.length) state.shapes.push(...clonedShapes);

  const newGroups = [];
  const usedNameKeys = new Set((state.groups || []).map(g => String(g?.name || "").trim().toLowerCase()).filter(Boolean));
  for (const oldGid of subtreeIds) {
    const oldG = byId.get(oldGid);
    if (!oldG) continue;
    const mappedId = groupIdMap.get(oldGid);
    const mappedParent = (oldG.parentId == null)
      ? oldG.parentId
      : (groupIdMap.get(Number(oldG.parentId)) ?? oldG.parentId);
    const newShapeIds = (Array.isArray(oldG.shapeIds) ? oldG.shapeIds : [])
      .map(id => shapeIdMap.get(Number(id)))
      .filter(id => Number.isFinite(Number(id)));
    const mappedAim = normalizeAimConstraint(oldG.aimConstraint);
    if (mappedAim.targetType === "group" && Number.isFinite(mappedAim.targetId) && groupIdMap.has(Number(mappedAim.targetId))) {
      mappedAim.targetId = Number(groupIdMap.get(Number(mappedAim.targetId)));
    }
    newGroups.push({
      ...JSON.parse(JSON.stringify(oldG)),
      id: mappedId,
      name: makeCopiedGroupName(oldG?.name, usedNameKeys),
      parentId: mappedParent,
      shapeIds: newShapeIds,
      originX: Number(oldG.originX || 0) + Number(dx || 0),
      originY: Number(oldG.originY || 0) + Number(dy || 0),
      aimConstraint: mappedAim,
    });
  }
  if (newGroups.length) state.groups = [...newGroups, ...state.groups];

  const newRootGroupIds = validRoots
    .map((id) => Number(groupIdMap.get(Number(id))))
    .filter(Number.isFinite);
  const newShapeIds = clonedShapes.map(s => Number(s.id));
  return { newShapeIds, newRootGroupIds };
}

function duplicateShapesByIds(shapeIds, dx, dy) {
  const srcIds = new Set((shapeIds || []).map(Number).filter(Number.isFinite));
  if (!srcIds.size) return { newShapeIds: [] };
  const src = (state.shapes || []).filter(s => srcIds.has(Number(s.id)));
  if (!src.length) return { newShapeIds: [] };

  const shapeIdMap = new Map();
  const copiedIds = [];
  const groupedNewIds = new Map();
  const clones = [];
  for (const s of src) {
    const n = JSON.parse(JSON.stringify(s));
    const oldId = Number(n.id);
    n.id = nextShapeId(state);
    n.layerId = normalizeLayerIdForClone(s.layerId);
    shapeIdMap.set(oldId, Number(n.id));
    shiftShapeDeep(n, dx, dy);
    clones.push(n);
    copiedIds.push(Number(n.id));
    if (n.groupId != null) {
      const gid = Number(n.groupId);
      if (!groupedNewIds.has(gid)) groupedNewIds.set(gid, []);
      groupedNewIds.get(gid).push(Number(n.id));
    }
  }
  for (const s of clones) remapShapeRefsDeep(s, shapeIdMap, null);
  state.shapes.push(...clones);

  for (const [gid, ids] of groupedNewIds.entries()) {
    const g = (state.groups || []).find(gr => Number(gr.id) === gid);
    if (!g) continue;
    if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
    for (const id of ids) {
      if (!g.shapeIds.includes(id)) g.shapeIds.push(id);
    }
  }
  return { newShapeIds: copiedIds };
}

function getCircleThreePointRefFromShape(shape) {
  if (!shape) return null;
  if (shape.type === "position") {
    return { x: Number(shape.x), y: Number(shape.y), r: 0, shapeId: Number(shape.id), type: "position" };
  }
  if (shape.type === "circle" || shape.type === "arc") {
    return {
      x: Number(shape.cx),
      y: Number(shape.cy),
      r: Math.max(0, Math.abs(Number(shape.r) || 0)),
      shapeId: Number(shape.id),
      type: shape.type
    };
  }
  return null;
}

function solveCircleBy3CenterRefs(refs, hint = null) {
  if (!Array.isArray(refs) || refs.length !== 3) return null;
  const p1 = refs[0], p2 = refs[1], p3 = refs[2];
  const x1 = Number(p1.x), y1 = Number(p1.y), r1 = Math.max(0, Number(p1.r) || 0);
  const x2 = Number(p2.x), y2 = Number(p2.y), r2 = Math.max(0, Number(p2.r) || 0);
  const x3 = Number(p3.x), y3 = Number(p3.y), r3 = Math.max(0, Number(p3.r) || 0);
  if (![x1, y1, x2, y2, x3, y3, r1, r2, r3].every(Number.isFinite)) return null;

  const A1 = 2 * (x1 - x2), B1 = 2 * (y1 - y2), C1 = 2 * (r2 - r1);
  const A2 = 2 * (x1 - x3), B2 = 2 * (y1 - y3), C2 = 2 * (r3 - r1);
  const D1 = (x1 * x1 + y1 * y1 - r1 * r1) - (x2 * x2 + y2 * y2 - r2 * r2);
  const D2 = (x1 * x1 + y1 * y1 - r1 * r1) - (x3 * x3 + y3 * y3 - r3 * r3);
  const det = A1 * B2 - A2 * B1;
  if (Math.abs(det) < 1e-9) return null;

  const ax = (-C1 * B2 + C2 * B1) / det;
  const bx = (D1 * B2 - D2 * B1) / det;
  const ay = (-A1 * C2 + A2 * C1) / det;
  const by = (A1 * D2 - A2 * D1) / det;

  const dx = bx - x1;
  const dy = by - y1;
  const qa = ax * ax + ay * ay - 1;
  const qb = 2 * (ax * dx + ay * dy - r1);
  const qc = dx * dx + dy * dy - r1 * r1;

  const roots = [];
  if (Math.abs(qa) < 1e-10) {
    if (Math.abs(qb) < 1e-10) return null;
    roots.push(-qc / qb);
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < -1e-9) return null;
    const dd = Math.sqrt(Math.max(0, disc));
    roots.push((-qb - dd) / (2 * qa));
    roots.push((-qb + dd) / (2 * qa));
  }

  const candidates = [];
  for (const R of roots) {
    if (!Number.isFinite(R) || R <= 1e-6) continue;
    const cx = ax * R + bx;
    const cy = ay * R + by;
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    const e1 = Math.abs(Math.hypot(cx - x1, cy - y1) - (R + r1));
    const e2 = Math.abs(Math.hypot(cx - x2, cy - y2) - (R + r2));
    const e3 = Math.abs(Math.hypot(cx - x3, cy - y3) - (R + r3));
    const err = Math.max(e1, e2, e3);
    if (err > 1e-4) continue;
    const h = hint && Number.isFinite(Number(hint.x)) && Number.isFinite(Number(hint.y))
      ? Math.hypot(cx - Number(hint.x), cy - Number(hint.y))
      : R;
    candidates.push({ cx, cy, r: R, score: h });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
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
  trimateFillet: (r, h) => trimateFillet(state, r, h, helpers),
  buildHatchLoopsFromBoundaryIds,
  chooseEndsForLineByKeepEnd,
  createGroupFromSelection: (st, name) => createGroupFromSelection(st, name),
  setTool: (t) => {
    setTool(state, t);
    // Immediately refresh snap candidate marker when entering dimension tool.
    if (t === "dim") {
      const ms = getMouseScreen(dom.canvas);
      const wr = getMouseWorld(state, ms);
      const hw = (Number.isFinite(Number(wr?.x)) && Number.isFinite(Number(wr?.y)))
        ? wr
        : (state.input?.hover?.world || state.input?.hoverWorld || { x: 0, y: 0 });
      state.input.hoverWorld = { x: Number(hw.x), y: Number(hw.y) };
      updateDimHover(state, hw, hw, helpers);
      if (!state.input.objectSnapHover) {
        state.input.objectSnapHover = { x: Number(hw.x), y: Number(hw.y), kind: "nearest" };
      }
    }
    draw();
  },
  undo: () => {
    if (stateUndo(state)) {
      if (!state.ui) state.ui = {};
      state.ui._needsTangentResolve = true;
      setStatus("Undo");
      draw();
      return;
    }
    setStatus("Nothing to undo");
    draw();
  },
  redo: () => {
    if (stateRedo(state)) {
      if (!state.ui) state.ui = {};
      state.ui._needsTangentResolve = true;
      setStatus("Redo");
      draw();
      return;
    }
    setStatus("Nothing to redo");
    draw();
  },
  delete: () => {
    const selectedShapeIds = new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite));
    const selectedGroupIds = new Set((state.selection?.groupIds || []).map(Number).filter(Number.isFinite));
    if (selectedGroupIds.size === 0 && Number.isFinite(Number(state.activeGroupId))) {
      selectedGroupIds.add(Number(state.activeGroupId));
    }
    const rootGroupIds = filterRootGroupIds(Array.from(selectedGroupIds), state.groups || []);
    const deleteGroupIds = new Set();
    for (const gid of rootGroupIds) {
      for (const dgid of collectDescendantGroupIds(state, gid)) {
        if (Number.isFinite(Number(dgid))) deleteGroupIds.add(Number(dgid));
      }
      for (const sid of collectGroupTreeShapeIds(state, gid)) {
        if (Number.isFinite(Number(sid))) selectedShapeIds.add(Number(sid));
      }
    }
    if (selectedShapeIds.size === 0 && deleteGroupIds.size === 0) return;
    pushHistory(state);
    for (const sid of selectedShapeIds) removeShapeById(state, sid);
    if (deleteGroupIds.size > 0) {
      state.groups = (state.groups || []).filter(g => !deleteGroupIds.has(Number(g.id)));
    }
    const alivePositionIds = new Set((state.shapes || [])
      .filter((s) => String(s?.type || "") === "position")
      .map((s) => Number(s.id))
      .filter(Number.isFinite));
    const aliveGroupIds = new Set((state.groups || []).map((g) => Number(g.id)).filter(Number.isFinite));
    for (const g of (state.groups || [])) {
      const aim = normalizeAimConstraint(g.aimConstraint);
      const invalidGroupTarget = aim.targetType === "group" && !aliveGroupIds.has(Number(aim.targetId));
      const invalidPositionTarget = aim.targetType === "position" && !alivePositionIds.has(Number(aim.targetId));
      if (invalidGroupTarget || invalidPositionTarget) {
        g.aimConstraint = { enabled: false, targetType: null, targetId: null };
      }
    }
    state.selection.ids = [];
    state.selection.groupIds = [];
    state.activeGroupId = null;
    setStatus("Deleted selection");
    draw();
  },
  resetView: () => {
    resetView();
    if (!state.ui) state.ui = {};
    state.ui.flashAction = {
      id: "resetView",
      until: Date.now() + 1000,
    };
    if (resetViewFlashTimer) clearTimeout(resetViewFlashTimer);
    resetViewFlashTimer = setTimeout(() => {
      if (!state.ui) state.ui = {};
      state.ui.flashAction = null;
      setTool(state, "select");
      draw();
    }, 1000);
    draw();
  },
  loadJson: () => {
    if (!state.ui) state.ui = {};
    state.ui.jsonFileMode = "replace";
    loadJsonFromFileDialog(state, dom);
  },
  newFile: () => {
    const lang = String(state.ui?.language || "ja").toLowerCase();
    const msg = (lang === "en")
      ? "Create a new file? Unsaved changes will be lost."
      : "新規作成しますか？未保存の変更は失われます。";
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      if (!window.confirm(msg)) return;
    }
    const fresh = createState();
    state.shapes = [];
    state.nextShapeId = 1;
    state.groups = [];
    state.nextGroupId = 1;
    state.layers = JSON.parse(JSON.stringify(fresh.layers || [{ id: 1, name: "Layer 1", visible: true, locked: false }]));
    state.nextLayerId = Number(fresh.nextLayerId) || 2;
    state.activeLayerId = Number(fresh.activeLayerId) || Number(state.layers[0]?.id) || 1;
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
    if (state.input?.groupAimPick) {
      state.input.groupAimPick.active = false;
      state.input.groupAimPick.groupId = null;
      state.input.groupAimPick.candidateType = null;
      state.input.groupAimPick.candidateId = null;
    }
    state.vertexEdit.selectedVertices = [];
    state.vertexEdit.activeVertex = null;
    state.vertexEdit.filterShapeId = null;
    state.preview = null;
    state.polylineDraft = null;
    state.dimDraft = null;
    state.hatchDraft = { boundaryIds: [] };
    if (!state.ui) state.ui = {};
    state.ui.layerView = { colorize: false, editOnlyActive: false };
    state.ui.groupView = { colorize: false };
    state.history.past = [];
    state.history.future = [];
    setTool(state, "select");
    setStatus(lang === "en" ? "New file created" : "新規作成しました");
    draw();
  },
  importJson: () => {
    if (!state.ui) state.ui = {};
    state.ui.jsonFileMode = "import";
    loadJsonFromFileDialog(state, dom);
  },
  saveJson: () => saveJsonToFile(state, helpers),
  saveJsonAs: () => saveJsonAsToFile(state, helpers),
  pdf: () => exportPdf(state, helpers),
  svg: () => exportSvg(state, helpers),

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
  setLanguage: (lang) => {
    const v = String(lang || "en").toLowerCase();
    state.ui.language = v.startsWith("ja") ? "ja" : "en";
    scheduleSaveAppSettings();
    draw();
  },
  setMenuScalePct: (pct) => {
    const n = Number(pct);
    const snapped = Math.max(50, Math.min(200, Math.round((Number.isFinite(n) ? n : 100) / 5) * 5));
    if (!state.ui) state.ui = {};
    state.ui.menuScalePct = snapped;
    scheduleSaveAppSettings();
    draw();
  },

  addLayer: (name) => {
    pushHistory(state);
    const layer = addLayer(state, name);
    if (layer) setActiveLayer(state, layer.id);
    if (!state.ui.rightPanelCollapsed) state.ui.rightPanelCollapsed = {};
    state.ui.rightPanelCollapsed.layers = false;
    if (!state.ui.panelLayout) state.ui.panelLayout = {};
    state.ui.panelLayout.layerPanelListHeight = 2000;
    setStatus(`Layer created: ${layer?.name ?? ""}`.trim());
    draw();
  },
  setActiveLayer: (id) => {
    setActiveLayer(state, id);
    if (state.ui?.layerView?.editOnlyActive) {
      const activeLayerId = Number(state.activeLayerId);
      const selIds = Array.isArray(state.selection?.ids) ? state.selection.ids : [];
      state.selection.ids = selIds
        .map(Number)
        .filter((sid) => {
          const s = (state.shapes || []).find(sh => Number(sh.id) === sid);
          if (!s) return false;
          return Number(s.layerId ?? activeLayerId) === activeLayerId;
        });
      if (state.selection) state.selection.groupIds = [];
      state.activeGroupId = null;
    }
    draw();
  },
  selectGroup: (id) => { selectGroupById(state, id); draw(); },
  toggleGroupSelection: (id) => { toggleGroupSelectionById(state, id); draw(); },
  setGroupVisible: (groupId, on) => {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const nextVisible = !!on;
    if ((g.visible !== false) === nextVisible) return;
    pushHistory(state);
    g.visible = nextVisible;
    if (!nextVisible) {
      const hiddenGroupIds = new Set(collectDescendantGroupIds(state, gid).map(Number));
      const shapeGroupMap = new Map();
      for (const gg of (state.groups || [])) {
        const ggid = Number(gg?.id);
        if (!Number.isFinite(ggid)) continue;
        for (const sid of (gg?.shapeIds || [])) {
          const sidNum = Number(sid);
          if (!Number.isFinite(sidNum)) continue;
          shapeGroupMap.set(sidNum, ggid);
        }
      }
      state.selection.groupIds = (state.selection?.groupIds || [])
        .map(Number)
        .filter((id) => Number.isFinite(id) && !hiddenGroupIds.has(id));
      state.selection.ids = (state.selection?.ids || [])
        .map(Number)
        .filter((sid) => {
          if (!Number.isFinite(sid)) return false;
          const sh = (state.shapes || []).find((s) => Number(s.id) === sid);
          if (!sh) return false;
          const sgidFromMap = shapeGroupMap.has(sid) ? Number(shapeGroupMap.get(sid)) : NaN;
          const sgid = Number.isFinite(sgidFromMap) ? sgidFromMap : Number(sh.groupId);
          return !(Number.isFinite(sgid) && hiddenGroupIds.has(sgid));
        });
      if (hiddenGroupIds.has(Number(state.activeGroupId))) {
        state.activeGroupId = null;
      }
    }
    draw();
  },
  selectShapeById: (id) => { setSelection(state, [id]); draw(); },
  toggleShapeSelectionById: (id) => {
    const sid = Number(id);
    if (!Number.isFinite(sid)) return;
    const cur = new Set((state.selection?.ids || []).map(Number));
    if (cur.has(sid)) cur.delete(sid);
    else cur.add(sid);
    setSelection(state, Array.from(cur));
    state.activeGroupId = null;
    draw();
  },
  cycleLayerMode: (id) => { cycleLayerMode(state, helpers, id); draw(); },
  renameActiveLayer: (n) => { renameActiveLayer(state, helpers, n); draw(); },
  moveSelectionToLayer: () => { moveSelectionToLayer(state, helpers); draw(); },
  deleteActiveLayer: () => { deleteActiveLayer(state, helpers); draw(); },
  moveActiveGroupOrder: (direction) => moveActiveGroupOrder(state, helpers, direction),
  moveActiveLayerOrder: (direction) => moveActiveLayerOrder(state, helpers, direction),
  setLayerColorize: (v) => { setLayerColorize(state, helpers, v); draw(); },
  setGroupColorize: (v) => { setGroupColorize(state, helpers, v); draw(); },
  setEditOnlyActiveLayer: (v) => { setEditOnlyActiveLayer(state, helpers, v); draw(); },
  renameActiveGroup: (n) => { renameActiveGroup(state, helpers, n); draw(); },
  deleteActiveGroup: () => deleteActiveGroup(state, helpers),
  unparentActiveGroup: () => unparentActiveGroup(state, helpers),
  moveActiveGroup: (dx, dy) => moveActiveGroup(state, helpers, dx, dy),
  copyActiveGroup: (dx, dy) => {
    const srcRootId = Number(state.activeGroupId);
    if (!Number.isFinite(srcRootId)) return;
    pushHistory(state);
    const result = duplicateGroupsByRootIds([srcRootId], dx, dy);
    if (result.newShapeIds.length) setSelection(state, result.newShapeIds);
    if (result.newRootGroupIds.length) {
      state.selection.groupIds = result.newRootGroupIds.slice();
      state.activeGroupId = Number(result.newRootGroupIds[result.newRootGroupIds.length - 1]);
    }
    draw();
  },
  setActiveGroupAimEnabled: (on) => {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const nextEnabled = !!on;
    const prevAim = normalizeAimConstraint(g.aimConstraint);
    if (prevAim.enabled === nextEnabled) return;
    pushHistory(state);
    g.aimConstraint = { ...prevAim, enabled: nextEnabled };
    if (!nextEnabled && state.input?.groupAimPick?.active && Number(state.input.groupAimPick.groupId) === gid) {
      state.input.groupAimPick.active = false;
      state.input.groupAimPick.groupId = null;
      state.input.groupAimPick.candidateType = null;
      state.input.groupAimPick.candidateId = null;
    }
    setStatus(nextEnabled ? "Aim Constraint: ON" : "Aim Constraint: OFF");
    draw();
  },
  beginPickActiveGroupAimTarget: () => {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    if (!state.input.groupAimPick) state.input.groupAimPick = { active: false, groupId: null, candidateType: null, candidateId: null };
    state.input.groupAimPick.active = true;
    state.input.groupAimPick.groupId = gid;
    state.input.groupAimPick.candidateType = null;
    state.input.groupAimPick.candidateId = null;
    if (state.input.groupOriginPick) {
      state.input.groupOriginPick.active = false;
      state.input.groupOriginPick.dragging = false;
    }
    setStatus("Aim target: 位置マーカー or オブジェクトをクリック");
    draw();
  },
  confirmActiveGroupAimTarget: () => {
    const gid = Number(state.input?.groupAimPick?.active ? state.input?.groupAimPick?.groupId : state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const pick = state.input?.groupAimPick;
    if (!pick?.active || Number(pick.groupId) !== gid) return;
    const candidateType = String(pick.candidateType || "");
    const candidateId = Number(pick.candidateId);
    if (!(candidateType === "group" || candidateType === "position") || !Number.isFinite(candidateId)) {
      setStatus("Aim target: 先に候補をクリックしてください");
      draw();
      return;
    }
    pushHistory(state);
    g.aimConstraint = { enabled: true, targetType: candidateType, targetId: candidateId };
    pick.active = false;
    pick.groupId = null;
    pick.candidateType = null;
    pick.candidateId = null;
    setStatus(candidateType === "position"
      ? `Aim target set: Position #${candidateId}`
      : `Aim target set: Group #${candidateId}`);
    draw();
  },
  pickOrConfirmActiveGroupAimTarget: () => {
    const gid = Number(state.input?.groupAimPick?.active ? state.input?.groupAimPick?.groupId : state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const pick = state.input?.groupAimPick;
    if (pick?.active && Number(pick.groupId) === gid) {
      helpers.confirmActiveGroupAimTarget();
      return;
    }
    helpers.beginPickActiveGroupAimTarget();
  },
  clearActiveGroupAimTarget: () => {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const prevAim = normalizeAimConstraint(g.aimConstraint);
    if (!prevAim.enabled && !prevAim.targetType && !Number.isFinite(prevAim.targetId)) return;
    pushHistory(state);
    g.aimConstraint = { enabled: false, targetType: null, targetId: null };
    if (state.input?.groupAimPick?.active && Number(state.input.groupAimPick.groupId) === gid) {
      state.input.groupAimPick.active = false;
      state.input.groupAimPick.groupId = null;
      state.input.groupAimPick.candidateType = null;
      state.input.groupAimPick.candidateId = null;
    }
    setStatus("Aim target cleared");
    draw();
  },
  setActiveGroupParent: (pid) => {
    const movingGroupId = Number(state.activeGroupId);
    const newParentId = (pid == null) ? null : Number(pid);
    if (!Number.isFinite(movingGroupId)) return;
    const moving = getGroup(state, movingGroupId);
    if (!moving) return;
    if (newParentId != null && newParentId === movingGroupId) return;

    // Prevent making a cycle: parent cannot be self or any descendant.
    if (newParentId != null) {
      const byId = new Map((state.groups || []).map(g => [Number(g.id), g]));
      let cur = byId.get(newParentId);
      while (cur) {
        if (Number(cur.id) === movingGroupId) return;
        if (cur.parentId == null) break;
        cur = byId.get(Number(cur.parentId));
      }
    }

    pushHistory(state);
    moving.parentId = (newParentId == null || !Number.isFinite(newParentId)) ? null : newParentId;
    draw();
  },
  moveShapeToGroup: (sid, gid) => {
    const shapeId = Number(sid);
    const targetGroupId = Number(gid);
    if (!Number.isFinite(shapeId) || !Number.isFinite(targetGroupId)) return;
    const shape = (state.shapes || []).find(sh => Number(sh.id) === shapeId);
    const target = getGroup(state, targetGroupId);
    if (!shape || !target) return;

    pushHistory(state);

    // Remove from all groups first.
    for (const g of (state.groups || [])) {
      if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
      g.shapeIds = g.shapeIds.map(Number).filter(id => Number.isFinite(id) && id !== shapeId);
    }

    // Add to target group.
    if (!Array.isArray(target.shapeIds)) target.shapeIds = [];
    if (!target.shapeIds.map(Number).includes(shapeId)) target.shapeIds.push(shapeId);
    shape.groupId = targetGroupId;

    draw();
  },
  createGroupFromSelection: (name) => { pushHistory(state); const g = createGroupFromSelection(state, name); draw(); return g; },
  mergeSelectedShapesToGroup: () => mergeSelectedShapesToGroup(state, helpers),

  updateSelectedTextSettings: (s) => updateSelectedTextSettings(state, helpers, s),
  updateSelectedImageSettings: (s) => updateSelectedImageSettings(state, helpers, s),
  moveSelectedShapes: (dx, dy) => moveSelectedShapes(state, helpers, dx, dy),
  copySelectedShapes: (dx, dy) => {
    pushHistory(state);
    const res = duplicateShapesByIds((state.selection?.ids || []), dx, dy);
    setSelection(state, res.newShapeIds || []);
    state.activeGroupId = null;
    setStatus(`コピー: ${(res.newShapeIds || []).length} 個`);
    draw();
  },
  copySelectionToClipboard: () => {
    const selectedGroupIds = filterRootGroupIds((state.selection?.groupIds || []), (state.groups || []));
    const selectedShapeIds = (state.selection?.ids || []).map(Number).filter(Number.isFinite);
    if (!state.ui) state.ui = {};
    if (selectedGroupIds.length > 0) {
      state.ui.clipboard = { kind: "groups", groupIds: selectedGroupIds.slice(), copiedAt: Date.now() };
      setStatus(`コピー: グループ ${selectedGroupIds.length} 個`);
      return;
    }
    if (selectedShapeIds.length > 0) {
      state.ui.clipboard = { kind: "shapes", shapeIds: selectedShapeIds.slice(), copiedAt: Date.now() };
      setStatus(`コピー: オブジェクト ${selectedShapeIds.length} 個`);
      return;
    }
    setStatus("コピー対象がありません");
  },
  pasteClipboard: () => {
    const clip = state.ui?.clipboard;
    if (!clip || !clip.kind) {
      setStatus("貼り付け対象がありません");
      return;
    }
    const dx = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    const dy = 0;
    pushHistory(state);
    if (clip.kind === "groups") {
      const roots = filterRootGroupIds((clip.groupIds || []), (state.groups || []));
      const res = duplicateGroupsByRootIds(roots, dx, dy);
      if (res.newShapeIds.length) {
        setSelection(state, res.newShapeIds);
        state.selection.groupIds = (res.newRootGroupIds || []).slice();
        state.activeGroupId = state.selection.groupIds.length
          ? Number(state.selection.groupIds[state.selection.groupIds.length - 1])
          : null;
        setStatus(`貼り付け: グループ ${state.selection.groupIds.length} 個`);
      } else {
        setStatus("貼り付け対象がありません");
      }
      draw();
      return;
    }
    if (clip.kind === "shapes") {
      const res = duplicateShapesByIds((clip.shapeIds || []), dx, dy);
      if (res.newShapeIds.length) {
        setSelection(state, res.newShapeIds);
        state.activeGroupId = null;
        setStatus(`貼り付け: オブジェクト ${res.newShapeIds.length} 個`);
      } else {
        setStatus("貼り付け対象がありません");
      }
    }
    draw();
  },
  moveSelectedVertices: (dx, dy) => moveSelectedVertices(state, helpers, dx, dy),

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
      setStatus("円作成: 三点指示モードで使用してください");
      draw();
      return;
    }
    const refs = Array.isArray(state.input.circleThreePointRefs) ? state.input.circleThreePointRefs.slice(0, 3) : [];
    if (refs.length < 3) {
      setStatus(`三点指示: ${refs.length}/3 点。先にターゲットを登録してください`);
      draw();
      return;
    }
    const hint = refs[refs.length - 1] || null;
    const sol = solveCircleBy3CenterRefs(refs, hint);
    if (!sol) {
      state.input.circleThreePointRefs = [];
      setStatus("三点指示: 外接円を計算できませんでした");
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
    addShape(state, shape);
    clearSelection(state);
    state.activeGroupId = null;
    state.input.circleThreePointRefs = [];
    setStatus("CIRCLE created (三点指示)");
    draw();
  },
  registerCircleThreePointTargetFromSelection: () => {
    const mode = String(state.circleSettings?.mode || "").toLowerCase();
    if (mode !== "threepoint") {
      setStatus("円作成: 三点指示モードで使用してください");
      draw();
      return;
    }
    const selIds = new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite));
    const selectedShapes = (state.shapes || []).filter(s => selIds.has(Number(s.id)));
    const refs = selectedShapes
      .map(getCircleThreePointRefFromShape)
      .filter(r => !!r);
    if (!refs.length) {
      setStatus("対象を選択してください (位置/円/円弧)。Shiftで複数選択できます");
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
      setStatus("三点指示: 選択対象はすべて登録済みです");
      draw();
      return;
    }
    const ids = state.input.circleThreePointRefs.map(r => Number(r.shapeId)).filter(Number.isFinite).join(", ");
    if (added.length === 1) {
      const a = added[0];
      const label = (a.type === "position") ? "位置" : ((a.type === "circle") ? "円" : "円弧");
      setStatus(`三点指示: ${label} #${Number(a.shapeId)} を登録 (${state.input.circleThreePointRefs.length}/3) [${ids}]`);
    } else {
      setStatus(`三点指示: ${added.length}件を登録 (${state.input.circleThreePointRefs.length}/3) [${ids}]${full ? " / 上限到達" : ""}`);
    }
    draw();
  },
  setCircleRadiusInput: (r) => { setCircleRadiusInput(state, r); draw(); },
  setCircleRadiusLocked: (on = null) => { setCircleRadiusLocked(state, helpers, on); draw(); },
  setPositionSize: (v) => setPositionSize(state, helpers, v),
  setLineWidthMm: (v, toolKey = null) => setLineWidthMm(state, helpers, v, toolKey),
  setToolLineType: (v, toolKey = null) => setToolLineType(state, helpers, v, toolKey),
  setSelectedLineWidthMm: (v) => setSelectedLineWidthMm(state, helpers, v),
  setSelectedLineType: (v) => setSelectedLineType(state, helpers, v),
  setSelectedColor: (v) => setSelectedColor(state, helpers, v),
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
    Object.assign(state.pageSetup, patch);
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
  setFpsDisplay: (on) => {
    if (!state.ui) state.ui = {};
    state.ui.showFps = !!on;
    scheduleSaveAppSettings();
    draw();
  },
  setObjectCountDisplay: (on) => {
    if (!state.ui) state.ui = {};
    state.ui.showObjectCount = !!on;
    scheduleSaveAppSettings();
    draw();
  },
  setAutoBackupEnabled: (on) => {
    if (!state.ui) state.ui = {};
    state.ui.autoBackupEnabled = !!on;
    if (state.ui.autoBackupEnabled) saveAutoBackup();
    refreshAutoBackupTimer();
    scheduleSaveAppSettings();
    draw();
  },
  setAutoBackupIntervalSec: (sec) => {
    if (!state.ui) state.ui = {};
    const n = Number(sec);
    state.ui.autoBackupIntervalSec = Number.isFinite(n) ? Math.max(60, Math.min(600, Math.round(n))) : 60;
    refreshAutoBackupTimer();
    scheduleSaveAppSettings();
    draw();
  },
  setTouchMode: (on) => {
    if (!state.ui) state.ui = {};
    state.ui.touchMode = !!on;
    scheduleSaveAppSettings();
    draw();
  },
  setToolShortcut: (tool, key) => {
    const t = String(tool || "").toLowerCase();
    if (!TOOL_SHORTCUT_TOOL_ORDER.includes(t)) return;
    if (!state.ui) state.ui = {};
    const next = sanitizeToolShortcuts(state.ui.toolShortcuts);
    next[t] = normalizeShortcutKey(key);
    state.ui.toolShortcuts = next;
    scheduleSaveAppSettings();
    draw();
  },
  resetToolShortcuts: () => {
    if (!state.ui) state.ui = {};
    state.ui.toolShortcuts = sanitizeToolShortcuts(DEFAULT_TOOL_SHORTCUTS);
    scheduleSaveAppSettings();
    draw();
  },
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
  addSelectedAttribute: (name, value, target = "object") => {
    const s = getPrimarySelectedShape();
    if (!s) return;
    pushHistory(state);
    if (!Array.isArray(s.attributes)) s.attributes = [];
    s.attributes.push({
      id: `attr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      name: String(name || "").trim(),
      value: String(value ?? ""),
      target: String(target || "object")
    });
    draw();
  },
  removeSelectedAttribute: (attrId) => {
    const s = getPrimarySelectedShape();
    if (!s || !Array.isArray(s.attributes)) return;
    const removed = s.attributes.find(a => String(a?.id) === String(attrId));
    if (!removed) return;
    pushHistory(state);
    s.attributes = s.attributes.filter(a => String(a?.id) !== String(attrId));
    const name = String(removed?.name || "");
    const target = String(removed?.target || "");
    const m = /^vertex:(p1|p2)$/.exec(target);
    if (m && (name.startsWith("keep_") || name === "keep_snap")) {
      if (s.type === "line") {
        if (m[1] === "p1") s.p1Attrib = null;
        if (m[1] === "p2") s.p2Attrib = null;
      }
      // Keep UI/state coherent: remove other keep_* rows for the same vertex target.
      s.attributes = s.attributes.filter(a => {
        if (String(a?.target || "") !== target) return true;
        const an = String(a?.name || "");
        return !(an.startsWith("keep_") || an === "keep_snap");
      });
    }
    draw();
  },
  updateSelectedAttribute: (attrId, patch) => {
    const s = getPrimarySelectedShape();
    if (!s || !Array.isArray(s.attributes)) return;
    const a = s.attributes.find(it => String(it?.id) === String(attrId));
    if (!a) return;
    pushHistory(state);
    Object.assign(a, patch || {});
    draw();
  },
  setVertexMoveInputs: (dx, dy) => { setVertexMoveInputs(state, dx, dy); draw(); },
  executeDoubleLine: () => {
    const lang = String(state.ui?.language || "ja").toLowerCase();
    if (state.tool !== "doubleline") {
      draw();
      return false;
    }
    if (!!state.dlineSettings?.noTrim) {
      const snap = snapshotModel(state);
      const ok = !!executeDoubleLine(state);
      if (ok) pushHistorySnapshot(state, snap);
      if (setStatus) setStatus(ok ? (lang === "en" ? "Double line created" : "二重線を作成しました") : (lang === "en" ? "Double line: select line(s) first" : "二重線: 先に対象を選択してください"));
      draw();
      return ok;
    }
    if (!Array.isArray(state.dlinePreview) || state.dlinePreview.length === 0) {
      if (setStatus) setStatus(lang === "en" ? "Double line: select line(s) first" : "二重線: 先に対象を選択してください");
      draw();
      return false;
    }
    const previewTrimmed = state.dlinePreview.map(o => ({ ...o }));
    const previewNoTrim = previewTrimmed.map(o => {
      if (!o || o.type !== "line") return o;
      const fx1 = Number(o.fullX1), fy1 = Number(o.fullY1), fx2 = Number(o.fullX2), fy2 = Number(o.fullY2);
      if ([fx1, fy1, fx2, fy2].every(Number.isFinite)) {
        return { ...o, x1: fx1, y1: fy1, x2: fx2, y2: fy2 };
      }
      return { ...o };
    });
    const selectedBases = (state.selection?.ids || [])
      .map(id => state.shapes.find(s => Number(s.id) === Number(id)))
      .filter(s => !!s);
    const intersections = buildDoubleLineTargetLineIntersections(previewTrimmed, selectedBases);
    const snap = snapshotModel(state);
    const res = executeDoubleLine(state, previewNoTrim, { returnMeta: true });
    const ok = !!res?.ok;
    if (ok && intersections.length) {
      const createdIds = new Set((res.newShapeIds || []).map(Number).filter(Number.isFinite));
      const excludedIds = [];
      for (const s of (state.shapes || [])) {
        const sid = Number(s?.id);
        if (!Number.isFinite(sid)) continue;
        if (createdIds.has(sid)) continue;
        excludedIds.push(sid);
      }
      for (const p of intersections) {
        trimClickedLineAtNearestIntersection(
          state,
          { x: Number(p.x), y: Number(p.y) },
          helpers,
          { excludedShapeIds: excludedIds, skipHistory: true, silent: true, allowedTargetTypes: ["line"] }
        );
      }
    }
    if (ok) pushHistorySnapshot(state, snap);
    clearDoubleLineTrimPendingState(state);
    if (setStatus) setStatus(ok ? (lang === "en" ? "Double line created" : "二重線を作成しました") : (lang === "en" ? "Double line: select line(s) first" : "二重線: 先に対象を選択してください"));
    draw();
    return ok;
  },
  cancelDoubleLineTrimPending: () => {
    if (!state.dlineTrimPending) return;
    clearDoubleLineTrimPendingState(state);
    draw();
  },
  beginMoveActiveGroupOriginOnly: () => {
    if (state.activeGroupId != null) {
      state.input.groupOriginPick.active = !state.input.groupOriginPick.active;
      if (setStatus) setStatus(state.input.groupOriginPick.active ? "Click or drag to move group origin" : "Ready");
      draw();
    }
  },
  render,
};

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

if (dom.jsonFileInput) {
  dom.jsonFileInput.addEventListener("change", async () => {
    const file = dom.jsonFileInput.files && dom.jsonFileInput.files[0];
    if (!file) return;
    try {
      const mode = String(state.ui?.jsonFileMode || "replace");
      if (isImageLikeFile(file)) {
        if (mode !== "import" && mode !== "append") {
          setStatus("画像の読み込みはインポートを使ってください");
          draw();
        } else {
          await importImageFile(file);
        }
      } else {
        const text = await file.text();
        const data = JSON.parse(text);
        if (mode === "append" || mode === "import") importJsonObjectAppend(state, data, helpers);
        else importJsonObject(state, data, helpers);
      }
      if (!state.ui) state.ui = {};
      state.ui._needsTangentResolve = true;
    } catch (err) {
      setStatus(`Load failed: ${err?.message || err}`);
      draw();
    } finally {
      if (state.ui) state.ui.jsonFileMode = "replace";
      dom.jsonFileInput.value = "";
    }
  });
}

// Handle exports for manual access if needed
window.cadApp = { state, dom, helpers, exportJsonObject, importJsonObject };


