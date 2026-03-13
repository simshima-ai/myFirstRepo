export function createDocumentOps(config) {
  const {
    state,
    dom,
    createState,
    loadJsonFromFileDialog,
    setTool,
    setStatus,
    draw
  } = config || {};

  function loadJson() {
    if (!state.ui) state.ui = {};
    state.ui.jsonFileMode = "replace";
    loadJsonFromFileDialog(state, dom);
  }

  function importJson() {
    if (!state.ui) state.ui = {};
    state.ui.jsonFileMode = "import";
    loadJsonFromFileDialog(state, dom);
  }

  function newFile() {
    const msg = "Create a new file? Unsaved changes will be lost.";
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
    state.ui.groupView = { colorize: false, currentLayerOnly: false };
    state.history.past = [];
    state.history.future = [];
    setTool(state, "select");
    setStatus("New file created");
    draw();
  }

  return { loadJson, importJson, newFile };
}
