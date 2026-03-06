import { TOOL_SHORTCUT_TOOL_ORDER, sanitizeToolShortcuts } from "./state.js";
export function createToolRegistry() {
  return [
    { id: "select", label: "Select" },
    { id: "vertex", label: "Vertex" },
    { id: "line", label: "Line" },
    { id: "polyline", label: "Polyline" },
    { id: "rect", label: "Rect" },
    { id: "circle", label: "Circle" },
    { id: "position", label: "Position" },
    { id: "text", label: "Text" },
    { id: "dim", label: "Dim" },
    { id: "trim", label: "Trim" },
    { id: "fillet", label: "Fillet" },
    { id: "hatch", label: "Hatching" },
    { id: "doubleline", label: "Double Line" },
  ];
}

function createHtmlLikeLeftMenuRegistry() {
  return [
    { type: "tool", id: "select", label: "選択", group: "create" },
    { type: "action", id: "resetView", label: "表示リセット", implemented: true, group: "create" },
    { type: "tool", id: "line", label: "線", group: "create" },
    { type: "tool", id: "rect", label: "四角", group: "create" },
    { type: "tool", id: "circle", label: "円", group: "create" },
    { type: "tool", id: "position", label: "位置", group: "create" },
    { type: "tool", id: "dim", label: "寸法線", group: "create" },
    { type: "tool", id: "text", label: "テキスト", group: "create" },
    { type: "tool", id: "hatch", label: "ハッチング", implemented: true, group: "create" },
    { type: "sep" },
    { type: "tool", id: "vertex", label: "頂点編集", group: "edit" },
    { type: "tool", id: "fillet", label: "フィレット", group: "edit" },
    { type: "tool", id: "trim", label: "トリム", group: "edit" },
    { type: "tool", id: "doubleline", label: "二重線", implemented: true, group: "edit" },
    { type: "tool", id: "patterncopy", label: "パターンコピー", implemented: true, group: "edit" },
    { type: "action", id: "undo", label: "Undo", implemented: true, group: "edit" },
    { type: "action", id: "redo", label: "Redo", implemented: true, group: "edit" },
    { type: "action", id: "delete", label: "削除", implemented: true, group: "edit" },
    { type: "sep" },
    { type: "action", id: "newFile", label: "新規作成", implemented: true, group: "file" },
    { type: "action", id: "saveJson", label: "保存", implemented: true, group: "file" },
    { type: "action", id: "saveJsonAs", label: "別名保存", implemented: true, group: "file" },
    { type: "action", id: "loadJson", label: "読込", implemented: true, group: "file" },
    { type: "action", id: "importJson", label: "インポート", implemented: true, group: "file" },
    {
      type: "action-flyout",
      id: "export",
      label: "出力",
      group: "file",
      options: [
        { id: "pdf", label: "PDF", implemented: true },
        { id: "svg", label: "SVG", implemented: true },
        { id: "dxf", label: "DXF", implemented: true },
      ],
    },
    { type: "tool", id: "settings", label: "設定", group: "file" },
  ];
}

function leftMenuItemKey(item) {
  return `${String(item?.type || "")}:${String(item?.id || "")}`;
}

function isLeftMenuItemVisible(state, key) {
  if (key === "tool:settings") return true;
  const map = (state.ui && typeof state.ui.leftMenuVisibility === "object") ? state.ui.leftMenuVisibility : null;
  if (!map) return true;
  return map[key] !== false;
}

