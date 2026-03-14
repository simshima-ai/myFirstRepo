export function getTopContextHelpText(state, tool, lang) {
  const isEasyMode = String(state.ui?.displayMode || "cad").toLowerCase() === "easy";
  if (isEasyMode && tool === "select") return "";
  if (state.ui?.importAdjust?.active) {
    return lang === "ja" ? "インポート形状の拡大率とオフセットを調整し、Apply か Cancel を押してください。" : "Adjust imported geometry scale/offset, then click Apply or Cancel.";
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
    return lang === "ja" ? "インポート画像を選び、各値を調整して Regenerate を押してください。" : "Select an imported image, tune parameters, then click Regenerate.";
  }

  const isTouchMode = !!state.ui?.touchMode;
  const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
  const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";

  let lineHelp = lang === "ja" ? "1点目をクリックし、次に2点目をクリック。長さ/角度入力も使えます。" : "Click first point, then second point. You can also input Length / Angle.";
  if (tool === "line" && lineMode === "continuous") {
    lineHelp = isTouchMode
      ? (lang === "ja" ? "クリックで頂点追加、Confirm で確定。" : "Click to add vertices, then tap Confirm.")
      : (lang === "ja" ? "クリックで頂点追加。Enter で確定。" : "Click to add vertices. Press Enter to confirm.");
  } else if (tool === "line" && lineMode === "freehand") {
    lineHelp = isTouchMode
      ? (lang === "ja" ? "クリックで制御点追加、Confirm で Bスプライン確定。" : "Click to add control points, then tap Confirm to finalize the B-spline.")
      : (lang === "ja" ? "クリックで制御点追加、Enterキーで Bスプライン確定。" : "Click to add control points. Press Enter or double-click to finalize the B-spline.");
  }

  const helpMap = (lang === "ja") ? {
    select: "クリック選択対象を切り替えます。Space でも切り替えできます。",
    vertex: "頂点をクリックまたはドラッグして編集します。複数選択は Shift、dX/dY 移動は Enter。",
    line: lineHelp,
    rect: "1点目の角をクリックし、次に対角をクリックします。幅/高さ入力も使えます。",
    circle: "drag / fixed radius / 3-point を切り替えます。3-point は中心座標を持つ3オブジェクトを使います。",
    position: "クリックして位置マーカーを置きます。サイズは左パネル設定を使います。",
    dim: "2点指定またはオブジェクト選択で寸法を作成します。chain は連続配置対応です。",
    fillet: "対象を選択して候補を確定します。line-circle / arc-line は残す側を段階的に選べます。",
    trim: "図形をクリックしてトリムします。分割のみモードも使えます。",
    settings: "用紙サイズ、向き、縮尺、グリッド設定を調整します。",
    text: "キャンバスをクリックして文字を配置します。配置後は上部パネルで内容やサイズなどを編集します。",
    hatch: isTouchMode ? "境界をクリックして選択し、Confirm でハッチを実行します。" : "境界をクリックして選択し、Enter または Apply でハッチを実行します。",
    patterncopy: isTouchMode ? "モードを選び、必要なら中心や軸を設定して Confirm。" : "モードを選び、必要なら中心点や軸をキャンバスで指定して コピー実行。",
    doubleline: isTouchMode ? "選択セグメントから複線を作成します。Offset と Mode を調整して Confirm。" : "選択セグメントからオフセット複線を作成します。Offset と Mode を調整して Apply または Enter。",
  } : {
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
