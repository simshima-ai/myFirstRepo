const JA_PANEL_TEXT = {
  hiddenSuffix: " (\u975e\u8868\u793a)",
  setAsCurrentLayerTitle: "\u30c0\u30d6\u30eb\u30af\u30ea\u30c3\u30af\u3067\u73fe\u5728\u30ec\u30a4\u30e4\u30fc\u306b\u8a2d\u5b9a",
  toggleLayerModeTitle: "ON / OFF / LOCK \u3092\u5207\u308a\u66ff\u3048",
  moveObjectsToLayer: "\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092\u79fb\u52d5",
  noObjects: "\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u306a\u3057",
  active: "\u9078\u629e\u4e2d",
  clickToSelect: "\u30af\u30ea\u30c3\u30af\u3067\u9078\u629e",
  ungrouped: "\u672a\u30b0\u30eb\u30fc\u30d7",
  clickToSelectObject: "\u30af\u30ea\u30c3\u30af\u3067\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092\u9078\u629e",
  movingOrigin: "\u539f\u70b9\u3092\u79fb\u52d5\u4e2d...",
  moveOrigin: "\u539f\u70b9\u79fb\u52d5",
  showGroup: "\u30b0\u30eb\u30fc\u30d7\u3092\u8868\u793a",
  hideGroup: "\u30b0\u30eb\u30fc\u30d7\u3092\u975e\u8868\u793a",
  layerOn: "ON",
  layerOff: "OFF",
  layerLocked: "LOCK",
};

const EN_PANEL_TEXT = {
  hiddenSuffix: " (hidden)",
  setAsCurrentLayerTitle: "Double-click to set as current layer",
  toggleLayerModeTitle: "Toggle ON / OFF / LOCK",
  moveObjectsToLayer: "Move Objects",
  noObjects: "No objects",
  active: "Active",
  clickToSelect: "Click to select",
  ungrouped: "Ungrouped",
  clickToSelectObject: "Click to select object",
  movingOrigin: "Moving origin...",
  moveOrigin: "Move Origin",
  showGroup: "Show group",
  hideGroup: "Hide group",
  layerOn: "ON",
  layerOff: "OFF",
  layerLocked: "LOCK",
};

const LEFT_MENU_TITLE = {
  en: { snap: "Snap", create: "Create", edit: "Edit", file: "File", other: "Other" },
  ja: {
    snap: "\u30b9\u30ca\u30c3\u30d7",
    create: "\u4f5c\u6210",
    edit: "\u7de8\u96c6",
    file: "\u30d5\u30a1\u30a4\u30eb",
    other: "\u305d\u306e\u4ed6",
  },
};

const GROUP_CONTEXT_TITLE = {
  en: {
    group: "Group",
    aimTarget: "Aim Target",
    polyline: "Polyline",
    line: "Line",
    circle: "Circle",
    arc: "Arc",
    position: "Position",
    rectangle: "Rectangle",
    image: "Image",
    object: "Object",
  },
  ja: {
    group: "\u30b0\u30eb\u30fc\u30d7",
    aimTarget: "\u30a8\u30a4\u30e0\u5bfe\u8c61",
    polyline: "\u30dd\u30ea\u30e9\u30a4\u30f3",
    line: "\u30e9\u30a4\u30f3",
    circle: "\u5186",
    arc: "\u5186\u5f27",
    position: "\u4f4d\u7f6e",
    rectangle: "\u77e9\u5f62",
    image: "\u753b\u50cf",
    object: "\u30aa\u30d6\u30b8\u30a7\u30af\u30c8",
  },
};