function bindSnapItemsToLeftMenuVisibility(dom) {
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

function clampGridAutoTiming(v) {
  return Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
}

function gridThresholdsFromTiming(timing) {
  const t = clampGridAutoTiming(timing);
  const u = t / 100;
  const s = u * u; // expand "slow" side while keeping "fast" side close to current
  const th50 = Math.round(110 + (130 * s));
  const th10 = Math.round(150 + (220 * s));
  const th5 = Math.round(200 + (320 * s));
  const th1 = Math.round(260 + (520 * s));
  return {
    th50,
    th10: Math.max(th50, th10),
    th5: Math.max(th10, th5),
    th1: Math.max(th5, th1),
  };
}

function gridAutoTimingFromThreshold50(th50) {
  const v50 = Math.max(110, Math.min(240, Math.round(Number(th50) || 130)));
  const s = Math.max(0, Math.min(1, (v50 - 110) / 130));
  return clampGridAutoTiming(Math.sqrt(s) * 100);
}

function gridAutoTimingLabelText(timing) {
  const t = clampGridAutoTiming(timing);
  if (t <= 20) return "かなり早い";
  if (t <= 40) return "やや早い";
  if (t <= 60) return "標準";
  if (t <= 80) return "やや遅い";
  return "かなり遅い";
}

function normalizeGridPreset(v) {
  const n = Number(v);
  const opts = [1, 5, 10, 50, 100, 500, 1000];
  if (!Number.isFinite(n)) return 100;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

function normalizePageScalePreset(v) {
  const n = Number(v);
  const opts = [1, 5, 10, 50, 100, 500, 1000];
  if (!Number.isFinite(n)) return 1;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

function normalizeMaxZoomPreset(v) {
  const n = Number(v);
  const opts = [1, 10, 100, 1000];
  if (!Number.isFinite(n)) return 100;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

function normalizeMenuScalePreset(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 100;
  const snapped = Math.round(n / 5) * 5;
  return Math.max(50, Math.min(200, snapped));
}

function normalizeLineWidthPreset(v) {
  const n = Number(v);
  const opts = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
  if (!Number.isFinite(n)) return 0.25;
  let best = opts[0];
  let bestD = Math.abs(n - best);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(n - opts[i]);
    if (d < bestD) {
      bestD = d;
      best = opts[i];
    }
  }
  return best;
}

function normalizeLineTypePreset(v) {
  const allowed = ["solid", "dashed", "dotted", "dashdot", "longdash", "center", "hidden"];
  const key = String(v || "solid").toLowerCase();
  return allowed.includes(key) ? key : "solid";
}

function getUiLanguage(state) {
  return String(state?.ui?.language || "en").toLowerCase().startsWith("ja") ? "ja" : "en";
}

function localizeGridAutoTimingLabelText(timing, lang) {
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

function applyLanguageUi(state, dom) {
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
      undo: "Undo",
      redo: "Redo",
      del: "削除",
      save: "保存",
      newFile: "新規作成",
      saveAs: "別名保存",
      load: "読込",
      import: "インポート",
      export: "出力",
      settings: "設定",
      manualGuide: "使い方ガイド",
      selectMode: "選択モード",
      objectPick: "オブジェクト",
      groupPick: "グループ",
      filletRadius: "半径",
      filletMode: "動作モード",
      filletTrim: "トリムも行う",
      filletSplit: "トリムしない",
      filletApply: "実行",
      language: "言語",
      menuScale: "メニュー倍率",
      touchMode: "タッチモード",
      leftMenuVisibleItems: "左メニュー表示項目",
      touchConfirmCommon: "決定",
      touchBackToSelect: "選択に戻る",
      touchConfirm: "確定",
      dimPreparePlacement: "配置位置を指定",
      dimFinalize: "寸法確定",
      shortcutSettings: "キーボードショートカット",
      shortcutHint: "主要ツールの切替キー（英字1文字）",
      resetShortcuts: "初期値に戻す",
      groups: "グループ",
      layers: "レイヤー",
      groupOps: "グループ操作",
      createGroup: "新規グループ作成",
      layerOps: "レイヤー操作",
      rename: "リネーム",
      colorize: "カラー分け表示",
      currentLayerOnly: "現在レイヤーのみ",
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
      pageSize: "用紙サイズ",
      orientation: "向き",
      landscape: "横",
      portrait: "縦",
      scale: "縮尺 (1:)",
      maxZoom: "最大ズーム",
      fps: "フレームレート表示",
      objectCount: "オブジェクト数表示",
      autoBackup: "自動バックアップ",
      backupInterval: "バックアップ間隔",
      paperFrame: "用紙枠",
      innerMargin: "内側余白(mm)",
      gridSettings: "グリッド設定",
      baseGrid: "基本グリッドサイズ",
      show: "表示",
      autoGrid: "可変グリッド",
      autoGridTiming: "オードグリッド切替タイミング",
      preview: "プレビュー",
      precision: "精度",
      hatchApply: "選択境界でハッチング作成",
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
      circleModeDrag: "マウスドラッグ",
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
      undo: "Undo",
      redo: "Redo",
      del: "Delete",
      save: "Save",
      newFile: "New",
      saveAs: "Save As",
      load: "Load",
      import: "Import",
      export: "Export",
      settings: "Settings",
      manualGuide: "User Guide",
      selectMode: "Selection Mode",
      objectPick: "Object",
      groupPick: "Group",
      filletRadius: "Radius",
      filletMode: "Mode",
      filletTrim: "Trim",
      filletSplit: "No Trim",
      filletApply: "Execute",
      language: "Language",
      menuScale: "Menu Scale",
      touchMode: "Touch Mode",
      leftMenuVisibleItems: "Left Menu Items",
      touchConfirmCommon: "Confirm",
      touchBackToSelect: "Back to Select",
      touchConfirm: "Confirm",
      dimPreparePlacement: "Set Placement",
      dimFinalize: "Finalize Dim",
      shortcutSettings: "Keyboard Shortcuts",
      shortcutHint: "Tool switch key (single character)",
      resetShortcuts: "Reset Defaults",
      groups: "Groups",
      layers: "Layers",
      groupOps: "Group Ops",
      createGroup: "New Group",
      layerOps: "Layer Ops",
      rename: "Rename",
      colorize: "Colorize",
      currentLayerOnly: "Active Layer Only",
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
      pageSize: "Page Size",
      orientation: "Orientation",
      landscape: "Landscape",
      portrait: "Portrait",
      scale: "Scale (1:)",
      maxZoom: "Max Zoom",
      fps: "Show FPS",
      objectCount: "Show Object Count",
      autoBackup: "Auto Backup",
      backupInterval: "Backup Interval",
      paperFrame: "Paper Frame",
      innerMargin: "Inner Margin (mm)",
      gridSettings: "Grid Settings",
      baseGrid: "Base Grid Size",
      show: "Show",
      autoGrid: "Auto Grid",
      autoGridTiming: "Auto Grid Timing",
      preview: "Preview",
      precision: "Precision",
      hatchApply: "Create Hatching",
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
      circleModeDrag: "Mouse Drag",
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
    if (oJa) oJa.textContent = "日本語";
    if (oEn) oEn.textContent = "English";
  }

  setText(".sidebar .section[data-panel-id='tools'] > .panel-toggle", t.create);
  setText(".sidebar .section[data-panel-id='editTools'] > .panel-toggle", t.edit);
  setText(".sidebar .section[data-panel-id='fileTools'] > .panel-toggle", t.file);
  setText("#openManualBtn", t.manualGuide);
  const manualBtn = document.getElementById("openManualBtn");
  if (manualBtn) manualBtn.setAttribute("href", lang === "en" ? "/manual_en.html" : "/manual.html");
  setText(".left-aux-stack .section[data-panel-id='snap'] > .panel-toggle", t.snap);
  setText(".left-aux-stack .section[data-panel-id='attrs'] > .panel-toggle", t.attrs);

  const leftPanels = [dom.toolButtons, dom.editToolButtons, dom.fileToolButtons].filter(Boolean);
  for (const panel of leftPanels) {
    for (const btn of panel.querySelectorAll("button[data-tool]")) {
      const id = String(btn.dataset.tool || "");
      if (id === "select") btn.textContent = t.select;
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
      else if (id === "export") btn.textContent = t.export;
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
  setLabelByControl("menuScaleSelect", t.menuScale);
  setLabelByControl("touchModeToggle", t.touchMode);
  setText("#leftMenuVisibilityLabel", t.leftMenuVisibleItems);
  setButtonById("touchConfirmBtn", t.touchConfirmCommon);
  setButtonById("touchSelectBackBtn", t.touchBackToSelect);
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
  setPrevSpanByControl("lineLengthInput", t.length);
  setPrevSpanByControl("lineAngleInput", t.angle);
  setPrevSpanByControl("lineAnchorSelect", t.anchor);
  setOptionText("lineAnchorSelect", "endpoint_a", t.endpointA);
  setOptionText("lineAnchorSelect", "endpoint_b", t.endpointB);
  setOptionText("lineAnchorSelect", "center", t.centerPoint);
  setPrevSpanByControl("lineToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("lineToolLineTypeInput", t.lineType);
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
  setLabelByControl("circleRadiusInput", t.radius);
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
  setPrevSpanByControl("filletToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("filletToolLineTypeInput", t.lineType);
  setPrevSpanByControl("selectionCircleRadiusInput", t.radius);
  setLabelByControl("selectionCircleCenterMarkToggle", t.centerMarkDisplay);
  setLabelByControl("selectionPositionSizeInput", t.size);
  setButtonById("mergeGroupsBtn", t.groupSelectedShapes);
  setButtonById("dimMergeGroupsBtn", t.groupSelectedShapes);
  setButtonById("unparentGroupBtn", t.unparent);
  setButtonById("deleteGroupBtn", t.deleteThisGroup);
  setLabelByControl("groupAimEnableToggle", t.aimConstraint);
  setButtonById("groupAimPickBtn", t.aimPickTarget);
  setButtonById("groupAimClearBtn", t.aimClear);
  setButtonById("dimChainPopBtn", t.undoPoint);
  setLabelByControl("groupRotateSnapInput", (lang === "en" ? "Rotate Snap" : "回転角スナップ"));
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
  setPrevSpanByControl("positionToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("positionToolLineTypeInput", t.lineType);
  setPrevSpanByControl("textToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("textToolLineTypeInput", t.lineType);
  setPrevSpanByControl("hatchToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("dlineOffsetInput", t.offset);
  setPrevSpanByControl("dlineModeSelect", t.mode);
  setLabelByControl("dlineNoTrimToggle", t.noTrim);
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
  if (dom.selectionApplyCircleRadiusBtn) dom.selectionApplyCircleRadiusBtn.textContent = t.apply;
  if (dom.applyDLineBtn) dom.applyDLineBtn.textContent = t.dlineApply;
  if (dom.applyHatchBtn) dom.applyHatchBtn.textContent = t.hatchApply;
  if (dom.patternCopyApplyBtn) dom.patternCopyApplyBtn.textContent = t.patternCopyRun;
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

  // Settings labels
  setLabelByControl("pageSizeSelect", t.pageSize);
  setLabelByControl("pageOrientationSelect", t.orientation);
  setLabelByControl("pageScaleInput", t.scale);
  setLabelByControl("maxZoomInput", t.maxZoom);
  setLabelByControl("fpsDisplayToggle", t.fps);
  setLabelByControl("objectCountDisplayToggle", t.objectCount);
  setLabelByControl("autoBackupToggle", t.autoBackup);
  setLabelByControl("autoBackupIntervalSelect", t.backupInterval);
  setLabelByControl("pageUnitSelect", t.unit);
  setLabelByControl("pageShowFrameToggle", t.paperFrame);
  setLabelByControl("pageInnerMarginInput", t.innerMargin);
  setLabelByControl("gridSizeContextInput", t.baseGrid);
  setLabelByControl("gridShowContextToggle", t.show);
  setLabelByControl("gridAutoContextToggle", t.autoGrid);
  setText(".section[data-context='settings'] > div > div", t.pageSettings);
  setText(".section[data-context='settings'] .section-title[style]", t.gridSettings);
  setText("#gridAutoTimingLabel", localizeGridAutoTimingLabelText(Number(dom.gridAutoTimingSlider?.value || 0), lang));
  setText("#filletModeLabel", t.filletMode);
  const autoTimingLabel = document.querySelector("#gridAutoTimingSlider")?.closest("label")?.querySelector("span");
  if (autoTimingLabel) autoTimingLabel.textContent = t.autoGridTiming;
  const gridHint = document.getElementById("gridAutoTimingHint");
  if (gridHint && lang === "en") gridHint.textContent = String(gridHint.textContent || "").replace("目標", "Target").replace("表示幅", "display width");

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

export function initUi(state, dom, actions) {
  bindSnapItemsToLeftMenuVisibility(dom);
  let currentGroupDropHoverRow = null;
  let groupRowClickTimer = null;
  let suppressGroupListClickUntil = 0;
  let lastGroupDnDKind = null; // "group" | "shape" | null
  const clearGroupDropHoverRow = () => {
    if (!currentGroupDropHoverRow) return;
    currentGroupDropHoverRow.classList.remove("dnd-over");
    currentGroupDropHoverRow = null;
  };
  const setGroupDropHoverRow = (row) => {
    if (currentGroupDropHoverRow === row) return;
    clearGroupDropHoverRow();
    if (!row) return;
    row.classList.add("dnd-over");
    currentGroupDropHoverRow = row;
  };
  const toElementTarget = (node) => {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  };
  const parseDragPayload = (e) => {
    const rawG = state.ui?.groupDragDrop?.draggingGroupId;
    const rawS = state.ui?.groupDragDrop?.draggingShapeId;
    let groupId = (rawG != null && Number.isFinite(Number(rawG))) ? Number(rawG) : null;
    let shapeId = (rawS != null && Number.isFinite(Number(rawS))) ? Number(rawS) : null;
    try {
      const raw = e?.dataTransfer?.getData?.("text/plain");
      if (typeof raw === "string" && raw.length) {
        if (raw.startsWith("shape:")) {
          const sid = Number(raw.slice(6));
          if (Number.isFinite(sid)) shapeId = sid;
        } else {
          const gid = Number(raw);
          if (Number.isFinite(gid)) groupId = gid;
        }
      }
    } catch (_) { }
    return { groupId, shapeId };
  };
  const resolveGroupDropTarget = (fromEl) => {
    const el = toElementTarget(fromEl);
    const groupRow = el?.closest?.("[data-group-row]");
    if (groupRow) {
      const gid = Number(groupRow.dataset.groupRow);
      return Number.isFinite(gid) ? { gid, row: groupRow } : null;
    }
    const objRow = el?.closest?.("[data-group-shape-row]");
    if (objRow) {
      const ownerGid = Number(objRow.dataset.ownerGroupId);
      if (!Number.isFinite(ownerGid)) return null;
      const ownerRow = dom.groupList?.querySelector?.(`[data-group-row="${ownerGid}"]`) || null;
      return { gid: ownerGid, row: ownerRow };
    }
    return null;
  };
  const refreshUiDeferred = () => {
    setTimeout(() => { refreshUi(state, dom); }, 0);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => refreshUi(state, dom)));
    }
  };
  const normalizeHexColor = (v, fallback = "#0f172a") => {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
  };
  const rgbToHex = (r, g, b) => `#${[r, g, b].map((n) => {
    const v = Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
    return v.toString(16).padStart(2, "0");
  }).join("")}`;
  const hexToRgb = (hex) => {
    const c = normalizeHexColor(hex, "#000000");
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
    };
  };
  const rgbToHsv = (r, g, b) => {
    const rn = (Number(r) || 0) / 255;
    const gn = (Number(g) || 0) / 255;
    const bn = (Number(b) || 0) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d > 1e-9) {
      if (max === rn) h = 60 * (((gn - bn) / d) % 6);
      else if (max === gn) h = 60 * (((bn - rn) / d) + 2);
      else h = 60 * (((rn - gn) / d) + 4);
    }
    if (h < 0) h += 360;
    const s = (max <= 1e-9) ? 0 : (d / max) * 100;
    const v = max * 100;
    return { h, s, v };
  };
  const hsvToRgb = (h, s, v) => {
    const hn = ((Number(h) || 0) % 360 + 360) % 360;
    const sn = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
    const vn = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
    const c = vn * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = vn - c;
    let rp = 0, gp = 0, bp = 0;
    if (hn < 60) { rp = c; gp = x; bp = 0; }
    else if (hn < 120) { rp = x; gp = c; bp = 0; }
    else if (hn < 180) { rp = 0; gp = c; bp = x; }
    else if (hn < 240) { rp = 0; gp = x; bp = c; }
    else if (hn < 300) { rp = x; gp = 0; bp = c; }
    else { rp = c; gp = 0; bp = x; }
    return {
      r: Math.round((rp + m) * 255),
      g: Math.round((gp + m) * 255),
      b: Math.round((bp + m) * 255),
    };
  };
  const collectUsedColors = () => {
    const acc = [];
    const push = (c) => {
      const n = normalizeHexColor(c, "");
      if (!n) return;
      if (acc.includes(n)) return;
      acc.push(n);
    };
    push(state.textSettings?.color);
    push(state.hatchSettings?.fillColor);
    push(state.hatchSettings?.lineColor);
    for (const s of (state.shapes || [])) {
      if (!s) continue;
      push(s.color);
      push(s.textColor);
      push(s.fillColor);
      push(s.lineColor);
    }
    return acc.slice(0, 10);
  };
  const getFileColorPalette = () => {
    if (!state.ui) state.ui = {};
    if (!Array.isArray(state.ui.colorPalette) || state.ui.colorPalette.length === 0) {
      state.ui.colorPalette = [
        "#000000",
        "#404040",
        "#808080",
        "#bfbfbf",
        "#ffffff",
        null,
        null,
        null,
        null,
        null,
      ];
    }
    const src = state.ui.colorPalette || [];
    const next = [];
    for (let i = 0; i < 10; i++) {
      const c = src[i];
      if (c == null || c === "") {
        next.push(null);
      } else {
        const n = normalizeHexColor(c, "");
        next.push(n || null);
      }
    }
    state.ui.colorPalette = next;
    return next;
  };
  const getPaletteSlots = () => {
    const p = getFileColorPalette().slice(0, 10);
    while (p.length < 10) p.push(null);
    return p;
  };
  const setPaletteSlot = (idx, colorOrNull) => {
    if (!state.ui) state.ui = {};
    const slots = getPaletteSlots();
    if (!Number.isFinite(Number(idx))) return;
    const i = Math.max(0, Math.min(9, Number(idx)));
    const c = (colorOrNull == null) ? null : normalizeHexColor(colorOrNull, "");
    slots[i] = c || null;
    state.ui.colorPalette = slots.slice(0, 10);
  };
  let colorPaletteHideTimer = null;
  let colorPopupCtx = null;
  const hideColorPalettePopup = () => {
    if (colorPaletteHideTimer) {
      clearTimeout(colorPaletteHideTimer);
      colorPaletteHideTimer = null;
    }
    if (dom.colorPalettePopup) dom.colorPalettePopup.style.display = "none";
    colorPopupCtx = null;
  };
  const scheduleHideColorPalettePopup = () => {
    if (colorPaletteHideTimer) clearTimeout(colorPaletteHideTimer);
    colorPaletteHideTimer = setTimeout(() => hideColorPalettePopup(), 160);
  };
  const renderColorPalettePopupContents = () => {
    if (!dom.colorPalettePopup || !colorPopupCtx || !colorPopupCtx.inputEl) return;
    const { inputEl, applyColor } = colorPopupCtx;
    if (colorPaletteHideTimer) {
      clearTimeout(colorPaletteHideTimer);
      colorPaletteHideTimer = null;
    }
    const slots = getPaletteSlots();
    const lang = getUiLanguage(state);
    dom.colorPalettePopup.innerHTML = "";
    dom.colorPalettePopup.style.display = "flex";
    dom.colorPalettePopup.style.flexDirection = "column";
    dom.colorPalettePopup.style.gap = "6px";
    dom.colorPalettePopup.style.minWidth = "180px";
    const current = normalizeHexColor(inputEl.value, "#0f172a");
    const paletteWrap = document.createElement("div");
    paletteWrap.style.display = "grid";
    paletteWrap.style.gridTemplateColumns = "repeat(5, 18px)";
    paletteWrap.style.gap = "4px";
    if (!Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))) {
      const foundIdx = slots.findIndex((c) => c === current);
      colorPopupCtx.selectedPaletteIndex = (foundIdx >= 0) ? foundIdx : 0;
    }
    for (let i = 0; i < slots.length; i++) {
      const c = slots[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = c || ((lang === "en") ? "Empty Slot" : "空スロット");
      btn.style.width = "18px";
      btn.style.height = "18px";
      btn.style.padding = "0";
      btn.style.borderRadius = "3px";
      const isSelectedSlot = Number(colorPopupCtx.selectedPaletteIndex) === i;
      btn.style.border = isSelectedSlot ? "2px solid #4f46e5" : "1px solid #475569";
      btn.style.background = c || "#ffffff";
      if (!c) btn.style.backgroundImage = "linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 50%,#e2e8f0 50%,#e2e8f0 75%,transparent 75%,transparent)";
      if (!c) btn.style.backgroundSize = "8px 8px";
      btn.style.touchAction = "manipulation";
      btn.style.userSelect = "none";
      btn.addEventListener("mousedown", (ev) => ev.preventDefault());
      btn.addEventListener("click", () => {
        colorPopupCtx.selectedPaletteIndex = i;
        if (c) {
          applyColor(c);
        }
        renderColorPalettePopupContents();
      });
      paletteWrap.appendChild(btn);
    }
    dom.colorPalettePopup.appendChild(paletteWrap);

    if (colorPopupCtx.mode === "picker") {
      const hsv = colorPopupCtx.hsv || (() => {
        const rgb = hexToRgb(current);
        return rgbToHsv(rgb.r, rgb.g, rgb.b);
      })();
      colorPopupCtx.hsv = { h: hsv.h, s: hsv.s, v: hsv.v };
      const pickerPanel = document.createElement("div");
      pickerPanel.style.display = "grid";
      pickerPanel.style.gridTemplateColumns = "auto 1fr auto";
      pickerPanel.style.gap = "4px 6px";
      pickerPanel.style.alignItems = "center";
      const preview = document.createElement("div");
      preview.style.gridColumn = "1 / -1";
      preview.style.height = "20px";
      preview.style.border = "1px solid #94a3b8";
      preview.style.borderRadius = "4px";
      const hexLabel = document.createElement("div");
      hexLabel.style.gridColumn = "1 / -1";
      hexLabel.style.fontSize = "11px";
      hexLabel.style.color = "#334155";
      const mkSlider = (label, min, max, step, value) => {
        const l = document.createElement("span");
        l.textContent = label;
        l.style.fontSize = "11px";
        const r = document.createElement("input");
        r.type = "range";
        r.min = String(min); r.max = String(max); r.step = String(step); r.value = String(value);
        const v = document.createElement("span");
        v.style.fontSize = "11px";
        v.textContent = String(Math.round(Number(value) || 0));
        return { l, r, v };
      };
      const hRow = mkSlider((lang === "en") ? "Hue" : "色相", 0, 360, 1, colorPopupCtx.hsv.h);
      const sRow = mkSlider((lang === "en") ? "Sat" : "彩度", 0, 100, 1, colorPopupCtx.hsv.s);
      const vRow = mkSlider((lang === "en") ? "Val" : "明度", 0, 100, 1, colorPopupCtx.hsv.v);
      const applyHsv = () => {
        colorPopupCtx.hsv.h = Number(hRow.r.value) || 0;
        colorPopupCtx.hsv.s = Number(sRow.r.value) || 0;
        colorPopupCtx.hsv.v = Number(vRow.r.value) || 0;
        hRow.v.textContent = String(Math.round(colorPopupCtx.hsv.h));
        sRow.v.textContent = String(Math.round(colorPopupCtx.hsv.s));
        vRow.v.textContent = String(Math.round(colorPopupCtx.hsv.v));
        const rgb = hsvToRgb(colorPopupCtx.hsv.h, colorPopupCtx.hsv.s, colorPopupCtx.hsv.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        preview.style.background = hex;
        hexLabel.textContent = hex;
        applyColor(hex);
      };
      hRow.r.addEventListener("input", applyHsv);
      sRow.r.addEventListener("input", applyHsv);
      vRow.r.addEventListener("input", applyHsv);
      pickerPanel.append(preview, hexLabel, hRow.l, hRow.r, hRow.v, sRow.l, sRow.r, sRow.v, vRow.l, vRow.r, vRow.v);
      applyHsv();
      const cmdRow = document.createElement("div");
      cmdRow.style.display = "flex";
      cmdRow.style.gap = "6px";
      cmdRow.style.justifyContent = "flex-end";
      const regBtn = document.createElement("button");
      regBtn.type = "button";
      regBtn.textContent = (lang === "en") ? "Register This Color" : "この色を登録";
      regBtn.style.fontSize = "11px";
      regBtn.style.padding = "2px 8px";
      regBtn.addEventListener("click", () => {
        const rgb = hsvToRgb(colorPopupCtx.hsv.h, colorPopupCtx.hsv.s, colorPopupCtx.hsv.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const idx = Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))
          ? Number(colorPopupCtx.selectedPaletteIndex)
          : 0;
        setPaletteSlot(idx, hex);
        applyColor(hex);
        colorPopupCtx.mode = "palette";
        renderColorPalettePopupContents();
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = (lang === "en") ? "Cancel" : "キャンセル";
      cancelBtn.style.fontSize = "11px";
      cancelBtn.style.padding = "2px 8px";
      cancelBtn.addEventListener("click", () => {
        colorPopupCtx.mode = "palette";
        renderColorPalettePopupContents();
      });
      cmdRow.append(regBtn, cancelBtn);
      dom.colorPalettePopup.append(pickerPanel, cmdRow);
    } else {
      const cmdRow = document.createElement("div");
      cmdRow.style.display = "flex";
      cmdRow.style.gap = "6px";
      cmdRow.style.justifyContent = "flex-end";
      const openRegBtn = document.createElement("button");
      openRegBtn.type = "button";
      openRegBtn.textContent = (lang === "en") ? "Register" : "登録";
      openRegBtn.style.fontSize = "11px";
      openRegBtn.style.padding = "2px 8px";
      openRegBtn.addEventListener("click", () => {
        const idx = Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))
          ? Number(colorPopupCtx.selectedPaletteIndex)
          : 0;
        const slotColor = slots[idx] || current;
        const rgb = hexToRgb(slotColor);
        colorPopupCtx.hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        colorPopupCtx.mode = "picker";
        renderColorPalettePopupContents();
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = (lang === "en") ? "Delete" : "削除";
      delBtn.style.fontSize = "11px";
      delBtn.style.padding = "2px 8px";
      delBtn.addEventListener("click", () => {
        const idx = Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))
          ? Number(colorPopupCtx.selectedPaletteIndex)
          : 0;
        setPaletteSlot(idx, null);
        renderColorPalettePopupContents();
      });
      cmdRow.append(openRegBtn, delBtn);
      dom.colorPalettePopup.appendChild(cmdRow);
    }
  };
  const showColorPalettePopupForInput = (inputEl, applyColor) => {
    if (!dom.colorPalettePopup || !inputEl || typeof applyColor !== "function") return;
    const sameInput = colorPopupCtx && colorPopupCtx.inputEl === inputEl;
    colorPopupCtx = { inputEl, applyColor, selectedPaletteIndex: null, mode: "palette", hsv: null };
    renderColorPalettePopupContents();
    if (!sameInput) {
      const r = inputEl.getBoundingClientRect();
      const popup = dom.colorPalettePopup;
      const left = Math.max(8, Math.min(window.innerWidth - 170, Math.round(r.left)));
      const top = Math.max(8, Math.min(window.innerHeight - 120, Math.round(r.bottom + 6)));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }
  };
  const bindColorInputPalette = (inputEl, applyColor) => {
    if (!inputEl || typeof applyColor !== "function") return;
    const applyFromInput = () => {
      const c = normalizeHexColor(inputEl.value, "#0f172a");
      inputEl.value = c;
      applyColor(c);
    };
    const openPopup = () => showColorPalettePopupForInput(inputEl, (c) => {
      inputEl.value = c;
      applyColor(c);
    });
    inputEl.addEventListener("input", applyFromInput);
    inputEl.addEventListener("change", applyFromInput);
    inputEl.addEventListener("focus", openPopup);
    inputEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      openPopup();
    });
    inputEl.addEventListener("click", (e) => {
      e.preventDefault();
      openPopup();
    });
    inputEl.addEventListener("blur", scheduleHideColorPalettePopup);
  };
  if (dom.colorPalettePopup) {
    dom.colorPalettePopup.addEventListener("mouseenter", () => {
      if (colorPaletteHideTimer) {
        clearTimeout(colorPaletteHideTimer);
        colorPaletteHideTimer = null;
      }
    });
    dom.colorPalettePopup.addEventListener("mouseleave", scheduleHideColorPalettePopup);
  }
  document.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (!t) return;
    const isColorInput = t instanceof Element && t.matches("input[type='color']");
    const inPopup = dom.colorPalettePopup && t instanceof Element && dom.colorPalettePopup.contains(t);
    if (!isColorInput && !inPopup) hideColorPalettePopup();
  });
  let groupPanelResizeDrag = null;
  const onGroupPanelResizeMove = (e) => {
    if (!groupPanelResizeDrag) return;
    if (!state.ui.panelLayout) state.ui.panelLayout = {};
    const dx = e.clientX - groupPanelResizeDrag.startX;
    const dy = e.clientY - groupPanelResizeDrag.startY;
    if (groupPanelResizeDrag.mode === "width" || groupPanelResizeDrag.mode === "both") {
      state.ui.panelLayout.rightPanelWidth = Math.max(180, Math.min(900, Math.round(groupPanelResizeDrag.startWidth - dx)));
    }
    if (groupPanelResizeDrag.mode === "height" || groupPanelResizeDrag.mode === "both") {
      state.ui.panelLayout.groupPanelHeight = Math.max(180, Math.min(2000, Math.round(groupPanelResizeDrag.startHeight - dy)));
    }
    if (groupPanelResizeDrag.mode === "layerHeight") {
      const nextListH = Math.max(40, Math.min(2000, Math.round((groupPanelResizeDrag.startListHeight ?? 120) - dy)));
      state.ui.panelLayout.layerPanelListHeight = nextListH;
    }
    refreshUi(state, dom);
  };
  const stopGroupPanelResizeDrag = () => {
    if (!groupPanelResizeDrag) return;
    groupPanelResizeDrag = null;
    window.removeEventListener("mousemove", onGroupPanelResizeMove);
    window.removeEventListener("mouseup", stopGroupPanelResizeDrag);
  };

  const toolTargets = {
    tools: dom.toolButtons,
    edit: dom.editToolButtons || dom.toolButtons,
    files: dom.fileToolButtons || dom.toolButtons,
  };
  const positionOneLeftFlyout = (wrapEl) => {
    if (!wrapEl) return;
    const main = wrapEl.querySelector(".left-flyout-main");
    const menu = wrapEl.querySelector(".left-flyout-menu");
    if (!main || !menu) return;
    const gap = 6;
    const pad = 8;
    const br = main.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    const menuW = Math.max(82, Number(mr.width || 0), Number(menu.scrollWidth || 0));
    const menuH = Math.max(0, Number(mr.height || 0), Number(menu.scrollHeight || 0));
    let x = br.right + gap;
    let y = br.top;
    if ((x + menuW + pad) > window.innerWidth) x = Math.max(pad, br.left - gap - menuW);
    if ((y + menuH + pad) > window.innerHeight) y = Math.max(pad, window.innerHeight - menuH - pad);
    y = Math.max(pad, y);
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
  };
  const positionOpenedLeftFlyouts = () => {
    const opened = document.querySelectorAll(".tool-buttons .left-flyout.open");
    opened.forEach((el) => positionOneLeftFlyout(el));
  };
  const closeLeftFlyouts = (exceptEl = null) => {
    const opened = document.querySelectorAll(".tool-buttons .left-flyout.open");
    opened.forEach((el) => {
      if (exceptEl && el === exceptEl) return;
      el.classList.remove("open");
      const main = el.querySelector(".left-flyout-main");
      const menu = el.querySelector(".left-flyout-menu");
      if (main) main.setAttribute("aria-expanded", "false");
      if (menu) {
        menu.classList.remove("floating");
        menu.style.left = "";
        menu.style.top = "";
      }
    });
  };
  if (!state.ui._leftFlyoutGlobalCloseBound) {
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.closest?.(".tool-buttons .left-flyout")) return;
      closeLeftFlyouts();
    });
    window.addEventListener("resize", positionOpenedLeftFlyouts);
    window.addEventListener("scroll", positionOpenedLeftFlyouts, true);
    state.ui._leftFlyoutGlobalCloseBound = true;
  }
  for (const el of [toolTargets.tools, toolTargets.edit, toolTargets.files]) {
    if (el) el.innerHTML = "";
  }
  const resolveToolTarget = (item) => {
    const g = String(item?.group || "");
    if (g === "edit") return toolTargets.edit;
    if (g === "file") return toolTargets.files;
    return toolTargets.tools;
  };
  const appendSep = (target) => {
    if (!target) return;
    const last = target.lastElementChild;
    if (last && last.classList?.contains?.("left-sep")) return;
    const sep = document.createElement("div");
    sep.className = "left-sep";
    target.appendChild(sep);
  };
  let lastTarget = toolTargets.tools;
  for (const item of createHtmlLikeLeftMenuRegistry()) {
    const target = resolveToolTarget(item);
    if (item.type === "sep") {
      appendSep(lastTarget);
      continue;
    }
    lastTarget = target;
    if (item.type === "action-flyout") {
      const wrap = document.createElement("div");
      wrap.className = "left-flyout";
      wrap.dataset.menuItemKey = leftMenuItemKey(item);
      if (item.group) wrap.dataset.menuGroup = item.group;
      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.textContent = item.label;
      mainBtn.dataset.action = item.id;
      mainBtn.className = "left-flyout-main";
      mainBtn.setAttribute("aria-expanded", "false");
      mainBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = !wrap.classList.contains("open");
        closeLeftFlyouts(willOpen ? wrap : null);
        wrap.classList.toggle("open", willOpen);
        mainBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen) {
          menu.classList.add("floating");
          positionOneLeftFlyout(wrap);
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => positionOneLeftFlyout(wrap));
          }
        } else {
          menu.classList.remove("floating");
          menu.style.left = "";
          menu.style.top = "";
        }
      });
      const menu = document.createElement("div");
      menu.className = "left-flyout-menu";
      for (const opt of (item.options || [])) {
        const optBtn = document.createElement("button");
        optBtn.type = "button";
        optBtn.textContent = opt.label;
        optBtn.dataset.action = opt.id;
        const fn = actions[opt.id];
        if (typeof fn === "function") {
          optBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            fn();
            wrap.classList.remove("open");
            mainBtn.setAttribute("aria-expanded", "false");
          });
        } else {
          optBtn.disabled = true;
          if (opt.implemented === false) optBtn.title = "未実装";
        }
        menu.appendChild(optBtn);
      }
      wrap.append(mainBtn, menu);
      target?.appendChild(wrap);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    btn.dataset.menuItemKey = leftMenuItemKey(item);
    if (item.group) btn.dataset.menuGroup = item.group;
    if (item.type === "tool") {
      btn.dataset.tool = item.id;
      btn.addEventListener("click", () => {
        if (item.id === "settings" && state.tool === "settings") {
          actions.setTool("select");
          return;
        }
        if (state.ui?.touchMode && state.tool === item.id && item.id !== "select") {
          actions.setTool("select");
          return;
        }
        actions.setTool(item.id);
      });
    } else {
      btn.dataset.action = item.id;
      const fn = actions[item.id];
      if (typeof fn === "function") {
        btn.addEventListener("click", () => fn());
      } else {
        btn.disabled = true;
        if (item.implemented === false) btn.title = "未実装";
      }
    }
    target?.appendChild(btn);
  }

  const panelStacks = document.querySelectorAll(".right-stack, .sidebar");
  panelStacks.forEach((stack) => {
    stack.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".panel-toggle.section-title");
      if (!btn) return;
      const sec = btn.closest?.(".section[data-panel-id]");
      const panelId = sec?.getAttribute?.("data-panel-id");
      if (!panelId) return;
      e.preventDefault();
      if (!state.ui.rightPanelCollapsed) state.ui.rightPanelCollapsed = {};
      state.ui.rightPanelCollapsed[panelId] = !state.ui.rightPanelCollapsed[panelId];
      refreshUi(state, dom);
    });
    stack.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-layer-inner-toggle]");
      if (!btn) return;
      e.preventDefault();
      const key = btn.getAttribute("data-layer-inner-toggle");
      if (!key) return;
      if (!state.ui.layerPanelInnerCollapsed) state.ui.layerPanelInnerCollapsed = {};
      state.ui.layerPanelInnerCollapsed[key] = !state.ui.layerPanelInnerCollapsed[key];
      refreshUi(state, dom);
    });
  });

  const rightStack = document.querySelector(".right-stack");
  if (rightStack) {
    const groupsSection = rightStack.querySelector(".section[data-panel-id='groups']");
    const groupsHeader = groupsSection?.querySelector?.(".panel-toggle.section-title");
    const bindPanelResizeHandle = (el, mode, sectionEl = groupsSection) => {
      if (!el) return;
      el.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const secRect = sectionEl.getBoundingClientRect();
        const stackRect = rightStack.getBoundingClientRect();
        groupPanelResizeDrag = {
          mode,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: Math.round(stackRect.width),
          startHeight: Math.round(secRect.height),
          startListHeight: (mode === "layerHeight")
            ? Math.round(sectionEl?.querySelector?.("#layerList")?.clientHeight || 0)
            : 0,
        };
        window.addEventListener("mousemove", onGroupPanelResizeMove);
        window.addEventListener("mouseup", stopGroupPanelResizeDrag);
      });
    };
    bindPanelResizeHandle(groupsSection?.querySelector?.("#groupPanelResizeHandleTop"), "height", groupsSection);
    bindPanelResizeHandle(groupsSection?.querySelector?.("#groupPanelResizeHandleLeft"), "width", groupsSection);
    const layersSection = rightStack.querySelector(".section[data-panel-id='layers']");
    bindPanelResizeHandle(layersSection?.querySelector?.("#layerPanelResizeHandleTop"), "layerHeight", layersSection);
    bindPanelResizeHandle(layersSection?.querySelector?.("#layerPanelResizeHandleLeft"), "width", layersSection);
    if (groupsHeader) {
      groupsHeader.addEventListener("dragover", (e) => {
        const payload = parseDragPayload(e);
        if (!Number.isFinite(payload.groupId) && !Number.isFinite(payload.shapeId)) return;
        e.preventDefault();
        clearGroupDropHoverRow();
        groupsSection.classList.add("dnd-over-root");
        if (state.ui.groupDragDrop) state.ui.groupDragDrop.overGroupId = null;
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });
      groupsHeader.addEventListener("dragleave", (e) => {
        const related = e.relatedTarget;
        if (related && groupsSection.contains?.(related)) return;
        groupsSection.classList.remove("dnd-over-root");
      });
      groupsHeader.addEventListener("drop", (e) => {
        const payload = parseDragPayload(e);
        const draggedGroupId = payload.groupId;
        const draggedShapeId = payload.shapeId;
        if (!Number.isFinite(draggedGroupId) && !Number.isFinite(draggedShapeId)) return;
        e.preventDefault();
        groupsSection.classList.remove("dnd-over-root");
        clearGroupDropHoverRow();
        if (Number.isFinite(draggedShapeId)) {
          // Root drop for shape is currently unsupported; just clear DnD state.
        } else if (Number.isFinite(draggedGroupId)) {
          actions.selectGroup?.(draggedGroupId);
          actions.unparentActiveGroup?.();
        }
        if (state.ui.groupDragDrop) {
          state.ui.groupDragDrop.draggingGroupId = null;
          state.ui.groupDragDrop.draggingShapeId = null;
          state.ui.groupDragDrop.overGroupId = null;
        }
        // Group/shape actions already call draw()+refreshUi(); avoid duplicate expensive refreshes.
      });
    }
  }

  const applyGridSizeValue = (raw) => {
    const v = normalizeGridPreset(raw);
    if (dom.gridSizeInput) dom.gridSizeInput.value = String(v);
    if (dom.gridSizeContextInput) dom.gridSizeContextInput.value = String(v);
    actions.setGridSize(v);
    actions.resetView?.();
  };
  dom.gridSizeInput.value = String(state.grid.size);
  dom.gridSizeInput.addEventListener("change", () => applyGridSizeValue(dom.gridSizeInput.value));
  dom.gridSizeInput.addEventListener("input", () => applyGridSizeValue(dom.gridSizeInput.value));
  if (dom.gridSizeContextInput) {
    dom.gridSizeContextInput.value = String(state.grid.size);
    dom.gridSizeContextInput.addEventListener("change", () => applyGridSizeValue(dom.gridSizeContextInput.value));
    dom.gridSizeContextInput.addEventListener("input", () => applyGridSizeValue(dom.gridSizeContextInput.value));
  }

  dom.gridSnapToggle.checked = !!state.grid.snap;
  dom.gridSnapToggle.addEventListener("change", () => {
    if (dom.gridSnapContextToggle) dom.gridSnapContextToggle.checked = !!dom.gridSnapToggle.checked;
    actions.setGridSnap(!!dom.gridSnapToggle.checked);
  });
  if (dom.gridSnapContextToggle) {
    dom.gridSnapContextToggle.checked = !!state.grid.snap;
    dom.gridSnapContextToggle.addEventListener("change", () => {
      dom.gridSnapToggle.checked = !!dom.gridSnapContextToggle.checked;
      actions.setGridSnap(!!dom.gridSnapContextToggle.checked);
    });
  }
  if (dom.gridShowToggle) {
    dom.gridShowToggle.checked = !!state.grid.show;
    dom.gridShowToggle.addEventListener("change", () => { if (dom.gridShowContextToggle) dom.gridShowContextToggle.checked = !!dom.gridShowToggle.checked; actions.setGridShow(!!dom.gridShowToggle.checked); });
  }
  if (dom.gridShowContextToggle) {
    dom.gridShowContextToggle.checked = !!state.grid.show;
    dom.gridShowContextToggle.addEventListener("change", () => { if (dom.gridShowToggle) dom.gridShowToggle.checked = !!dom.gridShowContextToggle.checked; actions.setGridShow(!!dom.gridShowContextToggle.checked); });
  }
  if (dom.gridAutoToggle) {
    dom.gridAutoToggle.checked = !!state.grid.auto;
    dom.gridAutoToggle.addEventListener("change", () => { if (dom.gridAutoContextToggle) dom.gridAutoContextToggle.checked = !!dom.gridAutoToggle.checked; actions.setGridAuto(!!dom.gridAutoToggle.checked); });
  }
  if (dom.gridAutoContextToggle) {
    dom.gridAutoContextToggle.checked = !!state.grid.auto;
    dom.gridAutoContextToggle.addEventListener("change", () => { if (dom.gridAutoToggle) dom.gridAutoToggle.checked = !!dom.gridAutoContextToggle.checked; actions.setGridAuto(!!dom.gridAutoContextToggle.checked); });
  }
  if (dom.gridAutoTimingSlider) {
    const baseTiming = Number.isFinite(Number(state.grid?.autoTiming))
      ? Number(state.grid.autoTiming)
      : gridAutoTimingFromThreshold50(state.grid?.autoThreshold50 ?? 130);
    dom.gridAutoTimingSlider.value = String(clampGridAutoTiming(baseTiming));
    const onGridAutoTimingChange = () => {
      const timing = clampGridAutoTiming(dom.gridAutoTimingSlider.value);
      const th = gridThresholdsFromTiming(timing);
      actions.setGridAutoThresholds?.(th.th50, th.th10, th.th5, th.th1, timing);
      if (dom.gridAutoTimingLabel) dom.gridAutoTimingLabel.textContent = gridAutoTimingLabelText(timing);
      if (dom.gridAutoTimingHint) dom.gridAutoTimingHint.textContent = `入閾値: 50=${th.th50}% / 10=${th.th10}% / 5=${th.th5}% / 1=${th.th1}%`;
    };
    dom.gridAutoTimingSlider.addEventListener("input", onGridAutoTimingChange);
    onGridAutoTimingChange();
  }
  if (dom.objSnapToggle) {
    dom.objSnapToggle.checked = state.objectSnap?.enabled !== false;
    dom.objSnapToggle.addEventListener("change", () => actions.setObjectSnapEnabled(!!dom.objSnapToggle.checked));
  }
  if (dom.objSnapEndpointToggle) {
    dom.objSnapEndpointToggle.checked = state.objectSnap?.endpoint !== false;
    dom.objSnapEndpointToggle.addEventListener("change", () => actions.setObjectSnapKind("endpoint", !!dom.objSnapEndpointToggle.checked));
  }
  if (dom.objSnapMidpointToggle) {
    dom.objSnapMidpointToggle.checked = !!state.objectSnap?.midpoint;
    dom.objSnapMidpointToggle.addEventListener("change", () => actions.setObjectSnapKind("midpoint", !!dom.objSnapMidpointToggle.checked));
  }
  if (dom.objSnapCenterToggle) {
    dom.objSnapCenterToggle.checked = state.objectSnap?.center !== false;
    dom.objSnapCenterToggle.addEventListener("change", () => actions.setObjectSnapKind("center", !!dom.objSnapCenterToggle.checked));
  }
  if (dom.objSnapIntersectionToggle) {
    dom.objSnapIntersectionToggle.checked = state.objectSnap?.intersection !== false;
    dom.objSnapIntersectionToggle.addEventListener("change", () => actions.setObjectSnapKind("intersection", !!dom.objSnapIntersectionToggle.checked));
  }
  if (dom.objSnapTangentToggle) {
    dom.objSnapTangentToggle.checked = !!state.objectSnap?.tangent;
    dom.objSnapTangentToggle.addEventListener("change", () => actions.setObjectSnapKind("tangent", !!dom.objSnapTangentToggle.checked));
  }
  if (dom.objSnapVectorToggle) {
    dom.objSnapVectorToggle.checked = !!state.objectSnap?.vector;
    dom.objSnapVectorToggle.addEventListener("change", () => actions.setObjectSnapKind("vector", !!dom.objSnapVectorToggle.checked));
  }

  if (dom.resetViewBtn) dom.resetViewBtn.addEventListener("click", () => actions.resetView());
  if (dom.undoBtn) dom.undoBtn.addEventListener("click", () => actions.undo());
  if (dom.redoBtn) dom.redoBtn.addEventListener("click", () => actions.redo());
  if (dom.saveJsonBtn) dom.saveJsonBtn.addEventListener("click", () => actions.saveJson());
  if (dom.loadJsonBtn) dom.loadJsonBtn.addEventListener("click", () => actions.loadJson());
  {
    const manualBtn = document.getElementById("openManualBtn");
    if (manualBtn) {
      manualBtn.addEventListener("click", (e) => {
        const lang = getUiLanguage(state);
        const href = (lang === "ja") ? "/manual.html" : "/manual_en.html";
        manualBtn.setAttribute("href", href);
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        window.location.assign(href);
      });
    }
  }
  if (dom.activeLayerSelect) {
    dom.activeLayerSelect.addEventListener("change", () => actions.setActiveLayer(Number(dom.activeLayerSelect.value)));
  }
  if (dom.addLayerBtn) {
    dom.addLayerBtn.addEventListener("click", () => actions.addLayer(dom.newLayerNameInput?.value || ""));
  }
  if (dom.newLayerNameInput) {
    dom.newLayerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.addLayer(dom.newLayerNameInput.value || "");
      }
    });
  }
  if (dom.renameLayerBtn) {
    dom.renameLayerBtn.addEventListener("click", () => actions.renameActiveLayer?.(dom.renameLayerNameInput?.value || ""));
  }
  if (dom.renameLayerNameInput) {
    dom.renameLayerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.renameActiveLayer?.(dom.renameLayerNameInput.value || "");
      }
    });
  }
  if (dom.moveSelectionLayerBtn) {
    dom.moveSelectionLayerBtn.addEventListener("click", () => actions.moveSelectionToLayer?.());
  }
  if (dom.deleteLayerBtn) {
    dom.deleteLayerBtn.addEventListener("click", () => actions.deleteActiveLayer?.());
  }
  if (dom.moveLayerUpBtn) {
    dom.moveLayerUpBtn.addEventListener("click", () => actions.moveActiveLayerOrder?.(-1));
  }
  if (dom.moveLayerDownBtn) {
    dom.moveLayerDownBtn.addEventListener("click", () => actions.moveActiveLayerOrder?.(1));
  }
  if (dom.moveGroupUpBtn) {
    dom.moveGroupUpBtn.addEventListener("click", () => actions.moveActiveGroupOrder?.(-1));
  }
  if (dom.moveGroupDownBtn) {
    dom.moveGroupDownBtn.addEventListener("click", () => actions.moveActiveGroupOrder?.(1));
  }
  if (dom.renameGroupBtn) {
    dom.renameGroupBtn.addEventListener("click", () => actions.renameActiveGroup?.(dom.renameGroupNameInput?.value || ""));
  }
  if (dom.renameGroupNameInput) {
    dom.renameGroupNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.renameActiveGroup?.(dom.renameGroupNameInput.value || "");
      }
    });
  }
  if (dom.groupColorizeToggle) {
    dom.groupColorizeToggle.addEventListener("change", () => actions.setGroupColorize?.(!!dom.groupColorizeToggle.checked));
  }
  if (dom.groupCurrentLayerOnlyToggle) {
    dom.groupCurrentLayerOnlyToggle.addEventListener("change", () => actions.setGroupCurrentLayerOnly?.(!!dom.groupCurrentLayerOnlyToggle.checked));
  }
  if (dom.layerColorizeToggle) {
    dom.layerColorizeToggle.addEventListener("change", () => actions.setLayerColorize?.(!!dom.layerColorizeToggle.checked));
  }
  if (dom.editOnlyActiveLayerToggle) {
    dom.editOnlyActiveLayerToggle.addEventListener("change", () => actions.setEditOnlyActiveLayer?.(!!dom.editOnlyActiveLayerToggle.checked));
  }
  if (dom.layerList) {
    dom.layerList.addEventListener("click", (e) => {
      const btn = e.target.closest?.("button[data-layer-mode-cycle]");
      if (!btn) return;
      actions.cycleLayerMode?.(Number(btn.dataset.layerModeCycle));
    });
    dom.layerList.addEventListener("dblclick", (e) => {
      const btn = e.target.closest?.("button[data-layer-name-btn]");
      if (!btn) return;
      e.preventDefault();
      actions.setActiveLayer(Number(btn.dataset.layerNameBtn));
    });
  }
  if (dom.createGroupBtn) {
    dom.createGroupBtn.addEventListener("click", () => actions.createGroupFromSelection(dom.newGroupNameInput?.value || ""));
  }
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.addEventListener("click", () => actions.createGroupFromSelection(dom.newGroupNameInput?.value || ""));
  }
  if (dom.deleteGroupBtn) {
    dom.deleteGroupBtn.addEventListener("click", () => actions.deleteActiveGroup?.());
  }
  if (dom.unparentGroupBtn) {
    dom.unparentGroupBtn.addEventListener("click", () => actions.unparentActiveGroup?.());
  }
  if (dom.selectPickObjectBtn) {
    dom.selectPickObjectBtn.addEventListener("click", () => actions.setSelectPickMode?.("object"));
  }
  if (dom.selectPickGroupBtn) {
    dom.selectPickGroupBtn.addEventListener("click", () => actions.setSelectPickMode?.("group"));
  }
  if (dom.newGroupNameInput) {
    dom.newGroupNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.createGroupFromSelection(dom.newGroupNameInput.value || "");
      }
    });
  }
  if (dom.groupList) {
    const showLayerRestrictionMessage = (reason) => {
      const lang = String(state.ui?.language || "en").toLowerCase();
      if (reason === "locked") {
        actions.setStatus?.(lang === "en" ? "Layer is locked." : "LOCKレイヤーです。");
        return;
      }
      actions.setStatus?.(lang === "en" ? "Out-of-scope layer." : "対象外レイヤーです。");
    };
    const getLayerMeta = (layerId) => {
      const lid = Number(layerId);
      const layer = (state.layers || []).find(l => Number(l?.id) === lid);
      return {
        id: lid,
        locked: !!layer?.locked,
      };
    };
    const isEditOnlyActiveLayer = () => !!state.ui?.layerView?.editOnlyActive;
    const getShapePickDenyReason = (shape) => {
      if (!shape) return "outside";
      const activeLayerId = Number(state.activeLayerId);
      const lid = Number(shape.layerId ?? activeLayerId);
      const meta = getLayerMeta(lid);
      if (meta.locked) return "locked";
      if (isEditOnlyActiveLayer() && lid !== activeLayerId) return "outside";
      return null;
    };
    const canPickShapeFromGroupPanel = (shapeId) => {
      const sid = Number(shapeId);
      if (!Number.isFinite(sid)) return false;
      const s = (state.shapes || []).find(sh => Number(sh.id) === sid);
      return getShapePickDenyReason(s) == null;
    };
    const getShapePickDenyReasonFromId = (shapeId) => {
      const sid = Number(shapeId);
      if (!Number.isFinite(sid)) return "outside";
      const s = (state.shapes || []).find(sh => Number(sh.id) === sid);
      return getShapePickDenyReason(s);
    };
    const canPickGroupFromGroupPanel = (groupId) => {
      const gid = Number(groupId);
      if (!Number.isFinite(gid)) return false;
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const byParent = new Map();
      for (const g of groups) {
        const pid = (g?.parentId == null) ? null : Number(g.parentId);
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(g);
      }
      const groupById = new Map(groups.map(g => [Number(g.id), g]));
      const root = groupById.get(gid);
      if (!root) return false;
      const q = [gid];
      const seen = new Set();
      let checkedShapeCount = 0;
      while (q.length) {
        const cur = Number(q.shift());
        if (!Number.isFinite(cur) || seen.has(cur)) continue;
        seen.add(cur);
        const g = groupById.get(cur);
        if (!g) continue;
        for (const sidRaw of (g.shapeIds || [])) {
          const sid = Number(sidRaw);
          if (!Number.isFinite(sid)) continue;
          const s = (state.shapes || []).find(sh => Number(sh.id) === sid);
          if (!s) continue;
          checkedShapeCount += 1;
          if (getShapePickDenyReason(s) != null) return false;
        }
        for (const child of (byParent.get(cur) || [])) {
          const cid = Number(child?.id);
          if (Number.isFinite(cid) && !seen.has(cid)) q.push(cid);
        }
      }
      return checkedShapeCount > 0;
    };
    const getGroupPickDenyReason = (groupId) => {
      const gid = Number(groupId);
      if (!Number.isFinite(gid)) return "outside";
      const groups = Array.isArray(state.groups) ? state.groups : [];
      const byParent = new Map();
      for (const g of groups) {
        const pid = (g?.parentId == null) ? null : Number(g.parentId);
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(g);
      }
      const groupById = new Map(groups.map(g => [Number(g.id), g]));
      const root = groupById.get(gid);
      if (!root) return "outside";
      const q = [gid];
      const seen = new Set();
      let anyShape = false;
      while (q.length) {
        const cur = Number(q.shift());
        if (!Number.isFinite(cur) || seen.has(cur)) continue;
        seen.add(cur);
        const g = groupById.get(cur);
        if (!g) continue;
        for (const sidRaw of (g.shapeIds || [])) {
          const sid = Number(sidRaw);
          if (!Number.isFinite(sid)) continue;
          const s = (state.shapes || []).find(sh => Number(sh.id) === sid);
          if (!s) continue;
          anyShape = true;
          const reason = getShapePickDenyReason(s);
          if (reason) return reason;
        }
        for (const child of (byParent.get(cur) || [])) {
          const cid = Number(child?.id);
          if (Number.isFinite(cid) && !seen.has(cid)) q.push(cid);
        }
      }
      return anyShape ? null : "outside";
    };

    const toggleGroupTreeExpandedByRow = (row, e) => {
      if (!row) return false;
      stopGroupPanelResizeDrag();
      const id = Number(row.dataset.groupRow);
      if (!Number.isFinite(id)) return false;
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      if (!state.ui.groupTreeExpanded) state.ui.groupTreeExpanded = {};
      state.ui.groupTreeExpanded[id] = !state.ui.groupTreeExpanded[id];
      if (e) e.preventDefault();
      refreshUi(state, dom);
      return true;
    };
    dom.groupList.addEventListener("mousedown", (e) => {
      if (e.button !== 0 || e.detail < 2) return;
      const objRow = e.target.closest?.("[data-group-shape-row]");
      if (objRow) return;
      const visCb = e.target.closest?.("input[data-group-visible]");
      if (visCb) return;
      const toggle = e.target.closest?.("button[data-group-toggle]");
      if (toggle) return;
      const row = e.target.closest?.("[data-group-row]");
      if (!row) return;
      toggleGroupTreeExpandedByRow(row, e);
    });
    dom.groupList.addEventListener("click", (e) => {
      if (Date.now() < suppressGroupListClickUntil) {
        e.preventDefault();
        return;
      }
      const t = toElementTarget(e.target);
      const objRow = t?.closest?.("[data-group-shape-row]");
      if (objRow) {
        const sid = Number(objRow.dataset.groupShapeRow);
        if (!canPickShapeFromGroupPanel(sid)) {
          showLayerRestrictionMessage(getShapePickDenyReasonFromId(sid));
          return;
        }
        if (e.shiftKey) actions.toggleShapeSelectionById?.(sid);
        else actions.selectShapeById?.(sid);
        return;
      }
      const toggle = t?.closest?.("button[data-group-toggle]");
      if (toggle) {
        const id = Number(toggle.dataset.groupToggle);
        if (!state.ui.groupTreeExpanded) state.ui.groupTreeExpanded = {};
        state.ui.groupTreeExpanded[id] = !state.ui.groupTreeExpanded[id];
        refreshUi(state, dom);
        return;
      }
      const visCb = t?.closest?.("input[data-group-visible]");
      if (visCb) {
        const gid = Number(visCb.getAttribute("data-group-visible"));
        if (Number.isFinite(gid)) {
          actions.setGroupVisible?.(gid, !!visCb.checked);
        }
        return;
      }
      const row = t?.closest?.("[data-group-row]");
      if (!row) return;
      const gid = Number(row.dataset.groupRow);
      if (!Number.isFinite(gid)) return;
      if (!canPickGroupFromGroupPanel(gid)) {
        showLayerRestrictionMessage(getGroupPickDenyReason(gid));
        return;
      }

      // Toggleボタンがクリックされた場合は、既に処理されているため帰る
      if (t?.closest?.("button[data-group-toggle]")) return;

      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      const shiftPressed = !!e.shiftKey;
      if (shiftPressed && typeof actions.toggleGroupSelection === "function") {
        actions.toggleGroupSelection(gid);
        return;
      }
      groupRowClickTimer = setTimeout(() => {
        groupRowClickTimer = null;
        actions.selectGroup(gid);
      }, 220);
    });
    dom.groupList.addEventListener("change", (e) => {
      const t = toElementTarget(e.target);
      const visCb = t?.closest?.("input[data-group-visible]");
      if (!visCb) return;
      const gid = Number(visCb.getAttribute("data-group-visible"));
      if (!Number.isFinite(gid)) return;
      actions.setGroupVisible?.(gid, !!visCb.checked);
    });
    dom.groupList.addEventListener("dblclick", (e) => {
      const t = toElementTarget(e.target);
      const objRow = t?.closest?.("[data-group-shape-row]");
      if (objRow) return;
      const row = t?.closest?.("[data-group-row]");
      if (!row) return;
      toggleGroupTreeExpandedByRow(row, e);
    });
    dom.groupList.addEventListener("dragstart", (e) => {
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      const t = toElementTarget(e.target);
      const objRow = t?.closest?.("[data-group-shape-row]");
      if (objRow) {
        const sid = Number(objRow.dataset.groupShapeRow);
        if (!Number.isFinite(sid)) return;
        if (!canPickShapeFromGroupPanel(sid)) {
          showLayerRestrictionMessage(getShapePickDenyReasonFromId(sid));
          e.preventDefault();
          return;
        }
        if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
        state.ui.groupDragDrop.draggingShapeId = sid;
        state.ui.groupDragDrop.draggingGroupId = null;
        state.ui.groupDragDrop.overGroupId = null;
        lastGroupDnDKind = "shape";
        try { e.dataTransfer.setData("text/plain", `shape:${sid}`); } catch (_) { }
        if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        return;
      }
      const row = t?.closest?.("[data-group-row]");
      if (!row) return;
      const gid = Number(row.dataset.groupRow);
      if (!Number.isFinite(gid)) return;
      if (!canPickGroupFromGroupPanel(gid)) {
        showLayerRestrictionMessage(getGroupPickDenyReason(gid));
        e.preventDefault();
        return;
      }
      if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
      state.ui.groupDragDrop.draggingGroupId = gid;
      state.ui.groupDragDrop.draggingShapeId = null;
      state.ui.groupDragDrop.overGroupId = null;
      lastGroupDnDKind = "group";
      try { e.dataTransfer.setData("text/plain", String(gid)); } catch (_) { }
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    dom.groupList.addEventListener("dragover", (e) => {
      const target = resolveGroupDropTarget(e.target);
      if (!target) return;
      e.preventDefault();
      const row = target.row;
      const sec = row?.closest?.(".section[data-panel-id='groups']") || dom.groupList.closest?.(".section[data-panel-id='groups']");
      sec?.classList.remove("dnd-over-root");
      const gid = Number(target.gid);
      if (!state.ui.groupDragDrop) state.ui.groupDragDrop = { draggingGroupId: null, draggingShapeId: null, overGroupId: null };
      if (state.ui.groupDragDrop.overGroupId !== gid) {
        state.ui.groupDragDrop.overGroupId = gid;
      }
      setGroupDropHoverRow(row);
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    });
    dom.groupList.addEventListener("dragleave", (e) => {
      const target = resolveGroupDropTarget(e.target);
      if (!target) return;
      const row = target.row;
      const related = e.relatedTarget;
      if (related && row && row.contains?.(related)) return;
      if (!state.ui.groupDragDrop) return;
      const gid = Number(target.gid);
      if (state.ui.groupDragDrop.overGroupId === gid) {
        state.ui.groupDragDrop.overGroupId = null;
      }
      if (row && currentGroupDropHoverRow === row) clearGroupDropHoverRow();
    });
    dom.groupList.addEventListener("drop", (e) => {
      if (lastGroupDnDKind === "shape") suppressGroupListClickUntil = Date.now() + 250;
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      const target = resolveGroupDropTarget(e.target);
      if (!target) return;
      e.preventDefault();
      clearGroupDropHoverRow();
      const row = target.row;
      const sec = row?.closest?.(".section[data-panel-id='groups']") || dom.groupList.closest?.(".section[data-panel-id='groups']");
      sec?.classList.remove("dnd-over-root");
      const parentId = Number(target.gid);
      const payload = parseDragPayload(e);
      const draggedGroupId = payload.groupId;
      const draggedShapeId = payload.shapeId;
      actions.debugStatus?.(`drop targetG=${parentId} dragG=${draggedGroupId ?? "null"} dragS=${draggedShapeId ?? "null"}`);
      if (Number.isFinite(draggedShapeId)) {
        actions.moveShapeToGroup?.(draggedShapeId, parentId);
      } else if (Number.isFinite(draggedGroupId)) {
        actions.selectGroup?.(draggedGroupId);
        actions.setActiveGroupParent?.(parentId);
      }
      if (state.ui.groupDragDrop) {
        state.ui.groupDragDrop.draggingGroupId = null;
        state.ui.groupDragDrop.draggingShapeId = null;
        state.ui.groupDragDrop.overGroupId = null;
      }
      // actions.setActiveGroupParent / actions.moveShapeToGroup already refresh.
    });
    dom.groupList.addEventListener("dragend", () => {
      if (lastGroupDnDKind === "shape") suppressGroupListClickUntil = Date.now() + 250;
      if (groupRowClickTimer) {
        clearTimeout(groupRowClickTimer);
        groupRowClickTimer = null;
      }
      clearGroupDropHoverRow();
      const sec = dom.groupList.closest?.(".section[data-panel-id='groups']");
      sec?.classList.remove("dnd-over-root");
      if (!state.ui.groupDragDrop) return;
      const _g = state.ui.groupDragDrop.draggingGroupId;
      const _s = state.ui.groupDragDrop.draggingShapeId;
      const _o = state.ui.groupDragDrop.overGroupId;
      const hadAnyDragState =
        (_g != null && Number.isFinite(Number(_g))) ||
        (_s != null && Number.isFinite(Number(_s))) ||
        (_o != null && Number.isFinite(Number(_o)));
      state.ui.groupDragDrop.draggingGroupId = null;
      state.ui.groupDragDrop.draggingShapeId = null;
      state.ui.groupDragDrop.overGroupId = null;
      if (hadAnyDragState) {
        refreshUi(state, dom);
      }
      lastGroupDnDKind = null;
    });
  }
  if (dom.moveGroupBtn) {
    dom.moveGroupBtn.addEventListener("click", () => {
      const dx = Number(dom.groupMoveDxInput?.value || 0);
      const dy = Number(dom.groupMoveDyInput?.value || 0);
      actions.moveActiveGroup(dx, dy);
    });
  }
  if (dom.copyGroupBtn) {
    dom.copyGroupBtn.addEventListener("click", () => {
      const dx = Number(dom.groupMoveDxInput?.value || 0);
      const dy = Number(dom.groupMoveDyInput?.value || 0);
      actions.copyActiveGroup?.(dx, dy);
    });
  }
  if (dom.moveGroupOriginOnlyBtn) {
    dom.moveGroupOriginOnlyBtn.addEventListener("click", () => {
      actions.beginMoveActiveGroupOriginOnly?.();
    });
  }
  if (dom.groupAimEnableToggle) {
    dom.groupAimEnableToggle.addEventListener("change", () => {
      actions.setActiveGroupAimEnabled?.(!!dom.groupAimEnableToggle.checked);
    });
  }
  if (dom.groupAimPickBtn) {
    dom.groupAimPickBtn.addEventListener("click", () => {
      actions.pickOrConfirmActiveGroupAimTarget?.();
    });
  }
  if (dom.groupAimClearBtn) {
    dom.groupAimClearBtn.addEventListener("click", () => {
      actions.clearActiveGroupAimTarget?.();
    });
  }
  if (dom.moveSelectedShapesBtn) {
    dom.moveSelectedShapesBtn.addEventListener("click", () => {
      const dx = Number(dom.selectMoveDxInput?.value || 0);
      const dy = Number(dom.selectMoveDyInput?.value || 0);
      actions.moveSelectedShapes?.(dx, dy);
    });
  }
  if (dom.copySelectedShapesBtn) {
    dom.copySelectedShapesBtn.addEventListener("click", () => {
      const dx = Number(dom.selectMoveDxInput?.value || 0);
      const dy = Number(dom.selectMoveDyInput?.value || 0);
      actions.copySelectedShapes?.(dx, dy);
    });
  }
  if (dom.selectionTextContentInput) {
    dom.selectionTextContentInput.addEventListener("input", (e) => {
      actions.updateSelectedTextSettings?.({ text: e.target.value });
    });
  }
  if (dom.selectionTextSizePtInput) {
    dom.selectionTextSizePtInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textSizePt: Number(e.target.value) || 12 });
    });
  }
  if (dom.selectionTextRotateInput) {
    dom.selectionTextRotateInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textRotate: Number(e.target.value) || 0 });
    });
  }
  if (dom.selectionTextFontFamilyInput) {
    dom.selectionTextFontFamilyInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textFontFamily: e.target.value });
    });
  }
  if (dom.selectionTextBoldInput) {
    dom.selectionTextBoldInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textBold: !!e.target.checked });
    });
  }
  if (dom.selectionTextItalicInput) {
    dom.selectionTextItalicInput.addEventListener("change", (e) => {
      actions.updateSelectedTextSettings?.({ textItalic: !!e.target.checked });
    });
  }
  bindColorInputPalette(dom.selectionTextColorInput, (c) => {
    actions.updateSelectedTextSettings?.({ textColor: c });
  });
  bindColorInputPalette(dom.selectionColorInput, (c) => {
    actions.setSelectedColor?.(c);
  });
  const runSelectMoveByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const dx = Number(dom.selectMoveDxInput?.value || 0);
    const dy = Number(dom.selectMoveDyInput?.value || 0);
    actions.moveSelectedShapes?.(dx, dy);
  };
  if (dom.selectMoveDxInput) {
    dom.selectMoveDxInput.addEventListener("keydown", runSelectMoveByEnter);
  }
  if (dom.selectMoveDyInput) {
    dom.selectMoveDyInput.addEventListener("keydown", runSelectMoveByEnter);
  }
  if (dom.groupRotateSnapInput) {
    dom.groupRotateSnapInput.addEventListener("change", () => {
      const v = Math.max(0.1, Number(dom.groupRotateSnapInput.value || 5));
      dom.groupRotateSnapInput.value = String(v);
      actions.setGroupRotateSnap(v);
    });
  }
  if (dom.moveVertexBtn) {
    dom.moveVertexBtn.addEventListener("click", () => {
      const dx = Number(dom.vertexMoveDxInput?.value || 0);
      const dy = Number(dom.vertexMoveDyInput?.value || 0);
      actions.moveSelectedVertices(dx, dy);
    });
  }
  const runVertexMoveByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const dx = Number(dom.vertexMoveDxInput?.value || 0);
    const dy = Number(dom.vertexMoveDyInput?.value || 0);
    actions.moveSelectedVertices(dx, dy);
  };
  if (dom.vertexMoveDxInput) {
    dom.vertexMoveDxInput.addEventListener("change", () => {
      actions.setVertexMoveInputs(Number(dom.vertexMoveDxInput.value || 0), null);
    });
    dom.vertexMoveDxInput.addEventListener("keydown", runVertexMoveByEnter);
  }
  if (dom.vertexMoveDyInput) {
    dom.vertexMoveDyInput.addEventListener("change", () => {
      actions.setVertexMoveInputs(null, Number(dom.vertexMoveDyInput.value || 0));
    });
    dom.vertexMoveDyInput.addEventListener("keydown", runVertexMoveByEnter);
  }
  if (dom.vertexLinkCoincidentToggle) {
    dom.vertexLinkCoincidentToggle.checked = state.vertexEdit?.linkCoincident !== false;
    dom.vertexLinkCoincidentToggle.addEventListener("change", () => {
      actions.setVertexLinkCoincident(!!dom.vertexLinkCoincidentToggle.checked);
    });
  }
  if (dom.applyLineInputBtn) {
    dom.applyLineInputBtn.addEventListener("click", () => {
      actions.setLineSizeLocked?.(null);
    });
  }
  if (dom.lineModeSelect) {
    dom.lineModeSelect.addEventListener("change", () => {
      const mode = String(dom.lineModeSelect.value || "segment").toLowerCase();
      const nextMode = (mode === "continuous" || mode === "freehand") ? mode : "segment";
      state.lineSettings.mode = nextMode;
      state.lineSettings.continuous = nextMode === "continuous";
    });
  }
  if (dom.lineTouchFinalizeBtn) {
    dom.lineTouchFinalizeBtn.addEventListener("click", () => {
      const modeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
      const mode = (modeRaw === "continuous" || modeRaw === "freehand") ? modeRaw : "segment";
      if (mode === "continuous") {
        actions.finalizePolylineDraft?.();
      } else if (mode === "freehand") {
        actions.finalizePolylineDraft?.();
      }
    });
  }
  const runLineApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const len = Number(dom.lineLengthInput?.value || 0);
    const ang = Number(dom.lineAngleInput?.value || 0);
    actions.setLineInputs(len, ang);
  };
  if (dom.lineLengthInput) {
    dom.lineLengthInput.addEventListener("change", () => {
      actions.setLineInputs(Number(dom.lineLengthInput.value || 0), null);
    });
    dom.lineLengthInput.addEventListener("keydown", runLineApplyByEnter);
  }
  if (dom.lineAngleInput) {
    dom.lineAngleInput.addEventListener("change", () => {
      actions.setLineInputs(null, Number(dom.lineAngleInput.value || 0));
    });
    dom.lineAngleInput.addEventListener("keydown", runLineApplyByEnter);
  }
  if (dom.lineAnchorSelect) {
    dom.lineAnchorSelect.addEventListener("change", () => {
      actions.setLineAnchor?.(dom.lineAnchorSelect.value || "endpoint_a");
    });
  }
  if (dom.applyRectInputBtn) {
    dom.applyRectInputBtn.addEventListener("click", () => {
      actions.setRectSizeLocked?.(null);
    });
  }
  const runRectApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const w = Number(dom.rectWidthInput?.value || 0);
    const h = Number(dom.rectHeightInput?.value || 0);
    actions.setRectInputs(w, h);
  };
  if (dom.rectWidthInput) {
    dom.rectWidthInput.addEventListener("change", () => {
      actions.setRectInputs(Number(dom.rectWidthInput.value || 0), null);
    });
    dom.rectWidthInput.addEventListener("keydown", runRectApplyByEnter);
  }
  if (dom.rectHeightInput) {
    dom.rectHeightInput.addEventListener("change", () => {
      actions.setRectInputs(null, Number(dom.rectHeightInput.value || 0));
    });
    dom.rectHeightInput.addEventListener("keydown", runRectApplyByEnter);
  }
  if (dom.rectAnchorSelect) {
    dom.rectAnchorSelect.addEventListener("change", () => {
      actions.setRectAnchor?.(dom.rectAnchorSelect.value || "c");
    });
  }
  if (dom.applyCircleInputBtn) {
    dom.applyCircleInputBtn.addEventListener("click", () => {
      actions.setCircleRadiusLocked?.(null);
    });
  }
  if (dom.circleModeSelect) {
    dom.circleModeSelect.addEventListener("change", () => {
      actions.setCircleMode?.(dom.circleModeSelect.value || "drag");
    });
  }
  if (dom.circleThreePointAddBtn) {
    dom.circleThreePointAddBtn.addEventListener("click", () => {
      actions.registerCircleThreePointTargetFromSelection?.();
    });
  }
  if (dom.circleThreePointRunBtn) {
    dom.circleThreePointRunBtn.addEventListener("click", () => {
      actions.executeCircleThreePointFromTargets?.();
    });
  }
  const runCircleApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const r = Number(dom.circleRadiusInput?.value || 0);
    actions.setCircleRadiusInput(r);
  };
  if (dom.circleRadiusInput) {
    dom.circleRadiusInput.addEventListener("change", () => {
      actions.setCircleRadiusInput(Number(dom.circleRadiusInput.value || 0));
    });
    dom.circleRadiusInput.addEventListener("keydown", runCircleApplyByEnter);
  }
  if (dom.circleCenterMarkToggle) {
    dom.circleCenterMarkToggle.addEventListener("change", () => {
      const on = !!dom.circleCenterMarkToggle.checked;
      state.circleSettings.showCenterMark = on;
      actions.setSelectionCircleCenterMark(on);
    });
  }
  if (dom.filletRadiusInput) {
    dom.filletRadiusInput.addEventListener("input", () => {
      const raw = String(dom.filletRadiusInput.value || "").trim();
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      actions.setFilletRadius(Math.max(0.1, n));
    });
    dom.filletRadiusInput.addEventListener("change", () => {
      const v = Math.max(0.1, Number(dom.filletRadiusInput.value || 20));
      dom.filletRadiusInput.value = String(v);
      actions.setFilletRadius(v);
    });
    dom.filletRadiusInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const r = Number(dom.filletRadiusInput?.value || 0);
      actions.applyFillet(r);
    });
  }
  if (dom.applyFilletBtn) {
    dom.applyFilletBtn.addEventListener("click", () => {
      const r = Number(dom.filletRadiusInput?.value || 0);
      actions.applyFillet(r);
    });
  }
  if (dom.filletLineModeSelect) {
    dom.filletLineModeSelect.addEventListener("change", () => {
      const v = String(dom.filletLineModeSelect.value || "split").toLowerCase();
      actions.setFilletLineMode(v === "split" ? "split" : "trim");
    });
  }
  if (dom.selectionLineWidthInput) {
    const applySelectionLineWidth = () => {
      const v = normalizeLineWidthPreset(dom.selectionLineWidthInput.value);
      dom.selectionLineWidthInput.value = String(v);
      actions.setSelectedLineWidthMm?.(v);
    };
    dom.selectionLineWidthInput.addEventListener("change", applySelectionLineWidth);
    dom.selectionLineWidthInput.addEventListener("input", applySelectionLineWidth);
  }
  if (dom.selectionLineTypeInput) {
    const applySelectionLineType = () => {
      const v = normalizeLineTypePreset(dom.selectionLineTypeInput.value);
      dom.selectionLineTypeInput.value = v;
      actions.setSelectedLineType?.(v);
    };
    dom.selectionLineTypeInput.addEventListener("change", applySelectionLineType);
    dom.selectionLineTypeInput.addEventListener("input", applySelectionLineType);
  }
  if (dom.selectionPositionSizeInput) {
    const applySelectionPositionSize = () => {
      const v = Math.max(1, Number(dom.selectionPositionSizeInput.value || 20));
      dom.selectionPositionSizeInput.value = String(v);
      actions.setPositionSize?.(v);
    };
    dom.selectionPositionSizeInput.addEventListener("change", applySelectionPositionSize);
    dom.selectionPositionSizeInput.addEventListener("input", applySelectionPositionSize);
  }
  if (dom.selectionImageWidthInput) {
    const applySelectionImageWidth = () => {
      const v = Math.max(1, Number(dom.selectionImageWidthInput.value || 1));
      dom.selectionImageWidthInput.value = String(v);
      actions.updateSelectedImageSettings?.({ width: v });
    };
    dom.selectionImageWidthInput.addEventListener("change", applySelectionImageWidth);
    dom.selectionImageWidthInput.addEventListener("input", applySelectionImageWidth);
  }
  if (dom.selectionImageHeightInput) {
    const applySelectionImageHeight = () => {
      const v = Math.max(1, Number(dom.selectionImageHeightInput.value || 1));
      dom.selectionImageHeightInput.value = String(v);
      actions.updateSelectedImageSettings?.({ height: v });
    };
    dom.selectionImageHeightInput.addEventListener("change", applySelectionImageHeight);
    dom.selectionImageHeightInput.addEventListener("input", applySelectionImageHeight);
  }
  if (dom.selectionImageLockAspectToggle) {
    dom.selectionImageLockAspectToggle.addEventListener("change", () => {
      actions.updateSelectedImageSettings?.({ lockAspect: !!dom.selectionImageLockAspectToggle.checked });
    });
  }
  if (dom.selectionImageLockTransformToggle) {
    dom.selectionImageLockTransformToggle.addEventListener("change", () => {
      actions.updateSelectedImageSettings?.({ lockTransform: !!dom.selectionImageLockTransformToggle.checked });
    });
  }
  if (dom.selectionCircleCenterMarkToggle) {
    dom.selectionCircleCenterMarkToggle.addEventListener("change", () => {
      actions.setSelectionCircleCenterMark?.(!!dom.selectionCircleCenterMarkToggle.checked);
    });
  }
  if (dom.selectionApplyCircleRadiusBtn) {
    dom.selectionApplyCircleRadiusBtn.addEventListener("click", () => {
      const r = Number(dom.selectionCircleRadiusInput?.value || 0);
      actions.applyCircleInput?.(r);
    });
  }
  const runSelectionCircleApplyByEnter = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const r = Number(dom.selectionCircleRadiusInput?.value || 0);
    actions.applyCircleInput?.(r);
  };
  if (dom.selectionCircleRadiusInput) {
    dom.selectionCircleRadiusInput.addEventListener("keydown", runSelectionCircleApplyByEnter);
  }
  if (dom.filletNoTrimToggle) {
    dom.filletNoTrimToggle.addEventListener("change", () => {
      actions.setFilletNoTrim?.(!!dom.filletNoTrimToggle.checked);
    });
  }
  if (dom.trimNoDeleteToggle) {
    dom.trimNoDeleteToggle.addEventListener("change", () => {
      actions.setTrimNoDelete(!!dom.trimNoDeleteToggle.checked);
    });
  }
  if (dom.objSnapTangentKeepToggle) {
    dom.objSnapTangentKeepToggle.addEventListener("change", () => {
      if (!state.objectSnap) state.objectSnap = {};
      const on = !!dom.objSnapTangentKeepToggle.checked;
      state.objectSnap.keepAttributes = on;
      state.objectSnap.tangentKeep = on; // legacy alias
    });
  }
  if (dom.positionSizeInput) {
    dom.positionSizeInput.addEventListener("change", () => {
      const v = Math.max(1, Number(dom.positionSizeInput.value || 20));
      dom.positionSizeInput.value = String(v);
      actions.setPositionSize(v);
    });
  }
  if (dom.textContentInput) {
    dom.textContentInput.addEventListener("input", () => actions.setTextSettings({ content: dom.textContentInput.value }));
  }
  if (dom.textSizePtInput) {
    dom.textSizePtInput.addEventListener("change", () => actions.setTextSettings({ sizePt: Number(dom.textSizePtInput.value) || 12 }));
  }
  if (dom.textRotateInput) {
    dom.textRotateInput.addEventListener("change", () => actions.setTextSettings({ rotate: Number(dom.textRotateInput.value) || 0 }));
  }
  if (dom.textFontFamilyInput) {
    dom.textFontFamilyInput.addEventListener("change", () => actions.setTextSettings({ fontFamily: dom.textFontFamilyInput.value }));
  }
  if (dom.textBoldInput) {
    dom.textBoldInput.addEventListener("change", () => actions.setTextSettings({ bold: !!dom.textBoldInput.checked }));
  }
  if (dom.textItalicInput) {
    dom.textItalicInput.addEventListener("change", () => actions.setTextSettings({ italic: !!dom.textItalicInput.checked }));
  }
  bindColorInputPalette(dom.textColorInput, (c) => {
    actions.setTextSettings({ color: c });
  });
  if (dom.dimLinearMode) dom.dimLinearMode.addEventListener("change", () => actions.setDimSettings({ linearMode: dom.dimLinearMode.value }));
  if (dom.dimIgnoreGridSnapToggle) dom.dimIgnoreGridSnapToggle.addEventListener("change", () => actions.setDimSettings({ ignoreGridSnap: !!dom.dimIgnoreGridSnapToggle.checked }));
  if (dom.dimCircleMode) dom.dimCircleMode.addEventListener("change", () => actions.setDimSettings({ circleMode: dom.dimCircleMode.value }));
  if (dom.dimCircleArrowSide) {
    dom.dimCircleArrowSide.addEventListener("change", () => {
      const v = (dom.dimCircleArrowSide.value === "inside") ? "inside" : "outside";
      actions.setDimSettings({ circleArrowSide: v });
      actions.applyDimSettingsToSelection({ circleArrowSide: v });
    });
  }
  if (dom.dimPrecisionSelect) {
    dom.dimPrecisionSelect.addEventListener("change", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.dimPrecisionSelect.value) || 0)));
      actions.setDimSettings({ precision: p });
      actions.applyDimSettingsToSelection({ precision: p });
    });
  }
  if (dom.dimArrowTypeSelect) {
    dom.dimArrowTypeSelect.addEventListener("change", () => {
      const raw = String(dom.dimArrowTypeSelect.value || "open").toLowerCase();
      const v = (raw === "closed" || raw === "hollow" || raw === "circle" || raw === "circle_filled") ? raw : "open";
      actions.setDimSettings({ dimArrowType: v });
      actions.applyDimSettingsToSelection({ dimArrowType: v });
    });
  }
  if (dom.dimArrowSizeInput) {
    dom.dimArrowSizeInput.addEventListener("change", () => {
      const v = Math.max(1, Number(dom.dimArrowSizeInput.value) || 10);
      dom.dimArrowSizeInput.value = String(v);
      actions.setDimSettings({ dimArrowSize: v });
      actions.applyDimSettingsToSelection({ dimArrowSizePt: v });
    });
  }
  if (dom.dimArrowDirectionSelect) {
    dom.dimArrowDirectionSelect.addEventListener("change", () => {
      const v = (String(dom.dimArrowDirectionSelect.value) === "reverse") ? "reverse" : "normal";
      actions.setDimSettings({ dimArrowDirection: v });
      actions.applyDimSettingsToSelection({ dimArrowDirection: v });
    });
  }
  if (dom.dimFontSizeInput) {
    dom.dimFontSizeInput.addEventListener("change", () => {
      const v = Math.max(1, Number(dom.dimFontSizeInput.value) || 12);
      dom.dimFontSizeInput.value = String(v);
      actions.setDimSettings({ fontSize: v });
      actions.applyDimSettingsToSelection({ fontSize: v });
    });
  }
  if (dom.dimTextRotateInput) dom.dimTextRotateInput.addEventListener("change", () => {
    const val = dom.dimTextRotateInput.value;
    const tv = val === "auto" ? "auto" : (Number(val) || 0);
    actions.setDimSettings({ textRotate: tv });
    actions.applyDimSettingsToSelection({ textRotate: tv });
  });
  if (dom.dimExtOffsetInput) dom.dimExtOffsetInput.addEventListener("change", () => {
    const v = Number(dom.dimExtOffsetInput.value) || 0;
    actions.setDimSettings({ extOffset: v });
    actions.applyDimSettingsToSelection({ extOffset: v });
  });
  if (dom.dimExtOverInput) dom.dimExtOverInput.addEventListener("change", () => {
    const v = Number(dom.dimExtOverInput.value) || 0;
    actions.setDimSettings({ extOver: v });
    actions.applyDimSettingsToSelection({ extOver: v });
  });
  if (dom.dimROvershootInput) dom.dimROvershootInput.addEventListener("change", () => {
    const n = Number(dom.dimROvershootInput.value);
    const v = Number.isFinite(n) ? Math.max(0, n) : 5;
    dom.dimROvershootInput.value = String(v);
    actions.setDimSettings({ rOvershoot: v });
    actions.applyDimSettingsToSelection({ rOverrun: v });
  });
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.addEventListener("click", () => {
      actions.mergeSelectedShapesToGroup?.();
    });
  }
  if (dom.dimMergeGroupsBtn) {
    dom.dimMergeGroupsBtn.addEventListener("click", () => {
      actions.mergeSelectedShapesToGroup?.();
    });
  }
  if (dom.dimChainPopBtn) dom.dimChainPopBtn.addEventListener("click", () => actions.popDimChainPoint());
  if (dom.dimChainPrepareBtn) {
    dom.dimChainPrepareBtn.addEventListener("click", () => {
      if (state.tool !== "dim" || String(state.dimSettings?.linearMode || "single") !== "chain") return;
      if (!state.dimDraft || state.dimDraft.type !== "dimchain") return;
      if ((state.dimDraft.points || []).length < 2) return;
      state.dimDraft.awaitingPlacement = true;
      actions.setStatus?.("Chain dim: click to place dimension line.");
      actions.render?.();
    });
  }
  if (dom.dimChainFinalizeBtn) {
    dom.dimChainFinalizeBtn.addEventListener("click", () => {
      if (state.tool !== "dim" || String(state.dimSettings?.linearMode || "single") !== "chain") return;
      if (!state.dimDraft || state.dimDraft.type !== "dimchain") return;
      if (!(state.dimDraft.awaitingPlacement && state.dimDraft.place)) return;
      actions.finalizeDimDraft?.();
      actions.setStatus?.("Dim finished");
      actions.render?.();
    });
  }
  if (dom.applyDimSettingsBtn) {
    dom.applyDimSettingsBtn.addEventListener("click", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.dimPrecisionSelect?.value) || 0)));
      const tv = dom.dimTextRotateInput?.value;
      actions.applyDimSettingsToSelection({
        precision: p,
        circleArrowSide: (dom.dimCircleArrowSide?.value === "inside") ? "inside" : "outside",
        fontSize: Math.max(1, Number(dom.dimFontSizeInput?.value) || 12),
        textRotate: tv === "auto" ? "auto" : (Number(tv) || 0),
        extOffset: Number(dom.dimExtOffsetInput?.value) || 0,
        extOver: Number(dom.dimExtOverInput?.value) || 0,
      });
    });
  }
  if (dom.previewPrecisionSelect) {
    dom.previewPrecisionSelect.addEventListener("change", () => {
      const p = Math.max(0, Math.min(3, Math.round(Number(dom.previewPrecisionSelect.value) || 0)));
      dom.previewPrecisionSelect.value = String(p);
      actions.setPreviewPrecision(p);
    });
  }
  if (dom.pageSizeSelect) {
    dom.pageSizeSelect.addEventListener("change", () => actions.setPageSetup({ size: dom.pageSizeSelect.value }));
  }
  if (dom.pageOrientationSelect) {
    dom.pageOrientationSelect.addEventListener("change", () => actions.setPageSetup({ orientation: dom.pageOrientationSelect.value }));
  }
  if (dom.pageScaleInput) {
    const applyPageScalePreset = () => {
      const v = normalizePageScalePreset(dom.pageScaleInput.value);
      dom.pageScaleInput.value = String(v);
      actions.setPageSetup({ scale: v });
      actions.resetView?.();
    };
    dom.pageScaleInput.addEventListener("change", applyPageScalePreset);
    dom.pageScaleInput.addEventListener("input", applyPageScalePreset);
  }
  if (dom.maxZoomInput) {
    dom.maxZoomInput.addEventListener("change", () => {
      const v = normalizeMaxZoomPreset(dom.maxZoomInput.value);
      dom.maxZoomInput.value = String(v);
      actions.setMaxZoomScale?.(v);
    });
  }
  if (dom.uiLanguageSelect) {
    dom.uiLanguageSelect.addEventListener("change", () => {
      actions.setLanguage?.(dom.uiLanguageSelect.value || "ja");
    });
  }
  if (dom.menuScaleSelect) {
    dom.menuScaleSelect.addEventListener("change", () => {
      const v = normalizeMenuScalePreset(dom.menuScaleSelect.value);
      dom.menuScaleSelect.value = String(v);
      actions.setMenuScalePct?.(v);
    });
  }
  if (dom.touchModeToggle) {
    dom.touchModeToggle.addEventListener("change", () => {
      actions.setTouchMode?.(!!dom.touchModeToggle.checked);
    });
  }
  if (dom.touchConfirmBtn) {
    dom.touchConfirmBtn.addEventListener("click", () => {
      if (!state.ui?.touchMode) return;
      const tool = String(state.tool || "");
      const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
      const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
      if (tool === "line" && (lineMode === "continuous" || lineMode === "freehand")) {
        actions.finalizePolylineDraft?.();
        return;
      }
      if (tool === "dim" && String(state.dimSettings?.linearMode || "single") === "chain") {
        const draft = state.dimDraft;
        if (draft && draft.type === "dimchain") {
          if (!draft.awaitingPlacement && (draft.points || []).length >= 2) {
            draft.awaitingPlacement = true;
            actions.setStatus?.("Chain dim: click to place dimension line.");
            actions.render?.();
            return;
          }
          if (draft.awaitingPlacement && draft.place) {
            actions.finalizeDimDraft?.();
            actions.setStatus?.("Dim finished");
            actions.render?.();
            return;
          }
        }
      }
      if (tool === "circle") {
        const modeRaw = String(state.circleSettings?.mode || "").toLowerCase();
        const mode = (modeRaw === "fixed" || modeRaw === "threepoint" || modeRaw === "drag")
          ? modeRaw
          : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
        if (mode === "threepoint") {
          actions.executeCircleThreePointFromTargets?.();
          return;
        }
      }
      if (tool === "patterncopy") {
        actions.executePatternCopy?.();
        return;
      }
      if (tool === "fillet") {
        const r = Number(dom.filletRadiusInput?.value || 0);
        actions.applyFillet?.(r);
        return;
      }
      if (tool === "doubleline") {
        actions.executeDoubleLine?.();
        return;
      }
      if (tool === "hatch") {
        actions.executeHatch?.();
      }
    });
  }
  if (dom.touchSelectBackBtn) {
    dom.touchSelectBackBtn.addEventListener("click", () => {
      if (!state.ui?.touchMode) return;
      actions.setTool?.("select");
    });
  }
  if (dom.fpsDisplayToggle) {
    dom.fpsDisplayToggle.addEventListener("change", () => {
      actions.setFpsDisplay?.(!!dom.fpsDisplayToggle.checked);
    });
  }
  if (dom.objectCountDisplayToggle) {
    dom.objectCountDisplayToggle.addEventListener("change", () => {
      actions.setObjectCountDisplay?.(!!dom.objectCountDisplayToggle.checked);
    });
  }
  if (dom.autoBackupToggle) {
    dom.autoBackupToggle.addEventListener("change", () => {
      actions.setAutoBackupEnabled?.(!!dom.autoBackupToggle.checked);
    });
  }
  if (dom.autoBackupIntervalSelect) {
    dom.autoBackupIntervalSelect.addEventListener("change", () => {
      const sec = Math.max(60, Math.min(600, Math.round(Number(dom.autoBackupIntervalSelect.value) || 60)));
      dom.autoBackupIntervalSelect.value = String(sec);
      actions.setAutoBackupIntervalSec?.(sec);
    });
  }
  if (dom.pageUnitSelect) {
    dom.pageUnitSelect.addEventListener("change", () => actions.setPageSetup({ unit: dom.pageUnitSelect.value }));
  }
  if (dom.toolShortcutList) {
    dom.toolShortcutList.addEventListener("change", (e) => {
      const sel = e.target?.closest?.("select[data-tool-shortcut]");
      if (!sel) return;
      const tool = String(sel.dataset.toolShortcut || "");
      const key = String(sel.value || "").toUpperCase();
      actions.setToolShortcut?.(tool, key);
    });
  }
  if (dom.resetToolShortcutsBtn) {
    dom.resetToolShortcutsBtn.addEventListener("click", () => {
      actions.resetToolShortcuts?.();
      refreshUi(state, dom);
    });
  }
  const toolStrokeControls = [
    { tool: "line", width: dom.lineToolLineWidthInput, type: dom.lineToolLineTypeInput },
    { tool: "rect", width: dom.rectToolLineWidthInput, type: dom.rectToolLineTypeInput },
    { tool: "circle", width: dom.circleToolLineWidthInput, type: dom.circleToolLineTypeInput },
    { tool: "fillet", width: dom.filletToolLineWidthInput, type: dom.filletToolLineTypeInput },
    { tool: "position", width: dom.positionToolLineWidthInput, type: dom.positionToolLineTypeInput },
    { tool: "text", width: dom.textToolLineWidthInput, type: dom.textToolLineTypeInput },
    { tool: "dim", width: dom.dimToolLineWidthInput, type: dom.dimToolLineTypeInput },
    { tool: "hatch", width: dom.hatchToolLineWidthInput, type: null },
    { tool: "doubleline", width: dom.dlineToolLineWidthInput, type: dom.dlineToolLineTypeInput },
  ];
  for (const ctl of toolStrokeControls) {
    if (ctl.width) {
      const applyLineWidth = () => {
        const v = normalizeLineWidthPreset(ctl.width.value);
        ctl.width.value = String(v);
        actions.setLineWidthMm?.(v, ctl.tool);
        if (ctl.tool === "dim") {
          actions.applyDimSettingsToSelection?.({ lineWidthMm: v });
        }
      };
      ctl.width.addEventListener("change", applyLineWidth);
      ctl.width.addEventListener("input", applyLineWidth);
    }
    if (ctl.type) {
      const applyLineType = () => {
        const v = normalizeLineTypePreset(ctl.type.value);
        ctl.type.value = v;
        actions.setToolLineType?.(v, ctl.tool);
        if (ctl.tool === "dim") {
          actions.applyDimSettingsToSelection?.({ lineType: v });
        }
      };
      ctl.type.addEventListener("change", applyLineType);
      ctl.type.addEventListener("input", applyLineType);
    }
  }
  if (dom.pageShowFrameToggle) {
    dom.pageShowFrameToggle.addEventListener("change", () => actions.setPageSetup({ showFrame: !!dom.pageShowFrameToggle.checked }));
  }
  if (dom.pageInnerMarginInput) {
    dom.pageInnerMarginInput.addEventListener("change", () => {
      const v = Math.max(0, Number(dom.pageInnerMarginInput.value || 0));
      dom.pageInnerMarginInput.value = String(v);
      actions.setPageSetup({ innerMarginMm: v });
    });
  }
  if (dom.hatchPitchInput) {
    dom.hatchPitchInput.addEventListener("change", () => actions.setHatchSettings({ pitchMm: Number(dom.hatchPitchInput.value) || 5 }));
  }
  if (dom.hatchAngleInput) {
    dom.hatchAngleInput.addEventListener("change", () => actions.setHatchSettings({ angleDeg: Number(dom.hatchAngleInput.value) || 0 }));
  }
  if (dom.hatchPaddingInput) {
    dom.hatchPaddingInput.addEventListener("change", () => actions.setHatchSettings({ repetitionPaddingMm: Number(dom.hatchPaddingInput.value) || 0 }));
  }
  if (dom.hatchAltShiftInput) {
    dom.hatchAltShiftInput.addEventListener("change", () => actions.setHatchSettings({ lineShiftMm: Number(dom.hatchAltShiftInput.value) || 0 }));
  }
  if (dom.hatchFillToggle) {
    dom.hatchFillToggle.addEventListener("change", () => actions.setHatchSettings({ fillEnabled: !!dom.hatchFillToggle.checked }));
  }
  bindColorInputPalette(dom.hatchFillColorInput, (c) => {
    actions.setHatchSettings({ fillColor: c });
  });
  bindColorInputPalette(dom.hatchLineColorInput, (c) => {
    actions.setHatchSettings({ lineColor: c });
  });
  if (dom.hatchToolLineWidthInput) {
    const applyHatchLineWidth = () => {
      const v = normalizeLineWidthPreset(dom.hatchToolLineWidthInput.value);
      dom.hatchToolLineWidthInput.value = String(v);
      actions.setHatchSettings({ lineWidthMm: v });
    };
    dom.hatchToolLineWidthInput.addEventListener("change", applyHatchLineWidth);
    dom.hatchToolLineWidthInput.addEventListener("input", applyHatchLineWidth);
  }
  if (dom.hatchDashMmInput) {
    dom.hatchDashMmInput.addEventListener("change", () => actions.setHatchSettings({ lineDashMm: Number(dom.hatchDashMmInput.value) || 5 }));
  }
  if (dom.hatchGapMmInput) {
    dom.hatchGapMmInput.addEventListener("change", () => actions.setHatchSettings({ lineGapMm: Number(dom.hatchGapMmInput.value) || 2 }));
  }
  if (dom.applyHatchBtn) {
    dom.applyHatchBtn.addEventListener("click", () => actions.executeHatch());
  }

  if (dom.dlineOffsetInput) {
    dom.dlineOffsetInput.addEventListener("input", () => {
      if (actions.cancelDoubleLineTrimPending) actions.cancelDoubleLineTrimPending();
      state.dlineSettings.offset = Number(dom.dlineOffsetInput.value) || 10;
      refreshUiDeferred();
    });
  }
  if (dom.dlineModeSelect) {
    dom.dlineModeSelect.addEventListener("change", () => {
      if (actions.cancelDoubleLineTrimPending) actions.cancelDoubleLineTrimPending();
      state.dlineSettings.mode = dom.dlineModeSelect.value;
      refreshUiDeferred();
    });
  }
  if (dom.dlineNoTrimToggle) {
    dom.dlineNoTrimToggle.addEventListener("change", () => {
      if (actions.cancelDoubleLineTrimPending) actions.cancelDoubleLineTrimPending();
      state.dlineSettings.noTrim = !!dom.dlineNoTrimToggle.checked;
      refreshUiDeferred();
    });
  }
  if (dom.applyDLineBtn) {
    dom.applyDLineBtn.addEventListener("click", () => actions.executeDoubleLine());
  }
  if (dom.patternCopyModeSelect) {
    dom.patternCopyModeSelect.addEventListener("change", () => actions.setPatternCopyMode(dom.patternCopyModeSelect.value));
  }
  if (dom.patternCopyArrayDxInput) {
    dom.patternCopyArrayDxInput.addEventListener("change", () => {
      state.patternCopySettings.arrayDx = Number(dom.patternCopyArrayDxInput.value) || 0;
    });
  }
  if (dom.patternCopyArrayDyInput) {
    dom.patternCopyArrayDyInput.addEventListener("change", () => {
      state.patternCopySettings.arrayDy = Number(dom.patternCopyArrayDyInput.value) || 0;
    });
  }
  if (dom.patternCopyArrayCountXInput) {
    dom.patternCopyArrayCountXInput.addEventListener("change", () => {
      state.patternCopySettings.arrayCountX = Math.max(1, Math.round(Number(dom.patternCopyArrayCountXInput.value) || 1));
    });
  }
  if (dom.patternCopyArrayCountYInput) {
    dom.patternCopyArrayCountYInput.addEventListener("change", () => {
      state.patternCopySettings.arrayCountY = Math.max(1, Math.round(Number(dom.patternCopyArrayCountYInput.value) || 1));
    });
  }
  if (dom.patternCopyRotateAngleInput) {
    dom.patternCopyRotateAngleInput.addEventListener("change", () => {
      state.patternCopySettings.rotateAngleDeg = Number(dom.patternCopyRotateAngleInput.value) || 0;
    });
  }
  if (dom.patternCopyRotateCountInput) {
    dom.patternCopyRotateCountInput.addEventListener("change", () => {
      state.patternCopySettings.rotateCount = Math.max(1, Math.round(Number(dom.patternCopyRotateCountInput.value) || 1));
    });
  }
  if (dom.patternCopySetCenterBtn) {
    dom.patternCopySetCenterBtn.addEventListener("click", () => {
      if (state.input.patternCopyFlow.centerPositionId) {
        actions.clearPatternCopyCenter();
      } else {
        actions.setPatternCopyCenterFromSelection();
      }
    });
  }
  if (dom.patternCopySetAxisBtn) {
    dom.patternCopySetAxisBtn.addEventListener("click", () => {
      if (state.input.patternCopyFlow.axisLineId) {
        actions.clearPatternCopyAxis();
      } else {
        actions.setPatternCopyAxisFromSelection();
      }
    });
  }
  if (dom.patternCopyApplyBtn) {
    dom.patternCopyApplyBtn.addEventListener("click", () => actions.executePatternCopy());
  }
  if (dom.attrAddBtn) {
    dom.attrAddBtn.addEventListener("click", () => {
      const name = String(dom.attrNameInput?.value || "").trim();
      if (!name) return;
      const value = String(dom.attrValueInput?.value || "");
      actions.addSelectedAttribute?.(name, value, "object");
      if (dom.attrNameInput) dom.attrNameInput.value = "";
      if (dom.attrValueInput) dom.attrValueInput.value = "";
    });
  }
  if (dom.attrList) {
    dom.attrList.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-attr-remove]");
      if (!btn) return;
      const attrId = btn.getAttribute("data-attr-remove");
      if (!attrId) return;
      actions.removeSelectedAttribute?.(attrId);
    });
    dom.attrList.addEventListener("change", (e) => {
      const inp = e.target.closest?.("input[data-attr-id][data-attr-field]");
      if (!inp) return;
      const attrId = inp.getAttribute("data-attr-id");
      const field = inp.getAttribute("data-attr-field");
      if (!attrId || !field) return;
      if (field === "name") actions.updateSelectedAttribute?.(attrId, { name: inp.value });
      if (field === "value") actions.updateSelectedAttribute?.(attrId, { value: inp.value });
    });
  }
}

