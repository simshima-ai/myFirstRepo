export const TOOL_SHORTCUT_TOOL_ORDER = Object.freeze([
  "select",
  "line",
  "rect",
  "circle",
  "position",
  "dim",
  "text",
  "vertex",
  "fillet",
  "trim",
  "hatch",
  "doubleline",
  "patterncopy",
  "vertex_mode_toggle",
  "delete",
]);

export const DEFAULT_TOOL_SHORTCUTS = Object.freeze({
  select: "S",
  line: "L",
  rect: "R",
  circle: "C",
  position: "P",
  dim: "D",
  text: "T",
  vertex: "V",
  fillet: "F",
  trim: "M",
  hatch: "H",
  doubleline: "B",
  patterncopy: "Y",
  vertex_mode_toggle: "\\",
  delete: "DEL",
});

export function normalizeShortcutKey(v) {
  if (v == null) return "";
  const key = String(v).trim().toUpperCase();
  if (key === "DELETE" || key === "DEL") return "DEL";
  if (key === "\\") return "\\";
  return /^[A-Z0-9]$/.test(key) ? key : "";
}

export function sanitizeToolShortcuts(rawMap) {
  const out = {};
  for (const tool of TOOL_SHORTCUT_TOOL_ORDER) {
    out[tool] = normalizeShortcutKey(DEFAULT_TOOL_SHORTCUTS[tool] || "");
  }
  if (!rawMap || typeof rawMap !== "object") return out;
  for (const tool of TOOL_SHORTCUT_TOOL_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(rawMap, tool)) continue;
    const normalized = normalizeShortcutKey(rawMap[tool]);
    out[tool] = normalized;
  }
  return out;
}

function normalizeGroupAimConstraint(raw) {
  const enabled = !!raw?.enabled;
  const targetTypeRaw = String(raw?.targetType || "").toLowerCase();
  const targetType = (targetTypeRaw === "group" || targetTypeRaw === "position") ? targetTypeRaw : null;
  const targetId = Number(raw?.targetId);
  return {
    enabled,
    targetType,
    targetId: Number.isFinite(targetId) ? targetId : null,
  };
}