const STATUS_EXACT_JA = new Map([
  ["Debug Console copied", "\u30c7\u30d0\u30c3\u30b0\u30b3\u30f3\u30bd\u30fc\u30eb\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f"],
  ["Copy failed", "\u30b3\u30d4\u30fc\u306b\u5931\u6557\u3057\u307e\u3057\u305f"],
  ["Debug Console: ON", "\u30c7\u30d0\u30c3\u30b0\u30b3\u30f3\u30bd\u30fc\u30eb: ON"],
  ["Debug Console: OFF", "\u30c7\u30d0\u30c3\u30b0\u30b3\u30f3\u30bd\u30fc\u30eb: OFF"],
  ["Ads shown", "\u5e83\u544a\u3092\u8868\u793a\u3057\u307e\u3057\u305f"],
  ["Ads hidden", "\u5e83\u544a\u3092\u975e\u8868\u793a\u306b\u3057\u307e\u3057\u305f"],
  ["Canceled", "\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f"],
  ["Ready", "\u6e96\u5099\u5b8c\u4e86"],
  ["Panning", "\u30d1\u30f3\u4e2d"],
  ["Selection cleared", "\u9078\u629e\u3092\u89e3\u9664\u3057\u307e\u3057\u305f"],
  ["Selection mode: OBJECT", "\u9078\u629e\u30e2\u30fc\u30c9: \u30aa\u30d6\u30b8\u30a7\u30af\u30c8"],
  ["Selection mode: GROUP", "\u9078\u629e\u30e2\u30fc\u30c9: \u30b0\u30eb\u30fc\u30d7"],
  ["Fillet created", "\u30d5\u30a3\u30ec\u30c3\u30c8\u3092\u4f5c\u6210\u3057\u307e\u3057\u305f"],
  ["Fillet: select 2 edges/arcs.", "\u30d5\u30a3\u30ec\u30c3\u30c8: 2\u672c\u306e\u8fba\u307e\u305f\u306f\u5186\u5f27\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044"],
  ["Fillet: candidate ready. Tap the top-left Confirm button to apply.", "\u30d5\u30a3\u30ec\u30c3\u30c8: \u5019\u88dc\u304c\u3067\u304d\u307e\u3057\u305f\u3002\u5de6\u4e0a\u306e Confirm \u3067\u9069\u7528\u3057\u307e\u3059"],
  ["Fillet: candidate ready. Click or press Enter to apply, Esc to cancel.", "\u30d5\u30a3\u30ec\u30c3\u30c8: \u5019\u88dc\u304c\u3067\u304d\u307e\u3057\u305f\u3002\u30af\u30ea\u30c3\u30af\u307e\u305f\u306f Enter \u3067\u9069\u7528\u3001Esc \u3067\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3059"],
  ["B-spline: tap Confirm to finish", "B\u30b9\u30d7\u30e9\u30a4\u30f3: Confirm \u3067\u7d42\u4e86"],
  ["Continuous line: tap Confirm to finish", "\u9023\u7d9a\u30e9\u30a4\u30f3: Confirm \u3067\u7d42\u4e86"],
  ["Import transform applied", "\u30a4\u30f3\u30dd\u30fc\u30c8\u5909\u63db\u3092\u9069\u7528\u3057\u307e\u3057\u305f"],
  ["Import transform canceled", "\u30a4\u30f3\u30dd\u30fc\u30c8\u5909\u63db\u3092\u30ad\u30e3\u30f3\u30bb\u30eb\u3057\u307e\u3057\u305f"],
  ["Viewer mode | Drop a DXF or SVG file here", "\u30d3\u30e5\u30fc\u30ef\u30fc\u30e2\u30fc\u30c9 | \u3053\u3053\u306b DXF \u307e\u305f\u306f SVG \u3092\u30c9\u30ed\u30c3\u30d7"],
]);