function refreshLeftMenuVisibilitySettings(state, dom) {
  const host = dom.leftMenuVisibilityList;
  if (!host) return;
  const nodes = Array.from(document.querySelectorAll(".sidebar [data-menu-item-key]"));
  host.innerHTML = "";
  const lang = getUiLanguage(state);
  const groupOrder = ["snap", "create", "edit", "file", "other"];
  const groupTitle = (g) => {
    if (lang === "en") {
      if (g === "snap") return "Snap";
      if (g === "create") return "Create";
      if (g === "edit") return "Edit";
      if (g === "file") return "File";
      return "Other";
    }
    if (g === "snap") return "スナップ";
    if (g === "create") return "作成";
    if (g === "edit") return "編集";
    if (g === "file") return "ファイル";
    return "その他";
  };
  const byGroup = new Map();
  for (const g of groupOrder) byGroup.set(g, []);
  for (const node of nodes) {
    const key = String(node.getAttribute("data-menu-item-key") || "");
    if (!key) continue;
    const isFlyout = node.classList?.contains?.("left-flyout");
    const labelText = isFlyout
      ? String(node.querySelector(".left-flyout-main")?.textContent || "").trim()
      : String(node.textContent || "").trim();
    if (!labelText) continue;
    const rawGroup = String(node.getAttribute("data-menu-group") || "").toLowerCase();
    const group = (rawGroup === "snap" || rawGroup === "create" || rawGroup === "edit" || rawGroup === "file")
      ? rawGroup
      : "other";
    byGroup.get(group).push({ key, labelText });
  }
  for (const group of groupOrder) {
    const items = byGroup.get(group) || [];
    if (!items.length) continue;
    const title = document.createElement("div");
    title.textContent = groupTitle(group);
    title.style.gridColumn = "1 / -1";
    title.style.fontSize = "12px";
    title.style.fontWeight = "700";
    title.style.color = "#334155";
    title.style.marginTop = "4px";
    host.appendChild(title);
    for (const item of items) {
      const key = item.key;
      const labelText = item.labelText;
    const row = document.createElement("label");
    row.style.display = "inline-flex";
    row.style.alignItems = "center";
    row.style.gap = "4px";
    row.style.justifyContent = "flex-start";
    row.style.fontSize = "12px";
    row.style.whiteSpace = "nowrap";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.style.marginLeft = "0";
    cb.checked = isLeftMenuItemVisible(state, key);
    if (key === "tool:settings") cb.disabled = true;
    cb.addEventListener("change", () => {
      if (!state.ui) state.ui = {};
      if (!state.ui.leftMenuVisibility || typeof state.ui.leftMenuVisibility !== "object") state.ui.leftMenuVisibility = {};
      state.ui.leftMenuVisibility[key] = !!cb.checked;
      refreshUi(state, dom);
    });
    const span = document.createElement("span");
    span.textContent = labelText;
    row.append(cb, span);
    host.appendChild(row);
  }
  }
}