export function createState() {
  return {
    buildVersion: "v00-scaffold",
    tool: "select",
    shapes: [],
    nextShapeId: 1,
    polylineDraft: null,
    dimDraft: null,
    dimSettings: {
      precision: 1,
      linearMode: "single", // "single" | "chain"
      snapMode: "endpoint",
      ignoreGridSnap: false,
      circleArrowSide: "outside", // "outside" | "inside"
      textRotate: "auto",
      extOffset: 2,
      extOver: 2,
      fontSize: 12,
      dimArrowType: 'open',
      dimArrowSize: 10,
      dimArrowDirection: "normal",
      rOvershoot: 5,
      lineWidthMm: 0.25,
      lineType: "solid",
    },
    previewSettings: {
      precision: 2,
    },
    lineSettings: {
      length: 100,
      angleDeg: 0,
      mode: "segment", // "segment" | "continuous" | "freehand"
      continuous: false,
      sizeLocked: false,
      anchor: "endpoint_a", // "endpoint_a" | "endpoint_b" | "center"
      lineWidthMm: 0.25,
      lineType: "solid",
      color: "#0f172a",
    },
    rectSettings: {
      width: 100,
      height: 100,
      sizeLocked: false,
      anchor: "c",
      lineWidthMm: 0.25,
      lineType: "solid",
      color: "#0f172a",
    },
    circleSettings: {
      mode: "drag", // "drag" | "fixed" | "threepoint"
      radius: 50,
      radiusLocked: false,
      showCenterMark: false,
      lineWidthMm: 0.25,
      lineType: "solid",
      color: "#0f172a",
    },
    filletSettings: {
      radius: 20,
      lineMode: "trim",
      noTrim: false,
      lineWidthMm: 0.25,
      lineType: "solid",
      color: "#0f172a",
    },
    trimSettings: {
      noDelete: false,
    },
    positionSettings: {
      size: 3,
      lineWidthMm: 0.1,
      lineType: "solid",
      color: "#0f172a",
    },
    textSettings: {
      content: "Text",
      color: "#0f172a",
      sizePt: 12,
      rotate: 0,
      fontFamily: "Yu Gothic UI",
      bold: false,
      italic: false,
      lineWidthMm: 0.25,
      lineType: "solid",
    },
    lineWidthMm: 0.25,
    hatchSettings: {
      pitchMm: 5,
      angleDeg: 45,
      pattern: "single", // "single" | "cross"
      crossAngleDeg: 90,
      rangeScale: 1.2,
      parallelRangeScale: 1.2,
      lineShiftMm: 0,
      lineType: "solid", // "solid" | "dashed" | "dotted" | "dashdot"
      lineColor: "#0f172a",
      lineDashMm: 5,
      lineGapMm: 2,
      repetitionPaddingMm: 2,
      fillEnabled: false,
      fillColor: "#dbeafe",
      lineWidthMm: 0.25,
    },
    hatchDraft: {
      boundaryIds: [],
    },
    dlineSettings: {
      offset: 10,
      mode: 'both', // 'single' | 'both'
      noTrim: false,
      lineWidthMm: 0.25,
      lineType: "solid",
    },
    dlinePreview: null, // [{x1,y1,x2,y2}]
    dlineSingleSidePickPoint: null, // {x,y} in single mode after side decision click
    dlineTrimPending: false,
    dlineTrimPendingPreview: null,
    dlineTrimCandidates: null,
    dlineTrimIntersections: null,
    dlineTrimStepTargets: null,
    dlineTrimStepCreatedIds: null,
    dlineTrimStepTotal: 0,
    groups: [],
    nextGroupId: 1,
    activeGroupId: null,
    layers: [
      { id: 1, name: "Layer 1", visible: true, locked: false },
    ],
    nextLayerId: 2,
    activeLayerId: 1,
    selection: {
      ids: [],
      groupIds: [],
      box: {
        active: false,
        additive: false,
        startScreen: null,
        currentScreen: null,
      },
      drag: {
        active: false,
        moved: false,
        startWorldRaw: null,
        shapeSnapshots: null,
        modelSnapshotBeforeMove: null,
        mode: null, // "move" | "resize-image"
        resizeShapeId: null,
        resizeCorner: null, // "tl" | "br"
        resizeAnchor: null,
      },
    },
    vertexEdit: {
      mode: "move", // "move" | "insert"
      moveDx: 0,
      moveDy: 0,
      linkCoincident: true,
      insertCandidate: null,
      targetShapeIds: [],
      selectedVertices: [], // [{ shapeId, key }]
      activeVertex: null, // last-picked convenience handle
      filterShapeId: null, // if set, only show/interact with vertices of this shape
      drag: {
        active: false,
        anchorShapeId: null,
        anchorKey: null,
        startWorldRaw: null,
        selectedVertexKeys: null, // stable keys for current drag
        baseShapeSnapshots: null, // [{id, shape}]
        modelSnapshotBeforeMove: null,
        moved: false,
        lastTangentSnap: null, // { x, y, circleId } if last snap was tangent
        lastIntersectionSnap: null, // { x, y, lineAId, lineBId } if last snap was line-line intersection
        lastObjectSnap: null,
      },
    },
    history: {
      past: [],
      future: [],
      limit: 100,
    },
    view: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      minScale: 0.02,
      maxScale: 192,
      viewportWidth: 1,
      viewportHeight: 1,
    },
    grid: {
      size: 10,
      presetSize: 10,
      customSizeEnabled: false,
      customSize: 10,
      snap: true,
      show: true,
      auto: true,
      // Auto-grid thresholds based on "% of reset-view grid pixel size"
      autoThreshold50: 130,
      autoThreshold10: 180,
      autoThreshold5: 240,
      autoThreshold1: 320,
      autoTiming: 35,
      autoBasePxAtReset: null,
      autoLevel: 100,
    },
    pageSetup: {
      size: "A4",
      customSizeEnabled: false,
      customWidthMm: 297,
      customHeightMm: 210,
      orientation: "landscape",
      scale: 1,
      presetScale: 1,
      customScaleEnabled: false,
      customScale: 1,
      unit: "mm",
      showFrame: true,
      innerMarginMm: 10,
    },
    objectSnap: {
      enabled: false,
      endpoint: false,
      midpoint: false,
      center: false,
      intersection: false,
      tangent: false,
      keepAttributes: false,
      tangentKeep: false, // save tangent relationship as vertex attribute
      vector: false,
    },
    input: {
      modifierKeys: { shift: false, ctrl: false, alt: false },
      hover: {
        shape: null,
        vertex: null,
        groupRotate: null,
        groupOrigin: null,
        dimHandle: null,
        trimCandidate: null,
        filletCandidate: null,
      },
      pointerDown: false,
      panning: false,
      panAnchor: null,
      groupDrag: {
        active: false,
        startWorldRaw: null,
        groupId: null,
        groupIds: null,
        groupOrigin: null,
        shapeSnapshots: null,
        anchorGroupId: null,
        anchorGroupOrigin: null,
        modelSnapshotBeforeMove: null,
        moved: false,
      },
      groupRotate: {
        active: false,
        groupId: null,
        startAngleDeg: 0,
        startPointerAngleDeg: 0,
        groupOrigin: null,
        shapeSnapshots: null,
        modelSnapshotBeforeRotate: null,
        moved: false,
        snapDeg: 5,
      },
      groupOriginPick: {
        active: false,
        dragging: false,
        groupId: null,
        startWorldRaw: null,
        startOrigin: null,
        moved: false,
        modelSnapshotBeforeMove: null,
      },
      groupAimPick: {
        active: false,
        groupId: null,
        candidateType: null,
        candidateId: null,
      },
      dimHandleDrag: {
        active: false,
        dimId: null,
        part: null,
        lastWorld: null,
        modelSnapshotBeforeMove: null,
        moved: false,
      },
      dimLineDrag: {
        active: false,
        moved: false,
      },
      circleThreePointRefs: [], // [{ x, y, r, shapeId, type }]
      dragStartWorld: null,
      touchRectDraft: {
        stage: 0, // 0: waiting first confirm, 1: waiting second confirm
        p1: null,
        candidateStart: null,
        candidateEnd: null,
      },
      dragStartScreen: null,
      hoverWorld: { x: 0, y: 0 },
      objectSnapHover: null,
      trimHover: null,
      filletHover: null,
      filletFlow: null,
      hatchHover: null,
      hatchValidation: null,
      dimHoveredShapeId: null,
      dimHoveredSegmentIndex: null,
      dimSessionGroupId: null,
      patternCopyFlow: {
        centerPositionId: null,
        axisLineId: null,
      },
    },
    patternCopySettings: {
      mode: "array", // "array" | "rotate" | "mirror"
      arrayCountX: 5,
      arrayCountY: 1,
      arrayDx: 50,
      arrayDy: 50,
      rotateCount: 3,
      rotateAngleDeg: 45,
    },
    ui: {
      statusText: "",
      rightPanelCollapsed: {
        snap: false,
        layers: false,
        groups: false,
      },
      groupTreeExpanded: {},
      groupDragDrop: {
        draggingGroupId: null,
        draggingShapeId: null,
        overGroupId: null,
      },
      layerPanelInnerCollapsed: {
        ops: true,
      },
      layerView: {
        colorize: false,
        editOnlyActive: false,
      },
      groupView: {
        colorize: false,
        currentLayerOnly: false,
      },
      selectPickMode: "object", // "object" | "group"
      language: "en",
      menuScalePct: 100,
      touchMode: false,
      touchMultiSelect: false,
      importDxfAsPolyline: false,
      showFps: false,
      showObjectCount: false,
      autoBackupEnabled: true,
      autoBackupIntervalSec: 60,
      toolShortcuts: sanitizeToolShortcuts(null),
      panelLayout: {
        rightPanelWidth: 188,
        groupPanelHeight: 420,
        layerPanelHeight: 300,
      },
    },
  };
}