const STATUS_PATTERN_JA = [
  [/^Display mode: (.+)$/, (m) => `\u8868\u793a\u30e2\u30fc\u30c9: ${m[1]}`],
  [/^Moved (\d+) objects$/, (m) => `${m[1]} \u500b\u306e\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092\u79fb\u52d5\u3057\u307e\u3057\u305f`],
  [/^Copied: (\d+) object\(s\)$/, (m) => `${m[1]} \u500b\u306e\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f`],
  [/^Copied: (\d+) group\(s\)$/, (m) => `${m[1]} \u500b\u306e\u30b0\u30eb\u30fc\u30d7\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f`],
  [/^Pasted: (\d+) object\(s\)$/, (m) => `${m[1]} \u500b\u306e\u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u3092\u8cbc\u308a\u4ed8\u3051\u307e\u3057\u305f`],
  [/^Pasted: (\d+) group\(s\)$/, (m) => `${m[1]} \u500b\u306e\u30b0\u30eb\u30fc\u30d7\u3092\u8cbc\u308a\u4ed8\u3051\u307e\u3057\u305f`],
  [/^Fillet \(R=([^)]+)\) created$/, (m) => `\u30d5\u30a3\u30ec\u30c3\u30c8\u3092\u4f5c\u6210\u3057\u307e\u3057\u305f (R=${m[1]})`],
  [/^Fillet \(R=([^)]+)\) created \(trim skipped\)$/, (m) => `\u30d5\u30a3\u30ec\u30c3\u30c8\u3092\u4f5c\u6210\u3057\u307e\u3057\u305f (R=${m[1]}, \u30c8\u30ea\u30e0\u7701\u7565)`],
  [/^Selected (\d+) object\(s\) \((Window|Crossing)\)$/, (m) => `${m[2] === "Window" ? "\u30a6\u30a3\u30f3\u30c9\u30a6" : "\u30af\u30ed\u30c3\u30b7\u30f3\u30b0"}\u3067 ${m[1]} \u30aa\u30d6\u30b8\u30a7\u30af\u30c8\u9078\u629e`],
  [/^Selected (\d+) group\(s\) \((Window|Crossing)\)$/, (m) => `${m[2] === "Window" ? "\u30a6\u30a3\u30f3\u30c9\u30a6" : "\u30af\u30ed\u30c3\u30b7\u30f3\u30b0"}\u3067 ${m[1]} \u30b0\u30eb\u30fc\u30d7\u9078\u629e`],
  [/^Tool changed: (.+)$/, (m) => `\u30c4\u30fc\u30eb\u5909\u66f4: ${m[1]}`],
  [/^Applied Radius \(R=([^)]+)\) - fillet arcs: (\d+), normal: (\d+)$/, (m) => `\u534a\u5f84\u3092\u9069\u7528\u3057\u307e\u3057\u305f (R=${m[1]}) - \u30d5\u30a3\u30ec\u30c3\u30c8\u5186\u5f27: ${m[2]}, \u901a\u5e38: ${m[3]}`],
  [/^Applied Circle\/Arc Radius Input \(R=([^)]+)\)$/, (m) => `\u5186/\u5186\u5f27\u534a\u5f84\u5165\u529b\u3092\u9069\u7528\u3057\u307e\u3057\u305f (R=${m[1]})`],
];

export function normalizeUiLang(langLike) {
  if (langLike && typeof langLike === "object") {
    const raw = String(langLike.ui?.language || langLike.ui?.lang || langLike.lang || "").toLowerCase();
    return raw === "ja" ? "ja" : "en";
  }
  const raw = String(langLike || "").toLowerCase();
  return raw === "ja" ? "ja" : "en";
}

export function getPanelText(langLike) {
  return normalizeUiLang(langLike) === "ja" ? JA_PANEL_TEXT : EN_PANEL_TEXT;
}

export function getLeftMenuGroupTitle(langLike, group) {
  const lang = normalizeUiLang(langLike);
  const key = String(group || "other").toLowerCase();
  return LEFT_MENU_TITLE[lang][key] || LEFT_MENU_TITLE[lang].other;
}

export function getGroupContextTitle(langLike, key) {
  const lang = normalizeUiLang(langLike);
  const k = String(key || "object");
  return GROUP_CONTEXT_TITLE[lang][k] || GROUP_CONTEXT_TITLE[lang].object;
}

