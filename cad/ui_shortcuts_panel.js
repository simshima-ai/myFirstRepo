export function refreshToolShortcutSettings(state, dom, helpers) {
  const { getUiLanguage, sanitizeToolShortcuts, toolOrder } = helpers;
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
      delete: "Delete",
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
      delete: "削除",
      none: "(なし)",
    };
  const shortcuts = sanitizeToolShortcuts(state?.ui?.toolShortcuts);
  host.innerHTML = "";
  for (const tool of toolOrder) {
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
    const optDel = document.createElement("option");
    optDel.value = "DEL";
    optDel.textContent = "DEL";
    select.appendChild(optDel);
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