export function snapshotModel(state) {
  return {
    shapes: JSON.parse(JSON.stringify(state.shapes)),
    nextShapeId: state.nextShapeId,
    selectionIds: state.selection.ids.slice(),
    selectionGroupIds: Array.isArray(state.selection.groupIds) ? state.selection.groupIds.slice() : [],
    groups: JSON.parse(JSON.stringify(state.groups || [])),
    nextGroupId: state.nextGroupId,
    activeGroupId: state.activeGroupId,
    layers: JSON.parse(JSON.stringify(state.layers || [])),
    nextLayerId: state.nextLayerId,
    activeLayerId: state.activeLayerId,
  };
}

export function restoreModel(state, snap) {
  if (!snap) return;
  state.shapes = JSON.parse(JSON.stringify(snap.shapes || []));
  state.nextShapeId = Number(snap.nextShapeId) || 1;
  state.selection.ids = Array.isArray(snap.selectionIds) ? snap.selectionIds.map(Number) : [];
  state.selection.groupIds = Array.isArray(snap.selectionGroupIds) ? snap.selectionGroupIds.map(Number) : [];
  state.groups = Array.isArray(snap.groups)
    ? JSON.parse(JSON.stringify(snap.groups.map((g, i) => ({
      id: Number(g.id) || (i + 1),
      name: String(g.name || `Group ${i + 1}`),
      shapeIds: Array.isArray(g.shapeIds) ? g.shapeIds.map(Number) : [],
      visible: g.visible !== false,
      parentId: (g.parentId == null) ? null : Number(g.parentId),
      originX: Number.isFinite(Number(g.originX)) ? Number(g.originX) : 0,
      originY: Number.isFinite(Number(g.originY)) ? Number(g.originY) : 0,
      rotationDeg: Number.isFinite(Number(g.rotationDeg)) ? Number(g.rotationDeg) : 0,
      aimConstraint: normalizeGroupAimConstraint(g.aimConstraint),
    }))))
    : [];
  state.nextGroupId = Number(snap.nextGroupId) || (Math.max(0, ...state.groups.map(g => Number(g.id) || 0)) + 1);
  state.activeGroupId = (snap.activeGroupId == null) ? null : Number(snap.activeGroupId);
  if (state.activeGroupId != null && !state.groups.some(g => Number(g.id) === Number(state.activeGroupId))) {
    state.activeGroupId = null;
  }
  state.layers = Array.isArray(snap.layers) && snap.layers.length
    ? JSON.parse(JSON.stringify(snap.layers.map((l, i) => ({
      id: Number(l.id) || (i + 1),
      name: String(l.name || `Layer ${i + 1}`),
      visible: l.visible !== false,
      locked: l.locked === true,
    }))))
    : [{ id: 1, name: "Layer 1", visible: true, locked: false }];
  state.nextLayerId = Number(snap.nextLayerId) || (Math.max(...state.layers.map(l => Number(l.id) || 0), 0) + 1);
  const activeLayerId = Number(snap.activeLayerId) || Number(state.layers[0].id);
  state.activeLayerId = state.layers.some(l => Number(l.id) === activeLayerId)
    ? activeLayerId
    : Number(state.layers[0].id);
  const ps = snap.pageSetup || {};
  if (!state.pageSetup) state.pageSetup = {};
  state.pageSetup.size = String(ps.size || state.pageSetup.size || "A4");
  state.pageSetup.customSizeEnabled = !!(ps.customSizeEnabled ?? state.pageSetup.customSizeEnabled);
  state.pageSetup.customWidthMm = Math.max(1, Number(ps.customWidthMm ?? state.pageSetup.customWidthMm ?? 297) || 297);
  state.pageSetup.customHeightMm = Math.max(1, Number(ps.customHeightMm ?? state.pageSetup.customHeightMm ?? 210) || 210);
  state.pageSetup.orientation = (String(ps.orientation || state.pageSetup.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
  state.pageSetup.scale = Math.max(0.0001, Number(ps.scale ?? state.pageSetup.scale ?? 1) || 1);
  state.pageSetup.presetScale = Math.max(0.0001, Number(ps.presetScale ?? state.pageSetup.presetScale ?? state.pageSetup.scale ?? 1) || 1);
  state.pageSetup.customScaleEnabled = !!(ps.customScaleEnabled ?? state.pageSetup.customScaleEnabled);
  state.pageSetup.customScale = Math.max(0.0001, Number(ps.customScale ?? state.pageSetup.customScale ?? state.pageSetup.scale ?? 1) || 1);
  state.pageSetup.unit = String(ps.unit || state.pageSetup.unit || "mm");
  state.pageSetup.showFrame = ps.showFrame !== false;
  state.pageSetup.innerMarginMm = Math.max(0, Number(ps.innerMarginMm ?? state.pageSetup.innerMarginMm ?? 10) || 0);
  if (!state.grid) state.grid = {};
  state.grid.presetSize = Math.max(1, Number(snap.grid?.presetSize ?? state.grid.presetSize ?? state.grid.size ?? 10) || 10);
  state.grid.customSizeEnabled = !!(snap.grid?.customSizeEnabled ?? state.grid.customSizeEnabled);
  state.grid.customSize = Math.max(1, Number(snap.grid?.customSize ?? state.grid.customSize ?? state.grid.size ?? 10) || 10);
  state.lineWidthMm = Math.max(0.01, Number(snap.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
  for (const s of (state.shapes || [])) {
    if (!Number.isFinite(Number(s?.lineWidthMm))) s.lineWidthMm = state.lineWidthMm;
  }
}

export function pushHistory(state) {
  state.history.past.push(snapshotModel(state));
  if (state.history.past.length > state.history.limit) state.history.past.shift();
  state.history.future = [];
}

export function pushHistorySnapshot(state, snap) {
  if (!snap) return;
  state.history.past.push(JSON.parse(JSON.stringify(snap)));
  if (state.history.past.length > state.history.limit) state.history.past.shift();
  state.history.future = [];
}

export function canUndo(state) {
  return state.history.past.length > 0;
}

export function canRedo(state) {
  return state.history.future.length > 0;
}

export function undo(state) {
  if (!canUndo(state)) return false;
  const cur = snapshotModel(state);
  const prev = state.history.past.pop();
  state.history.future.push(cur);
  restoreModel(state, prev);
  return true;
}

export function redo(state) {
  if (!canRedo(state)) return false;
  const cur = snapshotModel(state);
  const next = state.history.future.pop();
  state.history.past.push(cur);
  restoreModel(state, next);
  return true;
}

export function nextShapeId(state) {
  const id = state.nextShapeId;
  state.nextShapeId += 1;
  return id;
}

export function setTool(state, tool) {
  const prevTool = state.tool;
  state.tool = tool;
  if (tool === "fillet" && prevTool !== "fillet") {
    clearSelection(state);
  }
  if (tool === "hatch" && prevTool !== "hatch") {
    if (!state.hatchDraft) state.hatchDraft = { boundaryIds: [] };
    state.hatchDraft.boundaryIds = [];
    if (state.input) {
      state.input.hatchHover = null;
      state.input.hatchValidation = null;
    }
  }
  if (tool !== "circle" && state.input) {
    state.input.circleThreePointRefs = [];
    state.input.dragStartWorld = null;
  }
  if (tool !== "rect" && state.input) {
    state.input.dragStartWorld = null;
    state.input.touchRectDraft = { stage: 0, p1: null, candidateStart: null, candidateEnd: null };
  }
  if (tool !== "dim") {
    state.input.dimSessionGroupId = null;
  }
  if (tool !== "doubleline") {
    state.dlineSingleSidePickPoint = null;
    state.dlineTrimPending = false;
    state.dlineTrimPendingPreview = null;
    state.dlineTrimCandidates = null;
    state.dlineTrimIntersections = null;
    state.dlineTrimStepTargets = null;
    state.dlineTrimStepCreatedIds = null;
    state.dlineTrimStepTotal = 0;
  }
  if (tool === "vertex" && prevTool !== "vertex") {
    const editableTypeSet = new Set(["line", "rect", "arc", "polyline", "bspline"]);
    const shapeById = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    const targetIds = new Set();
    for (const sidRaw of (state.selection?.ids || [])) {
      const sid = Number(sidRaw);
      if (!Number.isFinite(sid)) continue;
      const s = shapeById.get(sid);
      if (!s || !editableTypeSet.has(String(s.type || "").toLowerCase())) continue;
      targetIds.add(sid);
    }
    const selectedGroupIds = new Set();
    for (const gidRaw of (state.selection?.groupIds || [])) {
      const gid = Number(gidRaw);
      if (Number.isFinite(gid)) selectedGroupIds.add(gid);
    }
    if (state.activeGroupId != null && Number.isFinite(Number(state.activeGroupId))) {
      selectedGroupIds.add(Number(state.activeGroupId));
    }
    if (selectedGroupIds.size) {
      const childrenByParent = new Map();
      for (const g of (state.groups || [])) {
        const pid = (g?.parentId == null) ? null : Number(g.parentId);
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid).push(Number(g.id));
      }
      const groupTreeIds = new Set();
      const walk = (gid) => {
        if (!Number.isFinite(gid) || groupTreeIds.has(gid)) return;
        groupTreeIds.add(gid);
        for (const cid of (childrenByParent.get(gid) || [])) walk(Number(cid));
      };
      for (const gid of selectedGroupIds) walk(Number(gid));
      for (const g of (state.groups || [])) {
        if (!groupTreeIds.has(Number(g?.id))) continue;
        for (const sidRaw of (g?.shapeIds || [])) {
          const sid = Number(sidRaw);
          const s = shapeById.get(sid);
          if (!s || !editableTypeSet.has(String(s.type || "").toLowerCase())) continue;
          targetIds.add(sid);
        }
      }
    }
    state.vertexEdit.targetShapeIds = Array.from(targetIds);
    state.vertexEdit.filterShapeId = (state.vertexEdit.targetShapeIds.length === 1)
      ? Number(state.vertexEdit.targetShapeIds[0])
      : null;
    state.vertexEdit.insertCandidate = null;
    state.vertexEdit.selectedVertices = [];
    state.vertexEdit.activeVertex = null;
  }
  if (tool !== "vertex" && prevTool === "vertex") {
    state.vertexEdit.insertCandidate = null;
    state.vertexEdit.filterShapeId = null;
    state.vertexEdit.selectedVertices = [];
    state.vertexEdit.activeVertex = null;
    state.vertexEdit.targetShapeIds = [];
  }
}

export function clearSelection(state) {
  state.selection.ids = [];
  state.selection.groupIds = [];
  state.activeGroupId = null;
  state.dlineSingleSidePickPoint = null;
}

export function setSelection(state, ids) {
  state.selection.ids = Array.from(new Set(ids.map(Number)));
  state.selection.groupIds = [];
  state.dlineSingleSidePickPoint = null;
}

export function isSelected(state, id) {
  return state.selection.ids.includes(Number(id));
}

export function isGroupVisible(state, groupId) {
  const gid = Number(groupId);
  if (!Number.isFinite(gid)) return true;
  const byId = new Map((state.groups || []).map((g) => [Number(g.id), g]));
  let cur = byId.get(gid);
  let guard = 0;
  while (cur && guard < 10000) {
    if (cur.visible === false) return false;
    if (cur.parentId == null) return true;
    cur = byId.get(Number(cur.parentId));
    guard += 1;
  }
  return true;
}

export function addShape(state, shape) {
  if (shape && (shape.layerId == null)) shape.layerId = state.activeLayerId;
  if (shape && !Number.isFinite(Number(shape.lineWidthMm))) {
    shape.lineWidthMm = Math.max(0.01, Number(state.lineWidthMm ?? 0.25) || 0.25);
  }
  if (shape && typeof shape.lineType !== "string") {
    shape.lineType = "solid";
  }

  // 自動グループ作成: groupId が指定されていない新規オブジェクトの場合
  // ただし position は常に未グループで作成する。
  if (shape && shape.groupId == null && shape.type !== "position") {
    const id = state.nextGroupId++;
    let ox = 0, oy = 0;

    // 形状種別に応じて中心点（グループ原点）を計算
    if (shape.type === "line" || shape.type === "rect") {
      ox = (shape.x1 + shape.x2) * 0.5;
      oy = (shape.y1 + shape.y2) * 0.5;
    } else if (shape.type === "circle" || shape.type === "arc") {
      ox = shape.cx;
      oy = shape.cy;
    } else if (shape.type === "polyline") {
      if (Array.isArray(shape.points) && shape.points.length) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of shape.points) {
          const x = Number(p?.x), y = Number(p?.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
        if (Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)) {
          ox = (minX + maxX) * 0.5;
          oy = (minY + maxY) * 0.5;
        }
      }
    } else if (shape.type === "image") {
      ox = Number(shape.x) + Number(shape.width) * 0.5;
      oy = Number(shape.y) + Number(shape.height) * 0.5;
    } else if (shape.type === "position" || shape.type === "text") {
      ox = shape.x || shape.x1 || 0;
      oy = shape.y || shape.y1 || 0;
    } else if (shape.type === "dim" || shape.type === "dimchain" || shape.type === "dimangle") {
      ox = shape.x1 || 0;
      oy = shape.y1 || 0;
    }

    if (!Number.isFinite(ox)) ox = 0;
    if (!Number.isFinite(oy)) oy = 0;
    const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
    const sox = Math.round(ox / gridStep) * gridStep;
    const soy = Math.round(oy / gridStep) * gridStep;

    const group = {
      id,
      name: `Group ${id}`,
      shapeIds: [Number(shape.id)],
      visible: true,
      parentId: null,
      originX: sox,
      originY: soy,
      rotationDeg: 0,
      aimConstraint: normalizeGroupAimConstraint(null),
    };
    state.groups.unshift(group);
    shape.groupId = id;
    state.activeGroupId = id;
  }

  state.shapes.push(shape);
  return shape;
}

export function addShapesAsGroup(state, shapes) {
  if (!shapes || shapes.length === 0) return;
  const gid = state.nextGroupId++;

  // 計算用：グループ原点を包含する形状のバウンディングボックス中心に
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes) {
    if (s.type === "line" || s.type === "rect") {
      minX = Math.min(minX, s.x1, s.x2); minY = Math.min(minY, s.y1, s.y2);
      maxX = Math.max(maxX, s.x1, s.x2); maxY = Math.max(maxY, s.y1, s.y2);
    } else if (s.type === "polyline") {
      for (const p of (s.points || [])) {
        const x = Number(p?.x), y = Number(p?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    } else if (s.type === "circle" || s.type === "arc") {
      minX = Math.min(minX, s.cx - s.r); minY = Math.min(minY, s.cy - s.r);
      maxX = Math.max(maxX, s.cx + s.r); maxY = Math.max(maxY, s.cy + s.r);
    } else if (s.type === "image") {
      const x = Number(s.x), y = Number(s.y), w = Number(s.width), h = Number(s.height);
      if ([x, y, w, h].every(Number.isFinite)) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      }
    }
  }

  const ox = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
  const oy = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;
  const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
  const sox = Math.round(ox / gridStep) * gridStep;
  const soy = Math.round(oy / gridStep) * gridStep;

  const group = {
    id: gid,
    name: `Group ${gid}`,
    shapeIds: shapes.map(s => Number(s.id)),
    visible: true,
    parentId: null,
    originX: sox,
    originY: soy,
    rotationDeg: 0,
    aimConstraint: normalizeGroupAimConstraint(null),
  };

  state.groups.unshift(group);
  state.activeGroupId = null;

  for (const s of shapes) {
    s.groupId = gid;
    if (s.layerId == null) s.layerId = state.activeLayerId;
    state.shapes.push(s);
  }
  state.selection.ids = [];
}

export function removeShapeById(state, id) {
  const idx = state.shapes.findIndex((s) => Number(s.id) === Number(id));
  if (idx < 0) return false;
  state.shapes.splice(idx, 1);
  state.selection.ids = state.selection.ids.filter((sid) => Number(sid) !== Number(id));
  for (const g of state.groups) {
    g.shapeIds = (g.shapeIds || []).filter((sid) => Number(sid) !== Number(id));
  }
  pruneEmptyGroups(state);
  return true;
}

export function translateShape(shape, dx, dy) {
  if (!shape) return;
  if (shape.type === "line" || shape.type === "rect") {
    shape.x1 += dx; shape.y1 += dy;
    shape.x2 += dx; shape.y2 += dy;
    return;
  }
  if (shape.type === "polyline") {
    if (Array.isArray(shape.points)) {
      for (const p of shape.points) {
        if (!p) continue;
        p.x = Number(p.x) + dx;
        p.y = Number(p.y) + dy;
      }
    }
    return;
  }
  if (shape.type === "circle") {
    shape.cx += dx; shape.cy += dy;
    return;
  }
  if (shape.type === "arc") {
    shape.cx += dx; shape.cy += dy;
    return;
  }
  if (shape.type === "dim") {
    shape.x1 += dx; shape.y1 += dy;
    shape.x2 += dx; shape.y2 += dy;
    shape.px += dx; shape.py += dy;
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      shape.tx += dx; shape.ty += dy;
    }
    return;
  }
  if (shape.type === "dimchain") {
    if (Array.isArray(shape.points)) {
      for (const pt of shape.points) {
        if (!pt) continue;
        pt.x = Number(pt.x) + dx;
        pt.y = Number(pt.y) + dy;
      }
    }
    if (Number.isFinite(Number(shape.px)) && Number.isFinite(Number(shape.py))) {
      shape.px += dx; shape.py += dy;
    }
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      shape.tx += dx; shape.ty += dy;
    }
    return;
  }
  if (shape.type === "circleDim") {
    if (Number.isFinite(Number(shape.tx)) && Number.isFinite(Number(shape.ty))) {
      shape.tx += dx; shape.ty += dy;
    }
    return;
  }
  if (shape.type === "image") {
    if (Number.isFinite(Number(shape.x)) && Number.isFinite(Number(shape.y))) {
      shape.x += dx; shape.y += dy;
    }
    return;
  }
  if (shape.type === "imagetrace") {
    if (Array.isArray(shape.segments)) {
      for (const seg of shape.segments) {
        if (!seg) continue;
        if (Number.isFinite(Number(seg.x1))) seg.x1 = Number(seg.x1) + dx;
        if (Number.isFinite(Number(seg.y1))) seg.y1 = Number(seg.y1) + dy;
        if (Number.isFinite(Number(seg.x2))) seg.x2 = Number(seg.x2) + dx;
        if (Number.isFinite(Number(seg.y2))) seg.y2 = Number(seg.y2) + dy;
      }
    }
    if (Number.isFinite(Number(shape.x))) shape.x += dx;
    if (Number.isFinite(Number(shape.y))) shape.y += dy;
    return;
  }
}

