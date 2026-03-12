export function setupLayoutAndTopContext(state, tool, helpers) {
  const {
    getUiLanguage,
    getViewportSizeForUi,
    normalizeMenuScalePreset,
    resolveTopActiveContext,
    getTopContextHelpText,
  } = helpers;

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
    sidebarEl.style.zoom = "1";
    const baseWidthPx = (() => {
      const saved = Number(sidebarEl.dataset.baseWidthPx);
      if (Number.isFinite(saved) && saved > 0) return saved;
      const w = Number.parseFloat(window.getComputedStyle(sidebarEl).width);
      const base = (Number.isFinite(w) && w > 0) ? w : 146;
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
    const needScroll = (contentH - viewH) > 6;
    // Keep sidebar content width stable regardless of scrollbar visibility.
    sidebarEl.style.overflowY = "auto";
    sidebarEl.style.scrollbarGutter = "stable";
    if (!needScroll) sidebarEl.scrollTop = 0;
  };
  updateSidebarScaleAndScroll();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(updateSidebarScaleAndScroll);

  const rightStackEl = document.querySelector(".right-stack");
  const getMaxGroupPanelHeight = (groupsSectionEl) => {
    const stackEl = rightStackEl || groupsSectionEl?.closest?.(".right-stack");
    const vp = getViewportSizeForUi();
    if (!stackEl || !groupsSectionEl) return Math.max(120, Math.floor(vp.height - 20));
    const stackRect = stackEl.getBoundingClientRect();
    const availableTotal = Math.max(
      120,
      Math.floor(
        (Number(stackRect.height) > 0 ? Number(stackRect.height) : Number(vp.height) - 20)
      )
    );
    const gap = Math.max(0, parseFloat(window.getComputedStyle(stackEl).gap || "0") || 0);
    const sections = Array.from(stackEl.querySelectorAll(":scope > [data-panel-id]"))
      .filter(el => window.getComputedStyle(el).display !== "none");
    let othersTotal = 0;
    for (const sec of sections) {
      if (sec === groupsSectionEl) continue;
      const panelId = String(sec.getAttribute("data-panel-id") || "");
      if (panelId === "layers") {
        const listEl = sec.querySelector("#layerList");
        let chromeH = 0;
        for (const child of Array.from(sec.children || [])) {
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
        const desiredListH = Number(state.ui?.panelLayout?.layerPanelListHeight);
        const naturalListH = Math.max(40, Math.round(Number(listEl?.scrollHeight || listEl?.clientHeight || 0) + 16));
        const reserveListH = Number.isFinite(desiredListH) && desiredListH > 0
          ? Math.max(40, Math.round(desiredListH))
          : naturalListH;
        const reserveH = chromeH + reserveListH + 8;
        const currentH = Math.max(0, sec.getBoundingClientRect().height || sec.offsetHeight || 0);
        othersTotal += Math.max(currentH, reserveH);
      } else {
        othersTotal += Math.max(0, sec.getBoundingClientRect().height || sec.offsetHeight || 0);
      }
    }
    const gapsTotal = Math.max(0, (sections.length - 1) * gap);
    return Math.max(120, Math.floor(availableTotal - othersTotal - gapsTotal));
  };
  if (rightStackEl) {
    rightStackEl.style.removeProperty("top");
    const w = Number(state.ui?.panelLayout?.rightPanelWidth);
    if (Number.isFinite(w) && w > 0) {
      rightStackEl.style.width = `min(${w}px, calc(100% - 230px))`;
    } else {
      rightStackEl.style.removeProperty("width");
    }
  }

  const topContext = document.getElementById("topContext");
  const topContextHelp = document.getElementById("topContextHelp");
  if (topContext) {
    const activeCtx = resolveTopActiveContext(state, tool);
    let visibleCount = 0;
    for (const el of topContext.querySelectorAll("[data-context]")) {
      const key = el.getAttribute("data-context") || "";
      const on = (activeCtx && key === activeCtx);
      el.style.display = on ? "flex" : "none";
      if (on) visibleCount++;
    }
    const lang = getUiLanguage(state);
    const helpText = getTopContextHelpText(state, tool, lang);
    if (topContextHelp) {
      topContextHelp.textContent = helpText;
      topContextHelp.style.display = (visibleCount > 0 && helpText) ? "flex" : "none";
    }
    topContext.style.display = visibleCount > 0 ? "grid" : "none";

    const selectedCount = (state.selection?.ids || []).length;
    if (selectedCount > 0 || state.activeGroupId != null) {
      if (topContextHelp) {
        const baseTxt = getTopContextHelpText(state, tool, lang);
        topContextHelp.textContent = (baseTxt ? baseTxt + " | " : "") + (lang === "en" ? "Space: Clear selection" : "Space: 選択解除");
        topContextHelp.style.display = "flex";
      }
      topContext.style.display = "grid";
    }
  }

  return { getMaxGroupPanelHeight };
}
