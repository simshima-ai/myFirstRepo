export function getTopContextHelpText(state, tool, lang) {
  if (state.ui?.importAdjust?.active) {
    return (lang === "en")
      ? "Adjust imported geometry scale/offset, then click Apply or Cancel."
      : "インポート図形の縮尺と移動を調整し、Apply か Cancel で確定してください。";
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
    return (lang === "en")
      ? "Select an imported image, tune parameters, then click Regenerate."
      : "インポート済み画像を選択し、パラメータ調整後に再生成を押してください。";
  }
  const isTouchMode = !!state.ui?.touchMode;
  const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
  const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
  const lineHelp = (tool === "line" && lineMode === "continuous")
    ? (lang === "en"
      ? (isTouchMode ? "Click to add vertices, then tap Confirm." : "Click to add vertices. Press Enter to confirm.")
      : (isTouchMode ? "クリックで頂点追加後、左上の「確定」を押します。" : "クリックで頂点追加  Enterキーで決定"))
    : ((tool === "line" && lineMode === "freehand")
      ? (lang === "en"
        ? (isTouchMode ? "Click to add control points, then tap Confirm to finalize B-Spline." : "Click to add control points. Press Enter or double-click to finalize B-Spline.")
        : (isTouchMode ? "クリックで制御点を追加し、左上の「確定」でBスプラインを確定します。" : "クリックで制御点を追加。EnterまたはダブルクリックでBスプライン確定。"))
      : (lang === "en" ? "Click first point, then second point. You can also input Length / Angle." : "1点目クリック後、2点目をクリック。Length / Angle の数値入力も使えます。"));
  const helpMap = (lang === "en")
    ? {
      select: "Switch click target type. Toggle with Space key.",
      vertex: "Click/drag vertices to edit. Shift for multi-select. Enter executes dX/dY move.",
      line: lineHelp,
      rect: "Click start point then opposite corner. Width / Height inputs are also supported.",
      circle: "Mode: Mouse Drag / Fixed Radius / 3-Point Tangent. In 3-point, pick 3 center-bearing objects.",
      position: "Click to place a position marker. Size uses the left panel setting.",
      dim: "Create dimensions by two points or object pick. Chain mode supports continuous placement.",
      fillet: "Select target objects and confirm candidate. line-circle/arc-line supports side selection.",
      trim: "Click shape to trim. You can also split without deleting.",
      settings: "Configure paper size, orientation, scale, and grid.",
      text: "Click canvas to place text. Edit content/size/color in the top panel.",
      hatch: isTouchMode ? "Click boundaries to select, then tap Confirm." : "Click boundaries to select. Press Enter or Apply to execute hatching.",
      patterncopy: isTouchMode ? "Choose mode and set center/axis if needed, then tap Confirm." : "Execute pattern copy. Choose mode and set center/axis if needed, then click Apply.",
      doubleline: isTouchMode ? "Create double lines from selected lines. Adjust offset/mode, then tap Confirm." : "Create double lines from selected lines. Adjust offset/mode and confirm by Apply or Enter.",
    }
    : {
      select: "クリック選択の対象を切り替えます。スペースキーでトグル",
      vertex: "頂点をクリック/ドラッグして編集。Shiftで複数選択。Enterで dX/dY 移動を実行。",
      line: lineHelp,
      rect: "始点クリック後、対角点をクリック。Width / Height の数値入力で確定できます。",
      circle: "モード: マウスドラッグ / 半径固定 / 三点指示。三点指示は中心座標を持つオブジェクトを3つ選択。",
      position: "クリックで位置マーカーを配置します。Size は左パネル設定を使用。",
      dim: "2点クリックまたはオブジェクト選択で寸法線を作成。直列モードでは連続配置可能。",
      fillet: "対象を選択して候補を確定。line-circle/arc-line は段階的に残す側を選べます。",
      trim: "図形をクリックしてトリムを実行。削除せずに分割のみ行うことも可能です。",
      settings: "用紙サイズ、方位、縮尺、およびグリッド設定を行います。",
      text: "キャンバスをクリックしてテキストを配置。配置後、上部パネルで内容、サイズ、色などを変更できます。",
      hatch: isTouchMode ? "境界をクリックして選択後、左上の「確定」でハッチングを実行します。" : "境界をクリックして選択。Enter または Apply でハッチングを実行します。",
      patterncopy: isTouchMode ? "モードを選択し、必要なら中心点や軸線を指定して、左上の「確定」を押してください。" : "パターンコピーを実行します。モードを選択し、必要であれば中心点や軸線をキャンバス上でクリックしてから Apply を押してください。",
      doubleline: isTouchMode ? "選択した線分から二重線を生成します。Offset値やModeを調整後、左上の「確定」で実行します。" : "選択した線分から二重線（オフセット線）を生成します。Offset値やMode（片側/両側）を調整し、ApplyまたはEnterで確定します。",
    };
  return helpMap[tool] || "";
}