export function getLayer(state, layerId) {
  return (state.layers || []).find((l) => Number(l.id) === Number(layerId)) || null;
}

export function isLayerVisible(state, layerId) {
  const layer = getLayer(state, layerId);
  return !layer || layer.visible !== false;
}

export function isLayerLocked(state, layerId) {
  const layer = getLayer(state, layerId);
  return !!(layer && layer.locked === true);
}

export function addLayer(state, name) {
  const id = state.nextLayerId++;
  const layer = { id, name: String(name || `Layer ${id}`), visible: true, locked: false };
  state.layers.push(layer);
  return layer;
}

export function setActiveLayer(state, layerId) {
  const id = Number(layerId);
  if (state.layers.some((l) => Number(l.id) === id)) state.activeLayerId = id;
}

export function setLayerVisible(state, layerId, visible) {
  const layer = getLayer(state, layerId);
  if (!layer) return false;
  layer.visible = !!visible;
  return true;
}

export function setLayerLocked(state, layerId, locked) {
  const layer = getLayer(state, layerId);
  if (!layer) return false;
  layer.locked = !!locked;
  return true;
}

export function getGroup(state, groupId) {
  return (state.groups || []).find((g) => Number(g.id) === Number(groupId)) || null;
}

export function pruneEmptyGroups(state) {
  const shapeIdSet = new Set((state.shapes || []).map((s) => Number(s.id)));
  state.groups = (state.groups || [])
    .map((g) => ({
      ...g,
      shapeIds: (g.shapeIds || []).map(Number).filter((id) => shapeIdSet.has(id)),
    }))
    .filter((g) => (g.shapeIds || []).length > 0);
  if (state.activeGroupId != null && !state.groups.some((g) => Number(g.id) === Number(state.activeGroupId))) {
    state.activeGroupId = null;
  }
}

