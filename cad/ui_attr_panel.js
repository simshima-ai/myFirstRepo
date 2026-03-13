export function refreshAttrPanel(state, dom, selectedShapes) {
  if (!dom?.attrPanel) return;
  const selectedWithAttrs = (selectedShapes || []).find(s => {
    const explicit = Array.isArray(s?.attributes) && s.attributes.length > 0;
    const vertexBind = (s?.type === "line" || s?.type === "dim") && (!!s?.p1Attrib || !!s?.p2Attrib);
    return explicit || vertexBind;
  }) || null;
  if (selectedWithAttrs) {
    if (!state.ui.rightPanelCollapsed) state.ui.rightPanelCollapsed = {};
    state.ui.rightPanelCollapsed.attrs = false;
  }
  const explicitAttrs = Array.isArray(selectedWithAttrs?.attributes) ? selectedWithAttrs.attributes : [];
  const attrs = explicitAttrs.slice();
  if (selectedWithAttrs && (selectedWithAttrs.type === "line" || selectedWithAttrs.type === "dim")) {
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
    const leftAuxStack = document.querySelector(".left-aux-stack");
    const sidebar = document.querySelector(".sidebar");
    const anchor = snapPanel || leftAuxStack || sidebar || dom.attrPanel;
    const r = anchor.getBoundingClientRect();
    const leftPx = Math.max(8, Math.round(r.right + 6));
    const gridScale = document.getElementById("gridScaleIndicator");
    const gridOverlay = gridScale?.closest?.(".bottom-scale-overlay") || null;
    const panelH = Math.max(80, Number(dom.attrPanel.offsetHeight || dom.attrPanel.scrollHeight || 160));
    let targetBottom = 18;
    if (gridOverlay) {
      const or = gridOverlay.getBoundingClientRect();
      targetBottom = Math.max(18, Math.round(window.innerHeight - or.top + 8));
    } else if (gridScale && gridScale.style.display !== "none") {
      const gr = gridScale.getBoundingClientRect();
      targetBottom = Math.max(18, Math.round(window.innerHeight - gr.top + 8));
    }
    dom.attrPanel.style.position = "fixed";
    dom.attrPanel.style.left = `${leftPx}px`;
    dom.attrPanel.style.top = "auto";
    dom.attrPanel.style.right = "auto";
    dom.attrPanel.style.bottom = `${targetBottom}px`;
    dom.attrPanel.style.width = "240px";
    dom.attrPanel.style.maxWidth = `min(240px, calc(100vw - 16px - ${leftPx}px))`;
    dom.attrPanel.style.maxHeight = `min(45vh, calc(100vh - ${targetBottom + 16}px), ${Math.max(120, Math.round(panelH))}px)`;
    dom.attrPanel.style.zIndex = "30";
  } else {
    dom.attrPanel.style.position = "";
    dom.attrPanel.style.left = "";
    dom.attrPanel.style.top = "";
    dom.attrPanel.style.right = "";
    dom.attrPanel.style.bottom = "";
    dom.attrPanel.style.width = "";
    dom.attrPanel.style.maxWidth = "";
    dom.attrPanel.style.maxHeight = "";
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
      delBtn.textContent = "Delete";
      if (!a?._implicit) delBtn.setAttribute("data-attr-remove", String(a?.id ?? ""));
      else delBtn.disabled = true;
      row.append(nameIn, valIn, delBtn);
      dom.attrList.appendChild(row);
    }
  } else if (dom.attrList) {
    dom.attrList.innerHTML = "";
  }
}
