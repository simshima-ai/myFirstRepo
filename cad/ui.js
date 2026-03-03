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
    { type: "tool", id: "select", label: "選択", group: "select" },
    { type: "action", id: "resetView", label: "表示リセット", implemented: true, group: "view" },
    { type: "sep" },
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
      ],
    },
    { type: "tool", id: "settings", label: "設定", group: "file" },
  ];
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
  return String(state?.ui?.language || "ja").toLowerCase() === "en" ? "en" : "ja";
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
      groups: "グループ",
      layers: "レイヤー",
      groupOps: "グループ操作",
      createGroup: "新規グループ作成",
      layerOps: "レイヤー操作",
      rename: "リネーム",
      colorize: "カラー分け表示",
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
      lineContinuousMode: "連続線モード",
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
      groups: "Groups",
      layers: "Layers",
      groupOps: "Group Ops",
      createGroup: "New Group",
      layerOps: "Layer Ops",
      rename: "Rename",
      colorize: "Colorize",
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
      lineContinuousMode: "Continuous Line Mode",
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

  // Tool context labels/options
  setLabelByControl("lineContinuousToggle", t.lineContinuousMode);
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
  setPrevSpanByControl("positionToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("positionToolLineTypeInput", t.lineType);
  setPrevSpanByControl("textToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("textToolLineTypeInput", t.lineType);
  setPrevSpanByControl("hatchToolLineWidthInput", t.lineWidth);
  setPrevSpanByControl("hatchToolLineTypeInput", t.lineType);
  setPrevSpanByControl("dlineOffsetInput", t.offset);
  setPrevSpanByControl("dlineModeSelect", t.mode);
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
    "hatchToolLineTypeInput",
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
    if (item.group) btn.dataset.menuGroup = item.group;
    if (item.type === "tool") {
      btn.dataset.tool = item.id;
      btn.addEventListener("click", () => {
        if (item.id === "settings" && state.tool === "settings") actions.setTool("select");
        else actions.setTool(item.id);
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
      const row = t?.closest?.("[data-group-row]");
      if (!row) return;
      const gid = Number(row.dataset.groupRow);
      if (!Number.isFinite(gid)) return;

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
  if (dom.selectionTextColorInput) {
    dom.selectionTextColorInput.addEventListener("input", (e) => {
      actions.updateSelectedTextSettings?.({ textColor: e.target.value });
    });
  }
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
  if (dom.lineContinuousToggle) {
    dom.lineContinuousToggle.addEventListener("change", () => {
      state.lineSettings.continuous = !!dom.lineContinuousToggle.checked;
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
  if (dom.textColorInput) {
    dom.textColorInput.addEventListener("input", () => actions.setTextSettings({ color: dom.textColorInput.value }));
  }
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
  const toolStrokeControls = [
    { tool: "line", width: dom.lineToolLineWidthInput, type: dom.lineToolLineTypeInput },
    { tool: "rect", width: dom.rectToolLineWidthInput, type: dom.rectToolLineTypeInput },
    { tool: "circle", width: dom.circleToolLineWidthInput, type: dom.circleToolLineTypeInput },
    { tool: "fillet", width: dom.filletToolLineWidthInput, type: dom.filletToolLineTypeInput },
    { tool: "position", width: dom.positionToolLineWidthInput, type: dom.positionToolLineTypeInput },
    { tool: "text", width: dom.textToolLineWidthInput, type: dom.textToolLineTypeInput },
    { tool: "dim", width: dom.dimToolLineWidthInput, type: dom.dimToolLineTypeInput },
    { tool: "hatch", width: dom.hatchToolLineWidthInput, type: dom.hatchToolLineTypeInput },
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
  if (dom.hatchPatternSelect) {
    dom.hatchPatternSelect.addEventListener("change", () => actions.setHatchSettings({ pattern: dom.hatchPatternSelect.value }));
  }
  if (dom.hatchCrossAngleInput) {
    dom.hatchCrossAngleInput.addEventListener("change", () => actions.setHatchSettings({ crossAngleDeg: Number(dom.hatchCrossAngleInput.value) || 90 }));
  }
  if (dom.hatchPaddingInput) {
    dom.hatchPaddingInput.addEventListener("change", () => actions.setHatchSettings({ repetitionPaddingMm: Number(dom.hatchPaddingInput.value) || 0 }));
  }
  if (dom.hatchLineTypeSelect) {
    dom.hatchLineTypeSelect.addEventListener("change", () => actions.setHatchSettings({ lineType: dom.hatchLineTypeSelect.value }));
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
      state.dlineSettings.offset = Number(dom.dlineOffsetInput.value) || 10;
      refreshUiDeferred();
    });
  }
  if (dom.dlineModeSelect) {
    dom.dlineModeSelect.addEventListener("change", () => {
      state.dlineSettings.mode = dom.dlineModeSelect.value;
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

export function refreshUi(state, dom) {
  dom.buildBadge.textContent = `Build ${state.buildVersion}`;
  dom.statusText.textContent = state.ui.statusText || "";
  applyLanguageUi(state, dom);
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
    document.querySelector(".sidebar"),
    document.querySelector(".left-aux-stack"),
    document.querySelector(".top-context"),
    document.querySelector(".right-stack"),
  ];
  for (const el of scaleRoots) {
    if (!el) continue;
    el.style.zoom = String(menuScale);
  }
  const sidebarEl = document.querySelector(".sidebar");
  if (sidebarEl) {
    // Measure actual sidebar content height from direct child blocks
    // (snap/attrs stack + tools/edit/files sections), not only .left-aux-stack.
    const sidebarRect = sidebarEl.getBoundingClientRect();
    let contentH = 0;
    for (const child of Array.from(sidebarEl.children || [])) {
      const cs = window.getComputedStyle(child);
      if (cs.display === "none") continue;
      const childRect = child.getBoundingClientRect();
      const h = Number(childRect.bottom || 0) - Number(sidebarRect.top || 0);
      if (h > contentH) contentH = h;
    }
    if (contentH <= 0) contentH = Number(sidebarEl.scrollHeight || 0);
    const viewH = Number(sidebarRect.height || sidebarEl.clientHeight || 0);
    // Add a small tolerance to avoid "always-on" scrollbar due to sub-pixel rounding.
    const needScroll = (contentH - viewH) > 6;
    sidebarEl.style.overflowY = needScroll ? "auto" : "hidden";
  }
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
    let activeCtx = "";
    if (tool === "patterncopy") activeCtx = "patterncopy";
    if (tool === "vertex") activeCtx = "vertex";
    if (tool === "line") activeCtx = "line";
    if (tool === "rect") activeCtx = "rect";
    const hasCircleSelected = (state.selection?.ids || []).some(id => {
      const s = state.shapes.find(sh => Number(sh.id) === Number(id));
      return s && (s.type === "circle" || s.type === "arc");
    });
    if (!activeCtx && (tool === "circle" || (tool !== "select" && hasCircleSelected))) activeCtx = "circle";
    const hasPositionSelected = (state.selection?.ids || []).some(id => {
      const s = state.shapes.find(sh => Number(sh.id) === Number(id));
      return s && s.type === "position";
    });
    if (!activeCtx && (tool === "position" || (tool !== "select" && hasPositionSelected))) activeCtx = "position";
    if (!activeCtx && tool === "text") activeCtx = "text";
    const hasDimSelected = (state.selection?.ids || []).some(id => {
      const s = state.shapes.find(sh => Number(sh.id) === Number(id));
      return s && (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim");
    });
    if (!activeCtx && (tool === "dim" || hasDimSelected)) activeCtx = "dim";
    if (!activeCtx && tool === "fillet") activeCtx = "fillet";
    if (!activeCtx && tool === "trim") activeCtx = "trim";
    if (tool === "settings") {
      activeCtx = "settings";
    }
    if (!activeCtx && tool === "doubleline") activeCtx = "doubleline";

    // 選択中にハッチがあればハッチパネルを出す
    const hasHatchSelected = (state.selection?.ids || []).some(id => {
      const s = state.shapes.find(sh => sh.id === id);
      return s && s.type === "hatch";
    });
    if (!activeCtx && (tool === "hatch" || hasHatchSelected)) activeCtx = "hatch";
    if (tool === "select") {
      const selIds = state.selection?.ids || [];
      const hasActiveGroup = state.activeGroupId != null;
      const hasNonDimSelection = selIds.some(id => {
        const s = state.shapes.find(sh => Number(sh.id) === Number(id));
        return s && s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim";
      });
      // Handle the case where ONLY dimensions are selected
      const hasOnlyDimSelection = selIds.length > 0 && selIds.every(id => {
        const s = state.shapes.find(sh => Number(sh.id) === Number(id));
        return s && (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim");
      });

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
    const lineHelp = (tool === "line" && state.lineSettings?.continuous)
      ? (lang === "en" ? "Click to add vertices. Press Enter to confirm." : "クリックで頂点追加  Enterキーで決定")
      : (lang === "en" ? "Click first point, then second point. You can also input Length / Angle." : "1点目クリック後、2点目をクリック。Length / Angle の数値入力も使えます。");
    const helpMap = (lang === "en")
      ? {
        select: "Switch click target type. Toggle with Space key.",
        vertex: "Click/drag vertices to edit. Shift for multi-select. Enter executes dX/dY move.",
        line: lineHelp,
        rect: "Click start point then opposite corner. Width / Height inputs are also supported.",
        circle: "Click center then radius point, or confirm with Radius input.",
        position: "Click to place a position marker. Size uses the left panel setting.",
        dim: "Create dimensions by two points or object pick. Chain mode supports continuous placement.",
        fillet: "Select target objects and confirm candidate. line-circle/arc-line supports side selection.",
        trim: "Click shape to trim. You can also split without deleting.",
        settings: "Configure paper size, orientation, scale, and grid.",
        text: "Click canvas to place text. Edit content/size/color in the top panel.",
        hatch: "Click boundaries to select. Press Enter or Apply to execute hatching.",
        patterncopy: "Execute pattern copy. Choose mode and set center/axis if needed, then click Apply.",
        doubleline: "Create double lines from selected lines. Adjust offset/mode and confirm by Apply or Enter.",
      }
      : {
        select: "クリック選択の対象を切り替えます。スペースキーでトグル",
        vertex: "頂点をクリック/ドラッグして編集。Shiftで複数選択。Enterで dX/dY 移動を実行。",
        line: lineHelp,
        rect: "始点クリック後、対角点をクリック。Width / Height の数値入力で確定できます。",
        circle: "中心クリック後、半径をクリックまたは Radius 入力で確定。",
        position: "クリックで位置マーカーを配置します。Size は左パネル設定を使用。",
        dim: "2点クリックまたはオブジェクト選択で寸法線を作成。直列モードでは連続配置可能。",
        fillet: "対象を選択して候補を確定。line-circle/arc-line は段階的に残す側を選べます。",
        trim: "図形をクリックしてトリムを実行。削除せずに分割のみ行うことも可能です。",
        settings: "用紙サイズ、方位、縮尺、およびグリッド設定を行います。",
        text: "キャンバスをクリックしてテキストを配置。配置後、上部パネルで内容、サイズ、色などを変更できます。",
        hatch: "境界をクリックして選択。Enter または Apply でハッチングを実行します。",
        patterncopy: "パターンコピーを実行します。モードを選択し、必要であれば中心点や軸線をキャンバス上でクリックしてから Apply を押してください。",
        doubleline: "選択した線分から二重線（オフセット線）を生成します。Offset値やMode（片側/両側）を調整し、ApplyまたはEnterで確定します。",
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
  const selectionPositionOps = document.getElementById("selectionPositionOps");
  const selectionCircleOps = document.getElementById("selectionCircleOps");
  const groupRelativeMoveOps = document.getElementById("groupRelativeMoveOps");
  const dimMergeGroupsRow = document.getElementById("dimMergeGroupsRow");
  if (groupCtxObjectOps || groupCtxGroupOps) {
    const selectedCount = (state.selection?.ids || []).length;
    const hasObjectSelection = selectedCount > 0;
    const hasActiveGroup = state.activeGroupId != null;
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selectedShapes = (state.shapes || []).filter(s => selIds.has(Number(s.id)));
    const styleTargetTypes = new Set(["line", "circle", "arc", "position"]);
    const hasOnlyStyleTargetSelection = selectedShapes.length > 0
      && selectedShapes.every(s => styleTargetTypes.has(String(s.type || "")));
    const hasOnlyPositionSelection = selectedShapes.length > 0
      && selectedShapes.every(s => String(s.type || "") === "position");
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
      if (hasActiveGroup) {
        title = panelLang === "en" ? "Group" : "グループ";
      } else if (selectedShapes.length === 1) {
        const t = String(selectedShapes[0]?.type || "");
        if (t === "line") title = panelLang === "en" ? "Line" : "線分";
        else if (t === "circle") title = panelLang === "en" ? "Circle" : "円";
        else if (t === "arc") title = panelLang === "en" ? "Arc" : "円弧";
        else if (t === "position") title = panelLang === "en" ? "Position" : "位置";
        else if (t === "rect") title = panelLang === "en" ? "Rectangle" : "四角";
        else title = panelLang === "en" ? "Object" : "オブジェクト";
      } else if (selectedShapes.length >= 2) {
        title = panelLang === "en" ? "Object" : "オブジェクト";
      }
      groupCtxTitle.textContent = title;
    }
    const showObjectOps = hasObjectSelection;
    if (groupCtxObjectOps) groupCtxObjectOps.style.display = showObjectOps ? "flex" : "none";
    if (groupCtxGroupOps) groupCtxGroupOps.style.display = hasActiveGroup ? "flex" : "none";
    if (lineCircleMoveOps) lineCircleMoveOps.style.display = hasOnlyStyleTargetSelection ? "grid" : "none";
    if (selectionStyleOps) selectionStyleOps.style.display = hasOnlyStyleTargetSelection ? "grid" : "none";
    if (selectionPositionOps) selectionPositionOps.style.display = hasOnlyPositionSelection ? "grid" : "none";
    if (selectionCircleOps) selectionCircleOps.style.display = hasOnlyCircleSelection ? "flex" : "none";
    if (mergeGroupsRow) mergeGroupsRow.style.display = (!hasActiveGroup && selectedCount >= 2) ? "flex" : "none";
    if (dimMergeGroupsRow) dimMergeGroupsRow.style.display = (state.tool === "select" && !hasActiveGroup && selectedCount >= 2 && hasOnlyDimSelection) ? "flex" : "none";
    if (groupRelativeMoveOps) groupRelativeMoveOps.style.display = hasLineCircleOnlySelection ? "none" : "grid";
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
  if (dom.lineContinuousToggle) dom.lineContinuousToggle.checked = !!state.lineSettings.continuous;
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

  if (dom.hatchPitchInput) syncInputValue(dom.hatchPitchInput, state.hatchSettings.pitchMm);
  if (dom.hatchAngleInput) syncInputValue(dom.hatchAngleInput, state.hatchSettings.angleDeg);
  if (dom.hatchPatternSelect) dom.hatchPatternSelect.value = state.hatchSettings.pattern;
  if (dom.hatchCrossAngleInput) syncInputValue(dom.hatchCrossAngleInput, state.hatchSettings.crossAngleDeg);
  if (dom.hatchPaddingInput) syncInputValue(dom.hatchPaddingInput, state.hatchSettings.repetitionPaddingMm);
  if (dom.hatchLineTypeSelect) dom.hatchLineTypeSelect.value = state.hatchSettings.lineType;
  if (dom.hatchDashMmInput) syncInputValue(dom.hatchDashMmInput, state.hatchSettings.lineDashMm);
  if (dom.hatchGapMmInput) syncInputValue(dom.hatchGapMmInput, state.hatchSettings.lineGapMm);
  if (dom.applyHatchBtn) dom.applyHatchBtn.disabled = !(state.tool === "hatch" && state.hatchDraft?.boundaryIds?.length > 0);

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
    const hasSelection = ((state.selection?.ids || []).length > 0) || ((state.selection?.groupIds || []).length > 0);
    const mode = state.patternCopySettings.mode;
    let ok = hasSelection;
    if (mode === "rotate") ok = ok && !!state.input.patternCopyFlow.centerPositionId;
    if (mode === "mirror") ok = ok && !!state.input.patternCopyFlow.axisLineId;
    dom.patternCopyApplyBtn.disabled = !ok;
  }

  const selectedShapes = (state.shapes || []).filter(s => (state.selection?.ids || []).map(Number).includes(Number(s.id)));
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
    const prev = dom.activeLayerSelect.value;
    dom.activeLayerSelect.innerHTML = "";
    for (const layer of (state.layers || [])) {
      const opt = document.createElement("option");
      opt.value = String(layer.id);
      opt.textContent = `${layer.name}${layer.visible === false ? panelText.hiddenSuffix : ""}`;
      dom.activeLayerSelect.appendChild(opt);
    }
    dom.activeLayerSelect.value = String(state.activeLayerId ?? prev ?? "");
  }
  if (dom.renameLayerNameInput) {
    const activeLayer = (state.layers || []).find(l => Number(l.id) === Number(state.activeLayerId));
    if (activeLayer && document.activeElement !== dom.renameLayerNameInput) {
      dom.renameLayerNameInput.value = String(activeLayer.name ?? "");
    }
  }
  if (dom.layerList) {
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
  if (dom.renameLayerBtn) dom.renameLayerBtn.disabled = (state.activeLayerId == null);
  if (dom.moveSelectionLayerBtn) {
    const selectedShapeIds = new Set((state.selection?.ids || []).map(Number));
    const hasSelectedObjects = (state.shapes || []).some(s => selectedShapeIds.has(Number(s.id)));
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
    dom.groupList.innerHTML = "";
    const selectedShapeIdSet = new Set((state.selection?.ids || []).map(Number));
    const selectedGroupIdSet = new Set((state.selection?.groupIds || []).map(Number));
    if (!selectedGroupIdSet.size && state.activeGroupId != null) selectedGroupIdSet.add(Number(state.activeGroupId));
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
    const rows = [];
    const visited = new Set();
    const walk = (pid, depth) => {
      const children = byParent.get(pid) || [];
      for (const g of children) {
        if (visited.has(Number(g.id))) continue;
        visited.add(Number(g.id));
        const hasChildGroups = (byParent.get(Number(g.id)) || []).length > 0;
        const hasShapes = Array.isArray(g.shapeIds) && g.shapeIds.length > 0;
        rows.push({ group: g, depth, hasChildren: (hasChildGroups || hasShapes) });
        const expanded = state.ui.groupTreeExpanded[Number(g.id)] !== false;
        if (expanded) walk(Number(g.id), depth + 1);
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
      const hasChildGroups = (byParent.get(Number(g.id)) || []).length > 0;
      const hasShapes = Array.isArray(g.shapeIds) && g.shapeIds.length > 0;
      rows.push({ group: g, depth: 0, hasChildren: (hasChildGroups || hasShapes) });
    }
    // Also account for shapes not in any group
    const inAnyGroup = new Set();
    for (const g of groups) {
      for (const sid of (g.shapeIds || [])) inAnyGroup.add(Number(sid));
    }
    const unGroupedShapes = (state.shapes || []).filter(s => !inAnyGroup.has(Number(s.id)));

    if (rows.length === 0 && unGroupedShapes.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = panelText.noObjects;
      empty.style.color = "var(--muted)";
      empty.style.fontSize = "12px";
      empty.style.padding = "4px 2px";
      dom.groupList.appendChild(empty);
    }

    for (const { group, depth, hasChildren } of rows) {
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
      name.textContent = `${group.name} (${(group.shapeIds || []).length})`;
      const groupHasSelectedObject = (!selectedGroupIdSet.size)
        && (group.shapeIds || []).some(sid => selectedShapeIdSet.has(Number(sid)));
      name.style.color = groupHasSelectedObject ? "#16a34a" : "var(--muted)";
      name.style.fontWeight = isActiveGroup ? "600" : "400";
      name.style.fontSize = "11px";
      name.style.flex = "1";
      row.style.cursor = "pointer";
      row.title = isActiveGroup ? panelText.active : panelText.clickToSelect;
      nameWrap.append(treeBtn, name);
      row.append(nameWrap);
      dom.groupList.appendChild(row);

      // Show child objects when this group is expanded (HTML迚亥ｯ・○縺ｮ陦ｨ遉ｺ蠑ｷ蛹・
      if (expanded) {
        const shapeIds = Array.isArray(group.shapeIds) ? group.shapeIds : [];
        for (const sid of shapeIds) {
          const s = (state.shapes || []).find(ss => Number(ss.id) === Number(sid));
          if (!s) continue;
          renderShapeRow(dom.groupList, s, depth + 1, group.id, activeGroupShapeIdSet);
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

      for (const s of unGroupedShapes) {
        renderShapeRow(dom.groupList, s, 1, null, activeGroupShapeIdSet);
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

  function renderShapeRow(parent, s, depth, ownerGroupId, activeGroupShapeIdSet) {
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
    const isShapeSelected = (state.selection?.ids || []).map(Number).includes(Number(s.id));
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
  if (dom.mergeGroupsBtn) {
    dom.mergeGroupsBtn.disabled = !(state.tool === "select" && (state.selection?.ids?.length > 1) && state.activeGroupId == null);
  }
  if (dom.dimMergeGroupsBtn) {
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selectedShapes = (state.shapes || []).filter(s => selIds.has(Number(s.id)));
    const hasOnlyDims = selectedShapes.length > 0
      && selectedShapes.every(s => s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim");
    dom.dimMergeGroupsBtn.disabled = !(state.tool === "select" && (state.selection?.ids?.length > 1) && state.activeGroupId == null && hasOnlyDims);
  }
  const selIdsForObjMove = new Set((state.selection?.ids || []).map(Number));
  const selectedShapesForMove = (state.shapes || []).filter(s => selIdsForObjMove.has(Number(s.id)));
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
  if (dom.applyCircleInputBtn) {
    const on = !!state.circleSettings?.radiusLocked;
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
    dom.applyFilletBtn.disabled = false;
  }
  if (dom.dlineOffsetInput) {
    const v = Number(state.dlineSettings?.offset || 10);
    syncInputValue(dom.dlineOffsetInput, v);
  }
  if (dom.dlineModeSelect) {
    const v = state.dlineSettings?.mode || "both";
    if (dom.dlineModeSelect.value !== v) dom.dlineModeSelect.value = v;
  }
  if (dom.applyDLineBtn) {
    dom.applyDLineBtn.disabled = !(state.tool === "doubleline" && state.dlinePreview && state.dlinePreview.length > 0);
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
    { cfg: state.hatchSettings, width: dom.hatchToolLineWidthInput, type: dom.hatchToolLineTypeInput },
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