export function createGroupFromSelection(state, name) {
  let ids = Array.from(new Set((state.selection.ids || []).map(Number).filter(Number.isFinite)));
  if (!ids.length) {
    const selectedGroupIds = Array.from(new Set((state.selection.groupIds || []).map(Number).filter(Number.isFinite)));
    if (selectedGroupIds.length) {
      const byParent = new Map();
      for (const g of (state.groups || [])) {
        const pid = g.parentId == null ? null : Number(g.parentId);
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(Number(g.id));
      }
      const byGroupId = new Map((state.groups || []).map(g => [Number(g.id), g]));
      const groupSeen = new Set();
      const shapeSet = new Set();
      const stack = selectedGroupIds.slice();
      while (stack.length) {
        const gid = Number(stack.pop());
        if (!Number.isFinite(gid) || groupSeen.has(gid)) continue;
        groupSeen.add(gid);
        const g = byGroupId.get(gid);
        if (g) {
          for (const sid of (g.shapeIds || [])) {
            const n = Number(sid);
            if (Number.isFinite(n)) shapeSet.add(n);
          }
        }
        for (const cid of (byParent.get(gid) || [])) stack.push(Number(cid));
      }
      ids = Array.from(shapeSet);
      if (ids.length) {
        state.selection.ids = ids.slice();
        state.selection.groupIds = [];
      }
    }
  }
  if (!ids.length) {
    const id = state.nextGroupId++;
    const cx = (Number(state.view?.offsetX) || 0) / Math.max(1e-9, Number(state.view?.scale) || 1);
    const cy = (Number(state.view?.offsetY) || 0) / Math.max(1e-9, Number(state.view?.scale) || 1);
    const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
    const group = {
      id,
      name: String(name || `Group ${id}`),
      shapeIds: [],
      visible: true,
      parentId: null,
      originX: Math.round(cx / gridStep) * gridStep,
      originY: Math.round(cy / gridStep) * gridStep,
      rotationDeg: 0,
      aimConstraint: normalizeGroupAimConstraint(null),
    };
    state.groups.unshift(group);
    state.activeGroupId = id;
    state.selection.ids = [];
    state.selection.groupIds = [id];
    return group;
  }
  const idSet = new Set(ids);
  for (const g of (state.groups || [])) {
    g.shapeIds = (g.shapeIds || []).filter((sid) => !ids.includes(Number(sid)));
  }
  const id = state.nextGroupId++;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const shapeIdSet = new Set(ids);
  for (const s of (state.shapes || [])) {
    if (!shapeIdSet.has(Number(s.id))) continue;
    if (s.type === "line" || s.type === "rect") {
      minX = Math.min(minX, s.x1, s.x2); minY = Math.min(minY, s.y1, s.y2);
      maxX = Math.max(maxX, s.x1, s.x2); maxY = Math.max(maxY, s.y1, s.y2);
    } else if (s.type === "polyline") {
      for (const p of (s.points || [])) {
        const x = Number(p?.x), y = Number(p?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
    } else if (s.type === "circle" || s.type === "arc") {
      minX = Math.min(minX, s.cx - s.r); minY = Math.min(minY, s.cy - s.r);
      maxX = Math.max(maxX, s.cx + s.r); maxY = Math.max(maxY, s.cy + s.r);
    } else if (s.type === "position") {
      minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y);
    } else if (s.type === "image") {
      const x = Number(s.x), y = Number(s.y), w = Number(s.width), h = Number(s.height);
      if ([x, y, w, h].every(Number.isFinite)) {
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      }
    } else if (s.type === "dim") {
      minX = Math.min(minX, s.x1, s.x2, s.px); minY = Math.min(minY, s.y1, s.y2, s.py);
      maxX = Math.max(maxX, s.x1, s.x2, s.px); maxY = Math.max(maxY, s.y1, s.y2, s.py);
    } else if (s.type === "dimchain") {
      if (Array.isArray(s.points) && s.points.length) {
        for (const pt of s.points) {
          if (!pt) continue;
          const x = Number(pt.x), y = Number(pt.y);
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      if (Number.isFinite(Number(s.px)) && Number.isFinite(Number(s.py))) {
        minX = Math.min(minX, Number(s.px)); minY = Math.min(minY, Number(s.py));
        maxX = Math.max(maxX, Number(s.px)); maxY = Math.max(maxY, Number(s.py));
      }
      if (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) {
        minX = Math.min(minX, Number(s.tx)); minY = Math.min(minY, Number(s.ty));
        maxX = Math.max(maxX, Number(s.tx)); maxY = Math.max(maxY, Number(s.ty));
      }
    } else if (s.type === "circleDim") {
      // circleDim geometry anchors to referenced shape; use known text anchor as fallback.
      if (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) {
        minX = Math.min(minX, Number(s.tx)); minY = Math.min(minY, Number(s.ty));
        maxX = Math.max(maxX, Number(s.tx)); maxY = Math.max(maxY, Number(s.ty));
      }
    } else if (s.type === "dimangle") {
      const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r)) {
        minX = Math.min(minX, cx - r); minY = Math.min(minY, cy - r);
        maxX = Math.max(maxX, cx + r); maxY = Math.max(maxY, cy + r);
      }
      if (Number.isFinite(Number(s.tx)) && Number.isFinite(Number(s.ty))) {
        minX = Math.min(minX, Number(s.tx)); minY = Math.min(minY, Number(s.ty));
        maxX = Math.max(maxX, Number(s.tx)); maxY = Math.max(maxY, Number(s.ty));
      }
    }
  }
  const originX = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
  const originY = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;
  const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
  const snapOriginX = Math.round(originX / gridStep) * gridStep;
  const snapOriginY = Math.round(originY / gridStep) * gridStep;
  const group = {
    id,
    name: String(name || `Group ${id}`),
    shapeIds: ids.slice(),
    visible: true,
    parentId: null,
    originX: snapOriginX,
    originY: snapOriginY,
    rotationDeg: 0,
    aimConstraint: normalizeGroupAimConstraint(null),
  };
  state.groups.unshift(group);
  // Keep shape.groupId consistent with groups[].shapeIds so group-pick hit tests work.
  for (const s of (state.shapes || [])) {
    if (!idSet.has(Number(s.id))) continue;
    s.groupId = id;
  }
  state.activeGroupId = id;
  return group;
}

export function nextGroupId(state) {
  return state.nextGroupId++;
}

export function addGroup(state, group) {
  if (group && (group.id == null)) group.id = state.nextGroupId++;
  if (group) group.visible = group.visible !== false;
  if (group) group.aimConstraint = normalizeGroupAimConstraint(group.aimConstraint);
  state.groups.push(group);
  return group;
}

export function setActiveGroup(state, groupId) {
  if (groupId == null) {
    state.activeGroupId = null;
    return;
  }
  const id = Number(groupId);
  if (state.groups.some((g) => Number(g.id) === id)) {
    state.activeGroupId = id;
  }
}

export function moveGroupOrigin(state, groupId, dx, dy) {
  const g = getGroup(state, groupId);
  if (!g) return false;
  g.originX = (Number(g.originX) || 0) + dx;
  g.originY = (Number(g.originY) || 0) + dy;
  return true;
}


