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
      select: "Select",
      line: "Line",
      rect: "Rect",
      circle: "Circle",
      position: "Position",
      dim: "Dimension",
      text: "Text",
      vertex: "Vertex Edit",
      fillet: "Fillet",
      trim: "Trim",
      hatch: "Hatch",
      doubleline: "Double Line",
      patterncopy: "Pattern Copy",
      delete: "Delete",
      none: "(None)",
    };
  const shortcuts = sanitizeToolShortcuts(state?.ui?.toolShortcuts);
  if (!labels.vertex_mode_toggle) {
    labels.vertex_mode_toggle = "Vertex Mode Toggle";
  }
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
    const optBackslash = document.createElement("option");
    optBackslash.value = "\\";
    optBackslash.textContent = "\\";
    select.appendChild(optBackslash);
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