export function localizeStatusText(langLike, text) {
  const lang = normalizeUiLang(langLike);
  const raw = String(text ?? "");
  if (!raw || lang === "en") return raw;
  if (STATUS_EXACT_JA.has(raw)) return STATUS_EXACT_JA.get(raw);
  for (const [pattern, render] of STATUS_PATTERN_JA) {
    const m = raw.match(pattern);
    if (m) return render(m);
  }
  return raw;
}

export function getShortcutLabels(langLike) {
  const lang = normalizeUiLang(langLike);
  if (lang === "ja") {
    return {
      select: "\u9078\u629e",
      line: "\u30e9\u30a4\u30f3",
      rect: "\u77e9\u5f62",
      circle: "\u5186",
      position: "\u4f4d\u7f6e",
      dim: "\u5bf8\u6cd5",
      text: "\u6587\u5b57",
      vertex: "\u9802\u70b9\u7de8\u96c6",
      fillet: "\u30d5\u30a3\u30ec\u30c3\u30c8",
      trim: "\u30c8\u30ea\u30e0",
      hatch: "\u30cf\u30c3\u30c1",
      doubleline: "\u8907\u7dda",
      patterncopy: "\u30d1\u30bf\u30fc\u30f3\u30b3\u30d4\u30fc",
      delete: "\u524a\u9664",
      none: "(\u306a\u3057)",
      vertex_mode_toggle: "\u9802\u70b9\u30e2\u30fc\u30c9\u5207\u66ff",
    };
  }
  return {
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
    delete: "Delete",
    none: "(None)",
    vertex_mode_toggle: "Vertex Mode Toggle",
  };
}

export function getStatusBarText(langLike) {
  const lang = normalizeUiLang(langLike);
  if (lang === "ja") {
    return {
      tool: "\u30c4\u30fc\u30eb",
      none: "\u306a\u3057",
      fps: "FPS",
      objects: "\u56f3\u5f62\u6570",
      zoom: "\u30ba\u30fc\u30e0",
      grid: "1\u30b0\u30ea\u30c3\u30c9",
      viewerEmpty: "\u30d3\u30e5\u30fc\u30ef\u30fc\u30e2\u30fc\u30c9 | \u3053\u3053\u306b DXF \u307e\u305f\u306f SVG \u3092\u30c9\u30ed\u30c3\u30d7",
      autoGridOn: "\u81ea\u52d5\u30b0\u30ea\u30c3\u30c9: ON",
      autoGridOff: "\u81ea\u52d5\u30b0\u30ea\u30c3\u30c9: OFF",
      baseGrid: "\u57fa\u6e96\u30b0\u30ea\u30c3\u30c9",
      currentPx: "\u73fe\u5728Px",
      resetBasePx: "\u30ea\u30bb\u30c3\u30c8\u57fa\u6e96Px",
      enter: "\u5207\u66ff\u95be\u5024",
      back: "\u5fa9\u5e30\u95be\u5024",
      autoLevel: "\u81ea\u52d5\u30ec\u30d9\u30eb",
      stage: "\u6bb5\u968e",
      effectiveGrid: "\u6709\u52b9\u30b0\u30ea\u30c3\u30c9",
      clearSelection: "Space: \u9078\u629e\u89e3\u9664",
    };
  }
  return {
    tool: "Tool",
    none: "NONE",
    fps: "FPS",
    objects: "Objects",
    zoom: "Zoom",
    grid: "1 grid",
    viewerEmpty: "Viewer mode | Drop a DXF or SVG file here",
    autoGridOn: "AutoGrid: ON",
    autoGridOff: "AutoGrid: OFF",
    baseGrid: "BaseGrid",
    currentPx: "CurrentPx",
    resetBasePx: "ResetBasePx",
    enter: "Enter",
    back: "Return",
    autoLevel: "AutoLevel",
    stage: "Stage",
    effectiveGrid: "EffectiveGrid",
    clearSelection: "Space: Clear selection",
  };
}

