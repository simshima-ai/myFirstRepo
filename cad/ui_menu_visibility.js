export function refreshLeftMenuVisibilitySettings(state, dom, helpers) {
  const { getUiLanguage, isLeftMenuItemVisible, onToggle } = helpers;
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
      cb.addEventListener("change", () => onToggle(key, !!cb.checked));
      const span = document.createElement("span");
      span.textContent = labelText;
      row.append(cb, span);
      host.appendChild(row);
    }
  }
}
