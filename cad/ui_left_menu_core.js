export function createHtmlLikeLeftMenuRegistry() {
  return [
    { type: "tool", id: "select", label: "驕ｸ謚・", group: "create" },
    { type: "action", id: "resetView", label: "陦ｨ遉ｺ繝ｪ繧ｻ繝・ヨ", implemented: true, group: "create" },
    { type: "tool", id: "line", label: "邱・", group: "create" },
    { type: "tool", id: "rect", label: "蝗幄ｧ・", group: "create" },
    { type: "tool", id: "circle", label: "蜀・", group: "create" },
    { type: "tool", id: "position", label: "菴咲ｽｮ", group: "create" },
    { type: "tool", id: "dim", label: "蟇ｸ豕慕ｷ・", group: "create" },
    { type: "tool", id: "text", label: "繝・く繧ｹ繝・", group: "create" },
    { type: "tool", id: "hatch", label: "繝上ャ繝√Φ繧ｰ", implemented: true, group: "create" },
    { type: "sep" },
    { type: "tool", id: "vertex", label: "鬆らせ邱ｨ髮・", group: "edit" },
    { type: "tool", id: "fillet", label: "繝輔ぅ繝ｬ繝・ヨ", group: "edit" },
    { type: "tool", id: "trim", label: "繝医Μ繝", group: "edit" },
    { type: "tool", id: "doubleline", label: "莠碁㍾邱・", implemented: true, group: "edit" },
    { type: "tool", id: "patterncopy", label: "繝代ち繝ｼ繝ｳ繧ｳ繝斐・", implemented: true, group: "edit" },
    { type: "action", id: "undo", label: "Undo", implemented: true, group: "edit" },
    { type: "action", id: "redo", label: "Redo", implemented: true, group: "edit" },
    { type: "action", id: "delete", label: "蜑企勁", implemented: true, group: "edit" },
    { type: "sep" },
    { type: "action", id: "newFile", label: "譁ｰ隕丈ｽ懈・", implemented: true, group: "file" },
    { type: "action", id: "saveJson", label: "菫晏ｭ・", implemented: true, group: "file" },
    { type: "action", id: "saveJsonAs", label: "蛻･蜷堺ｿ晏ｭ・", implemented: true, group: "file" },
    { type: "action", id: "loadJson", label: "隱ｭ霎ｼ", implemented: true, group: "file" },
    { type: "action", id: "importJson", label: "繧､繝ｳ繝昴・繝・", implemented: true, group: "file" },
    {
      type: "action-flyout",
      id: "export",
      label: "蜃ｺ蜉・",
      group: "file",
      options: [
        { id: "pdf", label: "PDF", implemented: true },
        { id: "svg", label: "SVG", implemented: true },
        { id: "dxf", label: "DXF", implemented: true },
      ],
    },
    { type: "tool", id: "settings", label: "險ｭ螳・", group: "file" },
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