export function getGroupAimText(langLike) {
  const lang = normalizeUiLang(langLike);
  if (lang === "ja") {
    return {
      confirm: "\u78ba\u5b9a",
      pickTarget: "\u5bfe\u8c61\u3092\u9078\u629e",
      targetNone: "\u5bfe\u8c61: \u306a\u3057",
      targetGroup: (id) => `\u5bfe\u8c61: \u30b0\u30eb\u30fc\u30d7 #${id}`,
      targetPosition: (id) => `\u5bfe\u8c61: \u4f4d\u7f6e #${id}`,
      candidateGroup: (id) => `\u5019\u88dc: \u30b0\u30eb\u30fc\u30d7 #${id}`,
      candidatePosition: (id) => `\u5019\u88dc: \u4f4d\u7f6e #${id}`,
      picking: "\u5bfe\u8c61\u3092\u9078\u629e\u4e2d...",
      on: " (ON)",
      rotation: "\u56de\u8ee2",
      deg: "\u5ea6",
    };
  }
  return {
    confirm: "Confirm",
    pickTarget: "Pick Target",
    targetNone: "Target: None",
    targetGroup: (id) => `Target: Group #${id}`,
    targetPosition: (id) => `Target: Position #${id}`,
    candidateGroup: (id) => `Candidate: Group #${id}`,
    candidatePosition: (id) => `Candidate: Position #${id}`,
    picking: "Picking target...",
    on: " (ON)",
    rotation: "Rotation",
    deg: "deg",
  };
}

export function getPatternCopyText(langLike) {
  const lang = normalizeUiLang(langLike);
  if (lang === "ja") {
    return {
      centerSetStatus: (id) => `設定: 点 #${id}`,
      centerUnsetStatus: "未設定（キャンバス上の点を選択）",
      centerSetButton: "中心に設定",
      centerClearButton: "中心解除",
      axisSetStatus: (id) => `設定: 線 #${id}`,
      axisUnsetStatus: "未設定（キャンバス上の線を選択）",
      axisSetButton: "軸に設定",
      axisClearButton: "軸解除",
    };
  }
  return {
    centerSetStatus: (id) => `Set: Point #${id}`,
    centerUnsetStatus: "Not set (pick a point on canvas)",
    centerSetButton: "Set as Center",
    centerClearButton: "Clear Center",
    axisSetStatus: (id) => `Set: Line #${id}`,
    axisUnsetStatus: "Not set (pick a line on canvas)",
    axisSetButton: "Set as Axis",
    axisClearButton: "Clear Axis",
  };
}

export function getTouchConfirmText(langLike) {
  const lang = normalizeUiLang(langLike);
  if (lang === "ja") {
    return {
      confirm: "確定",
      finishContinuousLine: "連続ライン終了",
      finalizeBSpline: "Bスプライン確定",
      finalizeDim: "寸法確定",
      setPlacement: "配置位置を設定",
      createThreePointCircle: "3点円を作成",
      applyFillet: "フィレット適用",
      applyDoubleLine: "複線適用",
      applyHatch: "ハッチ適用",
      runPatternCopy: "パターンコピー実行",
      createRectangle: "矩形を作成",
      confirmFirstPoint: "1点目を確定",
    };
  }
  return {
    confirm: "Confirm",
    finishContinuousLine: "Finish Continuous Line",
    finalizeBSpline: "Finalize B-Spline",
    finalizeDim: "Finalize Dim",
    setPlacement: "Set Placement",
    createThreePointCircle: "Create 3-Point Circle",
    applyFillet: "Apply Fillet",
    applyDoubleLine: "Apply Double Line",
    applyHatch: "Apply Hatch",
    runPatternCopy: "Run Pattern Copy",
    createRectangle: "Create Rectangle",
    confirmFirstPoint: "Confirm 1st Point",
  };
}
