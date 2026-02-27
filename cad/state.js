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
      snapMode: "object", // "object" | "grid" | "both"
      circleMode: "radius", // "radius" | "diameter"
      textRotate: 0,
      extOffset: 4,
      extOver: 4,
      arrowType: "default",
      arrowSize: 10,
      rOvershoot: 5,
    },
    previewSettings: {
      precision: 2,
    },
    lineSettings: {
      length: 100,
      angleDeg: 0,
    },
    rectSettings: {
      width: 100,
      height: 100,
    },
    circleSettings: {
      radius: 50,
      showCenterMark: false,
    },
    filletSettings: {
      radius: 20,
      lineMode: "trim",
    },
    trimSettings: {
      noDelete: false,
    },
    positionSettings: {
      size: 20,
    },
    textSettings: {
      content: "Text",
      color: "#0f172a",
      sizePt: 12,
      rotate: 0,
      fontFamily: "Yu Gothic UI",
      bold: false,
      italic: false,
    },
    hatchSettings: {
      pitchMm: 5,
      angleDeg: 45,
      pattern: "single", // "single" | "cross"
      crossAngleDeg: 90,
      rangeScale: 1.2,
      parallelRangeScale: 1.2,
      lineShiftMm: 0,
      lineType: "solid", // "solid" | "dashed" | "dotted" | "dashdot"
      lineDashMm: 5,
      lineGapMm: 2,
      repetitionPaddingMm: 2,
    },
    hatchDraft: {
      boundaryIds: [],
    },
    dlineSettings: {
      offset: 10,
      mode: 'both', // 'single' | 'both'
    },
    dlinePreview: null, // [{x1,y1,x2,y2}]
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
      },
    },
    vertexEdit: {
      moveDx: 0,
      moveDy: 0,
      linkCoincident: true,
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
      maxScale: 16,
    },
    grid: {
      size: 100,
      snap: true,
      show: true,
      auto: true,
      // Auto-grid pixel thresholds (HTML版寄せ):
      // base/effective grid px がこれを超えたら finer、下回ったら coarser を段階判定
      autoThreshold50: 30,
      autoThreshold10: 60,
    },
    pageSetup: {
      size: "A4",
      orientation: "landscape",
      scale: 1,
      unit: "mm",
      showFrame: true,
      innerMarginMm: 10,
    },
    objectSnap: {
      enabled: true,
      endpoint: true,
      center: true,
      intersection: true,
      tangent: false,
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
        groupOrigin: null,
        shapeSnapshots: null,
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
      dimHandleDrag: {
        active: false,
        dimId: null,
        part: null,
        modelSnapshotBeforeMove: null,
        moved: false,
      },
      dragStartWorld: null,
      dragStartScreen: null,
      hoverWorld: { x: 0, y: 0 },
      objectSnapHover: null,
      trimHover: null,
      filletHover: null,
      filletFlow: null,
      hatchHover: null,
      dimHoveredShapeId: null,
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
      panelLayout: {
        rightPanelWidth: 250,
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
  state.groups = Array.isArray(snap.groups)
    ? JSON.parse(JSON.stringify(snap.groups.map((g, i) => ({
      id: Number(g.id) || (i + 1),
      name: String(g.name || `Group ${i + 1}`),
      shapeIds: Array.isArray(g.shapeIds) ? g.shapeIds.map(Number) : [],
      parentId: (g.parentId == null) ? null : Number(g.parentId),
      originX: Number.isFinite(Number(g.originX)) ? Number(g.originX) : 0,
      originY: Number.isFinite(Number(g.originY)) ? Number(g.originY) : 0,
      rotationDeg: Number.isFinite(Number(g.rotationDeg)) ? Number(g.rotationDeg) : 0,
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
  state.pageSetup.orientation = (String(ps.orientation || state.pageSetup.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
  state.pageSetup.scale = Math.max(0.0001, Number(ps.scale ?? state.pageSetup.scale ?? 1) || 1);
  state.pageSetup.unit = String(ps.unit || state.pageSetup.unit || "mm");
  state.pageSetup.showFrame = ps.showFrame !== false;
  state.pageSetup.innerMarginMm = Math.max(0, Number(ps.innerMarginMm ?? state.pageSetup.innerMarginMm ?? 10) || 0);
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
  state.tool = tool;
}

export function clearSelection(state) {
  state.selection.ids = [];
  state.activeGroupId = null;
}

export function setSelection(state, ids) {
  state.selection.ids = Array.from(new Set(ids.map(Number)));
}

export function isSelected(state, id) {
  return state.selection.ids.includes(Number(id));
}

export function addShape(state, shape) {
  if (shape && (shape.layerId == null)) shape.layerId = state.activeLayerId;

  // 自動グループ作成: groupId が指定されていない新規オブジェクトの場合
  if (shape && shape.groupId == null) {
    const id = state.nextGroupId++;
    let ox = 0, oy = 0;

    // 形状種別に応じて中心点（グループ原点）を計算
    if (shape.type === "line" || shape.type === "rect") {
      ox = (shape.x1 + shape.x2) * 0.5;
      oy = (shape.y1 + shape.y2) * 0.5;
    } else if (shape.type === "circle" || shape.type === "arc") {
      ox = shape.cx;
      oy = shape.cy;
    } else if (shape.type === "position" || shape.type === "text") {
      ox = shape.x || shape.x1 || 0;
      oy = shape.y || shape.y1 || 0;
    } else if (shape.type === "dim" || shape.type === "dimchain" || shape.type === "dimangle") {
      ox = shape.x1 || 0;
      oy = shape.y1 || 0;
    }

    if (!Number.isFinite(ox)) ox = 0;
    if (!Number.isFinite(oy)) oy = 0;

    const group = {
      id,
      name: `Group ${id}`,
      shapeIds: [Number(shape.id)],
      parentId: null,
      originX: ox,
      originY: oy,
      rotationDeg: 0,
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
    } else if (s.type === "circle" || s.type === "arc") {
      minX = Math.min(minX, s.cx - s.r); minY = Math.min(minY, s.cy - s.r);
      maxX = Math.max(maxX, s.cx + s.r); maxY = Math.max(maxY, s.cy + s.r);
    }
  }

  const ox = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
  const oy = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;

  const group = {
    id: gid,
    name: `Group ${gid}`,
    shapeIds: shapes.map(s => Number(s.id)),
    parentId: null,
    originX: ox,
    originY: oy,
    rotationDeg: 0,
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
  const ids = Array.from(new Set((state.selection.ids || []).map(Number)));
  if (!ids.length) return null;
  for (const g of (state.groups || [])) {
    g.shapeIds = (g.shapeIds || []).filter((sid) => !ids.includes(Number(sid)));
  }
  pruneEmptyGroups(state);
  const id = state.nextGroupId++;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const shapeIdSet = new Set(ids);
  for (const s of (state.shapes || [])) {
    if (!shapeIdSet.has(Number(s.id))) continue;
    if (s.type === "line" || s.type === "rect") {
      minX = Math.min(minX, s.x1, s.x2); minY = Math.min(minY, s.y1, s.y2);
      maxX = Math.max(maxX, s.x1, s.x2); maxY = Math.max(maxY, s.y1, s.y2);
    } else if (s.type === "circle" || s.type === "arc") {
      minX = Math.min(minX, s.cx - s.r); minY = Math.min(minY, s.cy - s.r);
      maxX = Math.max(maxX, s.cx + s.r); maxY = Math.max(maxY, s.cy + s.r);
    } else if (s.type === "position") {
      minX = Math.min(minX, s.x); minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x); maxY = Math.max(maxY, s.y);
    } else if (s.type === "dim") {
      minX = Math.min(minX, s.x1, s.x2, s.px); minY = Math.min(minY, s.y1, s.y2, s.py);
      maxX = Math.max(maxX, s.x1, s.x2, s.px); maxY = Math.max(maxY, s.y1, s.y2, s.py);
    }
  }
  const originX = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
  const originY = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;
  const group = {
    id,
    name: String(name || `Group ${id}`),
    shapeIds: ids.slice(),
    parentId: null,
    originX,
    originY,
    rotationDeg: 0,
  };
  state.groups.unshift(group);
  state.activeGroupId = id;
  return group;
}

export function nextGroupId(state) {
  return state.nextGroupId++;
}

export function addGroup(state, group) {
  if (group && (group.id == null)) group.id = state.nextGroupId++;
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