function refreshToolShortcutSettings(state, dom) {
  const host = dom.toolShortcutList;
  if (!host) return;
  const lang = getUiLanguage(state);
  const labels = (lang === "en")
    ? {
      select: "Select",
      line: "Line",
      rect: "Rectangle",
      circle: "Circle",
      position: "Position",
      dim: "Dimension",
      text: "Text",
      vertex: "Vertex",
      fillet: "Fillet",
      trim: "Trim",
      hatch: "Hatching",
      doubleline: "Double Line",
      patterncopy: "Pattern Copy",
      none: "(None)",
    }
    : {
      select: "選択",
      line: "線",
      rect: "四角",
      circle: "円",
      position: "位置",
      dim: "寸法線",
      text: "テキスト",
      vertex: "頂点編集",
      fillet: "フィレット",
      trim: "トリム",
      hatch: "ハッチング",
      doubleline: "二重線",
      patterncopy: "パターンコピー",
      none: "(なし)",
    };
  const shortcuts = sanitizeToolShortcuts(state?.ui?.toolShortcuts);
  host.innerHTML = "";
  for (const tool of TOOL_SHORTCUT_TOOL_ORDER) {
    const row = document.createElement("label");
    row.style.display = "inline-flex";
    row.style.alignItems = "center";
    row.style.gap = "6px";
    row.style.justifyContent = "space-between";
    row.style.fontSize = "12px";
    row.style.whiteSpace = "nowrap";
    const title = document.createElement("span");
    title.textContent = labels[tool] || tool;
    const select = document.createElement("select");
    select.dataset.toolShortcut = tool;
    const optNone = document.createElement("option");
    optNone.value = "";
    optNone.textContent = labels.none;
    select.appendChild(optNone);
    for (let code = 65; code <= 90; code++) {
      const k = String.fromCharCode(code);
      const opt = document.createElement("option");
      opt.value = k;
      opt.textContent = k;
      select.appendChild(opt);
    }
    select.value = String(shortcuts[tool] || "");
    row.append(title, select);
    host.appendChild(row);
  }
}

