function clampGridAutoTiming(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

function gridAutoTimingLabelText(timing) {
  const t = clampGridAutoTiming(timing);
  if (t <= 20) return "かなり早い";
  if (t <= 40) return "やや早い";
  if (t <= 60) return "標準";
  if (t <= 80) return "やや遅い";
  return "かなり遅い";
}
export function getUiLanguage(state) {
  return String(state?.ui?.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function normalizePositiveNumber(v, fallback = 1, min = 0.0001) {
  const n = Number(v);
  if (!Number.isFinite(n)) return Math.max(min, Number(fallback) || min);
  return Math.max(min, n);
}

export function localizeGridAutoTimingLabelText(timing, lang) {
  const t = clampGridAutoTiming(timing);
  if (lang === "en") {
    if (t <= 20) return "Very Fast";
    if (t <= 40) return "Fast";
    if (t <= 60) return "Normal";
    if (t <= 80) return "Slow";
    return "Very Slow";
  }
  return gridAutoTimingLabelText(timing);
}

export function refreshCustomPageSizeUnitLabels(state) {
  const text = "(mm)";
  const w = document.getElementById("customPageWidthUnitLabel");
  const h = document.getElementById("customPageHeightUnitLabel");
  const m = document.getElementById("pageInnerMarginUnitLabel");
  if (w) w.textContent = text;
  if (h) h.textContent = text;
  if (m) m.textContent = text;
}

export function refreshGridUnitLabels(state) {
  const unit = String(state?.pageSetup?.unit || "mm").toLowerCase();
  const text = `(${unit})`;
  const base = document.getElementById("baseGridUnitLabel");
  const custom = document.getElementById("customGridUnitLabel");
  const dlineOffset = document.getElementById("dlineOffsetUnitLabel");
  if (base) base.textContent = text;
  if (custom) custom.textContent = text;
  if (dlineOffset) dlineOffset.textContent = text;
}

export function applyLanguageUi(state, dom) {
  const lang = getUiLanguage(state);
  const q = (sel) => document.querySelector(sel);
  const setText = (sel, text) => {
    const el = q(sel);
    if (el) el.textContent = text;
  };
  const setInnerToggleText = (sel, text) => {
    const el = q(sel);
    if (!el) return;
    // Keep localized label in dataset so refreshUi arrow-render keeps it.
    el.dataset.innerLabel = text;
    const inner = el.querySelector?.(".inner-label");
    if (inner) inner.textContent = text;
    else el.textContent = text;
  };
  const setLabelByControl = (controlId, text) => {
    const ctl = document.getElementById(controlId);
    const label = ctl?.closest?.("label");
    if (!label) return;
    // Prefer explicit span-based label text used by right-panel rows.
    const span = Array.from(label.querySelectorAll?.("span") || []).find((sp) => {
      if (!sp) return false;
      if (sp.contains?.(ctl)) return false;
      return true;
    });
    if (span) {
      span.textContent = text;
      return;
    }
    let textNode = null;
    for (const n of Array.from(label.childNodes || [])) {
      if (n && n.nodeType === 3) { textNode = n; break; }
    }
    const v = `${text} `;
    if (textNode) textNode.textContent = v;
    else label.insertBefore(document.createTextNode(v), label.firstChild || null);
  };
  const setButtonById = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setOptionText = (selectId, value, text) => {
    const sel = document.getElementById(selectId);
    const opt = sel?.querySelector?.(`option[value='${value}']`);
    if (opt) opt.textContent = text;
  };
  const setPrevSpanByControl = (controlId, text) => {
    const ctl = document.getElementById(controlId);
    const prev = ctl?.previousElementSibling;
    if (prev && prev.tagName === "SPAN") prev.textContent = text;
  };
  document.documentElement.lang = lang;

  const dict = {
    ja: {
      create: "作成",
      edit: "編集",
      file: "ファイル",
      snap: "スナップ",
      attrs: "属性",
      select: "選択",
      selectToolObject: "オブジェクト選択",
      selectToolGroup: "グループ選択",
      resetView: "表示リセット",
      line: "線",
      rect: "四角",
      circle: "円",
      position: "位置",
      dim: "寸法線",
      text: "テキスト",
      hatch: "ハッチング",
      vertex: "頂点編集",
      fillet: "フィレット",
      trim: "トリム",
      doubleline: "二重線",
      patterncopy: "パターンコピー",
      lineToPolyline: "多角形変換",
      undo: "Undo",
      redo: "Redo",
      del: "削除",
      save: "保存",
      newFile: "新規作成",
      saveAs: "別名保存",
      load: "読込",
      import: "インポート",
      traceImage: "画像トレース(実験)",
      tracePanelTitle: "画像トレース(実験)",
      traceTargetNone: "インポート済み画像を選択してください",
      traceMaxDim: "解像度上限",
      traceEdgePercent: "エッジ量",
      traceSimplify: "簡略化",
      traceMinSeg: "最小線分",
      traceMaxSeg: "最大線分数",
      traceOffsetX: "オフセットX",
      traceOffsetY: "オフセットY",
      traceInvert: "反転",
      importSourceUnit: "入力単位",
      importAsPolyline: "ポリライン化",
      traceRegenerate: "再生成",
      close: "閉じる",
      export: "出力",
      settings: "設定",
      manualGuide: "\u4f7f\u3044\u65b9\u30ac\u30a4\u30c9",
      modeMenuTitle: "\u30e2\u30fc\u30c9",
      viewerMode: "\u30d3\u30e5\u30fc\u30ef\u30fc\u30e2\u30fc\u30c9",
      easyMode: "\u30a4\u30fc\u30b8\u30fc\u30e2\u30fc\u30c9",
      cadMode: "CAD\u30e2\u30fc\u30c9",
      webTop: "Web Top",
      view: "\u8868\u793a",
      attrNamePlaceholder: "\u540d\u524d",
      attrValuePlaceholder: "\u5024",
      scadMenu: "S-CAD \u30e1\u30cb\u30e5\u30fc",
      cancel: "\u30ad\u30e3\u30f3\u30bb\u30eb",
      textPlaceholder: "\u30c6\u30ad\u30b9\u30c8\u3092\u5165\u529b",
      textContentPlaceholder: "\u30c6\u30ad\u30b9\u30c8\u5185\u5bb9",
      groupPanelHeightTitle: "\u30b0\u30eb\u30fc\u30d7\u30d1\u30cd\u30eb\u306e\u9ad8\u3055\u3092\u5909\u66f4",
      groupPanelWidthTitle: "\u30b0\u30eb\u30fc\u30d7\u30d1\u30cd\u30eb\u306e\u5e45\u3092\u5909\u66f4",
      layerPanelHeightTitle: "\u30ec\u30a4\u30e4\u30fc\u30d1\u30cd\u30eb\u306e\u9ad8\u3055\u3092\u5909\u66f4",
      layerPanelWidthTitle: "\u30ec\u30a4\u30e4\u30fc\u30d1\u30cd\u30eb\u306e\u5e45\u3092\u5909\u66f4",
      gridAutoTimingHint: "\u30ba\u30fc\u30e0\u306b\u5fdc\u3058\u3066\u30b0\u30ea\u30c3\u30c9\u9593\u9694\u3092\u81ea\u52d5\u5207\u66ff\u3057\u307e\u3059",
      adSpace: "\u5e83\u544a\u30b9\u30da\u30fc\u30b9",
      clear: "\u30af\u30ea\u30a2",
      rotateSnap: "\u56de\u8ee2\u89d2\u30b9\u30ca\u30c3\u30d7",
      filename: "\u30d5\u30a1\u30a4\u30eb\u540d",
      range: "\u7bc4\u56f2",
      page: "\u30da\u30fc\u30b8",
      viewRange: "\u8868\u793a\u7bc4\u56f2",
      selectionRange: "\u9078\u629e\u7bc4\u56f2",
      custom: "\u30ab\u30b9\u30bf\u30e0",
      centerX: "\u4e2d\u5fc3X",
      centerY: "\u4e2d\u5fc3Y",
      sizeMode: "\u30b5\u30a4\u30ba\u30e2\u30fc\u30c9",
      pixels: "\u30d4\u30af\u30bb\u30eb",
      dpiLabel: "DPI",
      widthPx: "\u5e45(px)",
      heightPx: "\u9ad8\u3055(px)",
      scaleMultiplier: "\u500d\u7387",
      marginPx: "\u4f59\u767d(px)",
      background: "\u80cc\u666f",
      white: "\u767d",
      transparent: "\u900f\u660e",
      backgroundColor: "\u80cc\u666f\u8272",
      colorMode: "\u8272\u30e2\u30fc\u30c9",
      layerColorMode: "\u30ec\u30a4\u30e4\u30fc\u8272\u5206\u3051",
      groupColorMode: "\u30b0\u30eb\u30fc\u30d7\u8272\u5206\u3051",
      includeGrid: "\u30b0\u30ea\u30c3\u30c9\u3092\u542b\u3081\u308b",
      includeAxes: "\u8ef8\u3092\u542b\u3081\u308b",
      includePageFrame: "\u7528\u7d19\u30d5\u30ec\u30fc\u30e0\u3092\u542b\u3081\u308b",
      includeSelectionHighlight: "\u9078\u629e\u30cf\u30a4\u30e9\u30a4\u30c8\u3092\u542b\u3081\u308b",
      antialias: "\u30a2\u30f3\u30c1\u30a8\u30a4\u30ea\u30a2\u30b9",
      debugConsole: "\u30c7\u30d0\u30c3\u30b0\u30b3\u30f3\u30bd\u30fc\u30eb",
      exportPng: "PNG\u51fa\u529b",
      lineWidthScale: "\u7dda\u5e45\u500d\u7387",
      minLineWidthPx: "\u6700\u5c0f\u7dda\u5e45(px)",
      moveOriginOnly: "\u539f\u70b9\u306e\u307f\u79fb\u52d5",
      sizeLocked: "\u30b5\u30a4\u30ba\u56fa\u5b9a",
      transformLocked: "\u5909\u5f62\u56fa\u5b9a",
      autoGridDebug: "\u81ea\u52d5\u30b0\u30ea\u30c3\u30c9\u30c7\u30d0\u30c3\u30b0",
      add: "\u8ffd\u52a0",
      up: "\u4e0a\u3078",
      down: "\u4e0b\u3078",
      lineApply: "\u4f5c\u6210",
      rectApply: "\u4f5c\u6210",
      circleApply: "\u4f5c\u6210",
      vertexMoveApply: "\u79fb\u52d5",
      groupRotation: "\u56de\u8ee2",
      selectMode: "選択モード",
      objectPick: "オブジェクト",
      groupPick: "グループ",
      filletRadius: "半径",
      filletMode: "動作モード",
      filletTrim: "トリムも行う",
      filletSplit: "トリムしない",
      filletApply: "実行",
      language: "言語",
      languageJa: "\u65e5\u672c\u8a9e",
      languageEn: "English",
      menuScale: "メニュー倍率",
      touchMode: "タッチモード",
      leftMenuVisibleItems: "\u5de6\u30e1\u30cb\u30e5\u30fc\u8868\u793a\u9805\u76ee",
      adDisplay: "\u5e83\u544a\u8868\u793a",
      adTopRight: "\u53f3\u4e0a",
      adBottomLeft: "\u5de6\u4e0b",
      adBottomCenter: "\u4e2d\u592e\u4e0b",
      touchConfirmCommon: "決定",
      touchCancelCommon: "キャンセル",
      touchBackToSelect: "選択に戻る",
      touchMultiSelectOn: "複数選択 ON",
      touchMultiSelectOff: "複数選択 OFF",
      touchConfirm: "確定",
      dimPreparePlacement: "配置位置を指定",
      dimFinalize: "寸法確定",
      shortcutSettings: "キーボードショートカット",
      shortcutHint: "主要ツール/削除のキー設定",
      resetShortcuts: "初期値に戻す",
      groups: "グループ",
      layers: "レイヤー",
      groupOps: "グループ操作",
      createGroup: "新規グループ作成",
      layerOps: "レイヤー操作",
      rename: "リネーム",
      colorize: "カラー分け表示",
      currentLayerOnly: "現在レイヤー所属のみ表示",
      groupAllowScale: "グループにスケールを許可",
      groupKeepAspect: "比率を維持",
      groupScaleFactor: "スケール値",
      groupScaleX: "X倍率",
      groupScaleY: "Y倍率",
      editOnlyActive: "選択レイヤーのみ編集",
      moveObjectsToLayer: "オブジェクトを移動",
      deleteLayer: "レイヤー削除",
      createNew: "新規作成",
      groupName: "グループ名",
      newLayerName: "新規レイヤー名",
      layerName: "レイヤー名",
      grid: "グリッド",
      onCurve: "線上",
      endpoint: "端点",
      midpoint: "中点",
      center: "中心",
      intersection: "交点",
      tangent: "接線",
      vector: "ベクトル",
      keepAttr: "属性を保持",
      trimNoDelete: "削除しない(分割のみ)",
      move: "移動",
      copy: "コピー",
      positionMarker: "位置マーカー",
      apply: "適用",
      textSelectedEdit: "選択中のテキスト編集",
      size: "サイズ",
      rotate: "回転",
      bold: "太字",
      italic: "斜体",
      lineWidth: "線幅(mm)",
      lineType: "線種",
      color: "色",
      unit: "単位",
      pageSettings: "用紙設定",
      interfaceSection: "インターフェース",
      pageSize: "用紙サイズ",
      customPageSize: "カスタム用紙サイズ",
      customPageWidth: "幅",
      customPageHeight: "高さ",
      orientation: "向き",
      landscape: "横",
      portrait: "縦",
      scale: "縮尺 (1:)",
      customScale: "カスタム縮尺",
      maxZoom: "最大ズーム",
      fps: "フレームレート表示",
      objectCount: "オブジェクト数表示",
      autoBackup: "自動バックアップ",
      backupInterval: "バックアップ間隔",
      paperFrame: "用紙枠",
      innerMargin: "内側余白",
      gridSettings: "グリッド設定",
      baseGrid: "基本グリッド",
      customGrid: "カスタムグリッド",
      show: "表示",
      autoGrid: "可変グリッド",
      autoGridTiming: "可変グリッド切替タイミング",
      preview: "プレビュー",
      precision: "精度",
      hatchApply: "選択境界でハッチング作成",
      hatchValidate: "端点一致チェック",
      selectSameColor: "同じ色を選択",
      patternCopyRun: "コピー実行",
      dlineApply: "適用",
      dlineTrimExecute: "トリム実行",
      setAsCenter: "中心として設定",
      setAsAxis: "軸として設定",
      noGridSnap: "グリッド無視",
      dimSettings: "寸法設定",
      mode: "モード",
      radius: "半径",
      diameter: "直径",
      arrow: "矢印",
      outside: "外側",
      inside: "内側",
      single: "単一",
      chain: "直列",
      angle: "角度",
      normal: "通常",
      reverse: "反転",
      lineMode: "モード",
      lineModeSegment: "線分",
      lineModeContinuous: "連続線",
      lineModeFreehand: "Bスプライン",
      vertexMode: "モード",
      vertexModeMove: "頂点移動",
      vertexModeInsert: "頂点挿入",
      vertexKeepLinks: "\u7e4b\u304c\u308a\u3092\u7dad\u6301",
      vertexDelete: "頂点削除",
      length: "長さ",
      anchor: "基準",
      endpointA: "端点A",
      endpointB: "端点B",
      centerPoint: "中央",
      width: "幅",
      height: "高さ",
      basePoint: "基準点",
      topLeft: "上左",
      topCenter: "上中央",
      topRight: "上右",
      centerLeft: "中央左",
      centerRight: "中央右",
      bottomLeft: "下左",
      bottomCenter: "下中央",
      bottomRight: "下右",
      showCenterMark: "中心マーカーを表示",
      circleMode: "モード",
      circleModeDrag: "2点クリック",
      circleModeFixed: "半径固定",
      circleModeThreePoint: "三点指示",
      circleThreePointHint: "中心座標を持つオブジェクトを3つ選択",
      circleAddTarget: "ターゲットとして登録",
      circleRun: "実行",
      lockSize: "サイズ固定",
      unlockSize: "サイズ固定解除",
      lockRadius: "半径固定",
      unlockRadius: "半径固定解除",
      lineTypeSolid: "実線",
      lineTypeDashed: "破線",
      lineTypeDotted: "点線",
      lineTypeDashdot: "一点鎖線",
      lineTypeLongdash: "長破線",
      lineTypeCenter: "中心線",
      lineTypeHidden: "隠れ線",
      groupSelectedShapes: "選択した図形をグループ化",
      unparent: "親から外す",
      deleteThisGroup: "このグループを削除",
      aimConstraint: "方位拘束",
      aimPickTarget: "注視先を指定",
      aimClear: "解除",
      aimTargetNone: "ターゲット: なし",
      aimTargetGroupPrefix: "ターゲット: グループ #",
      aimTargetPositionPrefix: "ターゲット: 位置 #",
      aimPicking: "クリック待機中...",
      object: "オブジェクト",
      lineSegment: "線分",
      arc: "円弧",
      square: "四角",
      centerMarkDisplay: "中心マーカー表示",
      dimCircleArc: "円/弧",
      arrowShape: "矢印形状",
      arrowSizePt: "矢印サイズ(pt)",
      arrowDirection: "矢印向き",
      textSizePt: "文字サイズ(pt)",
      textRotate: "文字回転",
      auto: "自動",
      horizontal: "水平",
      extOffset: "補助線オフセット",
      extOver: "補助線突き出し",
      dimOvershoot: "寸法突き出し",
      undoPoint: "点を取り消し",
      patternArray: "配列状",
      patternRotate: "回転",
      patternMirror: "反転",
      clearCenter: "中心解除",
      clearAxis: "軸設定を解除",
      setPointStatusPrefix: "設定済み: 点 #",
      setLineStatusPrefix: "設定済み: 線 #",
      unsetPointStatus: "未設定 (キャンバスの点を選択)",
      unsetLineStatus: "未設定 (キャンバスの線を選択)",
      offset: "オフセット",
      bothSides: "両側",
      oneSide: "片側",
      noTrim: "トリムしない",
      dlineAsPolyline: "Polylineで生成",
      dimArrowOpen: "開き",
      dimArrowClosed: "塗り三角",
      dimArrowHollow: "中抜き三角",
      dimArrowCircle: "抜き丸",
      dimArrowCircleFilled: "塗り丸",
    },
    en: {
      create: "Create",
      edit: "Edit",
      file: "Files",
      snap: "Snap",
      attrs: "Attributes",
      select: "Select",
      selectToolObject: "Object Select",
      selectToolGroup: "Group Select",
      resetView: "Reset View",
      line: "Line",
      rect: "Rectangle",
      circle: "Circle",
      position: "Position",
      dim: "Dimension",
      text: "Text",
      hatch: "Hatching",
      vertex: "Vertex Edit",
      fillet: "Fillet",
      trim: "Trim",
      doubleline: "Double Line",
      patterncopy: "Pattern Copy",
      lineToPolyline: "Polygon Convert",
      undo: "Undo",
      redo: "Redo",
      del: "Delete",
      save: "Save",
      newFile: "New",
      saveAs: "Save As",
      load: "Load",
      import: "Import",
      traceImage: "Image Trace (Exp)",
      tracePanelTitle: "Image Trace (Exp)",
      traceTargetNone: "Select an imported image object",
      traceMaxDim: "Max Resolution",
      traceEdgePercent: "Edge Amount",
      traceSimplify: "Simplify",
      traceMinSeg: "Min Segment",
      traceMaxSeg: "Max Segments",
      traceOffsetX: "Offset X",
      traceOffsetY: "Offset Y",
      traceInvert: "Invert",
      importSourceUnit: "Source Unit",
      importAsPolyline: "Polylineize",
      traceRegenerate: "Regenerate",
      close: "Close",
      export: "Export",
      settings: "Settings",
      manualGuide: "User Guide",
      modeMenuTitle: "Mode",
      viewerMode: "Viewer Mode",
      easyMode: "Easy Mode",
      cadMode: "CAD Mode",
      webTop: "Web Top",
      view: "View",
      attrNamePlaceholder: "Name",
      attrValuePlaceholder: "Value",
      scadMenu: "S-CAD Menu",
      cancel: "Cancel",
      textPlaceholder: "Enter text",
      textContentPlaceholder: "Text content",
      groupPanelHeightTitle: "Resize group panel height",
      groupPanelWidthTitle: "Resize group panel width",
      layerPanelHeightTitle: "Resize layer panel height",
      layerPanelWidthTitle: "Resize layer panel width",
      gridAutoTimingHint: "Grid interval switches automatically based on zoom.",
      adSpace: "Ad Space",
      clear: "Clear",
      rotateSnap: "Rotate Snap",
      filename: "Filename",
      range: "Range",
      page: "Page",
      viewRange: "View",
      selectionRange: "Selection",
      custom: "Custom",
      centerX: "Center X",
      centerY: "Center Y",
      sizeMode: "Size Mode",
      pixels: "Pixels",
      dpiLabel: "DPI",
      widthPx: "Width (px)",
      heightPx: "Height (px)",
      scaleMultiplier: "Scale Multiplier",
      marginPx: "Margin (px)",
      background: "Background",
      white: "White",
      transparent: "Transparent",
      backgroundColor: "BG Color",
      colorMode: "Color Mode",
      layerColorMode: "Layer Colorize",
      groupColorMode: "Group Colorize",
      includeGrid: "Include Grid",
      includeAxes: "Include Axes",
      includePageFrame: "Include Page Frame",
      includeSelectionHighlight: "Include Selection Highlight",
      antialias: "Antialias",
      debugConsole: "Debug Console",
      exportPng: "Export PNG",
      lineWidthScale: "Line Width Scale",
      minLineWidthPx: "Min Line Width (px)",
      moveOriginOnly: "Move Origin Only",
      sizeLocked: "Lock Size",
      transformLocked: "Lock Transform",
      autoGridDebug: "auto-grid debug",
      add: "Add",
      up: "Up",
      down: "Down",
      lineApply: "Create",
      rectApply: "Create",
      circleApply: "Create",
      vertexMoveApply: "Move",
      groupRotation: "Rotation",
      selectMode: "Selection Mode",
      objectPick: "Object",
      groupPick: "Group",
      filletRadius: "Radius",
      filletMode: "Mode",
      filletTrim: "Trim",
      filletSplit: "No Trim",
      filletApply: "Execute",
      language: "Language",
      languageJa: "Japanese",
      languageEn: "English",
      menuScale: "Menu Scale",
      touchMode: "Touch Mode",
      leftMenuVisibleItems: "Left Menu Items",
      adDisplay: "Ad Display",
      adTopRight: "Top Right",
      adBottomLeft: "Bottom Left",
      adBottomCenter: "Bottom Center",
      touchConfirmCommon: "Confirm",
      touchCancelCommon: "Cancel",
      touchBackToSelect: "Back to Select",
      touchMultiSelectOn: "Multi-Select ON",
      touchMultiSelectOff: "Multi-Select OFF",
      touchConfirm: "Confirm",
      dimPreparePlacement: "Set Placement",
      dimFinalize: "Finalize Dim",
      shortcutSettings: "Keyboard Shortcuts",
      shortcutHint: "Shortcut keys for tools/delete",
      resetShortcuts: "Reset Defaults",
      groups: "Groups",
      layers: "Layers",
      groupOps: "Group Ops",
      createGroup: "New Group",
      layerOps: "Layer Ops",
      rename: "Rename",
      colorize: "Colorize",
      currentLayerOnly: "Show Active-Layer Items Only",
      groupAllowScale: "Allow Group Scaling",
      groupKeepAspect: "Keep Aspect",
      groupScaleFactor: "Scale Value",
      groupScaleX: "Scale X",
      groupScaleY: "Scale Y",
      editOnlyActive: "Edit Active Layer Only",
      moveObjectsToLayer: "Move Objects",
      deleteLayer: "Delete Layer",
      createNew: "Create",
      groupName: "Group Name",
      newLayerName: "New Layer Name",
      layerName: "Layer Name",
      grid: "Grid",
      onCurve: "On Curve",
      endpoint: "Endpoint",
      midpoint: "Midpoint",
      center: "Center",
      intersection: "Intersection",
      tangent: "Tangent",
      vector: "Vector",
      keepAttr: "Keep Attribute",
      trimNoDelete: "Split Only (Keep)",
      move: "Move",
      copy: "Copy",
      positionMarker: "Position Marker",
      apply: "Apply",
      textSelectedEdit: "Selected Text",
      size: "Size",
      rotate: "Rotate",
      bold: "Bold",
      italic: "Italic",
      lineWidth: "Line Width (mm)",
      lineType: "Line Type",
      color: "Color",
      unit: "Unit",
      pageSettings: "Page Settings",
      interfaceSection: "Interface",
      pageSize: "Page Size",
      customPageSize: "Custom Paper Size",
      customPageWidth: "Width",
      customPageHeight: "Height",
      orientation: "Orientation",
      landscape: "Landscape",
      portrait: "Portrait",
      scale: "Scale (1:)",
      customScale: "Custom Scale",
      maxZoom: "Max Zoom",
      fps: "Show FPS",
      objectCount: "Show Object Count",
      autoBackup: "Auto Backup",
      backupInterval: "Backup Interval",
      paperFrame: "Paper Frame",
      innerMargin: "Inner Margin",
      gridSettings: "Grid Settings",
      baseGrid: "Base Grid",
      customGrid: "Custom Grid",
      show: "Show",
      autoGrid: "Adaptive Grid",
      autoGridTiming: "Adaptive Grid Switch Timing",
      preview: "Preview",
      precision: "Precision",
      hatchApply: "Create Hatching",
      hatchValidate: "Check Endpoint Match",
      selectSameColor: "Select Same Color",
      patternCopyRun: "Run Copy",
      dlineApply: "Apply",
      dlineTrimExecute: "Trim Execute",
      setAsCenter: "Set as Center",
      setAsAxis: "Set as Axis",
      noGridSnap: "Ignore Grid Snap",
      dimSettings: "Dimension Settings",
      mode: "Mode",
      radius: "Radius",
      diameter: "Diameter",
      arrow: "Arrow",
      outside: "Outside",
      inside: "Inside",
      single: "Single",
      chain: "Chain",
      angle: "Angle",
      normal: "Normal",
      reverse: "Reverse",
      lineMode: "Mode",
      lineModeSegment: "Segment",
      lineModeContinuous: "Continuous",
      lineModeFreehand: "B-Spline",
      vertexMode: "Mode",
      vertexModeMove: "Move Vertex",
      vertexModeInsert: "Insert Vertex",
      vertexKeepLinks: "Keep Vertex Links",
      vertexDelete: "Delete Vertex",
      length: "Length",
      anchor: "Anchor",
      endpointA: "Endpoint A",
      endpointB: "Endpoint B",
      centerPoint: "Center",
      width: "Width",
      height: "Height",
      basePoint: "Base Point",
      topLeft: "Top Left",
      topCenter: "Top Center",
      topRight: "Top Right",
      centerLeft: "Center Left",
      centerRight: "Center Right",
      bottomLeft: "Bottom Left",
      bottomCenter: "Bottom Center",
      bottomRight: "Bottom Right",
      showCenterMark: "Show Center Marker",
      circleMode: "Mode",
      circleModeDrag: "2-Point Click",
      circleModeFixed: "Fixed Radius",
      circleModeThreePoint: "3-Point Tangent",
      circleThreePointHint: "Select 3 objects that have center coordinates.",
      circleAddTarget: "Add as Target",
      circleRun: "Run",
      lockSize: "Lock Size",
      unlockSize: "Unlock Size",
      lockRadius: "Lock Radius",
      unlockRadius: "Unlock Radius",
      lineTypeSolid: "Solid",
      lineTypeDashed: "Dashed",
      lineTypeDotted: "Dotted",
      lineTypeDashdot: "Dash-Dot",
      lineTypeLongdash: "Long Dash",
      lineTypeCenter: "Center",
      lineTypeHidden: "Hidden",
      groupSelectedShapes: "Group Selected Objects",
      unparent: "Remove from Parent",
      deleteThisGroup: "Delete This Group",
      aimConstraint: "Aim Constraint",
      aimPickTarget: "Pick Target",
      aimClear: "Clear",
      aimTargetNone: "Target: None",
      aimTargetGroupPrefix: "Target: Group #",
      aimTargetPositionPrefix: "Target: Position #",
      aimPicking: "Picking target...",
      object: "Object",
      lineSegment: "Line",
      arc: "Arc",
      square: "Rectangle",
      centerMarkDisplay: "Show Center Marker",
      dimCircleArc: "Circle/Arc",
      arrowShape: "Arrow Shape",
      arrowSizePt: "Arrow Size (pt)",
      arrowDirection: "Arrow Direction",
      textSizePt: "Text Size (pt)",
      textRotate: "Text Rotation",
      auto: "Auto",
      horizontal: "Horizontal",
      extOffset: "Extension Offset",
      extOver: "Extension Extend",
      dimOvershoot: "Dim Overshoot",
      undoPoint: "Undo Point",
      patternArray: "Array",
      patternRotate: "Rotate",
      patternMirror: "Mirror",
      clearCenter: "Clear Center",
      clearAxis: "Clear Axis",
      setPointStatusPrefix: "Set: Point #",
      setLineStatusPrefix: "Set: Line #",
      unsetPointStatus: "Not set (pick a point on canvas)",
      unsetLineStatus: "Not set (pick a line on canvas)",
      offset: "Offset",
      bothSides: "Both Sides",
      oneSide: "Single Side",
      noTrim: "No Trim",
      dlineAsPolyline: "Generate as Polyline",
      dimArrowOpen: "Open",
      dimArrowClosed: "Filled Triangle",
      dimArrowHollow: "Hollow Triangle",
      dimArrowCircle: "Open Circle",
      dimArrowCircleFilled: "Filled Circle",
    },
  };
  const t = dict[lang];
  if (dom.uiLanguageSelect) {
    if (dom.uiLanguageSelect.value !== lang) dom.uiLanguageSelect.value = lang;
    const oJa = dom.uiLanguageSelect.querySelector("option[value='ja']");
    const oEn = dom.uiLanguageSelect.querySelector("option[value='en']");
    if (oJa) oJa.textContent = t.languageJa;
    if (oEn) oEn.textContent = t.languageEn;
  }

  setText(".sidebar .section[data-panel-id='tools'] > .panel-toggle", t.create);
  setText(".sidebar .section[data-panel-id='editTools'] > .panel-toggle", t.edit);
  setText(".sidebar .section[data-panel-id='fileTools'] > .panel-toggle", t.file);
  setText("#openManualBtn", t.manualGuide);
  if (dom.cadHomeLink) dom.cadHomeLink.title = t.scadMenu;
  const homeLogo = dom.cadHomeLink?.querySelector?.(".cad-home-logo");
  if (homeLogo) {
    const displayMode = String(state.ui?.displayMode || "cad").toLowerCase();
    if (displayMode === "viewer") {
      homeLogo.textContent = (lang === "ja") ? "\u7de8\u96c6\u3059\u308b\uff1f" : "Edit?";
    } else if (displayMode === "easy") {
      homeLogo.textContent = "Easy";
    } else if (displayMode === "cad") {
      homeLogo.textContent = "CAD";
    } else {
      homeLogo.innerHTML = '<span class="logo-s">S-</span>CAD';
    }
  }
  if (dom.selectionTextContentInput) dom.selectionTextContentInput.placeholder = t.textPlaceholder;
  if (dom.textContentInput) dom.textContentInput.placeholder = t.textContentPlaceholder;
  const groupResizeTop = document.getElementById("groupPanelResizeHandleTop");
  const groupResizeLeft = document.getElementById("groupPanelResizeHandleLeft");
  const layerResizeTop = document.getElementById("layerPanelResizeHandleTop");
  const layerResizeLeft = document.getElementById("layerPanelResizeHandleLeft");
  if (groupResizeTop) groupResizeTop.title = t.groupPanelHeightTitle;
  if (groupResizeLeft) groupResizeLeft.title = t.groupPanelWidthTitle;
  if (layerResizeTop) layerResizeTop.title = t.layerPanelHeightTitle;
  if (layerResizeLeft) layerResizeLeft.title = t.layerPanelWidthTitle;
  if (dom.attrAddBtn) dom.attrAddBtn.textContent = t.add;
  if (dom.moveVertexBtn) dom.moveVertexBtn.textContent = t.vertexMoveApply;
  if (dom.applyLineInputBtn) dom.applyLineInputBtn.textContent = t.lineApply;
  if (dom.applyRectInputBtn) dom.applyRectInputBtn.textContent = t.rectApply;
  if (dom.applyCircleInputBtn) dom.applyCircleInputBtn.textContent = t.circleApply;
  if (dom.moveGroupUpBtn) dom.moveGroupUpBtn.textContent = t.up;
  if (dom.moveGroupDownBtn) dom.moveGroupDownBtn.textContent = t.down;
  if (dom.moveLayerUpBtn) dom.moveLayerUpBtn.textContent = t.up;
  if (dom.moveLayerDownBtn) dom.moveLayerDownBtn.textContent = t.down;
  if (dom.groupRotationLabel) dom.groupRotationLabel.textContent = t.groupRotation;
  const manualBtn = document.getElementById("openManualBtn");
  if (manualBtn) manualBtn.setAttribute("href", lang === "en" ? "/manual_en.html" : "/manual.html");
  const cadHomeMenuTitle = document.querySelector(".cad-home-menu-title");
  if (cadHomeMenuTitle) cadHomeMenuTitle.textContent = t.modeMenuTitle;
  if (dom.cadHomeModeViewer) dom.cadHomeModeViewer.textContent = t.viewerMode;
  if (dom.cadHomeModeEasy) dom.cadHomeModeEasy.textContent = t.easyMode;
  if (dom.cadHomeModeCad) dom.cadHomeModeCad.textContent = t.cadMode;
  if (dom.cadHomeMenuWebtop) dom.cadHomeMenuWebtop.textContent = t.webTop;
  if (dom.attrNameInput) dom.attrNameInput.placeholder = t.attrNamePlaceholder;
  if (dom.attrValueInput) dom.attrValueInput.placeholder = t.attrValuePlaceholder;
  setText(".left-aux-stack .section[data-panel-id='snap'] > .panel-toggle", t.snap);
  setText(".left-aux-stack .section[data-panel-id='attrs'] > .panel-toggle", t.attrs);

  const leftPanels = [dom.toolButtons, dom.editToolButtons, dom.fileToolButtons].filter(Boolean);
  const pickMode = String(state.ui?.selectPickMode || "object");
  for (const panel of leftPanels) {
    for (const btn of panel.querySelectorAll("button[data-tool]")) {
      const id = String(btn.dataset.tool || "");
      if (id === "select") btn.textContent = (pickMode === "group") ? t.selectToolGroup : t.selectToolObject;
      else if (id === "line") btn.textContent = t.line;
      else if (id === "rect") btn.textContent = t.rect;
      else if (id === "circle") btn.textContent = t.circle;
      else if (id === "position") btn.textContent = t.position;
      else if (id === "dim") btn.textContent = t.dim;
      else if (id === "text") btn.textContent = t.text;
      else if (id === "hatch") btn.textContent = t.hatch;
      else if (id === "vertex") btn.textContent = t.vertex;
      else if (id === "fillet") btn.textContent = t.fillet;
      else if (id === "trim") btn.textContent = t.trim;
      else if (id === "doubleline") btn.textContent = t.doubleline;
      else if (id === "patterncopy") btn.textContent = t.patterncopy;
      else if (id === "settings") btn.textContent = t.settings;
    }
    for (const btn of panel.querySelectorAll("button[data-action]")) {
      const id = String(btn.dataset.action || "");
      if (id === "resetView") btn.textContent = t.resetView;
      else if (id === "newFile") btn.textContent = t.newFile;
      else if (id === "undo") btn.textContent = t.undo;
      else if (id === "redo") btn.textContent = t.redo;
      else if (id === "delete") btn.textContent = t.del;
      else if (id === "saveJson") btn.textContent = t.save;
      else if (id === "saveJsonAs") btn.textContent = t.saveAs;
      else if (id === "loadJson") btn.textContent = t.load;
      else if (id === "importJson") btn.textContent = t.import;
      else if (id === "traceImage") btn.textContent = t.traceImage;
      else if (id === "lineToPolyline") btn.textContent = t.lineToPolyline;
      else if (id === "export") btn.textContent = t.export;
      else if (id === "png") btn.textContent = "PNG";
      else if (id === "pdf") btn.textContent = "PDF";
      else if (id === "svg") btn.textContent = "SVG";
      else if (id === "dxf") btn.textContent = "DXF";
    }
  }
  setText(".section[data-context='select'] .section-title", t.selectMode);
  setText(".section[data-context='vertex'] .section-title", t.vertex);
  setText(".section[data-context='line'] .section-title", t.line);
  setText(".section[data-context='rect'] .section-title", t.rect);
  setText(".section[data-context='circle'] .section-title", t.circle);
  setText(".section[data-context='fillet'] .section-title", t.fillet);
  setText(".section[data-context='trim'] .section-title", t.trim);
  setText(".section[data-context='settings'] .section-title", t.settings);
  setText(".section[data-context='position'] .section-title", t.positionMarker);
  setText(".section[data-context='dim'] .section-title", t.dimSettings);
  setText(".section[data-context='preview'] .section-title", t.preview);
  setText(".section[data-context='hatch'] .section-title", t.hatch);
  setText(".section[data-context='doubleline'] .section-title", t.doubleline);
  setText(".section[data-context='text'] .section-title", t.text);
  setText(".section[data-context='trace'] .section-title", t.tracePanelTitle);
  setText("#traceTargetInfo", t.traceTargetNone);
  setText("#traceMaxDimLabel", t.traceMaxDim);
  setText("#traceEdgePercentLabel", t.traceEdgePercent);
  setText("#traceSimplifyLabel", t.traceSimplify);
  setText("#traceMinSegLabel", t.traceMinSeg);
  setText("#traceMaxSegLabel", t.traceMaxSeg);
  setText("#traceOffsetXLabel", t.traceOffsetX);
  setText("#traceOffsetYLabel", t.traceOffsetY);
  setText("#importSourceUnitLabel", t.importSourceUnit);
  setText("#importAsPolylineLabel", t.importAsPolyline);
  setText("#traceLineWidthLabel", t.lineWidth);
  setText("#traceLineTypeLabel", t.lineType);
  setText("#traceInvertLabel", t.traceInvert);
  setButtonById("traceRegenerateBtn", t.traceRegenerate);
  setButtonById("traceClosePanelBtn", t.close);
  setText(".section[data-context='patterncopy'] .section-title", t.patterncopy);
  if (dom.selectPickObjectBtn) dom.selectPickObjectBtn.textContent = t.objectPick;
  if (dom.selectPickGroupBtn) dom.selectPickGroupBtn.textContent = t.groupPick;
  const filletModeSel = document.getElementById("filletLineModeSelect");
  if (filletModeSel) {
    const optTrim = filletModeSel.querySelector("option[value='trim']");
    const optSplit = filletModeSel.querySelector("option[value='split']");
    if (optTrim) optTrim.textContent = t.filletTrim;
    if (optSplit) optSplit.textContent = t.filletSplit;
  }
  setText("#filletRadiusLabel", t.filletRadius);
  setText("#filletModeLabel", t.filletMode);
  if (dom.applyFilletBtn) dom.applyFilletBtn.textContent = t.filletApply;
  setText("#uiLanguageLabel", t.language);
  setText(".section[data-panel-id='view'] > .section-title", t.view);
  setLabelByControl("gridShowToggle", t.show);
  setLabelByControl("gridAutoToggle", t.autoGrid);
  setLabelByControl("menuScaleSelect", t.menuScale);
  setLabelByControl("touchModeToggle", t.touchMode);
  setText("#leftMenuVisibilityLabel", t.leftMenuVisibleItems);
  setButtonById("touchConfirmBtn", t.touchConfirmCommon);
  setButtonById("touchCancelBtn", t.touchCancelCommon);
  setButtonById("touchSelectBackBtn", t.touchBackToSelect);
  if (dom.touchMultiSelectBtn) {
    const on = !!state.ui?.touchMultiSelect;
    dom.touchMultiSelectBtn.textContent = on ? t.touchMultiSelectOn : t.touchMultiSelectOff;
  }
  setButtonById("lineTouchFinalizeBtn", t.touchConfirm);
  setButtonById("dimChainPrepareBtn", t.dimPreparePlacement);
  setButtonById("dimChainFinalizeBtn", t.dimFinalize);
  setText("#shortcutSettingsLabel", t.shortcutSettings);
  setText("#shortcutSettingsHint", t.shortcutHint);
  setButtonById("resetToolShortcutsBtn", t.resetShortcuts);

  // Tool context labels/options
  setPrevSpanByControl("lineModeSelect", t.lineMode);
  setOptionText("lineModeSelect", "segment", t.lineModeSegment);
  setOptionText("lineModeSelect", "continuous", t.lineModeContinuous);
  setOptionText("lineModeSelect", "freehand", t.lineModeFreehand);
  setPrevSpanByControl("vertexModeSelect", t.vertexMode);
  setOptionText("vertexModeSelect", "move", t.vertexModeMove);
  setOptionText("vertexModeSelect", "insert", t.vertexModeInsert);
  setLabelByControl("vertexLinkCoincidentToggle", t.vertexKeepLinks);
  setButtonById("deleteVertexBtn", t.vertexDelete);
  setPrevSpanByControl("lineLengthInput", t.length);
  setPrevSpanByControl("lineAngleInput", t.angle);
  setPrevSpanByControl("lineAnchorSelect", t.anchor);
  setOptionText("lineAnchorSelect", "endpoint_a", t.endpointA);
  setOptionText("lineAnchorSelect", "endpoint_b", t.endpointB);
  setOptionText("lineAnchorSelect", "center", t.centerPoint);
  setPrevSpanByControl("lineToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("lineToolLineTypeInput", t.lineType);
  setPrevSpanByControl("lineToolColorInput", t.color);
  setPrevSpanByControl("rectWidthInput", t.width);
  setPrevSpanByControl("rectHeightInput", t.height);
  setPrevSpanByControl("rectAnchorSelect", t.basePoint);
  setOptionText("rectAnchorSelect", "c", t.centerPoint);
  setOptionText("rectAnchorSelect", "tl", t.topLeft);
  setOptionText("rectAnchorSelect", "tc", t.topCenter);
  setOptionText("rectAnchorSelect", "tr", t.topRight);
  setOptionText("rectAnchorSelect", "cl", t.centerLeft);
  setOptionText("rectAnchorSelect", "cr", t.centerRight);
  setOptionText("rectAnchorSelect", "bl", t.bottomLeft);
  setOptionText("rectAnchorSelect", "bc", t.bottomCenter);
  setOptionText("rectAnchorSelect", "br", t.bottomRight);
  setPrevSpanByControl("rectToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("rectToolLineTypeInput", t.lineType);
  setPrevSpanByControl("rectToolColorInput", t.color);
  setPrevSpanByControl("circleRadiusInput", t.radius);
  setPrevSpanByControl("circleModeSelect", t.circleMode);
  setOptionText("circleModeSelect", "drag", t.circleModeDrag);
  setOptionText("circleModeSelect", "fixed", t.circleModeFixed);
  setOptionText("circleModeSelect", "threepoint", t.circleModeThreePoint);
  setText("#circleThreePointHint", t.circleThreePointHint);
  setButtonById("circleThreePointAddBtn", t.circleAddTarget);
  setButtonById("circleThreePointRunBtn", t.circleRun);
  setLabelByControl("circleCenterMarkToggle", t.showCenterMark);
  setPrevSpanByControl("circleToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("circleToolLineTypeInput", t.lineType);
  setPrevSpanByControl("circleToolColorInput", t.color);
  setPrevSpanByControl("filletToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("filletToolLineTypeInput", t.lineType);
  setPrevSpanByControl("selectionCircleRadiusInput", t.radius);
  setLabelByControl("selectionCircleCenterMarkToggle", t.centerMarkDisplay);
  setLabelByControl("selectionPositionSizeInput", t.size);
  setButtonById("mergeGroupsBtn", t.groupSelectedShapes);
  setButtonById("dimMergeGroupsBtn", t.groupSelectedShapes);
  setButtonById("unparentGroupBtn", t.unparent);
  setButtonById("deleteGroupBtn", t.deleteThisGroup);
  setText("#groupScaleEnableLabel", t.groupAllowScale);
  setText("#groupScaleKeepAspectLabel", t.groupKeepAspect);
  setText("#groupScaleFactorXLabel", t.groupScaleX);
  setText("#groupScaleFactorYLabel", t.groupScaleY);
  setLabelByControl("groupScaleFactorInput", t.groupScaleFactor);
  setButtonById("groupScaleApplyBtn", t.apply);
  setLabelByControl("groupAimEnableToggle", t.aimConstraint);
  setButtonById("groupAimPickBtn", t.aimPickTarget);
  setButtonById("groupAimClearBtn", t.aimClear);
  setButtonById("dimChainPopBtn", t.undoPoint);
  setLabelByControl("groupRotateSnapInput", t.rotateSnap);
  setLabelByControl("dimLinearMode", t.mode);
  setLabelByControl("dimCircleMode", t.dimCircleArc);
  setLabelByControl("dimCircleArrowSide", t.arrow);
  setLabelByControl("dimPrecisionSelect", t.precision);
  setLabelByControl("dimArrowTypeSelect", t.arrowShape);
  setLabelByControl("dimArrowSizeInput", t.arrowSizePt);
  setLabelByControl("dimArrowDirectionSelect", t.arrowDirection);
  setLabelByControl("dimFontSizeInput", t.textSizePt);
  setLabelByControl("dimTextRotateInput", t.textRotate);
  setLabelByControl("dimExtOffsetInput", t.extOffset);
  setLabelByControl("dimExtOverInput", t.extOver);
  setLabelByControl("dimROvershootInput", t.dimOvershoot);
  setLabelByControl("dimToolLineWidthInput", t.lineWidth);
  setLabelByControl("dimToolLineTypeInput", t.lineType);
  setLabelByControl("dimToolColorInput", t.color);
  setOptionText("dimArrowTypeSelect", "open", t.dimArrowOpen);
  setOptionText("dimArrowTypeSelect", "closed", t.dimArrowClosed);
  setOptionText("dimArrowTypeSelect", "hollow", t.dimArrowHollow);
  setOptionText("dimArrowTypeSelect", "circle", t.dimArrowCircle);
  setOptionText("dimArrowTypeSelect", "circle_filled", t.dimArrowCircleFilled);
  setOptionText("dimTextRotateInput", "auto", t.auto);
  setOptionText("dimTextRotateInput", "0", t.horizontal);
  setPrevSpanByControl("selectionLineWidthInput", t.lineWidth);
  setPrevSpanByControl("selectionLineTypeInput", t.lineType);
  setPrevSpanByControl("selectionColorInput", t.color);
  setLabelByControl("dimSelectionColorInput", t.color);
  setPrevSpanByControl("positionToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("positionToolLineTypeInput", t.lineType);
  setPrevSpanByControl("positionToolColorInput", t.color);
  setPrevSpanByControl("textToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("textToolLineTypeInput", t.lineType);
  setPrevSpanByControl("hatchToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("dlineOffsetInput", t.offset);
  setPrevSpanByControl("dlineModeSelect", t.mode);
  setLabelByControl("dlineAsPolylineToggle", t.dlineAsPolyline);
  setPrevSpanByControl("dlineToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("dlineToolLineTypeInput", t.lineType);
  setOptionText("dlineModeSelect", "both", t.bothSides);
  setOptionText("dlineModeSelect", "single", t.oneSide);
  setOptionText("patternCopyModeSelect", "array", t.patternArray);
  setOptionText("patternCopyModeSelect", "rotate", t.patternRotate);
  setOptionText("patternCopyModeSelect", "mirror", t.patternMirror);
  const lineTypeTargets = [
    "lineToolLineTypeInput",
    "rectToolLineTypeInput",
    "circleToolLineTypeInput",
    "filletToolLineTypeInput",
    "selectionLineTypeInput",
    "positionToolLineTypeInput",
    "textToolLineTypeInput",
    "dimToolLineTypeInput",
    "dlineToolLineTypeInput",
  ];
  for (const selId of lineTypeTargets) {
    setOptionText(selId, "solid", t.lineTypeSolid);
    setOptionText(selId, "dashed", t.lineTypeDashed);
    setOptionText(selId, "dotted", t.lineTypeDotted);
    setOptionText(selId, "dashdot", t.lineTypeDashdot);
    setOptionText(selId, "longdash", t.lineTypeLongdash);
    setOptionText(selId, "center", t.lineTypeCenter);
    setOptionText(selId, "hidden", t.lineTypeHidden);
  }

  // Snap panel row labels
  setLabelByControl("gridSnapToggle", t.grid);
  setLabelByControl("objSnapToggle", t.onCurve);
  setLabelByControl("objSnapEndpointToggle", t.endpoint);
  setLabelByControl("objSnapMidpointToggle", t.midpoint);
  setLabelByControl("objSnapCenterToggle", t.center);
  setLabelByControl("objSnapIntersectionToggle", t.intersection);
  setLabelByControl("objSnapTangentToggle", t.tangent);
  setLabelByControl("objSnapVectorToggle", t.vector);
  setLabelByControl("objSnapTangentKeepToggle", t.keepAttr);

  // Right panels
  setText(".right-stack .section[data-panel-id='groups'] > .panel-toggle", t.groups);
  setText(".right-stack .section[data-panel-id='layers'] > .panel-toggle", t.layers);
  setInnerToggleText(".right-stack [data-layer-inner-toggle='groupOps']", t.groupOps);
  setInnerToggleText(".right-stack [data-layer-inner-toggle='ops']", t.layerOps);
  if (dom.createGroupBtn) dom.createGroupBtn.textContent = t.createGroup;
  if (dom.renameGroupBtn) dom.renameGroupBtn.textContent = t.rename;
  if (dom.renameLayerBtn) dom.renameLayerBtn.textContent = t.rename;
  if (dom.addLayerBtn) dom.addLayerBtn.textContent = t.createNew;
  if (dom.moveSelectionLayerBtn) dom.moveSelectionLayerBtn.textContent = t.moveObjectsToLayer;
  if (dom.deleteLayerBtn) dom.deleteLayerBtn.textContent = t.deleteLayer;
  setLabelByControl("groupColorizeToggle", t.colorize);
  setLabelByControl("groupCurrentLayerOnlyToggle", t.currentLayerOnly);
  setLabelByControl("layerColorizeToggle", t.colorize);
  setLabelByControl("editOnlyActiveLayerToggle", t.editOnlyActive);
  if (dom.newLayerNameInput) dom.newLayerNameInput.placeholder = t.newLayerName;
  if (dom.renameLayerNameInput) dom.renameLayerNameInput.placeholder = t.layerName;
  if (dom.renameGroupNameInput) dom.renameGroupNameInput.placeholder = t.groupName;
  if (dom.newGroupNameInput) dom.newGroupNameInput.placeholder = t.groupName;

  // Selection/group context buttons
  if (dom.moveSelectedShapesBtn) dom.moveSelectedShapesBtn.textContent = t.move;
  if (dom.copySelectedShapesBtn) dom.copySelectedShapesBtn.textContent = t.copy;
  if (dom.moveGroupBtn) dom.moveGroupBtn.textContent = t.move;
  if (dom.copyGroupBtn) dom.copyGroupBtn.textContent = t.copy;
  if (dom.moveGroupOriginOnlyBtn) dom.moveGroupOriginOnlyBtn.textContent = t.moveOriginOnly;
  if (dom.selectionApplyCircleRadiusBtn) dom.selectionApplyCircleRadiusBtn.textContent = t.apply;
  if (dom.applyDLineBtn) dom.applyDLineBtn.textContent = t.dlineApply;
  if (dom.applyHatchBtn) dom.applyHatchBtn.textContent = t.hatchApply;
  if (dom.hatchValidateBtn) dom.hatchValidateBtn.textContent = t.hatchValidate;
  if (dom.selectSameColorBtn) dom.selectSameColorBtn.textContent = t.selectSameColor;
  if (dom.patternCopyApplyBtn) dom.patternCopyApplyBtn.textContent = t.patternCopyRun;
  if (dom.importAdjustApplyBtn) dom.importAdjustApplyBtn.textContent = t.apply;
  if (dom.importAdjustCancelBtn) dom.importAdjustCancelBtn.textContent = t.cancel;
  if (dom.patternCopySetCenterBtn) dom.patternCopySetCenterBtn.textContent = t.setAsCenter;
  if (dom.patternCopySetAxisBtn) dom.patternCopySetAxisBtn.textContent = t.setAsAxis;
  setLabelByControl("trimNoDeleteToggle", t.trimNoDelete);
  setText("#selectionTextEdit .section-title", t.textSelectedEdit);
  setLabelByControl("positionSizeInput", t.size);
  setLabelByControl("previewPrecisionSelect", t.precision);
  setLabelByControl("dimIgnoreGridSnapToggle", t.noGridSnap);
  setPrevSpanByControl("textSizePtInput", t.textSizePt);
  setPrevSpanByControl("textRotateInput", t.rotate);
  setPrevSpanByControl("selectionTextSizePtInput", t.textSizePt);
  setPrevSpanByControl("selectionTextRotateInput", t.rotate);
  setLabelByControl("selectionImageLockAspectToggle", t.sizeLocked);
  setLabelByControl("selectionImageLockTransformToggle", t.transformLocked);
  setLabelByControl("selectionTextBoldInput", t.bold);
  setLabelByControl("selectionTextItalicInput", t.italic);
  setLabelByControl("textBoldInput", t.bold);
  setLabelByControl("textItalicInput", t.italic);
  if (dom.groupAimStatus && String(dom.groupAimStatus.textContent || "").trim() === "Target: None") {
    dom.groupAimStatus.textContent = t.aimTargetNone;
  }

  // Settings labels
  setLabelByControl("pageSizeSelect", t.pageSize);
  setText("#customPageSizeToggleLabel", t.customPageSize);
  setText("#customPageWidthLabel", t.customPageWidth);
  setText("#customPageHeightLabel", t.customPageHeight);
  setLabelByControl("pageOrientationSelect", t.orientation);
  setLabelByControl("pageScaleInput", t.scale);
  setText("#customScaleToggleLabel", t.customScale);
  setLabelByControl("maxZoomInput", t.maxZoom);
  setLabelByControl("fpsDisplayToggle", t.fps);
  setLabelByControl("objectCountDisplayToggle", t.objectCount);
  setLabelByControl("autoBackupToggle", t.autoBackup);
  setLabelByControl("autoBackupIntervalSelect", t.backupInterval);
  setLabelByControl("pageUnitSelect", t.unit);
  setText("#adSettingsLabel", t.adDisplay);
  const rightAdLabel = document.querySelector("#rightAdSlot .ad-zone-label");
  const leftAdLabel = document.querySelector("#leftBottomAdSlot .ad-zone-label");
  const bottomAdLabel = document.querySelector("#bottomCenterAdSlot .ad-zone-label");
  if (rightAdLabel) rightAdLabel.innerHTML = `${t.adSpace}<br>${t.adTopRight}`;
  if (leftAdLabel) leftAdLabel.innerHTML = `${t.adSpace}<br>${t.adBottomLeft}`;
  if (bottomAdLabel) bottomAdLabel.innerHTML = `${t.adSpace}<br>${t.adBottomCenter}`;
  setLabelByControl("topRightAdZoneToggle", t.adTopRight);
  setLabelByControl("bottomLeftAdZoneToggle", t.adBottomLeft);
  setLabelByControl("bottomCenterAdZoneToggle", t.adBottomCenter);
  refreshCustomPageSizeUnitLabels(state);
  setLabelByControl("pageShowFrameToggle", t.paperFrame);
  setLabelByControl("pageInnerMarginInput", t.innerMargin);
  setLabelByControl("gridSizeContextInput", t.baseGrid);
  refreshGridUnitLabels(state);
  setText("#customGridToggleLabel", t.customGrid);
  setText("#gridShowContextLabel", t.show);
  setText("#gridAutoContextLabel", t.autoGrid);
  setText(".section[data-context='settings'] > div > div", t.pageSettings);
  setText(".section[data-context='settings'] .section-title[style]", t.gridSettings);
  setText("#settingsInterfaceLabel", t.interfaceSection);
  setText("#gridAutoTimingLabel", localizeGridAutoTimingLabelText(Number(dom.gridAutoTimingSlider?.value || 0), lang));
  setText("#filletModeLabel", t.filletMode);
  const autoTimingLabel = document.querySelector("#gridAutoTimingSlider")?.closest("label")?.querySelector("span");
  if (autoTimingLabel) autoTimingLabel.textContent = t.autoGridTiming;
  const gridHint = document.getElementById("gridAutoTimingHint");
  if (gridHint) gridHint.textContent = t.gridAutoTimingHint;
  setText("#gridAutoTimingTitle", t.autoGridTiming);
  const debugTitle = document.querySelector(".debug-console-title");
  if (debugTitle) debugTitle.textContent = t.debugConsole;
  const debugCopyBtn = document.getElementById("debugConsoleCopyBtn");
  const debugClearBtn = document.getElementById("debugConsoleClearBtn");
  if (debugCopyBtn) debugCopyBtn.textContent = t.copy;
  if (debugClearBtn) debugClearBtn.textContent = t.clear;
  if (dom.gridAutoDebugText) dom.gridAutoDebugText.textContent = t.autoGridDebug;
  setText("#pngExportTitle", t.exportPng);
  setButtonById("pngExportCloseBtn", t.close);
  setButtonById("pngExportCancelBtn", t.cancel);
  setButtonById("pngExportApplyBtn", t.exportPng);
  setLabelByControl("pngFilenameInput", t.filename);
  setLabelByControl("pngRangeModeSelect", t.range);
  setOptionText("pngRangeModeSelect", "page", t.page);
  setOptionText("pngRangeModeSelect", "view", t.viewRange);
  setOptionText("pngRangeModeSelect", "selection", t.selectionRange);
  setOptionText("pngRangeModeSelect", "custom", t.custom);
  setLabelByControl("pngCustomXInput", t.centerX);
  setLabelByControl("pngCustomYInput", t.centerY);
  setLabelByControl("pngCustomWInput", t.width);
  setLabelByControl("pngCustomHInput", t.height);
  setLabelByControl("pngSizeModeSelect", t.sizeMode);
  setOptionText("pngSizeModeSelect", "pixels", t.pixels);
  setOptionText("pngSizeModeSelect", "dpi", t.dpiLabel);
  setLabelByControl("pngDpiInput", t.dpiLabel);
  setLabelByControl("pngWidthInput", t.widthPx);
  setLabelByControl("pngHeightInput", t.heightPx);
  setLabelByControl("pngScaleMulInput", t.scaleMultiplier);
  setLabelByControl("pngMarginInput", t.marginPx);
  setLabelByControl("pngBackgroundModeSelect", t.background);
  setOptionText("pngBackgroundModeSelect", "white", t.white);
  setOptionText("pngBackgroundModeSelect", "transparent", t.transparent);
  setOptionText("pngBackgroundModeSelect", "color", t.color);
  setLabelByControl("pngBackgroundColorInput", t.backgroundColor);
  setLabelByControl("pngColorModeSelect", t.colorMode);
  setOptionText("pngColorModeSelect", "normal", t.normal);
  setOptionText("pngColorModeSelect", "layer", t.layerColorMode);
  setOptionText("pngColorModeSelect", "group", t.groupColorMode);
  setLabelByControl("pngIncludeGridToggle", t.includeGrid);
  setLabelByControl("pngIncludeAxesToggle", t.includeAxes);
  setLabelByControl("pngIncludePageFrameToggle", t.includePageFrame);
  setLabelByControl("pngIncludeSelectionToggle", t.includeSelectionHighlight);
  setLabelByControl("pngAntialiasToggle", t.antialias);
  setLabelByControl("pngSrgbToggle", "sRGB");
  setLabelByControl("pngLineScaleInput", t.lineWidthScale);
  setLabelByControl("pngMinLinePxInput", t.minLineWidthPx);

  if (dom.pageOrientationSelect) {
    const oL = dom.pageOrientationSelect.querySelector("option[value='landscape']");
    const oP = dom.pageOrientationSelect.querySelector("option[value='portrait']");
    if (oL) oL.textContent = t.landscape;
    if (oP) oP.textContent = t.portrait;
  }
  if (dom.dimLinearMode) {
    const o1 = dom.dimLinearMode.querySelector("option[value='single']");
    const o2 = dom.dimLinearMode.querySelector("option[value='chain']");
    const o3 = dom.dimLinearMode.querySelector("option[value='angle']");
    if (o1) o1.textContent = t.single;
    if (o2) o2.textContent = t.chain;
    if (o3) o3.textContent = t.angle;
  }
  if (dom.dimCircleMode) {
    const o1 = dom.dimCircleMode.querySelector("option[value='radius']");
    const o2 = dom.dimCircleMode.querySelector("option[value='diameter']");
    if (o1) o1.textContent = t.radius;
    if (o2) o2.textContent = t.diameter;
  }
  if (dom.dimCircleArrowSide) {
    const o1 = dom.dimCircleArrowSide.querySelector("option[value='outside']");
    const o2 = dom.dimCircleArrowSide.querySelector("option[value='inside']");
    if (o1) o1.textContent = t.outside;
    if (o2) o2.textContent = t.inside;
  }
  if (dom.dimArrowDirectionSelect) {
    const o1 = dom.dimArrowDirectionSelect.querySelector("option[value='normal']");
    const o2 = dom.dimArrowDirectionSelect.querySelector("option[value='reverse']");
    if (o1) o1.textContent = t.normal;
    if (o2) o2.textContent = t.reverse;
  }
}














