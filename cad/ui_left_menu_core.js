export function createHtmlLikeLeftMenuRegistry() {
  return [
    { type: "tool", id: "select", label: "Select", group: "create" },
    { type: "action", id: "resetView", label: "Reset View", implemented: true, group: "create" },
    { type: "tool", id: "line", label: "Line", group: "create" },
    { type: "tool", id: "rect", label: "Rect", group: "create" },
    { type: "tool", id: "circle", label: "Circle", group: "create" },
    { type: "tool", id: "position", label: "Position", group: "create" },
    { type: "tool", id: "dim", label: "Dimension", group: "create" },
    { type: "tool", id: "text", label: "Text", group: "create" },
    { type: "tool", id: "hatch", label: "Hatch", implemented: true, group: "create" },
    { type: "sep" },
    { type: "tool", id: "vertex", label: "Vertex", group: "edit" },
    { type: "tool", id: "fillet", label: "Fillet", group: "edit" },
    { type: "tool", id: "trim", label: "Trim", group: "edit" },
    { type: "tool", id: "doubleline", label: "Double Line", implemented: true, group: "edit" },
    { type: "tool", id: "patterncopy", label: "Pattern Copy", implemented: true, group: "edit" },
    { type: "action", id: "lineToPolyline", label: "Polygon Convert", implemented: true, group: "edit" },
    { type: "action", id: "undo", label: "Undo", implemented: true, group: "edit" },
    { type: "action", id: "redo", label: "Redo", implemented: true, group: "edit" },
    { type: "action", id: "delete", label: "Delete", implemented: true, group: "edit" },
    { type: "sep" },
    { type: "action", id: "newFile", label: "New", implemented: true, group: "file" },
    { type: "action", id: "saveJson", label: "Save", implemented: true, group: "file" },
    { type: "action", id: "saveJsonAs", label: "Save As", implemented: true, group: "file" },
    { type: "action", id: "loadJson", label: "Load", implemented: true, group: "file" },
    { type: "action", id: "importJson", label: "Import", implemented: true, group: "file" },
    {
      type: "action-flyout",
      id: "export",
      label: "Export",
      group: "file",
      options: [
        { id: "png", label: "PNG", implemented: true },
        { id: "pdf", label: "PDF", implemented: true },
        { id: "svg", label: "SVG", implemented: true },
        { id: "dxf", label: "DXF", implemented: true },
      ],
    },
    { type: "tool", id: "settings", label: "Settings", group: "file" },
  ];
}

export function leftMenuItemKey(item) {
  return `${String(item?.type || "")}:${String(item?.id || "")}`;
}

export function getViewportSizeForUi() {
  const vv = window.visualViewport;
  const width = Math.max(
    1,
    Number(vv?.width)
    || Number(window.innerWidth)
    || Number(document.documentElement?.clientWidth)
    || 1
  );
  const height = Math.max(
    1,
    Number(vv?.height)
    || Number(window.innerHeight)
    || Number(document.documentElement?.clientHeight)
    || 1
  );
  return { width, height };
}

export function isLeftMenuItemVisible(state, key) {
  if (key === "tool:settings") return true;
  const map = (state.ui && typeof state.ui.leftMenuVisibility === "object") ? state.ui.leftMenuVisibility : null;
  if (!map) return true;
  return map[key] !== false;
}

export function bindSnapItemsToLeftMenuVisibility(dom) {
  const defs = [
    ["gridSnapToggle", "grid"],
    ["objSnapToggle", "onCurve"],
    ["objSnapEndpointToggle", "endpoint"],
    ["objSnapMidpointToggle", "midpoint"],
    ["objSnapCenterToggle", "center"],
    ["objSnapIntersectionToggle", "intersection"],
    ["objSnapTangentToggle", "tangent"],
    ["objSnapVectorToggle", "vector"],
    ["objSnapTangentKeepToggle", "keepAttr"],
  ];
  for (const [controlId, key] of defs) {
    const input = dom?.[controlId] || document.getElementById(controlId);
    const row = input?.closest?.("label");
    if (!row) continue;
    row.dataset.menuItemKey = `snap:${key}`;
    row.dataset.menuGroup = "snap";
  }
}
