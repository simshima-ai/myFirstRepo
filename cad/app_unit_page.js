const PAGE_SIZES_MM = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  Letter: [279.4, 215.9],
  Legal: [355.6, 215.9],
  Tabloid: [431.8, 279.4],
  Ledger: [431.8, 279.4],
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
  "dimOffset",
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

export function clearDoubleLineTrimPendingState(state) {
  state.dlineTrimPending = false;
  state.dlineTrimPendingPreview = null;
  state.dlineTrimCandidates = null;
  state.dlineTrimIntersections = null;
  state.dlineTrimStepTargets = null;
  state.dlineTrimStepCreatedIds = null;
  state.dlineTrimStepTotal = 0;
}

export function hasAnyVertexSnapBinding(state) {
  for (const s of (state.shapes || [])) {
    if (!s) continue;
    if (s.type === "line" && (s.p1Attrib || s.p2Attrib)) return true;
    if (s.type === "dim" && (s.p1Attrib || s.p2Attrib)) return true;
  }
  return false;
}

export function convertStateUnitKeepingPhysicalSize(state, fromUnit, toUnit) {
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
  if (state.grid && Number.isFinite(Number(state.grid.presetSize))) state.grid.presetSize = Number(state.grid.presetSize) * factor;
  if (state.grid && Number.isFinite(Number(state.grid.customSize))) state.grid.customSize = Number(state.grid.customSize) * factor;
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
  // NOTE: Keep print-based dimension settings fixed across unit changes.
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
    state.input.dimHoveredSegmentIndex = null;
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

export function getPageFrameWorldSize(pageSetup) {
  const useCustomSize = !!pageSetup?.customSizeEnabled;
  const customW = Math.max(1, Number(pageSetup?.customWidthMm) || 297);
  const customH = Math.max(1, Number(pageSetup?.customHeightMm) || 210);
  const key = String(pageSetup?.size || "A4");
  const [w, h] = useCustomSize ? [customW, customH] : (PAGE_SIZES_MM[key] || PAGE_SIZES_MM.A4);
  const isPortrait = String(pageSetup?.orientation || "landscape") === "portrait";
  const mmW = isPortrait ? Math.min(w, h) : Math.max(w, h);
  const mmH = isPortrait ? Math.max(w, h) : Math.min(w, h);
  const effectiveScale = !!pageSetup?.customScaleEnabled
    ? Number(pageSetup?.customScale ?? pageSetup?.scale ?? 1)
    : Number(pageSetup?.scale ?? pageSetup?.presetScale ?? 1);
  const scale = Math.max(0.0001, effectiveScale || 1);
  const unit = String(pageSetup?.unit || "mm");
  const mmPerUnit = MM_PER_UNIT[unit] || 1;
  return { cadW: mmW * scale / mmPerUnit, cadH: mmH * scale / mmPerUnit };
}