let _groupListRenderSignature = "";
let _layerListRenderSignature = "";
let _activeLayerSelectSignature = "";
// Cache for inAnyGroup set to avoid rebuilding on every refreshUi when groups don't change
let _inAnyGroupCacheSig = "";
let _inAnyGroupCache = null;
let _unGroupedShapesCacheSig = "";
let _unGroupedShapesCache = null;

export function refreshUi(state, dom) {
  dom.buildBadge.textContent = `Build ${state.buildVersion}`;
  dom.statusText.textContent = state.ui.statusText || "";
  applyLanguageUi(state, dom);
  for (const node of Array.from(document.querySelectorAll(".sidebar [data-menu-item-key]"))) {
    const key = String(node.getAttribute("data-menu-item-key") || "");
    if (!key) continue;
    node.style.display = isLeftMenuItemVisible(state, key) ? "" : "none";
  }
  if (String(state.tool || "") === "settings") {
    refreshLeftMenuVisibilitySettings(state, dom);
    refreshToolShortcutSettings(state, dom);
  }
  const panelLang = getUiLanguage(state);
  const panelText = (panelLang === "en")
    ? {
      hiddenSuffix: " (Hidden)",
      setAsCurrentLayerTitle: "Double-click to set active layer",
      toggleLayerModeTitle: "Toggle ON / OFF / LOCK",
      moveObjectsToLayer: "Move Objects",
      noObjects: "No objects",
      active: "Active",
      clickToSelect: "Click to select",
      ungrouped: "Ungrouped",
      clickToSelectObject: "Click to select object",
      movingOrigin: "Moving origin...",
      moveOrigin: "Move origin",
    }
    : {
      hiddenSuffix: "（非表示）",
      setAsCurrentLayerTitle: "ダブルクリックで現在レイヤーに設定",
      toggleLayerModeTitle: "ON / OFF / LOCK を切替",
      moveObjectsToLayer: "オブジェクトを移動",
      noObjects: "オブジェクトなし",
      active: "アクティブ",
      clickToSelect: "クリックで選択",
      ungrouped: "未グループ",
      clickToSelectObject: "クリックでオブジェクト選択",
      movingOrigin: "基準点を移動中...",
      moveOrigin: "基準点を移動",
    };
  const menuScalePct = normalizeMenuScalePreset(state.ui?.menuScalePct ?? 100);
  if (!state.ui) state.ui = {};
  state.ui.menuScalePct = menuScalePct;
  const menuScale = menuScalePct / 100;
  document.documentElement.style.setProperty("--menu-scale", String(menuScale));
  const scaleRoots = [
    document.querySelector(".top-context"),
    document.querySelector(".right-stack"),
  ];
  for (const el of scaleRoots) {
    if (!el) continue;
    el.style.zoom = String(menuScale);
  }
  const sidebarEl = document.querySelector(".sidebar");
  const updateSidebarScaleAndScroll = () => {
    if (!sidebarEl) return;
    // Keep the scroll container unscaled; scale each direct child panel instead.
    // This keeps scrollbar range accurate at all menu scales.
    sidebarEl.style.zoom = "1";
    const baseWidthPx = (() => {
      const saved = Number(sidebarEl.dataset.baseWidthPx);
      if (Number.isFinite(saved) && saved > 0) return saved;
      const w = Number.parseFloat(window.getComputedStyle(sidebarEl).width);
      const base = (Number.isFinite(w) && w > 0) ? w : 134;
      sidebarEl.dataset.baseWidthPx = String(base);
      return base;
    })();
    sidebarEl.style.width = `${Math.round(baseWidthPx * menuScale)}px`;
    for (const child of Array.from(sidebarEl.children || [])) {
      if (child?.style) child.style.zoom = String(menuScale);
    }
    const sidebarRect = sidebarEl.getBoundingClientRect();
    let contentH = 0;
    for (const child of Array.from(sidebarEl.children || [])) {
      const cs = window.getComputedStyle(child);
      if (cs.display === "none") continue;
      const r = child.getBoundingClientRect();
      const h = Number(r.bottom || 0) - Number(sidebarRect.top || 0);
      if (h > contentH) contentH = h;
    }
    const viewH = Number(sidebarRect.height || sidebarEl.clientHeight || 0);
    // Fractional layout can leave a tiny positive delta; ignore small gaps.
    const needScroll = (contentH - viewH) > 6;
    sidebarEl.style.overflowY = needScroll ? "auto" : "hidden";
    sidebarEl.style.scrollbarGutter = needScroll ? "stable" : "auto";
    if (!needScroll) sidebarEl.scrollTop = 0;
  };
  updateSidebarScaleAndScroll();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(updateSidebarScaleAndScroll);
  const syncInputValue = (el, value) => {
    if (!el) return;
    if (document.activeElement === el) return;
    const s = String(value);
    if (el.value !== s) el.value = s;
  };
  const rightStackEl = document.querySelector(".right-stack");
  const getMaxGroupPanelHeight = (groupsSectionEl) => {
    const stackEl = rightStackEl || groupsSectionEl?.closest?.(".right-stack");
    if (!stackEl || !groupsSectionEl) return Math.max(120, Math.floor(window.innerHeight - 20));
    const availableTotal = Math.max(120, Math.floor(window.innerHeight - 20));
    const gap = Math.max(0, parseFloat(window.getComputedStyle(stackEl).gap || "0") || 0);
    const sections = Array.from(stackEl.querySelectorAll(":scope > .section[data-panel-id]"))
      .filter(el => window.getComputedStyle(el).display !== "none");
    let othersTotal = 0;
    for (const sec of sections) {
      if (sec === groupsSectionEl) continue;
      othersTotal += Math.max(0, sec.getBoundingClientRect().height || sec.offsetHeight || 0);
    }
    const gapsTotal = Math.max(0, (sections.length - 1) * gap);
    return Math.max(120, Math.floor(availableTotal - othersTotal - gapsTotal));
  };
  if (rightStackEl) {
    const w = Number(state.ui?.panelLayout?.rightPanelWidth);
    if (Number.isFinite(w) && w > 0) {
      rightStackEl.style.width = `min(${w}px, calc(100% - 230px))`;
    } else {
      rightStackEl.style.removeProperty("width");
    }
  }
  const tool = String(state.tool || "");
  const topContext = document.getElementById("topContext");
  const topContextHelp = document.getElementById("topContextHelp");
  if (topContext) {
    // Build a type-lookup map once to avoid repeated O(n) find() calls for each selected ID
    const selIds = state.selection?.ids || [];
    let _selShapeTypeMap = null;
    const getSelShapeTypes = () => {
      if (!_selShapeTypeMap) {
        _selShapeTypeMap = new Map();
        if (selIds.length > 0) {
          const idSet = new Set(selIds.map(Number));
          for (const s of (state.shapes || [])) {
            if (idSet.has(Number(s.id))) _selShapeTypeMap.set(Number(s.id), s.type);
          }
        }
      }
      return _selShapeTypeMap;
    };
    const hasSelType = (...types) => {
      const m = getSelShapeTypes();
      for (const t of m.values()) { if (types.includes(t)) return true; }
      return false;
    };
    const allSelType = (...types) => {
      if (!selIds.length) return false;
      const m = getSelShapeTypes();
      for (const t of m.values()) { if (!types.includes(t)) return false; }
      return true;
    };

    let activeCtx = "";
    if (tool === "patterncopy") activeCtx = "patterncopy";
    if (tool === "vertex") activeCtx = "vertex";
    if (tool === "line") activeCtx = "line";
    if (tool === "rect") activeCtx = "rect";
    const hasCircleSelected = hasSelType("circle", "arc");
    if (!activeCtx && (tool === "circle" || (tool !== "select" && hasCircleSelected))) activeCtx = "circle";
    const hasPositionSelected = hasSelType("position");
    if (!activeCtx && (tool === "position" || (tool !== "select" && hasPositionSelected))) activeCtx = "position";
    if (!activeCtx && tool === "text") activeCtx = "text";
    const hasDimSelected = hasSelType("dim", "dimchain", "dimangle", "circleDim");
    if (!activeCtx && (tool === "dim" || hasDimSelected)) activeCtx = "dim";
    if (!activeCtx && tool === "fillet") activeCtx = "fillet";
    if (!activeCtx && tool === "trim") activeCtx = "trim";
    if (tool === "settings") {
      activeCtx = "settings";
    }
    if (!activeCtx && tool === "doubleline") activeCtx = "doubleline";

    // 選択中にハッチがあればハッチパネルを出す
    const hasHatchSelected = hasSelType("hatch");
    if (!activeCtx && (tool === "hatch" || hasHatchSelected)) activeCtx = "hatch";
    if (tool === "select") {
      const hasActiveGroup = state.activeGroupId != null;
      const hasNonDimSelection = selIds.length > 0 && !allSelType("dim", "dimchain", "dimangle", "circleDim");
      // Handle the case where ONLY dimensions are selected
      const hasOnlyDimSelection = selIds.length > 0 && allSelType("dim", "dimchain", "dimangle", "circleDim");

      if (!activeCtx && (hasNonDimSelection || hasActiveGroup) && !hasOnlyDimSelection) activeCtx = "group";
      if (!activeCtx && hasOnlyDimSelection) activeCtx = "dim";
      if (!activeCtx && hasPositionSelected) activeCtx = "position";
      if (!activeCtx && hasCircleSelected) activeCtx = "circle";
      if (!activeCtx && hasHatchSelected) activeCtx = "hatch";
      if (!activeCtx && !selIds.length && !hasActiveGroup) activeCtx = "select";
    }
    let visibleCount = 0;
    for (const el of topContext.querySelectorAll("[data-context]")) {
      const key = el.getAttribute("data-context") || "";
      const on = (activeCtx && key === activeCtx);
      el.style.display = on ? "flex" : "none";
      if (on) visibleCount++;
    }
    const lang = getUiLanguage(state);
    const isTouchMode = !!state.ui?.touchMode;
    const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
    const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
    const lineHelp = (tool === "line" && lineMode === "continuous")
      ? (lang === "en"
        ? (isTouchMode ? "Click to add vertices, then tap Confirm." : "Click to add vertices. Press Enter to confirm.")
        : (isTouchMode ? "クリックで頂点追加後、下中央の「確定」を押します。" : "クリックで頂点追加  Enterキーで決定"))
      : ((tool === "line" && lineMode === "freehand")
        ? (lang === "en"
          ? (isTouchMode ? "Click to add control points, then tap Confirm to finalize B-Spline." : "Click to add control points. Press Enter or double-click to finalize B-Spline.")
          : (isTouchMode ? "クリックで制御点を追加し、下中央の「確定」でBスプラインを確定します。" : "クリックで制御点を追加。EnterまたはダブルクリックでBスプライン確定。"))
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
        hatch: isTouchMode ? "境界をクリックして選択後、下中央の「確定」でハッチングを実行します。" : "境界をクリックして選択。Enter または Apply でハッチングを実行します。",
        patterncopy: isTouchMode ? "モードを選択し、必要なら中心点や軸線を指定して、下中央の「確定」を押してください。" : "パターンコピーを実行します。モードを選択し、必要であれば中心点や軸線をキャンバス上でクリックしてから Apply を押してください。",
        doubleline: isTouchMode ? "選択した線分から二重線を生成します。Offset値やModeを調整後、下中央の「確定」で実行します。" : "選択した線分から二重線（オフセット線）を生成します。Offset値やMode（片側/両側）を調整し、ApplyまたはEnterで確定します。",
      };
    const helpText = helpMap[tool] || "";
    if (topContextHelp) {
      topContextHelp.textContent = helpText;
      topContextHelp.style.display = (visibleCount > 0 && helpText) ? "flex" : "none";
    }
    topContext.style.display = visibleCount > 0 ? "grid" : "none";

    // Show Space handling message if something is selected
    const selectedCount = (state.selection?.ids || []).length;
    if (selectedCount > 0 || state.activeGroupId != null) {
      if (topContextHelp) {
        const baseTxt = helpMap[tool] || "";
        topContextHelp.textContent = (baseTxt ? baseTxt + " | " : "") + (lang === "en" ? "Space: Clear selection" : "Space: 選択解除");
        topContextHelp.style.display = "flex";
      }
      topContext.style.display = "grid";
    }
  }

  if (dom.statusText) {
    const toolText = `Tool: ${state.tool ? state.tool.toUpperCase() : "NONE"}`;
    const x = state.input.hoverWorld?.x ?? 0;
    const y = state.input.hoverWorld?.y ?? 0;
    const coordText = `X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}`;
    const zoomScale = Math.max(0, Number(state.view?.scale) || 0);
    const zoomText = `Zoom: ${(zoomScale * 100).toFixed(0)}%`;
    const baseGrid = Math.max(1e-9, Number(state.grid?.size) || 100);
    let effGrid = baseGrid;
    if (state.grid?.auto) {
      const currentPx = baseGrid * zoomScale;
      const basePx = Math.max(1e-9, Number(state.grid?.autoBasePxAtReset) || currentPx);
      const z = currentPx / basePx;
      const h = 0.85;
      const e50 = Math.max(1.01, Number(state.grid?.autoThreshold50 || 130) / 100);
      const e10 = Math.max(e50, Number(state.grid?.autoThreshold10 || 180) / 100);
      const e5 = Math.max(e10, (Number(state.grid?.autoThreshold5 || 240) / 100) * 1.2);
      const e1 = Math.max(e5, (Number(state.grid?.autoThreshold1 || 320) / 100) * 2.5);
      const r50 = e50 * h;
      const r10 = e10 * h;
      const r5 = e5 * h;
      const r1 = e1 * h;
      let level = Number(state.grid?.autoLevel);
      if (![100, 50, 10, 5, 1].includes(level)) level = 100;
      effGrid = Math.max(1e-9, baseGrid * (level / 100));

      if (dom.gridAutoDebugText) {
        const stage = `${level}%`;
        dom.gridAutoDebugText.textContent =
          `AutoGrid: ON` +
          `\nBaseGrid: ${Number(baseGrid.toFixed(4)).toString()}` +
          `\nZoom: ${(zoomScale * 100).toFixed(1)}%` +
          `\nCurrentPx: ${currentPx.toFixed(3)} px` +
          `\nResetBasePx: ${basePx.toFixed(3)} px` +
          `\nz(current/reset): ${z.toFixed(3)}` +
          `\nEnter: 50=${e50.toFixed(2)} 10=${e10.toFixed(2)} 5=${e5.toFixed(2)} 1=${e1.toFixed(2)}` +
          `\nReturn: 100<=${r50.toFixed(2)} 50<=${r10.toFixed(2)} 10<=${r5.toFixed(2)} 5<=${r1.toFixed(2)}` +
          `\nAutoLevel: ${level}%` +
          `\nStage: ${stage}` +
          `\nEffectiveGrid: ${Number(effGrid.toFixed(4)).toString()}`;
      }
    } else if (dom.gridAutoDebugText) {
      dom.gridAutoDebugText.textContent =
        `AutoGrid: OFF` +
        `\nBaseGrid: ${Number(baseGrid.toFixed(4)).toString()}` +
        `\nZoom: ${(zoomScale * 100).toFixed(1)}%` +
        `\nEffectiveGrid: ${Number(baseGrid.toFixed(4)).toString()}`;
    }
    const gridText = `Grid: ${Number(effGrid.toFixed(4)).toString()}`;
    const isDraggingSelection = state.selection?.drag?.active && state.selection?.drag?.moved;
    const isDraggingVertex = state.vertexEdit?.drag?.active && state.vertexEdit?.drag?.moved;
    const dragHint = (isDraggingSelection || isDraggingVertex) ? "  |  Enter to confirm" : "";
    dom.statusText.textContent = `${toolText} | ${zoomText} | ${gridText} | ${coordText}${dragHint}`;

    if (dom.gridScaleIndicator && dom.gridScaleBar && dom.gridScaleText) {
      const unit = String(state.pageSetup?.unit || "mm").toLowerCase();
      const unitMm = (unit === "cm") ? 10 : (unit === "m") ? 1000 : ((unit === "inch" || unit === "in") ? 25.4 : (unit === "ft" ? 304.8 : 1));
      const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
      const gridModelUnit = effGrid;
      const gridPaperMm = (effGrid * unitMm) / pageScale;
      const gridPx = effGrid * zoomScale;
      const viewportW = Math.max(1, Number(state.view?.viewportWidth) || 1);
      const maxBarPx = Math.max(120, Math.min(900, viewportW * 0.45));
      const barPx = Math.max(1, Math.min(maxBarPx, Number.isFinite(gridPx) ? gridPx : 1));
      dom.gridScaleIndicator.style.display = "";
      dom.gridScaleBar.style.width = `${barPx.toFixed(1)}px`;
      const unitLabel = (unit === "in") ? "inch" : unit;
      const modelTxt = Number.isFinite(gridModelUnit) ? Number(gridModelUnit.toFixed(3)).toString() : "-";
      const paperTxt = Number.isFinite(gridPaperMm) ? Number(gridPaperMm.toFixed(3)).toString() : "-";
      dom.gridScaleText.textContent = `1 grid = ${modelTxt} ${unitLabel} (model) / ${paperTxt} mm (paper)`;
    }
  }
  const pickMode = String(state.ui?.selectPickMode || "object");
  if (dom.selectPickObjectBtn) {
    const on = pickMode === "object";
    dom.selectPickObjectBtn.classList.toggle("active", on);
    dom.selectPickObjectBtn.style.fontWeight = on ? "700" : "400";
  }
  if (dom.selectPickGroupBtn) {
    const on = pickMode === "group";
    dom.selectPickGroupBtn.classList.toggle("active", on);
    dom.selectPickGroupBtn.style.fontWeight = on ? "700" : "400";
  }
  const groupCtxObjectOps = document.getElementById("groupCtxObjectOps");
  const groupCtxGroupOps = document.getElementById("groupCtxGroupOps");
  const groupCtxTitle = document.getElementById("groupCtxTitle");
  const mergeGroupsRow = document.getElementById("mergeGroupsRow");
  const lineCircleMoveOps = document.getElementById("lineCircleMoveOps");
  const selectionStyleOps = document.getElementById("selectionStyleOps");
  const selectionColorOps = document.getElementById("selectionColorOps");
  const selectionPositionOps = document.getElementById("selectionPositionOps");
  const selectionImageOps = document.getElementById("selectionImageOps");
  const selectionCircleOps = document.getElementById("selectionCircleOps");
  const groupRelativeMoveOps = document.getElementById("groupRelativeMoveOps");
  const dimMergeGroupsRow = document.getElementById("dimMergeGroupsRow");
  if (groupCtxObjectOps || groupCtxGroupOps) {
    const selectedCount = (state.selection?.ids || []).length;
    const hasObjectSelection = selectedCount > 0;
    const hasActiveGroup = state.activeGroupId != null;
    const aimPickActive = !!(state.input?.groupAimPick?.active)
      && Number(state.input?.groupAimPick?.groupId) === Number(state.activeGroupId);
    const selIds = new Set((state.selection?.ids || []).map(Number));
    // Avoid iterating all shapes when nothing is selected
    const selectedShapes = selIds.size > 0 ? (state.shapes || []).filter(s => selIds.has(Number(s.id))) : [];
    const styleTargetTypes = new Set(["line", "circle", "arc", "position"]);
    const colorTargetTypes = new Set(["line", "rect", "circle", "arc", "position", "text", "dim", "dimchain", "dimangle", "circleDim", "hatch"]);
    const hasOnlyStyleTargetSelection = selectedShapes.length > 0
      && selectedShapes.every(s => styleTargetTypes.has(String(s.type || "")));
    const hasOnlyColorTargetSelection = selectedShapes.length > 0
      && selectedShapes.every(s => colorTargetTypes.has(String(s.type || "")));
    const hasOnlyPositionSelection = selectedShapes.length > 0
      && selectedShapes.every(s => String(s.type || "") === "position");
    const hasOnlyImageSelection = selectedShapes.length > 0
      && selectedShapes.every(s => String(s.type || "") === "image");
    const hasOnlyCircleSelection = selectedShapes.length > 0
      && selectedShapes.every(s => {
        const t = String(s.type || "");
        return t === "circle" || t === "arc";
      });
    const hasLineCircleOnlySelection = selectedShapes.length > 0
      && selectedShapes.every(s => s.type === "line" || s.type === "circle" || s.type === "arc");
    const hasOnlyDimSelection = selectedShapes.length > 0
      && selectedShapes.every(s => s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim");
    if (groupCtxTitle) {
      let title = panelLang === "en" ? "Group" : "グループ";
      if (aimPickActive) {
        title = panelLang === "en" ? "Aim Target" : "方位拘束ターゲット";
      } else if (hasActiveGroup) {
        title = panelLang === "en" ? "Group" : "グループ";
      } else if (selectedShapes.length === 1) {
        const t = String(selectedShapes[0]?.type || "");
        if (t === "line") title = panelLang === "en" ? "Line" : "線分";
        else if (t === "circle") title = panelLang === "en" ? "Circle" : "円";
        else if (t === "arc") title = panelLang === "en" ? "Arc" : "円弧";
        else if (t === "position") title = panelLang === "en" ? "Position" : "位置";
        else if (t === "rect") title = panelLang === "en" ? "Rectangle" : "四角";
        else if (t === "image") title = panelLang === "en" ? "Image" : "画像";
        else title = panelLang === "en" ? "Object" : "オブジェクト";
      } else if (selectedShapes.length >= 2) {
        title = panelLang === "en" ? "Object" : "オブジェクト";
      }
      groupCtxTitle.textContent = title;
    }
    const showObjectOps = hasObjectSelection && !aimPickActive;
    if (groupCtxObjectOps) groupCtxObjectOps.style.display = showObjectOps ? "flex" : "none";
    if (groupCtxGroupOps) groupCtxGroupOps.style.display = hasActiveGroup ? "flex" : "none";
    if (lineCircleMoveOps) lineCircleMoveOps.style.display = hasOnlyStyleTargetSelection ? "grid" : "none";
    if (selectionStyleOps) selectionStyleOps.style.display = hasOnlyStyleTargetSelection ? "grid" : "none";
    if (selectionColorOps) selectionColorOps.style.display = hasOnlyColorTargetSelection ? "grid" : "none";
    if (selectionPositionOps) selectionPositionOps.style.display = hasOnlyPositionSelection ? "grid" : "none";
    if (selectionImageOps) selectionImageOps.style.display = hasOnlyImageSelection ? "grid" : "none";
    if (selectionCircleOps) selectionCircleOps.style.display = hasOnlyCircleSelection ? "flex" : "none";
    if (mergeGroupsRow) mergeGroupsRow.style.display = (!hasActiveGroup && selectedCount >= 2) ? "flex" : "none";
    if (dimMergeGroupsRow) dimMergeGroupsRow.style.display = (state.tool === "select" && !hasActiveGroup && selectedCount >= 2 && hasOnlyDimSelection) ? "flex" : "none";
    if (groupRelativeMoveOps) {
      groupRelativeMoveOps.style.display = (hasLineCircleOnlySelection && !aimPickActive) ? "none" : "grid";
    }
    if (groupCtxObjectOps && groupCtxGroupOps) {
      groupCtxGroupOps.style.order = "0";
      groupCtxObjectOps.style.order = "1";
    }
  }
  const leftToolPanels = [dom.toolButtons, dom.editToolButtons, dom.fileToolButtons].filter(Boolean);
  const flash = state.ui?.flashAction;
  const hasActiveFlash = !!(flash && Number(flash.until || 0) > Date.now());
  for (const panel of leftToolPanels) {
    for (const btn of panel.querySelectorAll("button[data-tool]")) {
      btn.classList.toggle("active", !hasActiveFlash && btn.dataset.tool === state.tool);
    }
    for (const btn of panel.querySelectorAll("button[data-action]")) {
      const isFlashActive = flash
        && String(flash.id || "") === String(btn.dataset.action || "")
        && Number(flash.until || 0) > Date.now();
      btn.classList.toggle("active", !!isFlashActive);
    }
  }
  if (dom.undoBtn) {
    for (const btn of dom.toolButtons.querySelectorAll("button[data-action='undo']")) {
      btn.disabled = !(state.history?.past?.length > 0);
    }
  }
  if (dom.redoBtn) {
    for (const btn of dom.toolButtons.querySelectorAll("button[data-action='redo']")) {
      btn.disabled = !(state.history?.future?.length > 0);
    }
  }
  if (dom.undoBtn) dom.undoBtn.disabled = !(state.history?.past?.length > 0);
  if (dom.redoBtn) dom.redoBtn.disabled = !(state.history?.future?.length > 0);
  if (dom.gridSizeInput) syncInputValue(dom.gridSizeInput, normalizeGridPreset(state.grid.size));
  if (dom.gridSizeContextInput) syncInputValue(dom.gridSizeContextInput, normalizeGridPreset(state.grid.size));
  if (dom.gridSnapToggle) dom.gridSnapToggle.checked = !!state.grid.snap;
  if (dom.gridSnapContextToggle) dom.gridSnapContextToggle.checked = !!state.grid.snap;
  if (dom.gridShowToggle) dom.gridShowToggle.checked = !!state.grid.show;
  if (dom.gridShowContextToggle) dom.gridShowContextToggle.checked = !!state.grid.show;
  if (dom.gridAutoToggle) dom.gridAutoToggle.checked = !!state.grid.auto;
  if (dom.gridAutoContextToggle) dom.gridAutoContextToggle.checked = !!state.grid.auto;
  if (dom.gridAutoTimingSlider) {
    const lang = getUiLanguage(state);
    const timing = Number.isFinite(Number(state.grid?.autoTiming))
      ? clampGridAutoTiming(state.grid.autoTiming)
      : gridAutoTimingFromThreshold50(state.grid?.autoThreshold50 ?? 130);
    dom.gridAutoTimingSlider.value = String(timing);
    if (dom.gridAutoTimingLabel) dom.gridAutoTimingLabel.textContent = localizeGridAutoTimingLabelText(timing, lang);
    if (dom.gridAutoTimingHint) {
      const t50 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold50 ?? 130))));
      const t10 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold10 ?? 180))));
      const t5 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold5 ?? 240))));
      const t1 = Math.max(100, Math.min(2000, Math.round(Number(state.grid.autoThreshold1 ?? 320))));
      dom.gridAutoTimingHint.textContent = `入閾値: 50=${t50}% / 10=${t10}% / 5=${t5}% / 1=${t1}%`;
    }
  }
  if (dom.objSnapToggle) dom.objSnapToggle.checked = state.objectSnap?.enabled !== false;
  if (dom.objSnapEndpointToggle) dom.objSnapEndpointToggle.checked = state.objectSnap?.endpoint !== false;
  if (dom.objSnapMidpointToggle) dom.objSnapMidpointToggle.checked = !!state.objectSnap?.midpoint;
  if (dom.objSnapCenterToggle) dom.objSnapCenterToggle.checked = state.objectSnap?.center !== false;
  if (dom.objSnapIntersectionToggle) dom.objSnapIntersectionToggle.checked = state.objectSnap?.intersection !== false;
  if (dom.lineModeSelect) {
    const modeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
    const mode = (modeRaw === "continuous" || modeRaw === "freehand") ? modeRaw : "segment";
    if (dom.lineModeSelect.value !== mode) dom.lineModeSelect.value = mode;
    if (dom.lineTouchFinalizeBtn) {
      const touchMode = !!state.ui?.touchMode;
      const show = !touchMode && state.tool === "line" && (mode === "continuous" || mode === "freehand");
      dom.lineTouchFinalizeBtn.style.display = show ? "" : "none";
      dom.lineTouchFinalizeBtn.textContent = mode === "freehand"
        ? (panelLang === "en" ? "Finalize B-Spline" : "Bスプライン確定")
        : (panelLang === "en" ? "Finish Continuous Line" : "連続線を確定");
    }
  }
  if (dom.objSnapTangentToggle) dom.objSnapTangentToggle.checked = !!state.objectSnap?.tangent;
  if (dom.objSnapTangentKeepToggle) dom.objSnapTangentKeepToggle.checked = !!(state.objectSnap?.keepAttributes || state.objectSnap?.tangentKeep);
  if (dom.objSnapVectorToggle) dom.objSnapVectorToggle.checked = !!state.objectSnap?.vector;

  if (dom.circleCenterMarkToggle) {
    const selectedCircles = (state.selection?.ids || []).map(id => state.shapes.find(sh => Number(sh.id) === Number(id))).filter(s => s && (s.type === "circle" || s.type === "arc"));
    if (selectedCircles.length > 0) {
      dom.circleCenterMarkToggle.checked = selectedCircles.every(s => s.showCenterMark);
    } else {
      dom.circleCenterMarkToggle.checked = !!state.circleSettings.showCenterMark;
    }
  }
  if (dom.textContentInput && document.activeElement !== dom.textContentInput) dom.textContentInput.value = state.textSettings.content;
  if (dom.textSizePtInput) syncInputValue(dom.textSizePtInput, state.textSettings.sizePt);
  if (dom.textRotateInput) syncInputValue(dom.textRotateInput, state.textSettings.rotate);
  if (dom.textFontFamilyInput) dom.textFontFamilyInput.value = state.textSettings.fontFamily;
  if (dom.textBoldInput) dom.textBoldInput.checked = !!state.textSettings.bold;
  if (dom.textItalicInput) dom.textItalicInput.checked = !!state.textSettings.italic;
  if (dom.textColorInput) dom.textColorInput.value = state.textSettings.color;

  const selectedHatch = (() => {
    const ids = new Set((state.selection?.ids || []).map(Number));
    if (!ids.size) return null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type === "hatch") return s;
    }
    return null;
  })();
  const hatchUi = selectedHatch || state.hatchSettings;
  if (dom.hatchPitchInput) syncInputValue(dom.hatchPitchInput, Number(hatchUi?.pitchMm ?? state.hatchSettings.pitchMm));
  if (dom.hatchAngleInput) syncInputValue(dom.hatchAngleInput, Number(hatchUi?.hatchAngleDeg ?? hatchUi?.angleDeg ?? state.hatchSettings.angleDeg));
  if (dom.hatchPaddingInput) syncInputValue(dom.hatchPaddingInput, Number(hatchUi?.repetitionPaddingMm ?? state.hatchSettings.repetitionPaddingMm));
  if (dom.hatchAltShiftInput) syncInputValue(dom.hatchAltShiftInput, Number(hatchUi?.lineShiftMm ?? state.hatchSettings.lineShiftMm ?? 0));
  if (dom.hatchFillToggle) dom.hatchFillToggle.checked = !!(hatchUi?.fillEnabled ?? state.hatchSettings.fillEnabled);
  if (dom.hatchFillColorInput) {
    const c = String(hatchUi?.fillColor ?? state.hatchSettings.fillColor ?? "#dbeafe");
    dom.hatchFillColorInput.value = /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#dbeafe";
  }
  if (dom.hatchLineColorInput) {
    const c = String(hatchUi?.lineColor ?? state.hatchSettings.lineColor ?? "#0f172a");
    dom.hatchLineColorInput.value = /^#[0-9a-fA-F]{6}$/.test(c) ? c : "#0f172a";
  }
  if (dom.hatchDashMmInput) syncInputValue(dom.hatchDashMmInput, Number(hatchUi?.lineDashMm ?? state.hatchSettings.lineDashMm));
  if (dom.hatchGapMmInput) syncInputValue(dom.hatchGapMmInput, Number(hatchUi?.lineGapMm ?? state.hatchSettings.lineGapMm));
  if (dom.applyHatchBtn) {
    const touchMode = !!state.ui?.touchMode;
    dom.applyHatchBtn.style.display = touchMode ? "none" : "";
    dom.applyHatchBtn.disabled = !(state.tool === "hatch" && state.hatchDraft?.boundaryIds?.length > 0);
  }

  if (dom.patternCopyModeSelect) dom.patternCopyModeSelect.value = state.patternCopySettings.mode;
  if (dom.patternCopyArrayOptions) dom.patternCopyArrayOptions.style.display = state.patternCopySettings.mode === "array" ? "block" : "none";
  if (dom.patternCopyRotateOptions) dom.patternCopyRotateOptions.style.display = state.patternCopySettings.mode === "rotate" ? "block" : "none";
  if (dom.patternCopyMirrorOptions) dom.patternCopyMirrorOptions.style.display = state.patternCopySettings.mode === "mirror" ? "block" : "none";

  if (dom.patternCopyArrayDxInput) syncInputValue(dom.patternCopyArrayDxInput, state.patternCopySettings.arrayDx);
  if (dom.patternCopyArrayDyInput) syncInputValue(dom.patternCopyArrayDyInput, state.patternCopySettings.arrayDy);
  if (dom.patternCopyArrayCountXInput) syncInputValue(dom.patternCopyArrayCountXInput, state.patternCopySettings.arrayCountX);
  if (dom.patternCopyArrayCountYInput) syncInputValue(dom.patternCopyArrayCountYInput, state.patternCopySettings.arrayCountY);
  if (dom.patternCopyRotateAngleInput) syncInputValue(dom.patternCopyRotateAngleInput, state.patternCopySettings.rotateAngleDeg);
  if (dom.patternCopyRotateCountInput) syncInputValue(dom.patternCopyRotateCountInput, state.patternCopySettings.rotateCount);

  if (dom.patternCopyCenterStatus) {
    const cid = state.input.patternCopyFlow.centerPositionId;
    dom.patternCopyCenterStatus.textContent = cid
      ? (panelLang === "en" ? `Set: Point #${cid}` : `設定済み: 点 #${cid}`)
      : (panelLang === "en" ? "Not set (pick a point on canvas)" : "未設定 (キャンバスの点を選択)");
    if (dom.patternCopySetCenterBtn) {
      dom.patternCopySetCenterBtn.textContent = cid
        ? (panelLang === "en" ? "Clear Center" : "中心解除")
        : (panelLang === "en" ? "Set as Center" : "中心として設定");
    }
  }
  if (dom.patternCopyAxisStatus) {
    const aid = state.input.patternCopyFlow.axisLineId;
    dom.patternCopyAxisStatus.textContent = aid
      ? (panelLang === "en" ? `Set: Line #${aid}` : `設定済み: 線 #${aid}`)
      : (panelLang === "en" ? "Not set (pick a line on canvas)" : "未設定 (キャンバスの線を選択)");
    if (dom.patternCopySetAxisBtn) {
      dom.patternCopySetAxisBtn.textContent = aid
        ? (panelLang === "en" ? "Clear Axis" : "軸設定を解除")
        : (panelLang === "en" ? "Set as Axis" : "軸として設定");
    }
  }

  if (dom.patternCopyApplyBtn) {
    const touchMode = !!state.ui?.touchMode;
    dom.patternCopyApplyBtn.style.display = touchMode ? "none" : "";
    const hasSelection = ((state.selection?.ids || []).length > 0) || ((state.selection?.groupIds || []).length > 0);
    const mode = state.patternCopySettings.mode;
    let ok = hasSelection;
    if (mode === "rotate") ok = ok && !!state.input.patternCopyFlow.centerPositionId;
    if (mode === "mirror") ok = ok && !!state.input.patternCopyFlow.axisLineId;
    dom.patternCopyApplyBtn.disabled = !ok;
  }

  const _selIdSet = new Set((state.selection?.ids || []).map(Number));
  const selectedShapes = _selIdSet.size > 0 ? (state.shapes || []).filter(s => _selIdSet.has(Number(s.id))) : [];
  const selectedPrimary = selectedShapes.length ? selectedShapes[0] : null;
  if (dom.attrPanel) {
    const selectedWithAttrs = selectedShapes.find(s => {
      const explicit = Array.isArray(s?.attributes) && s.attributes.length > 0;
      const lineVertexBind = s?.type === "line" && (!!s?.p1Attrib || !!s?.p2Attrib);
      return explicit || lineVertexBind;
    }) || null;
    if (selectedWithAttrs) {
      if (!state.ui.rightPanelCollapsed) state.ui.rightPanelCollapsed = {};
      state.ui.rightPanelCollapsed.attrs = false;
    }
    const explicitAttrs = Array.isArray(selectedWithAttrs?.attributes) ? selectedWithAttrs.attributes : [];
    const attrs = explicitAttrs.slice();
    if (selectedWithAttrs?.type === "line") {
      const hasP1 = explicitAttrs.some(a => String(a?.target || "") === "vertex:p1");
      const hasP2 = explicitAttrs.some(a => String(a?.target || "") === "vertex:p2");
      if (!hasP1 && selectedWithAttrs.p1Attrib) {
        attrs.push({
          id: "__implicit_p1",
          name: "keep_snap",
          value: `vertex:p1 (${String(selectedWithAttrs.p1Attrib?.type || "attrib")})`,
          target: "vertex:p1",
          _implicit: true
        });
      }
      if (!hasP2 && selectedWithAttrs.p2Attrib) {
        attrs.push({
          id: "__implicit_p2",
          name: "keep_snap",
          value: `vertex:p2 (${String(selectedWithAttrs.p2Attrib?.type || "attrib")})`,
          target: "vertex:p2",
          _implicit: true
        });
      }
    }
    dom.attrPanel.style.display = selectedWithAttrs ? "flex" : "none";
    if (selectedWithAttrs) {
      const snapPanel = document.querySelector(".left-aux-stack .section[data-panel-id='snap']");
      if (snapPanel) {
        const r = snapPanel.getBoundingClientRect();
        dom.attrPanel.style.position = "fixed";
        dom.attrPanel.style.left = `${Math.round(r.right + 6)}px`;
        dom.attrPanel.style.top = `${Math.round(r.top)}px`;
        dom.attrPanel.style.width = "240px";
        dom.attrPanel.style.maxWidth = "min(240px, calc(100vw - 16px - " + `${Math.round(r.right + 6)}` + "px))";
        dom.attrPanel.style.zIndex = "30";
      }
    } else {
      dom.attrPanel.style.position = "";
      dom.attrPanel.style.left = "";
      dom.attrPanel.style.top = "";
      dom.attrPanel.style.width = "";
      dom.attrPanel.style.maxWidth = "";
      dom.attrPanel.style.zIndex = "";
    }
    if (dom.attrList && attrs.length) {
      dom.attrList.innerHTML = "";
      for (const a of attrs) {
        const row = document.createElement("div");
        row.className = "attr-row";
        row.title = `target: ${String(a?.target || "object")}`;
        const nameIn = document.createElement("input");
        nameIn.type = "text";
        nameIn.value = String(a?.name ?? "");
        if (!a?._implicit) {
          nameIn.setAttribute("data-attr-id", String(a?.id ?? ""));
          nameIn.setAttribute("data-attr-field", "name");
        } else {
          nameIn.readOnly = true;
        }
        const valIn = document.createElement("input");
        valIn.type = "text";
        valIn.value = String(a?.value ?? "");
        if (!a?._implicit) {
          valIn.setAttribute("data-attr-id", String(a?.id ?? ""));
          valIn.setAttribute("data-attr-field", "value");
        } else {
          valIn.readOnly = true;
        }
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "削除";
        if (!a?._implicit) delBtn.setAttribute("data-attr-remove", String(a?.id ?? ""));
        else delBtn.disabled = true;
        row.append(nameIn, valIn, delBtn);
        dom.attrList.appendChild(row);
      }
    } else if (dom.attrList) {
      dom.attrList.innerHTML = "";
    }
  }
  const firstText = selectedShapes.find(s => s.type === "text");
  if (dom.selectionTextEdit) {
    dom.selectionTextEdit.style.display = firstText ? "flex" : "none";
  }
  if (firstText && dom.selectionTextContentInput && document.activeElement !== dom.selectionTextContentInput) {
    dom.selectionTextContentInput.value = firstText.text || "";
  }
  if (firstText && dom.selectionTextSizePtInput && document.activeElement !== dom.selectionTextSizePtInput) {
    dom.selectionTextSizePtInput.value = String(firstText.textSizePt || 12);
  }
  if (firstText && dom.selectionTextRotateInput && document.activeElement !== dom.selectionTextRotateInput) {
    dom.selectionTextRotateInput.value = String(firstText.textRotate || 0);
  }
  if (firstText && dom.selectionTextFontFamilyInput && document.activeElement !== dom.selectionTextFontFamilyInput) {
    dom.selectionTextFontFamilyInput.value = firstText.textFontFamily || "Yu Gothic UI";
  }
  if (firstText && dom.selectionTextBoldInput) {
    dom.selectionTextBoldInput.checked = !!firstText.textBold;
  }
  if (firstText && dom.selectionTextItalicInput) {
    dom.selectionTextItalicInput.checked = !!firstText.textItalic;
  }
  if (firstText && dom.selectionTextColorInput) {
    dom.selectionTextColorInput.value = firstText.textColor || state.textSettings.color;
  }

  if (dom.activeLayerSelect) {
    const layerSelectSig = [
      String(getUiLanguage(state)),
      String(state.activeLayerId ?? ""),
      (state.layers || []).map(layer =>
        `${Number(layer.id)}:${String(layer.name || "")}:${layer.visible === false ? 0 : 1}`
      ).join("|"),
    ].join("::");
    if (_activeLayerSelectSignature !== layerSelectSig) {
      _activeLayerSelectSignature = layerSelectSig;
      const prev = dom.activeLayerSelect.value;
      dom.activeLayerSelect.innerHTML = "";
      for (const layer of (state.layers || [])) {
        const opt = document.createElement("option");
        opt.value = String(layer.id);
        opt.textContent = `${layer.name}${layer.visible === false ? panelText.hiddenSuffix : ""}`;
        dom.activeLayerSelect.appendChild(opt);
      }
      dom.activeLayerSelect.value = String(state.activeLayerId ?? prev ?? "");
    } else {
      dom.activeLayerSelect.value = String(state.activeLayerId ?? dom.activeLayerSelect.value ?? "");
    }
  }
  if (dom.renameLayerNameInput) {
    const activeLayer = (state.layers || []).find(l => Number(l.id) === Number(state.activeLayerId));
    if (activeLayer && document.activeElement !== dom.renameLayerNameInput) {
      dom.renameLayerNameInput.value = String(activeLayer.name ?? "");
    }
  }
  if (dom.layerList) {
    const layerListSig = [
      String(getUiLanguage(state)),
      String(state.activeLayerId ?? ""),
      (state.layers || []).map(layer =>
        `${Number(layer.id)}:${String(layer.name || "")}:${layer.visible === false ? 0 : 1}:${layer.locked === true ? 1 : 0}`
      ).join("|"),
    ].join("::");
    if (_layerListRenderSignature !== layerListSig) {
      _layerListRenderSignature = layerListSig;
      dom.layerList.innerHTML = "";
      for (const layer of (state.layers || [])) {
        const row = document.createElement("div");
        row.style.display = "grid";
        row.style.gridTemplateColumns = "1fr auto";
        row.style.gap = "6px";
        row.style.alignItems = "center";
        const isActive = (Number(layer.id) === Number(state.activeLayerId));
        const nameBtn = document.createElement("button");
        nameBtn.type = "button";
        nameBtn.dataset.layerNameBtn = String(layer.id);
        nameBtn.textContent = layer.name;
        nameBtn.title = panelText.setAsCurrentLayerTitle;
        nameBtn.style.textAlign = "left";
        nameBtn.style.width = "100%";
        nameBtn.style.fontSize = "11px";
        nameBtn.style.background = isActive ? "rgba(219,234,254,0.9)" : "rgba(255,255,255,0.75)";
        nameBtn.style.border = isActive ? "1px solid rgba(37,99,235,0.45)" : "1px solid rgba(148,163,184,0.25)";
        nameBtn.style.color = isActive ? "var(--ink)" : "var(--muted)";
        nameBtn.style.fontWeight = isActive ? "700" : "500";
        const modeBtn = document.createElement("button");
        modeBtn.type = "button";
        modeBtn.dataset.layerModeCycle = String(layer.id);
        modeBtn.style.fontSize = "10px";
        const visible = layer.visible !== false;
        const locked = layer.locked === true;
        modeBtn.textContent = visible ? (locked ? "LOCK" : "ON") : "OFF";
        modeBtn.title = panelText.toggleLayerModeTitle;
        if (!visible) {
          modeBtn.style.background = "rgba(148,163,184,0.16)";
          modeBtn.style.color = "var(--muted)";
        } else if (locked) {
          modeBtn.style.background = "rgba(251,191,36,0.14)";
          modeBtn.style.color = "#92400e";
          modeBtn.style.borderColor = "rgba(251,191,36,0.35)";
        } else {
          modeBtn.style.background = "rgba(34,197,94,0.10)";
          modeBtn.style.color = "#166534";
          modeBtn.style.borderColor = "rgba(34,197,94,0.30)";
        }
        row.append(nameBtn, modeBtn);
        dom.layerList.appendChild(row);
      }
    }
  }
  if (dom.renameLayerBtn) dom.renameLayerBtn.disabled = (state.activeLayerId == null);
  if (dom.moveSelectionLayerBtn) {
    const selectedShapeIds = new Set((state.selection?.ids || []).map(Number));
    const hasSelectedObjects = selectedShapeIds.size > 0 && (state.shapes || []).some(s => selectedShapeIds.has(Number(s.id)));
    dom.moveSelectionLayerBtn.disabled = !hasSelectedObjects;
    dom.moveSelectionLayerBtn.textContent = panelText.moveObjectsToLayer;
  }
  if (dom.deleteLayerBtn) {
    const layers = state.layers || [];
    dom.deleteLayerBtn.disabled = (state.activeLayerId == null) || (layers.length <= 1);
  }
  if (dom.moveLayerUpBtn || dom.moveLayerDownBtn) {
    const layers = state.layers || [];
    const idx = layers.findIndex(l => Number(l.id) === Number(state.activeLayerId));
    const canUp = idx > 0;
    const canDown = idx >= 0 && idx < (layers.length - 1);
    if (dom.moveLayerUpBtn) dom.moveLayerUpBtn.disabled = !canUp;
    if (dom.moveLayerDownBtn) dom.moveLayerDownBtn.disabled = !canDown;
  }
  if (dom.layerColorizeToggle) {
    dom.layerColorizeToggle.checked = !!state.ui?.layerView?.colorize;
  }
  if (dom.groupColorizeToggle) {
    dom.groupColorizeToggle.checked = !!state.ui?.groupView?.colorize;
  }
  if (dom.groupCurrentLayerOnlyToggle) {
    dom.groupCurrentLayerOnlyToggle.checked = !!state.ui?.groupView?.currentLayerOnly;
  }
  if (dom.editOnlyActiveLayerToggle) {
    dom.editOnlyActiveLayerToggle.checked = !!state.ui?.layerView?.editOnlyActive;
  }
  for (const panel of document.querySelectorAll("[data-layer-inner-panel]")) {
    const key = panel.getAttribute("data-layer-inner-panel");
    if (!key) continue;
    const collapsed = !!state.ui?.layerPanelInnerCollapsed?.[key];
    panel.style.display = collapsed ? "none" : "flex";
  }
  for (const btn of document.querySelectorAll("[data-layer-inner-toggle]")) {
    const key = btn.getAttribute("data-layer-inner-toggle");
    if (!key) continue;
    const collapsed = !!state.ui?.layerPanelInnerCollapsed?.[key];
    if (!btn.dataset.innerLabel) {
      btn.dataset.innerLabel = String(btn.textContent || "").replace(/^[▸▾]\s*/, "");
    }
    btn.innerHTML = `<span class="inner-arrow">${collapsed ? "▸" : "▾"}</span><span class="inner-label">${btn.dataset.innerLabel}</span>`;
  }
  for (const sec of document.querySelectorAll(".right-stack .section[data-panel-id], .left-aux-stack .section[data-panel-id], .sidebar .section[data-panel-id]")) {
    const panelId = sec.getAttribute("data-panel-id");
    const collapsed = !!state.ui?.rightPanelCollapsed?.[panelId];
    sec.classList.toggle("collapsed", collapsed);
  }
  const groupsSectionEl = document.querySelector(".right-stack .section[data-panel-id='groups']");
  if (groupsSectionEl) {
    const h = Number(state.ui?.panelLayout?.groupPanelHeight);
    const collapsed = !!state.ui?.rightPanelCollapsed?.groups;
    const isGroupPanelEmpty = ((state.groups || []).length === 0) && ((state.shapes || []).length === 0);
    if (collapsed) {
      groupsSectionEl.style.removeProperty("height");
      groupsSectionEl.style.removeProperty("max-height");
    } else if (isGroupPanelEmpty) {
      groupsSectionEl.style.removeProperty("height");
      groupsSectionEl.style.removeProperty("max-height");
    } else if (Number.isFinite(h) && h > 0) {
      const maxGroupH = getMaxGroupPanelHeight(groupsSectionEl);
      const cappedH = Math.max(120, Math.min(maxGroupH, Math.round(h)));
      groupsSectionEl.style.height = `${cappedH}px`;
      groupsSectionEl.style.maxHeight = `${cappedH}px`;
    } else {
      groupsSectionEl.style.removeProperty("height");
      groupsSectionEl.style.removeProperty("max-height");
    }
  }
  const layersSectionEl = document.querySelector(".right-stack .section[data-panel-id='layers']");
  if (layersSectionEl) {
    const collapsed = !!state.ui?.rightPanelCollapsed?.layers;
    if (collapsed) {
      layersSectionEl.style.removeProperty("height");
      layersSectionEl.style.removeProperty("max-height");
    } else {
      const layerListEl = dom.layerList;
      layersSectionEl.style.minHeight = "0";
      layersSectionEl.style.display = "flex";
      layersSectionEl.style.flexDirection = "column";
      if (layerListEl) {
        const currentListH = Math.max(0, layerListEl.clientHeight || 0);
        let chromeH = 0;
        for (const child of Array.from(layersSectionEl.children || [])) {
          if (!(child instanceof HTMLElement)) continue;
          if (child === layerListEl) continue;
          // Absolute resize handles should not contribute to layout height.
          if (child.classList.contains("panel-resize-handle")) continue;
          const style = window.getComputedStyle(child);
          if (style.display === "none") continue;
          chromeH += child.offsetHeight;
          const mt = parseFloat(style.marginTop || "0");
          const mb = parseFloat(style.marginBottom || "0");
          if (Number.isFinite(mt)) chromeH += mt;
          if (Number.isFinite(mb)) chromeH += mb;
        }
        chromeH = Math.max(0, Math.round(chromeH));
        const listNaturalH = Math.max(0, layerListEl.scrollHeight || 0);
        // Small slack avoids clipping the last row due to rounding/borders.
        const maxListH = Math.max(40, listNaturalH + 16);
        if (!state.ui.panelLayout) state.ui.panelLayout = {};
        let desiredListH = Number(state.ui.panelLayout.layerPanelListHeight);
        if (!Number.isFinite(desiredListH) || desiredListH <= 0) {
          const fallbackOld = Number(state.ui.panelLayout.layerPanelHeight);
          desiredListH = (Number.isFinite(fallbackOld) && fallbackOld > chromeH)
            ? (fallbackOld - chromeH)
            : Math.min(maxListH, Math.max(80, currentListH || listNaturalH || 120));
        }
        desiredListH = Math.max(40, Math.min(maxListH, Math.round(desiredListH)));
        state.ui.panelLayout.layerPanelListHeight = desiredListH;
        const targetH = chromeH + desiredListH + 8;
        layersSectionEl.style.height = `min(calc(100vh - 20px), ${targetH}px)`;
        layersSectionEl.style.maxHeight = `min(calc(100vh - 20px), ${targetH}px)`;
      } else {
        layersSectionEl.style.removeProperty("height");
        layersSectionEl.style.removeProperty("max-height");
      }
    }
  }
  if (dom.groupList) {
    const selectedShapeIdSet = new Set((state.selection?.ids || []).map(Number));
    const selectedGroupIdSet = new Set((state.selection?.groupIds || []).map(Number));
    if (!selectedGroupIdSet.size && state.activeGroupId != null) selectedGroupIdSet.add(Number(state.activeGroupId));
    const showCurrentLayerOnly = !!state.ui?.groupView?.currentLayerOnly;
    const activeLayerId = Number(state.activeLayerId);
    const shapeByIdFast = new Map((state.shapes || []).map(s => [Number(s.id), s]));
    const isShapeInActiveLayer = (shape) => {
      if (!shape) return false;
      const lid = Number(shape.layerId ?? activeLayerId);
      return Number.isFinite(lid) && lid === activeLayerId;
    };
    const isShapeInActiveLayerById = (sid) => isShapeInActiveLayer(shapeByIdFast.get(Number(sid)));
    const groups = (state.groups || []).map(g => ({ ...g, parentId: g.parentId == null ? null : Number(g.parentId) }));
    const groupsById = new Map(groups.map(g => [Number(g.id), g]));
    const byParent = new Map();
    for (const g of groups) {
      const pid = g.parentId == null ? null : Number(g.parentId);
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(g);
    }
    const activeGroupShapeIdSet = new Set();
    for (const selectedGroupId of selectedGroupIdSet) {
      const stack = [Number(selectedGroupId)];
      const seen = new Set();
      while (stack.length) {
        const gid = Number(stack.pop());
        if (!Number.isFinite(gid) || seen.has(gid)) continue;
        seen.add(gid);
        const g = groupsById.get(gid);
        if (!g) continue;
        for (const sid of (g.shapeIds || [])) activeGroupShapeIdSet.add(Number(sid));
        const children = byParent.get(gid) || [];
        for (const ch of children) stack.push(Number(ch.id));
      }
    }
    // Groups are displayed in state.groups array order (no sorting)
    if (!state.ui.groupTreeExpanded) state.ui.groupTreeExpanded = {};
    const groupSubtreeLayerMatchMemo = new Map();
    const hasLayerMatchInGroupSubtree = (groupId) => {
      const gid = Number(groupId);
      if (groupSubtreeLayerMatchMemo.has(gid)) return !!groupSubtreeLayerMatchMemo.get(gid);
      const g = groupsById.get(gid);
      if (!g) {
        groupSubtreeLayerMatchMemo.set(gid, false);
        return false;
      }
      const ownMatch = (g.shapeIds || []).some((sid) => isShapeInActiveLayerById(sid));
      let childMatch = false;
      for (const ch of (byParent.get(gid) || [])) {
        if (hasLayerMatchInGroupSubtree(ch.id)) {
          childMatch = true;
          break;
        }
      }
      const matched = ownMatch || childMatch;
      groupSubtreeLayerMatchMemo.set(gid, matched);
      return matched;
    };
    const rows = [];
    const visited = new Set();
    const walk = (pid, depth) => {
      const children = byParent.get(pid) || [];
      for (const g of children) {
        const gid = Number(g.id);
        if (visited.has(gid)) continue;
        visited.add(gid);
        if (showCurrentLayerOnly && !hasLayerMatchInGroupSubtree(gid)) continue;
        const childGroups = byParent.get(gid) || [];
        const visibleShapeIds = showCurrentLayerOnly
          ? (g.shapeIds || []).filter((sid) => isShapeInActiveLayerById(sid))
          : (Array.isArray(g.shapeIds) ? g.shapeIds : []);
        const hasChildGroups = showCurrentLayerOnly
          ? childGroups.some((ch) => hasLayerMatchInGroupSubtree(ch.id))
          : childGroups.length > 0;
        const hasShapes = visibleShapeIds.length > 0;
        rows.push({ group: g, depth, hasChildren: (hasChildGroups || hasShapes), visibleShapeCount: visibleShapeIds.length });
        const expanded = state.ui.groupTreeExpanded[Number(g.id)] !== false;
        if (expanded) walk(gid, depth + 1);
      }
    };
    walk(null, 0);
    // Fallback for orphan groups (invalid parent only)
    const allGroupIds = new Set(groups.map(g => Number(g.id)));
    for (const g of groups) {
      if (visited.has(Number(g.id))) continue;
      const pid = g.parentId == null ? null : Number(g.parentId);
      const parentMissing = pid != null && !allGroupIds.has(pid);
      if (!parentMissing) continue;
      const gid = Number(g.id);
      if (showCurrentLayerOnly && !hasLayerMatchInGroupSubtree(gid)) continue;
      const childGroups = byParent.get(gid) || [];
      const visibleShapeIds = showCurrentLayerOnly
        ? (g.shapeIds || []).filter((sid) => isShapeInActiveLayerById(sid))
        : (Array.isArray(g.shapeIds) ? g.shapeIds : []);
      const hasChildGroups = showCurrentLayerOnly
        ? childGroups.some((ch) => hasLayerMatchInGroupSubtree(ch.id))
        : childGroups.length > 0;
      const hasShapes = visibleShapeIds.length > 0;
      rows.push({ group: g, depth: 0, hasChildren: (hasChildGroups || hasShapes), visibleShapeCount: visibleShapeIds.length });
    }
    // Also account for shapes not in any group.
    // Cache inAnyGroup to avoid O(totalShapeIds) rebuild on every refreshUi when groups haven't changed.
    const inAnyGroupQuickSig = groups.map(g => `${Number(g.id)}:${(g.shapeIds || []).length}`).join(",");
    if (_inAnyGroupCacheSig !== inAnyGroupQuickSig || _inAnyGroupCache === null) {
      _inAnyGroupCacheSig = inAnyGroupQuickSig;
      _inAnyGroupCache = new Set();
      for (const g of groups) {
        for (const sid of (g.shapeIds || [])) _inAnyGroupCache.add(Number(sid));
      }
    }
    const inAnyGroup = _inAnyGroupCache;
    // Also cache unGroupedShapes using shapes count + inAnyGroup sig as key
    const unGroupedSig = `${inAnyGroupQuickSig}|${(state.shapes || []).length}`;
    if (_unGroupedShapesCacheSig !== unGroupedSig || _unGroupedShapesCache === null) {
      _unGroupedShapesCacheSig = unGroupedSig;
      _unGroupedShapesCache = (state.shapes || []).filter(s => !inAnyGroup.has(Number(s.id)));
    }
    const unGroupedShapes = showCurrentLayerOnly
      ? _unGroupedShapesCache.filter((s) => isShapeInActiveLayer(s))
      : _unGroupedShapesCache;

    const groupListSig = [
      String(getUiLanguage(state)),
      String(state.activeGroupId ?? ""),
      (state.selection?.ids || []).map(Number).sort((a, b) => a - b).join(","),
      (state.selection?.groupIds || []).map(Number).sort((a, b) => a - b).join(","),
      String(state.ui?.groupDragDrop?.draggingGroupId ?? ""),
      String(state.ui?.groupDragDrop?.draggingShapeId ?? ""),
      String(state.ui?.groupDragDrop?.overGroupId ?? ""),
      String(showCurrentLayerOnly ? 1 : 0),
      String(activeLayerId),
      rows.map(({ group, depth, visibleShapeCount }) => {
        const gid = Number(group.id);
        const expanded = state.ui.groupTreeExpanded[gid] !== false ? 1 : 0;
        const visible = group.visible !== false ? 1 : 0;
        const sids = `${visibleShapeCount}`;
        return `${gid}:${depth}:${expanded}:${visible}:${String(group.name || "")}:${String(group.parentId ?? "")}:${sids}`;
      }).join("|"),
      // Use count + first ID as cheap proxy to avoid O(n) string for large ungrouped sets
      `${unGroupedShapes.length}:${Number(unGroupedShapes[0]?.id ?? -1)}`,
    ].join("::");

    if (_groupListRenderSignature !== groupListSig) {
      _groupListRenderSignature = groupListSig;
      // Build shapeById map only when DOM actually needs updating
      const shapeById = new Map((state.shapes || []).map(s => [Number(s.id), s]));
      dom.groupList.innerHTML = "";
      if (rows.length === 0 && unGroupedShapes.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = panelText.noObjects;
      empty.style.color = "var(--muted)";
      empty.style.fontSize = "12px";
      empty.style.padding = "4px 2px";
      dom.groupList.appendChild(empty);
      }

      for (const { group, depth, hasChildren, visibleShapeCount } of rows) {
      const row = document.createElement("div");
      row.dataset.groupRow = String(group.id);
      row.draggable = true;
      row.style.display = "flex";
      row.style.gap = "6px";
      row.style.alignItems = "center";
      const isActiveGroup = Number(group.id) === Number(state.activeGroupId);
      const isSelectedGroup = selectedGroupIdSet.has(Number(group.id));
      row.style.border = isActiveGroup
        ? "1px solid rgba(37,99,235,0.42)"
        : (isSelectedGroup ? "1px solid rgba(96,165,250,0.45)" : "1px solid rgba(148,163,184,0.22)");
      row.style.background = isActiveGroup
        ? "rgba(219,234,254,0.7)"
        : (isSelectedGroup ? "rgba(239,246,255,0.78)" : "rgba(255,255,255,0.65)");
      const overGroupId = Number(state.ui?.groupDragDrop?.overGroupId);
      const draggingGroupId = Number(state.ui?.groupDragDrop?.draggingGroupId);
      if (Number.isFinite(overGroupId) && overGroupId === Number(group.id) && draggingGroupId !== Number(group.id)) {
        row.style.border = "1px solid rgba(22,163,74,0.45)";
        row.style.background = "rgba(220,252,231,0.72)";
      }
      row.style.borderRadius = "8px";
      row.style.padding = "4px 5px";
      const nameWrap = document.createElement("div");
      nameWrap.style.display = "flex";
      nameWrap.style.alignItems = "center";
      nameWrap.style.gap = "6px";
      nameWrap.style.paddingLeft = `${depth * 12}px`;
      const treeBtn = document.createElement("button");
      treeBtn.type = "button";
      treeBtn.dataset.groupToggle = String(group.id);
      treeBtn.style.width = "22px";
      treeBtn.style.minWidth = "22px";
      treeBtn.style.padding = "0";
      treeBtn.style.border = "none";
      treeBtn.style.background = "transparent";
      treeBtn.style.boxShadow = "none";
      treeBtn.style.color = "#64748b";
      treeBtn.style.fontSize = "18px";
      treeBtn.style.fontWeight = "700";
      treeBtn.style.lineHeight = "1";
      treeBtn.style.visibility = hasChildren ? "visible" : "hidden";
      const expanded = state.ui.groupTreeExpanded[Number(group.id)] !== false;
      treeBtn.textContent = hasChildren ? (expanded ? "▾" : "▸") : "";
      const name = document.createElement("div");
      name.textContent = `${group.name} (${visibleShapeCount})`;
      const groupHasSelectedObject = (!selectedGroupIdSet.size)
        && (group.shapeIds || []).some(sid => selectedShapeIdSet.has(Number(sid)));
      name.style.color = groupHasSelectedObject ? "#16a34a" : "var(--muted)";
      name.style.fontWeight = isActiveGroup ? "600" : "400";
      if (group.visible === false) {
        name.style.opacity = "0.55";
      }
      name.style.fontSize = "11px";
      name.style.flex = "1";
      row.style.cursor = "pointer";
      row.title = isActiveGroup ? panelText.active : panelText.clickToSelect;
      nameWrap.append(treeBtn, name);
      const visWrap = document.createElement("label");
      visWrap.style.display = "inline-flex";
      visWrap.style.alignItems = "center";
      visWrap.style.gap = "4px";
      visWrap.style.marginLeft = "auto";
      visWrap.style.cursor = "pointer";
      visWrap.title = (group.visible === false) ? "Show group" : "Hide group";
      visWrap.addEventListener("click", (ev) => ev.stopPropagation());
      visWrap.addEventListener("mousedown", (ev) => ev.stopPropagation());
      const visCb = document.createElement("input");
      visCb.type = "checkbox";
      visCb.setAttribute("data-group-visible", String(group.id));
      visCb.checked = group.visible !== false;
      visCb.style.margin = "0";
      visCb.addEventListener("click", (ev) => ev.stopPropagation());
      visCb.addEventListener("mousedown", (ev) => ev.stopPropagation());
      visWrap.append(visCb);
      row.append(nameWrap, visWrap);
      dom.groupList.appendChild(row);

      // Show child objects when this group is expanded.
      // Cap to MAX_GROUP_ROWS to avoid DOM explosion with large groups.
      if (expanded) {
        const MAX_GROUP_ROWS = 200;
        const shapeIds = Array.isArray(group.shapeIds) ? group.shapeIds : [];
        const visibleShapeIds = showCurrentLayerOnly
          ? shapeIds.filter((sid) => isShapeInActiveLayerById(sid))
          : shapeIds;
        const limit = Math.min(visibleShapeIds.length, MAX_GROUP_ROWS);
        for (let i = 0; i < limit; i++) {
          const s = shapeById.get(Number(visibleShapeIds[i]));
          if (!s) continue;
          renderShapeRow(dom.groupList, s, depth + 1, group.id, activeGroupShapeIdSet, selectedShapeIdSet);
        }
        if (visibleShapeIds.length > MAX_GROUP_ROWS) {
          const more = document.createElement("div");
          more.style.cssText = "padding:2px 8px 2px 24px;font-size:10px;color:var(--muted);";
          more.textContent = `...and ${visibleShapeIds.length - MAX_GROUP_ROWS} more`;
          dom.groupList.appendChild(more);
        }
      }
      }

      // Render Ungrouped section after groups so newly created groups stay at top.
      if (unGroupedShapes.length > 0) {
      // Add separator if there are also groups
      if (rows.length > 0) {
        const sep = document.createElement("div");
        sep.style.height = "1px";
        sep.style.background = "rgba(148,163,184,0.1)";
        sep.style.margin = "4px 8px";
        dom.groupList.appendChild(sep);
      }

      const unGroupHeader = document.createElement("div");
      unGroupHeader.style.display = "grid";
      unGroupHeader.style.gridTemplateColumns = "20px 1fr";
      unGroupHeader.style.gap = "6px";
      unGroupHeader.style.alignItems = "center";
      unGroupHeader.style.padding = "4px 5px";
      unGroupHeader.style.color = "var(--muted)";
      unGroupHeader.style.fontSize = "12px";
      unGroupHeader.style.fontWeight = "600";

      const icon = document.createElement("div");
      icon.textContent = "•";
      icon.style.textAlign = "center";
      const name = document.createElement("div");
      name.textContent = `${panelText.ungrouped} (${unGroupedShapes.length})`;
      unGroupHeader.append(icon, name);
      dom.groupList.appendChild(unGroupHeader);

        const MAX_UNGROUPED_ROWS = 200;
        const ugLimit = Math.min(unGroupedShapes.length, MAX_UNGROUPED_ROWS);
        for (let i = 0; i < ugLimit; i++) {
          renderShapeRow(dom.groupList, unGroupedShapes[i], 1, null, activeGroupShapeIdSet, selectedShapeIdSet);
        }
        if (unGroupedShapes.length > MAX_UNGROUPED_ROWS) {
          const more = document.createElement("div");
          more.style.cssText = "padding:2px 8px 2px 16px;font-size:10px;color:var(--muted);";
          more.textContent = `...and ${unGroupedShapes.length - MAX_UNGROUPED_ROWS} more`;
          dom.groupList.appendChild(more);
        }
      }
    }

    // Auto-grow group panel upward when expanded content no longer fits.
    // Cap by drawing area height so it never grows beyond the main viewport.
    const groupsSectionAuto = document.querySelector(".right-stack .section[data-panel-id='groups']");
    const groupsCollapsed = !!state.ui?.rightPanelCollapsed?.groups;
    if (groupsSectionAuto && !groupsCollapsed) {
      const listEl = dom.groupList;
      const currentListH = Math.max(0, listEl.clientHeight || 0);
      const neededListH = Math.max(0, listEl.scrollHeight || 0);
      let chromeH = 0;
      for (const child of Array.from(groupsSectionAuto.children || [])) {
        if (!(child instanceof HTMLElement)) continue;
        if (child === listEl) continue;
        if (child.classList.contains("panel-resize-handle")) continue;
        const style = window.getComputedStyle(child);
        if (style.display === "none") continue;
        chromeH += child.offsetHeight;
        const mt = parseFloat(style.marginTop || "0");
        const mb = parseFloat(style.marginBottom || "0");
        if (Number.isFinite(mt)) chromeH += mt;
        if (Number.isFinite(mb)) chromeH += mb;
      }
      chromeH = Math.max(0, Math.round(chromeH));
      // Keep extra bottom slack so the last row is never visually clipped.
      const naturalTargetH = chromeH + neededListH + 28;
      const maxByView = getMaxGroupPanelHeight(groupsSectionAuto);
      const minH = 180;
      const nextH = Math.max(minH, Math.min(maxByView, Math.ceil(naturalTargetH)));
      if (!state.ui.panelLayout) state.ui.panelLayout = {};
      const currentH = Number(state.ui.panelLayout.groupPanelHeight || groupsSectionAuto.getBoundingClientRect().height || 0);
      if (Math.abs(nextH - currentH) > 1) {
        state.ui.panelLayout.groupPanelHeight = nextH;
        groupsSectionAuto.style.height = `${nextH}px`;
        groupsSectionAuto.style.maxHeight = `${nextH}px`;
      }
    }
  }

  function renderShapeRow(parent, s, depth, ownerGroupId, activeGroupShapeIdSet, selectedShapeIdSetArg = null) {
    const objRow = document.createElement("div");
    objRow.dataset.groupShapeRow = String(s.id);
    if (ownerGroupId != null) objRow.dataset.ownerGroupId = String(ownerGroupId);
    objRow.style.display = "grid";
    objRow.draggable = true;
    objRow.style.gridTemplateColumns = "auto 1fr";
    objRow.style.gap = "6px";
    objRow.style.alignItems = "center";
    objRow.style.border = "1px dashed rgba(148,163,184,0.20)";
    objRow.style.borderRadius = "8px";
    objRow.style.padding = "3px 5px";
    const selectedSet = selectedShapeIdSetArg || new Set((state.selection?.ids || []).map(Number));
    const isShapeSelected = selectedSet.has(Number(s.id));
    const inActiveGroupSelection = !!activeGroupShapeIdSet?.has?.(Number(s.id));
    const isDirectObjectSelection = isShapeSelected && !inActiveGroupSelection;
    objRow.style.background = isDirectObjectSelection
      ? "rgba(254,215,170,0.72)"
      : "rgba(255,255,255,0.50)";
    if (isDirectObjectSelection) {
      objRow.style.border = "1px solid rgba(249,115,22,0.45)";
    }
    objRow.style.marginLeft = `${depth * 12}px`;
    objRow.style.cursor = "pointer";
    objRow.title = panelText.clickToSelectObject;

    const bullet = document.createElement("div");
    bullet.textContent = "•";
    bullet.style.color = "var(--muted)";
    bullet.style.fontSize = "12px";
    bullet.style.lineHeight = "1";

    const label = document.createElement("div");
    const typeEnMap = {
      line: "Line",
      rect: "Rect",
      circle: "Circle",
      arc: "Arc",
      dim: "Dim",
      dimchain: "DimChain",
      dimangle: "DimAngle",
      position: "Position",
      text: "Text",
      hatch: "Hatching",
      dline: "DLine",
    };
    label.textContent = `${typeEnMap[s.type] || s.type} #${s.id}`;
    label.style.fontSize = "11px";
    label.style.color = inActiveGroupSelection ? "#16a34a" : (isShapeSelected ? "var(--ink)" : "var(--muted)");

    objRow.append(bullet, label);
    parent.appendChild(objRow);
  }
  if (dom.deleteGroupBtn) dom.deleteGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.unparentGroupBtn) {
    const g = (state.groups || []).find(gg => Number(gg.id) === Number(state.activeGroupId));
    dom.unparentGroupBtn.disabled = !(g && g.parentId != null);
  }
  if (dom.moveGroupBtn) dom.moveGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.copyGroupBtn) dom.copyGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.renameGroupBtn) dom.renameGroupBtn.disabled = (state.activeGroupId == null);
  if (dom.renameGroupNameInput) {
    const activeGroup = (state.groups || []).find(g => Number(g.id) === Number(state.activeGroupId));
    if (!activeGroup) {
      if (document.activeElement !== dom.renameGroupNameInput) dom.renameGroupNameInput.value = "";
    } else if (document.activeElement !== dom.renameGroupNameInput) {
      dom.renameGroupNameInput.value = String(activeGroup.name || "");
    }
  }
  if (dom.moveGroupUpBtn || dom.moveGroupDownBtn) {
    const groups = state.groups || [];
    const idx = groups.findIndex(g => Number(g.id) === Number(state.activeGroupId));
    const canUp = idx > 0;
    const canDown = idx >= 0 && idx < (groups.length - 1);
    if (dom.moveGroupUpBtn) dom.moveGroupUpBtn.disabled = !canUp;
    if (dom.moveGroupDownBtn) dom.moveGroupDownBtn.disabled = !canDown;
  }
  if (dom.moveGroupOriginOnlyBtn) {
    const active = !!(state.input?.groupOriginPick?.active);
    dom.moveGroupOriginOnlyBtn.disabled = (state.activeGroupId == null);
    dom.moveGroupOriginOnlyBtn.classList.toggle("is-active", active);
    dom.moveGroupOriginOnlyBtn.textContent = active ? panelText.movingOrigin : panelText.moveOrigin;
  }
  const activeGroup = (state.groups || []).find((g) => Number(g.id) === Number(state.activeGroupId)) || null;
  const aim = activeGroup?.aimConstraint || {};
  const aimEnabled = !!aim.enabled;
  const aimTargetType = String(aim.targetType || "");
  const aimTargetId = Number(aim.targetId);
  const aimPickActive = !!(state.input?.groupAimPick?.active)
    && Number(state.input?.groupAimPick?.groupId) === Number(state.activeGroupId);
  const aimCandidateType = String(state.input?.groupAimPick?.candidateType || "");
  const aimCandidateId = Number(state.input?.groupAimPick?.candidateId);
  if (dom.groupAimEnableToggle) {
    dom.groupAimEnableToggle.disabled = (state.activeGroupId == null);
    dom.groupAimEnableToggle.checked = aimEnabled;
  }
  if (dom.groupAimPickBtn) {
    dom.groupAimPickBtn.disabled = (state.activeGroupId == null);
    dom.groupAimPickBtn.classList.toggle("is-active", aimPickActive);
    dom.groupAimPickBtn.textContent = aimPickActive
      ? ((panelLang === "en") ? "Confirm" : "決定")
      : ((panelLang === "en") ? "Pick Target" : "注視先を指定");
  }
  if (dom.groupAimClearBtn) {
    const hasAimTarget = aimTargetType.length > 0 && Number.isFinite(aimTargetId);
    dom.groupAimClearBtn.disabled = (state.activeGroupId == null) || (!hasAimTarget && !aimEnabled);
  }
  if (dom.groupAimStatus) {
    let text = (panelLang === "en") ? "Target: None" : "ターゲット: なし";
    if (aimTargetType === "group" && Number.isFinite(aimTargetId)) {
      text = (panelLang === "en") ? `Target: Group #${aimTargetId}` : `ターゲット: グループ #${aimTargetId}`;
    } else if (aimTargetType === "position" && Number.isFinite(aimTargetId)) {
      text = (panelLang === "en") ? `Target: Position #${aimTargetId}` : `ターゲット: 位置 #${aimTargetId}`;
    }
    if (aimPickActive) {
      if (aimCandidateType === "group" && Number.isFinite(aimCandidateId)) {
        text = (panelLang === "en") ? `Candidate: Group #${aimCandidateId}` : `候補: グループ #${aimCandidateId}`;
      } else if (aimCandidateType === "position" && Number.isFinite(aimCandidateId)) {
        text = (panelLang === "en") ? `Candidate: Position #${aimCandidateId}` : `候補: 位置 #${aimCandidateId}`;
      } else {
        text = (panelLang === "en") ? "Picking target..." : "クリック待機中...";
      }
    }
    if (aimEnabled && !aimPickActive) text += (panelLang === "en") ? " (ON)" : " (ON)";
    dom.groupAimStatus.textContent = text;
  }
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.disabled = !(state.tool === "select" && (state.selection?.ids?.length > 1) && state.activeGroupId == null);
  }
  if (dom.dimMergeGroupsBtn) {
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selectedShapes = selIds.size > 0 ? (state.shapes || []).filter(s => selIds.has(Number(s.id))) : [];
    const hasOnlyDims = selectedShapes.length > 0
      && selectedShapes.every(s => s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim");
    dom.dimMergeGroupsBtn.disabled = !(state.tool === "select" && (state.selection?.ids?.length > 1) && state.activeGroupId == null && hasOnlyDims);
  }
  const selIdsForObjMove = new Set((state.selection?.ids || []).map(Number));
  const selectedShapesForMove = selIdsForObjMove.size > 0 ? (state.shapes || []).filter(s => selIdsForObjMove.has(Number(s.id))) : [];
  const hasObjectSelectionForMove = state.tool === "select" && selectedShapesForMove.length > 0;
  const canCopyLineCircle = state.tool === "select"
    && selectedShapesForMove.length > 0
    && selectedShapesForMove.every(s => s.type === "line" || s.type === "circle" || s.type === "arc");
  if (dom.moveSelectedShapesBtn) {
    dom.moveSelectedShapesBtn.disabled = !hasObjectSelectionForMove;
  }
  if (dom.copySelectedShapesBtn) {
    dom.copySelectedShapesBtn.disabled = !canCopyLineCircle;
  }
  if (dom.groupRotateSnapInput) {
    const v = Number(state.input?.groupRotate?.snapDeg || 5);
    syncInputValue(dom.groupRotateSnapInput, v);
  }
  if (dom.selectMoveDxInput && (dom.selectMoveDxInput.value == null || dom.selectMoveDxInput.value === "")) {
    dom.selectMoveDxInput.value = "0";
  }
  if (dom.selectMoveDyInput && (dom.selectMoveDyInput.value == null || dom.selectMoveDyInput.value === "")) {
    dom.selectMoveDyInput.value = "0";
  }
  if (dom.vertexMoveDxInput) {
    const v = Number(state.vertexEdit?.moveDx || 0);
    syncInputValue(dom.vertexMoveDxInput, v);
  }
  if (dom.vertexMoveDyInput) {
    const v = Number(state.vertexEdit?.moveDy || 0);
    syncInputValue(dom.vertexMoveDyInput, v);
  }
  if (dom.moveVertexBtn) {
    dom.moveVertexBtn.disabled = !(state.vertexEdit?.selectedVertices?.length > 0);
  }
  if (dom.vertexLinkCoincidentToggle) {
    dom.vertexLinkCoincidentToggle.checked = state.vertexEdit?.linkCoincident !== false;
  }
  if (dom.lineLengthInput) {
    const v = Number(state.lineSettings?.length || 0);
    syncInputValue(dom.lineLengthInput, v);
  }
  if (dom.lineAngleInput) {
    const v = Number(state.lineSettings?.angleDeg || 0);
    syncInputValue(dom.lineAngleInput, v);
  }
  if (dom.applyLineInputBtn) {
    const on = !!state.lineSettings?.sizeLocked;
    dom.applyLineInputBtn.disabled = !(state.tool === "line");
    dom.applyLineInputBtn.textContent = on
      ? (panelLang === "en" ? "Unlock Size" : "サイズ固定解除")
      : (panelLang === "en" ? "Lock Size" : "サイズ固定");
    dom.applyLineInputBtn.classList.toggle("active", on);
  }
  if (dom.lineAnchorSelect) {
    const v = String(state.lineSettings?.anchor || "endpoint_a");
    if (dom.lineAnchorSelect.value !== v) dom.lineAnchorSelect.value = v;
  }
  if (dom.rectWidthInput) {
    const v = Number(state.rectSettings?.width || 0);
    syncInputValue(dom.rectWidthInput, v);
  }
  if (dom.rectHeightInput) {
    const v = Number(state.rectSettings?.height || 0);
    syncInputValue(dom.rectHeightInput, v);
  }
  if (dom.applyRectInputBtn) {
    const on = !!state.rectSettings?.sizeLocked;
    dom.applyRectInputBtn.disabled = !(state.tool === "rect");
    dom.applyRectInputBtn.textContent = on
      ? (panelLang === "en" ? "Unlock Size" : "サイズ固定解除")
      : (panelLang === "en" ? "Lock Size" : "サイズ固定");
    dom.applyRectInputBtn.classList.toggle("active", on);
  }
  if (dom.rectAnchorSelect) {
    const v = String(state.rectSettings?.anchor || "c");
    if (dom.rectAnchorSelect.value !== v) dom.rectAnchorSelect.value = v;
  }
  if (dom.circleRadiusInput) {
    const v = Number(state.circleSettings?.radius || 0);
    syncInputValue(dom.circleRadiusInput, v);
  }
  if (dom.circleModeSelect) {
    const modeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const mode = (modeRaw === "fixed" || modeRaw === "threepoint" || modeRaw === "drag")
      ? modeRaw
      : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
    if (dom.circleModeSelect.value !== mode) dom.circleModeSelect.value = mode;
    if (dom.circleRadiusRow) dom.circleRadiusRow.style.display = (mode === "threepoint") ? "none" : "grid";
    if (dom.circleThreePointHint) dom.circleThreePointHint.style.display = (mode === "threepoint") ? "block" : "none";
    if (dom.circleThreePointOps) dom.circleThreePointOps.style.display = (mode === "threepoint") ? "block" : "none";
    if (dom.circleThreePointRunBtn) {
      const touchMode = !!state.ui?.touchMode;
      const count = Array.isArray(state.input?.circleThreePointRefs) ? state.input.circleThreePointRefs.length : 0;
      dom.circleThreePointRunBtn.style.display = touchMode ? "none" : "";
      dom.circleThreePointRunBtn.disabled = !(mode === "threepoint" && count >= 3);
    }
  }
  if (dom.applyCircleInputBtn) {
    const modeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const on = (modeRaw === "fixed") || (!!state.circleSettings?.radiusLocked && modeRaw !== "drag" && modeRaw !== "threepoint");
    dom.applyCircleInputBtn.disabled = !(state.tool === "circle");
    dom.applyCircleInputBtn.textContent = on
      ? (panelLang === "en" ? "Unlock Radius" : "半径固定解除")
      : (panelLang === "en" ? "Lock Radius" : "半径固定");
    dom.applyCircleInputBtn.classList.toggle("active", on);
  }
  if (dom.filletRadiusInput) {
    const v = Number(state.filletSettings?.radius || 20);
    syncInputValue(dom.filletRadiusInput, v);
  }
  if (dom.filletLineModeSelect) {
    const v = (String(state.filletSettings?.lineMode || "split").toLowerCase() === "split") ? "split" : "trim";
    if (dom.filletLineModeSelect.value !== v) dom.filletLineModeSelect.value = v;
  }
  if (dom.filletNoTrimToggle) {
    dom.filletNoTrimToggle.checked = !!state.filletSettings?.noTrim;
  }
  if (dom.trimNoDeleteToggle) {
    dom.trimNoDeleteToggle.checked = !!state.trimSettings?.noDelete;
  }
  if (dom.applyFilletBtn) {
    const touchMode = !!state.ui?.touchMode;
    dom.applyFilletBtn.style.display = (!touchMode && state.tool === "fillet") ? "" : "none";
    dom.applyFilletBtn.disabled = !((state.selection?.ids || []).length >= 2);
  }
  if (dom.dlineOffsetInput) {
    const v = Number(state.dlineSettings?.offset || 10);
    syncInputValue(dom.dlineOffsetInput, v);
  }
  if (dom.dlineModeSelect) {
    const v = state.dlineSettings?.mode || "both";
    if (dom.dlineModeSelect.value !== v) dom.dlineModeSelect.value = v;
  }
  if (dom.dlineNoTrimToggle) {
    dom.dlineNoTrimToggle.checked = !!state.dlineSettings?.noTrim;
  }
  if (dom.applyDLineBtn) {
    const touchMode = !!state.ui?.touchMode;
    const ready = !!(state.tool === "doubleline" && state.dlinePreview && state.dlinePreview.length > 0);
    dom.applyDLineBtn.style.display = touchMode ? "none" : "";
    dom.applyDLineBtn.disabled = !ready;
  }
  if (dom.positionSizeInput) {
    const selectedPosition = (() => {
      const ids = new Set((state.selection?.ids || []).map(Number));
      if (!ids.size) return null;
      for (const s of (state.shapes || [])) {
        if (!ids.has(Number(s.id))) continue;
        if (s.type === "position") return s;
      }
      return null;
    })();
    const v = Number(selectedPosition?.size ?? state.positionSettings?.size ?? 20);
    syncInputValue(dom.positionSizeInput, v);
  }
  if (dom.selectionLineWidthInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    const selected = [];
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "line" && s.type !== "circle" && s.type !== "arc" && s.type !== "position" && s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim") continue;
      selected.push(s);
    }
    const first = selected[0] || null;
    const v = normalizeLineWidthPreset(first?.lineWidthMm ?? state.lineWidthMm ?? 0.25);
    syncInputValue(dom.selectionLineWidthInput, v);
    dom.selectionLineWidthInput.disabled = !selected.length;
  }
  if (dom.selectionLineTypeInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "line" && s.type !== "circle" && s.type !== "arc" && s.type !== "position" && s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim") continue;
      first = s;
      break;
    }
    dom.selectionLineTypeInput.value = normalizeLineTypePreset(first?.lineType ?? "solid");
    dom.selectionLineTypeInput.disabled = !first;
  }
  if (dom.selectionColorInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      first = s;
      break;
    }
    const color = (() => {
      if (!first) return "#0f172a";
      if (first.type === "text") return String(first.textColor || "#0f172a");
      if (first.type === "hatch") return String(first.lineColor || "#0f172a");
      return String(first.color || "#0f172a");
    })();
    dom.selectionColorInput.value = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f172a";
    dom.selectionColorInput.disabled = !first;
  }
  if (dom.selectionPositionSizeInput) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "position") continue;
      first = s;
      break;
    }
    const v = Math.max(1, Number(first?.size ?? state.positionSettings?.size ?? 20));
    syncInputValue(dom.selectionPositionSizeInput, v);
    dom.selectionPositionSizeInput.disabled = !first;
  }
  if (dom.selectionImageWidthInput || dom.selectionImageHeightInput || dom.selectionImageLockAspectToggle || dom.selectionImageLockTransformToggle) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let first = null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type !== "image") continue;
      first = s;
      break;
    }
    if (dom.selectionImageWidthInput) {
      const v = Math.max(1, Number(first?.width || 1));
      syncInputValue(dom.selectionImageWidthInput, v);
      dom.selectionImageWidthInput.disabled = !first;
    }
    if (dom.selectionImageHeightInput) {
      const v = Math.max(1, Number(first?.height || 1));
      syncInputValue(dom.selectionImageHeightInput, v);
      dom.selectionImageHeightInput.disabled = !first;
    }
    if (dom.selectionImageLockAspectToggle) {
      dom.selectionImageLockAspectToggle.checked = !!first?.lockAspect;
      dom.selectionImageLockAspectToggle.disabled = !first;
    }
    if (dom.selectionImageLockTransformToggle) {
      dom.selectionImageLockTransformToggle.checked = !!first?.lockTransform;
      dom.selectionImageLockTransformToggle.disabled = !first;
    }
    const transformLocked = !!first?.lockTransform;
    if (dom.selectionImageWidthInput) dom.selectionImageWidthInput.disabled = !first || transformLocked;
    if (dom.selectionImageHeightInput) dom.selectionImageHeightInput.disabled = !first || transformLocked;
    if (dom.selectionImageLockAspectToggle) dom.selectionImageLockAspectToggle.disabled = !first || transformLocked;
  }
  if (dom.selectionCircleCenterMarkToggle) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    const circles = (state.shapes || []).filter(s => {
      if (!ids.has(Number(s.id))) return false;
      return s.type === "circle" || s.type === "arc";
    });
    if (circles.length > 0) {
      dom.selectionCircleCenterMarkToggle.checked = circles.every(s => !!s.showCenterMark);
      dom.selectionCircleCenterMarkToggle.disabled = false;
    } else {
      dom.selectionCircleCenterMarkToggle.checked = !!state.circleSettings?.showCenterMark;
      dom.selectionCircleCenterMarkToggle.disabled = true;
    }
  }
  if (dom.selectionCircleRadiusInput || dom.selectionApplyCircleRadiusBtn) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    const circles = (state.shapes || []).filter(s => ids.has(Number(s.id)) && (s.type === "circle" || s.type === "arc"));
    const first = circles[0] || null;
    if (dom.selectionCircleRadiusInput) {
      const v = Math.max(0, Number(first?.r ?? state.circleSettings?.radius ?? 50) || 0);
      syncInputValue(dom.selectionCircleRadiusInput, v);
      dom.selectionCircleRadiusInput.disabled = !first;
    }
    if (dom.selectionApplyCircleRadiusBtn) {
      dom.selectionApplyCircleRadiusBtn.disabled = !first;
    }
  }
  if (dom.dimLinearMode) dom.dimLinearMode.value = state.dimSettings.linearMode || "single";
  if (dom.dimIgnoreGridSnapToggle) dom.dimIgnoreGridSnapToggle.checked = !!state.dimSettings.ignoreGridSnap;
  if (dom.dimSnapMode) dom.dimSnapMode.value = state.dimSettings.snapMode || "object";
  if (dom.dimCircleMode) dom.dimCircleMode.value = state.dimSettings.circleMode || "radius";
  const selectedDim = (() => {
    const ids = new Set((state.selection?.ids || []).map(Number));
    if (!ids.size) return null;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim") {
        return s;
      }
    }
    return null;
  })();
  const dimUiSource = selectedDim || state.dimSettings || {};
  if (dom.dimCircleArrowSide) dom.dimCircleArrowSide.value = (dimUiSource.circleArrowSide === "inside" ? "inside" : (state.dimSettings.circleArrowSide === "inside" ? "inside" : "outside"));
  if (dom.dimPrecisionSelect) {
    dom.dimPrecisionSelect.value = String(Math.max(0, Math.min(3, Number(dimUiSource.precision ?? state.dimSettings?.precision ?? 1))));
  }
  if (dom.dimArrowTypeSelect) {
    const raw = String(dimUiSource.dimArrowType ?? state.dimSettings?.dimArrowType ?? "open").toLowerCase();
    const v = (raw === "closed" || raw === "hollow" || raw === "circle" || raw === "circle_filled") ? raw : "open";
    if (dom.dimArrowTypeSelect.value !== v) dom.dimArrowTypeSelect.value = v;
  }
  if (dom.dimArrowSizeInput) {
    const av = Math.max(1, Number(dimUiSource.dimArrowSizePt ?? dimUiSource.dimArrowSize ?? state.dimSettings?.dimArrowSize ?? 10) || 10);
    syncInputValue(dom.dimArrowSizeInput, av);
  }
  if (dom.dimArrowDirectionSelect) {
    const v = (String(dimUiSource.dimArrowDirection ?? state.dimSettings?.dimArrowDirection ?? "normal") === "reverse") ? "reverse" : "normal";
    if (dom.dimArrowDirectionSelect.value !== v) dom.dimArrowDirectionSelect.value = v;
  }
  if (dom.dimFontSizeInput) {
    syncInputValue(dom.dimFontSizeInput, Math.max(1, Number(dimUiSource.fontSize ?? state.dimSettings?.fontSize ?? 12)));
  }
  if (dom.dimTextRotateInput) {
    const tv = (dimUiSource.textRotate ?? state.dimSettings?.textRotate);
    dom.dimTextRotateInput.value = (tv === "auto" || tv == null) ? "auto" : String(tv);
  }
  if (dom.dimExtOffsetInput) syncInputValue(dom.dimExtOffsetInput, dimUiSource.extOffset ?? state.dimSettings?.extOffset ?? 2);
  if (dom.dimExtOverInput) syncInputValue(dom.dimExtOverInput, dimUiSource.extOver ?? state.dimSettings?.extOver ?? 2);
  if (dom.dimROvershootInput) syncInputValue(dom.dimROvershootInput, dimUiSource.rOverrun ?? state.dimSettings?.rOvershoot ?? 5);
  const dimExtOffsetWrap = document.getElementById("dimExtOffsetWrap");
  const dimExtOverWrap = document.getElementById("dimExtOverWrap");
  const isAngleDimContext = (state.tool === "dim" && String(state.dimSettings?.linearMode || "single") === "angle")
    || (selectedDim && selectedDim.type === "dimangle");
  if (dimExtOffsetWrap) dimExtOffsetWrap.style.display = isAngleDimContext ? "none" : "";
  if (dimExtOverWrap) dimExtOverWrap.style.display = isAngleDimContext ? "none" : "";

  const dimChainOps = document.getElementById("dimChainOps");
  if (dimChainOps) {
    dimChainOps.style.display = (state.tool === "dim" && state.dimSettings.linearMode === "chain") ? "block" : "none";
    const touchMode = !!state.ui?.touchMode;
    const isChain = state.tool === "dim" && String(state.dimSettings?.linearMode || "single") === "chain";
    const isDraft = !!(state.dimDraft && state.dimDraft.type === "dimchain");
    const canPrepare = isChain && isDraft && !state.dimDraft.awaitingPlacement && (state.dimDraft.points || []).length >= 2;
    const canFinalize = isChain && isDraft && !!state.dimDraft.awaitingPlacement && !!state.dimDraft.place;
    if (dom.dimChainPrepareBtn) {
      dom.dimChainPrepareBtn.style.display = (!touchMode && isChain) ? "" : "none";
      dom.dimChainPrepareBtn.disabled = !canPrepare;
    }
    if (dom.dimChainFinalizeBtn) {
      dom.dimChainFinalizeBtn.style.display = (!touchMode && isChain) ? "" : "none";
      dom.dimChainFinalizeBtn.disabled = !canFinalize;
    }
  }
  const dimModeOptions = document.getElementById("dimModeOptions");
  if (dimModeOptions) {
    dimModeOptions.style.display = (state.tool === "dim") ? "" : "none";
  }

  if (dom.applyDimSettingsBtn) {
    const ids = new Set((state.selection?.ids || []).map(Number));
    let hasDim = false;
    for (const s of (state.shapes || [])) {
      if (!ids.has(Number(s.id))) continue;
      if (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim") { hasDim = true; break; }
    }
    dom.applyDimSettingsBtn.disabled = !hasDim;
  }
  if (dom.previewPrecisionSelect) {
    dom.previewPrecisionSelect.value = String(Math.max(0, Math.min(3, Number(state.previewSettings?.precision ?? 2))));
  }
  if (dom.pageSizeSelect) {
    const v = String(state.pageSetup?.size || "A4");
    if (dom.pageSizeSelect.value !== v) dom.pageSizeSelect.value = v;
  }
  if (dom.pageOrientationSelect) {
    const v = (String(state.pageSetup?.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
    if (dom.pageOrientationSelect.value !== v) dom.pageOrientationSelect.value = v;
  }
  if (dom.pageScaleInput) {
    const v = normalizePageScalePreset(state.pageSetup?.scale ?? 1);
    syncInputValue(dom.pageScaleInput, v);
  }
  if (dom.maxZoomInput) {
    const v = normalizeMaxZoomPreset(state.view?.maxScale ?? 100);
    syncInputValue(dom.maxZoomInput, v);
  }
  if (dom.menuScaleSelect) {
    syncInputValue(dom.menuScaleSelect, menuScalePct);
  }
  if (dom.touchModeToggle) {
    dom.touchModeToggle.checked = !!state.ui?.touchMode;
  }
  if (dom.touchConfirmOverlay && dom.touchConfirmBtn) {
    const touchMode = !!state.ui?.touchMode;
    const tool = String(state.tool || "");
    const lineModeRaw = String(state.lineSettings?.mode || (state.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
    const lineMode = (lineModeRaw === "continuous" || lineModeRaw === "freehand") ? lineModeRaw : "segment";
    const circleModeRaw = String(state.circleSettings?.mode || "").toLowerCase();
    const circleMode = (circleModeRaw === "fixed" || circleModeRaw === "threepoint" || circleModeRaw === "drag")
      ? circleModeRaw
      : ((state.circleSettings?.radiusLocked ? "fixed" : "drag"));
    const circleThreePointCount = Array.isArray(state.input?.circleThreePointRefs) ? state.input.circleThreePointRefs.length : 0;
    const isChainDim = tool === "dim" && String(state.dimSettings?.linearMode || "single") === "chain";
    const chainDraft = (state.dimDraft && state.dimDraft.type === "dimchain") ? state.dimDraft : null;
    const canPrepareDim = !!(isChainDim && chainDraft && !chainDraft.awaitingPlacement && (chainDraft.points || []).length >= 2);
    const canFinalizeDim = !!(isChainDim && chainDraft && chainDraft.awaitingPlacement && chainDraft.place);
    const canLineFinalize = (tool === "line" && (lineMode === "continuous" || lineMode === "freehand"));
    const canCircleThreePoint = (tool === "circle" && circleMode === "threepoint" && circleThreePointCount >= 3);
    const hasPatternCopySelection = ((state.selection?.ids || []).length > 0) || ((state.selection?.groupIds || []).length > 0);
    const patternCopyMode = String(state.patternCopySettings?.mode || "array");
    let canPatternCopy = (tool === "patterncopy" && hasPatternCopySelection);
    if (canPatternCopy && patternCopyMode === "rotate") canPatternCopy = !!state.input?.patternCopyFlow?.centerPositionId;
    if (canPatternCopy && patternCopyMode === "mirror") canPatternCopy = !!state.input?.patternCopyFlow?.axisLineId;
    const canFillet = (tool === "fillet" && (state.selection?.ids || []).length >= 2);
    const canDline = (tool === "doubleline" && Array.isArray(state.dlinePreview) && state.dlinePreview.length > 0);
    const canHatch = (tool === "hatch" && (state.hatchDraft?.boundaryIds || []).length > 0);
    const show = touchMode && (canLineFinalize || isChainDim || (tool === "circle" && circleMode === "threepoint") || tool === "fillet" || tool === "doubleline" || tool === "hatch" || tool === "patterncopy");
    let enabled = false;
    let label = panelLang === "en" ? "Confirm" : "決定";
    if (canLineFinalize) {
      enabled = !!(state.polylineDraft && (state.polylineDraft.points || []).length >= 2);
      label = (lineMode === "freehand")
        ? (panelLang === "en" ? "Finalize B-Spline" : "Bスプライン確定")
        : (panelLang === "en" ? "Finish Continuous Line" : "連続線を確定");
    } else if (isChainDim) {
      enabled = canPrepareDim || canFinalizeDim;
      label = canFinalizeDim
        ? (panelLang === "en" ? "Finalize Dim" : "寸法確定")
        : (panelLang === "en" ? "Set Placement" : "配置位置を指定");
    } else if (tool === "circle" && circleMode === "threepoint") {
      enabled = canCircleThreePoint;
      label = panelLang === "en" ? "Create 3-Point Circle" : "三点円を作成";
    } else if (tool === "fillet") {
      enabled = canFillet;
      label = panelLang === "en" ? "Apply Fillet" : "フィレット実行";
    } else if (tool === "doubleline") {
      enabled = canDline;
      label = panelLang === "en" ? "Apply Double Line" : "二重線を適用";
    } else if (tool === "hatch") {
      enabled = canHatch;
      label = panelLang === "en" ? "Apply Hatch" : "ハッチング実行";
    } else if (tool === "patterncopy") {
      enabled = canPatternCopy;
      label = panelLang === "en" ? "Run Pattern Copy" : "パターンコピー実行";
    }
    dom.touchConfirmOverlay.style.display = show ? "block" : "none";
    dom.touchConfirmBtn.disabled = !enabled;
    dom.touchConfirmBtn.textContent = label;
  }
  if (dom.touchSelectBackOverlay && dom.touchSelectBackBtn) {
    const touchMode = !!state.ui?.touchMode;
    const isSelect = String(state.tool || "") === "select";
    dom.touchSelectBackOverlay.style.display = (touchMode && !isSelect) ? "block" : "none";
  }
  if (dom.fpsDisplayToggle) {
    dom.fpsDisplayToggle.checked = !!state.ui?.showFps;
  }
  if (dom.objectCountDisplayToggle) {
    dom.objectCountDisplayToggle.checked = !!state.ui?.showObjectCount;
  }
  if (dom.autoBackupToggle) {
    dom.autoBackupToggle.checked = state.ui?.autoBackupEnabled !== false;
  }
  if (dom.autoBackupIntervalSelect) {
    const sec = Math.max(60, Math.min(600, Math.round(Number(state.ui?.autoBackupIntervalSec ?? 60) || 60)));
    syncInputValue(dom.autoBackupIntervalSelect, sec);
  }
  if (dom.pageUnitSelect) {
    const v = String(state.pageSetup?.unit || "mm");
    if (dom.pageUnitSelect.value !== v) dom.pageUnitSelect.value = v;
  }
  const toolStrokeSync = [
    { cfg: state.lineSettings, width: dom.lineToolLineWidthInput, type: dom.lineToolLineTypeInput },
    { cfg: state.rectSettings, width: dom.rectToolLineWidthInput, type: dom.rectToolLineTypeInput },
    { cfg: state.circleSettings, width: dom.circleToolLineWidthInput, type: dom.circleToolLineTypeInput },
    { cfg: state.filletSettings, width: dom.filletToolLineWidthInput, type: dom.filletToolLineTypeInput },
    { cfg: state.positionSettings, width: dom.positionToolLineWidthInput, type: dom.positionToolLineTypeInput },
    { cfg: state.textSettings, width: dom.textToolLineWidthInput, type: dom.textToolLineTypeInput },
    { cfg: (selectedDim || state.dimSettings), width: dom.dimToolLineWidthInput, type: dom.dimToolLineTypeInput },
    { cfg: (selectedHatch || state.hatchSettings), width: dom.hatchToolLineWidthInput, type: null },
    { cfg: state.dlineSettings, width: dom.dlineToolLineWidthInput, type: dom.dlineToolLineTypeInput },
  ];
  for (const it of toolStrokeSync) {
    if (it.width) syncInputValue(it.width, normalizeLineWidthPreset(it.cfg?.lineWidthMm ?? 0.25));
    if (it.type) it.type.value = normalizeLineTypePreset(it.cfg?.lineType ?? "solid");
  }
  if (dom.pageShowFrameToggle) {
    dom.pageShowFrameToggle.checked = state.pageSetup?.showFrame !== false;
  }
  if (dom.pageInnerMarginInput) {
    const v = Math.max(0, Number(state.pageSetup?.innerMarginMm ?? 10) || 0);
    syncInputValue(dom.pageInnerMarginInput, v);
  }
}


