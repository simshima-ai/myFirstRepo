export function getTopContextHelpText(state, tool, lang) {
  const isEasyMode = String(state.ui?.displayMode || "cad").toLowerCase() === "easy";
  if (isEasyMode && tool === "select") return "";
  if (state.ui?.importAdjust?.active) {
    return "Adjust imported geometry scale/offset, then click Apply or Cancel.";
  }

  const hasTraceSelected = (() => {
    const ids = new Set((state.selection?.ids || []).map(Number));
    if (!ids.size) return false;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (String(s.type || "") === "imagetrace") return true;
    }
    return false;
  })();

  if (state.ui?.tracePanelOpen || hasTraceSelected) {
    return "Select an imported image, tune parameters, then click Regenerate.";
  }

  const isTouchMode = !!state.ui?.touchMode;
  const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
  const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";

  let lineHelp = "Click first point, then second point. You can also input Length / Angle.";
  if (tool === "line" && lineMode === "continuous") {
    lineHelp = isTouchMode
      ? "Click to add vertices, then tap Confirm."
      : "Click to add vertices. Press Enter to confirm.";
  } else if (tool === "line" && lineMode === "freehand") {
    lineHelp = isTouchMode
      ? "Click to add control points, then tap Confirm to finalize the B-spline."
      : "Click to add control points. Press Enter or double-click to finalize the B-spline.";
  }

  const helpMap = {
    select: "Toggle the click-selection target. Press Space to switch.",
    vertex: "Click or drag vertices to edit. Use Shift for multi-select. Press Enter for dX/dY move.",
    line: lineHelp,
    rect: "Click the first corner, then the opposite corner. Width / Height input also works.",
    circle: "Modes: drag / fixed radius / 3-point. 3-point mode uses 3 objects with center coordinates.",
    position: "Click to place a position marker. Size uses the left-panel setting.",
    dim: "Create dimensions by clicking 2 points or selecting objects. Chain mode supports continuous placement.",
    fillet: "Select targets and confirm the candidate. line-circle / arc-line can choose the side to keep step by step.",
    trim: "Click a shape to trim it. Split-only mode is also available.",
    settings: "Configure paper size, orientation, scale, and grid settings.",
    text: "Click the canvas to place text. After placement, edit content, size, color, and more from the top panel.",
    hatch: isTouchMode ? "Click boundaries to select them, then tap Confirm to run hatching." : "Click boundaries to select them. Press Enter or Apply to run hatching.",
    patterncopy: isTouchMode ? "Choose a mode, optionally set a center or axis, then tap Confirm." : "Run pattern copy. Choose a mode, optionally click a center point or axis on the canvas, then press Apply.",
    doubleline: isTouchMode ? "Create double lines from the selected segments. Adjust Offset and Mode, then tap Confirm." : "Create offset double lines from the selected segments. Adjust Offset and Mode, then press Apply or Enter.",
  };

  return helpMap[tool] || "";
}
