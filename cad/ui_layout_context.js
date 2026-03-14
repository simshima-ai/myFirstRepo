import { ensurePanelVisibilityState, isPanelVisible } from "./ui_panel_visibility.js";
import { getStatusBarText } from "./ui_text.js";

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
  if (!state.ui.adZones || typeof state.ui.adZones !== "object") {
    state.ui.adZones = { topRight: false, bottomLeft: false, bottomCenter: false };
  }
  ensurePanelVisibilityState(state);
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
  if (sidebarEl) {
    sidebarEl.style.display = isPanelVisible(state, "sidebar") ? "" : "none";
  }
  const sidebarPanels = [
    [".left-aux-stack .section[data-panel-id='snap']", "snapPanel"],
    ["#attrPanel", "attrPanel"],
    [".sidebar .section[data-panel-id='tools']", "createToolsPanel"],
    [".sidebar .section[data-panel-id='editTools']", "editToolsPanel"],
    [".sidebar .section[data-panel-id='fileTools']", "fileToolsPanel"],
  ];
  for (const [selector, key] of sidebarPanels) {
    const el = document.querySelector(selector);
    if (!el) continue;
    el.style.display = isPanelVisible(state, key) ? "" : "none";
  }
  const updateSidebarScaleAndScroll = () => {
    if (!sidebarEl) return;
    if (!isPanelVisible(state, "sidebar")) {
      sidebarEl.style.overflowY = "hidden";
      sidebarEl.scrollTop = 0;
      return;
    }
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
    const viewH = Number(sidebarEl.clientHeight || sidebarEl.getBoundingClientRect().height || 0);
    const contentH = Number(sidebarEl.scrollHeight || 0);
    const needScroll = (contentH - viewH) > 2;
    sidebarEl.style.overflowY = needScroll ? "auto" : "hidden";
    sidebarEl.style.scrollbarGutter = "stable";
    if (!needScroll) sidebarEl.scrollTop = 0;
  };
  updateSidebarScaleAndScroll();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(updateSidebarScaleAndScroll);

  const vp = getViewportSizeForUi();
  const lang = getUiLanguage(state);
  const statusText = getStatusBarText(lang);
  const rootStyle = document.documentElement.style;
  const rightAdEl = document.getElementById("rightAdSlot");
  const leftBottomAdEl = document.getElementById("leftBottomAdSlot");
  const bottomCenterAdEl = document.getElementById("bottomCenterAdSlot");
  const rightPanelsVisible = isPanelVisible(state, "rightPanels");
  const rightStackEl = document.querySelector(".right-stack");
  if (rightStackEl) {
    rightStackEl.style.display = rightPanelsVisible ? "flex" : "none";
  }
  const groupsSectionEl = document.querySelector(".right-stack .section[data-panel-id='groups']");
  if (groupsSectionEl) groupsSectionEl.style.display = isPanelVisible(state, "groupsPanel") ? "flex" : "none";
  const layersSectionEl = document.querySelector(".right-stack .section[data-panel-id='layers']");
  if (layersSectionEl) layersSectionEl.style.display = isPanelVisible(state, "layersPanel") ? "flex" : "none";
  const setZoneLabel = (el, text) => {
    const label = el?.querySelector?.(".ad-zone-label");
    if (label) label.innerHTML = text;
  };
  setZoneLabel(rightAdEl, lang === "ja" ? "\u5e83\u544a\u30b9\u30da\u30fc\u30b9<br>\u53f3\u4e0a" : "Ad Space<br>Top Right");
  setZoneLabel(leftBottomAdEl, lang === "ja" ? "\u5e83\u544a\u30b9\u30da\u30fc\u30b9<br>\u5de6\u4e0b" : "Ad Space<br>Bottom Left");
  const setBottomCenterCards = (el, count) => {
    if (!el) return;
    const n = Math.max(1, Math.min(3, Math.round(Number(count) || 1)));
    const labels = [];
    for (let i = 0; i < n; i++) {
      labels.push(lang === "en"
        ? `<div class="ad-zone-card">Ad Space<br>Bottom Center ${i + 1}</div>`
        : `<div class="ad-zone-card">\u5e83\u544a\u30b9\u30da\u30fc\u30b9<br>\u4e2d\u592e\u4e0b ${i + 1}</div>`);
    }
    el.innerHTML = labels.join("");
  };

  const mode = (() => {
    if (vp.width >= 1720 && vp.height >= 920) return "xlarge";
    if (vp.width >= 1420 && vp.height >= 820) return "large";
    if (vp.width >= 1100 && vp.height >= 700) return "medium";
    return "small";
  })();
  const presets = {
    small: {
      topRight: { w: 220, h: 124 },
      bottomLeft: null,
      bottomCenter: null,
    },
    medium: {
      topRight: { w: 280, h: 156 },
      bottomLeft: null,
      bottomCenter: null,
    },
    large: {
      topRight: { w: 340, h: 200 },
      bottomLeft: { w: 340, h: 200 },
      bottomCenter: { w: 980, h: 108 },
    },
    xlarge: {
      topRight: { w: 400, h: 236 },
      bottomLeft: { w: 400, h: 236 },
      bottomCenter: { w: 1320, h: 124 },
    },
  };
  const preset = presets[mode] || presets.medium;
  const adGapPx = 8;
  const bottomGapPx = 12;
  const fitBox = (box, maxW, maxH) => {
    if (!box) return null;
    const w = Math.max(160, Math.min(Number(box.w) || 160, Math.max(160, Math.floor(maxW))));
    const h = Math.max(84, Math.min(Number(box.h) || 84, Math.max(84, Math.floor(maxH))));
    return { w, h };
  };
  const topRightBox = fitBox(preset.topRight, Math.max(170, vp.width - 230), Math.max(100, vp.height - 40));
  const bottomLeftBox = fitBox(preset.bottomLeft, Math.max(170, vp.width * 0.28), Math.max(100, vp.height * 0.32));
  const estimatedRightPanelW = Math.max(180, Math.round(Number(state.ui?.panelLayout?.rightPanelWidth) || 250));
  if (rightStackEl && rightPanelsVisible) {
    const presetRightW = Number(state.ui?.panelLayout?.rightPanelWidth);
    if (Number.isFinite(presetRightW) && presetRightW > 0) {
      rightStackEl.style.width = `min(${presetRightW}px, calc(100% - 230px))`;
    } else {
      rightStackEl.style.removeProperty("width");
    }
  }
  const leftBottomReservedX = bottomLeftBox ? (10 + Number(bottomLeftBox.w) + 12) : 10;
  const actualRightPanelLeft = (rightPanelsVisible && rightStackEl)
    ? Math.floor(rightStackEl.getBoundingClientRect().left || (vp.width - 10 - estimatedRightPanelW))
    : Math.floor(vp.width - 10);
  const rightPanelReservedX = Math.max(10, actualRightPanelLeft - 6);
  const fullBottomMaxW = Math.max(260, Math.floor(rightPanelReservedX - leftBottomReservedX));
  const bottomCenterBox = fitBox(preset.bottomCenter, fullBottomMaxW, Math.max(90, vp.height * 0.2));
  const bottomCenterCount = bottomCenterBox
    ? Math.max(1, Math.min(4, Math.floor((Number(bottomCenterBox.w) + 8) / 260)))
    : 0;

  const visible = {
    topRight: !!topRightBox && state.ui.adZones.topRight === true,
    bottomLeft: !!bottomLeftBox && state.ui.adZones.bottomLeft === true,
    bottomCenter: !!bottomCenterBox && state.ui.adZones.bottomCenter === true,
  };
  if (mode === "small" || mode === "medium") {
    visible.bottomLeft = false;
    visible.bottomCenter = false;
  }

  const applyZone = (el, box, on) => {
    if (!el) return { w: 0, h: 0 };
    if (!on || !box) {
      el.classList.remove("is-visible");
      el.style.width = "0px";
      el.style.height = "0px";
      return { w: 0, h: 0 };
    }
    el.classList.add("is-visible");
    el.style.width = `${Math.round(box.w)}px`;
    el.style.height = `${Math.round(box.h)}px`;
    return { w: Math.round(box.w), h: Math.round(box.h) };
  };

  const rightApplied = applyZone(rightAdEl, topRightBox, visible.topRight);
  const leftApplied = applyZone(leftBottomAdEl, bottomLeftBox, visible.bottomLeft);
  setBottomCenterCards(bottomCenterAdEl, bottomCenterCount);
  const bottomApplied = applyZone(bottomCenterAdEl, bottomCenterBox, visible.bottomCenter);
  rootStyle.setProperty("--ad-slot-w", `${rightApplied.w}px`);
  rootStyle.setProperty("--ad-slot-h", `${rightApplied.h}px`);
  rootStyle.setProperty("--ad-slot-gap", visible.topRight ? `${adGapPx}px` : "0px");
  rootStyle.setProperty("--bottom-ad-gap", `${bottomGapPx}px`);
  rootStyle.setProperty("--bottom-ad-safe-h", visible.bottomCenter ? `${bottomApplied.h + bottomGapPx}px` : "0px");
  rootStyle.setProperty("--left-bottom-ad-safe-h", visible.bottomLeft ? `${leftApplied.h + 10}px` : "0px");

  if (leftBottomAdEl) {
    leftBottomAdEl.style.bottom = "0px";
  }
  if (bottomCenterAdEl) {
    bottomCenterAdEl.style.bottom = "10px";
    bottomCenterAdEl.style.left = `${Math.round(leftBottomReservedX)}px`;
    bottomCenterAdEl.style.transform = "none";
  }

  const getMaxGroupPanelHeight = (groupsSectionEl) => {
    const stackEl = rightStackEl || groupsSectionEl?.closest?.(".right-stack");
    if (!stackEl || !groupsSectionEl) return Math.max(120, Math.floor(vp.height - 20));
    const stackRect = stackEl.getBoundingClientRect();
    const availableTotal = Math.max(
      120,
      Math.floor((Number(stackRect.height) > 0 ? Number(stackRect.height) : Number(vp.height) - 20))
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
  if (rightStackEl && rightPanelsVisible) {
    const w = Number(state.ui?.panelLayout?.rightPanelWidth);
    if (Number.isFinite(w) && w > 0) {
      rightStackEl.style.width = `min(${w}px, calc(100% - 230px))`;
    } else {
      rightStackEl.style.removeProperty("width");
    }
    const appliedRightPanelW = Math.max(180, Math.round(rightStackEl.getBoundingClientRect().width || w || 250));
    rootStyle.setProperty("--right-panel-w", `${appliedRightPanelW}px`);
  } else {
    rootStyle.setProperty("--right-panel-w", rightPanelsVisible ? "250px" : "0px");
  }

  const topContext = document.getElementById("topContext");
  const topContextHelp = document.getElementById("topContextHelp");
  const isEasySelect = String(state.ui?.displayMode || "cad").toLowerCase() === "easy" && tool === "select";
  if (topContext) {
    const activeCtx = resolveTopActiveContext(state, tool);
    let visibleCount = 0;
    for (const el of topContext.querySelectorAll("[data-context]")) {
      const key = el.getAttribute("data-context") || "";
      const on = (activeCtx && key === activeCtx);
      el.style.display = on ? "flex" : "none";
      if (on) visibleCount++;
    }
    const helpText = getTopContextHelpText(state, tool, lang);
    if (topContextHelp) {
      topContextHelp.textContent = helpText;
      const topContextVisible = isPanelVisible(state, "topContext") || !!state.ui?.importAdjust?.active;
      topContextHelp.style.display = (topContextVisible && visibleCount > 0 && helpText) ? "flex" : "none";
    }
    const topContextVisible = isPanelVisible(state, "topContext") || !!state.ui?.importAdjust?.active;
    topContext.style.display = (topContextVisible && visibleCount > 0) ? "grid" : "none";

    const selectedCount = (state.selection?.ids || []).length;
    if (!isEasySelect && (selectedCount > 0 || state.activeGroupId != null)) {
      if (topContextHelp) {
        const baseTxt = getTopContextHelpText(state, tool, lang);
        topContextHelp.textContent = (baseTxt ? `${baseTxt} | ` : "") + statusText.clearSelection;
        topContextHelp.style.display = topContextVisible ? "flex" : "none";
      }
      topContext.style.display = topContextVisible ? "grid" : "none";
    }
  }

  const topOverlayEl = document.querySelector(".overlay");
  if (topOverlayEl) topOverlayEl.style.display = isPanelVisible(state, "topOverlay") ? "flex" : "none";
  const statusOverlayEl = document.querySelector(".bottom-left-overlay");
  if (statusOverlayEl) statusOverlayEl.style.display = isPanelVisible(state, "statusOverlay") ? "flex" : "none";
  const scaleOverlayEl = document.querySelector(".bottom-scale-overlay");
  if (scaleOverlayEl) scaleOverlayEl.style.display = isPanelVisible(state, "scaleOverlay") ? "flex" : "none";
  const debugConsoleEl = document.getElementById("debugConsolePanel");
  if (debugConsoleEl) {
    debugConsoleEl.style.display = (isPanelVisible(state, "debugConsole") && state.ui?.debugDoubleLineConnect) ? "flex" : "none";
  }

  return { getMaxGroupPanelHeight };
}












