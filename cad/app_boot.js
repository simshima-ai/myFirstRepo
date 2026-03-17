const VALID_MODES = new Set(["viewer", "easy", "cad"]);

function getUrlMode() {
  try {
    const params = new URLSearchParams(window.location?.search || "");
    const raw = String(params.get("mode") || "").toLowerCase();
    return VALID_MODES.has(raw) ? raw : "";
  } catch (_) {
    return "";
  }
}

function getUiLanguage() {
  try {
    const saved = String(localStorage.getItem("scad-lang") || "").toLowerCase();
    return saved.startsWith("ja") ? "ja" : "en";
  } catch (_) {
    return "en";
  }
}

function hideEl(el) {
  if (!el) return;
  el.style.display = "none";
}

function initViewerShell() {
  const lang = getUiLanguage();
  const sidebarEl = document.querySelector(".sidebar");
  if (sidebarEl) sidebarEl.style.display = "flex";
  hideEl(document.querySelector(".left-aux-stack"));
  hideEl(document.querySelector(".right-stack"));
  hideEl(document.querySelector(".top-context"));
  hideEl(document.querySelector(".bottom-scale-overlay"));
  hideEl(document.querySelector("#debugConsolePanel"));
  hideEl(document.getElementById("rightAdSlot"));
  hideEl(document.getElementById("leftBottomAdSlot"));
  hideEl(document.getElementById("bottomCenterAdSlot"));

  const homeLogo = document.querySelector("#cadHomeLink .cad-home-logo");
  if (homeLogo) homeLogo.textContent = lang === "ja" ? "\u7de8\u96c6\u3059\u308b\uff1f" : "Edit?";

  const homeLink = document.getElementById("cadHomeLink");
  const homeMenu = document.getElementById("cadHomeMenu");
  const modeViewerBtn = document.getElementById("cadHomeModeViewer");
  const modeEasyBtn = document.getElementById("cadHomeModeEasy");
  const modeCadBtn = document.getElementById("cadHomeModeCad");
  if (modeViewerBtn) modeViewerBtn.style.display = "none";

  const closeMenu = () => {
    if (!homeMenu) return;
    homeMenu.classList.remove("is-open");
    homeLink?.setAttribute?.("aria-expanded", "false");
  };
  if (homeLink) {
    homeLink.setAttribute("aria-expanded", "false");
    homeLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      void switchMode("easy");
    });
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t?.closest?.("#cadHomeLink")) return;
    if (t?.closest?.("#cadHomeMenu")) return;
    closeMenu();
  });

  let fullAppPromise = null;
  const loadFullApp = async () => {
    if (!fullAppPromise) fullAppPromise = import("./app.js").then(() => window.cadApp);
    return fullAppPromise;
  };
  const saveViewerModeTransferSnapshot = async () => {
    try {
      const liveApp = window.cadApp;
      if (liveApp?.helpers?.saveModeTransferSnapshot?.()) return true;
    } catch (_) {
      // noop
    }
    try {
      const app = await ensureViewerFullApp();
      return !!app?.helpers?.saveModeTransferSnapshot?.();
    } catch (_) {
      return false;
    }
  };
  const switchMode = async (mode) => {
    closeMenu();
    await saveViewerModeTransferSnapshot();
    window.location.href = `./cad.html?mode=${mode}`;
  };
  const createViewerSidebarButton = (label, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  };
  const applyViewerFullAppCustomizations = (app) => {
    if (!app?.state || !app?.dom) return;
    const state = app.state;
    const dom = app.dom;
    if (!state.ui) state.ui = {};
    state.ui.panelVisibility = {
      ...(state.ui.panelVisibility || {}),
      snapPanel: false,
      attrPanel: false,
      createToolsPanel: false,
      editToolsPanel: false,
      fileToolsPanel: true,
      topContext: false,
      rightPanels: false,
      groupsPanel: false,
      layersPanel: false,
      statusOverlay: true,
      scaleOverlay: false,
      debugConsole: false,
    };
    const createSection = dom.toolButtons?.closest?.(".section");
    const editSection = dom.editToolButtons?.closest?.(".section");
    const fileSection = dom.fileToolButtons?.closest?.(".section");
    const manualLink = document.getElementById("openManualBtn");
    const bottomLeftOverlay = document.querySelector(".bottom-left-overlay");
    if (sidebarEl) sidebarEl.style.display = "flex";
    if (createSection) createSection.style.display = "none";
    if (editSection) editSection.style.display = "none";
    if (fileSection) fileSection.style.display = "";
    if (manualLink) manualLink.style.display = "none";
    if (bottomLeftOverlay) bottomLeftOverlay.style.display = "";
    if (dom.fileToolButtons && !dom.fileToolButtons.dataset.viewerCustomized) {
      dom.fileToolButtons.dataset.viewerCustomized = "1";
      dom.fileToolButtons.textContent = "";
      dom.fileToolButtons.appendChild(createViewerSidebarButton("New", () => app.helpers?.newFile?.()));
      dom.fileToolButtons.appendChild(createViewerSidebarButton("Import", () => app.helpers?.importJson?.()));
    }
    if (dom.viewerImportMeta && !dom.viewerImportMeta.dataset.viewerBound) {
      dom.viewerImportMeta.dataset.viewerBound = "1";
      [dom.viewerImportScaleBtn1, dom.viewerImportScaleBtn2, dom.viewerImportScaleBtn3].forEach((btn) => {
        btn?.addEventListener("click", () => {
          const scale = Number(btn.dataset.scale);
          if (!(Number.isFinite(scale) && scale > 0)) return;
          const ok = app.helpers?.applySuggestedImportScale?.(scale);
          if (ok) app.helpers?.animateResetView?.();
        });
      });
      dom.viewerImportResetViewBtn?.addEventListener("click", () => app.helpers?.animateResetView?.());
    }
  };
  const ensureViewerFullApp = async () => {
    const app = await loadFullApp();
    applyViewerFullAppCustomizations(app);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => applyViewerFullAppCustomizations(app));
    }
    return app;
  };
  modeEasyBtn?.addEventListener("click", (e) => { e.preventDefault(); void switchMode("easy"); });
  modeCadBtn?.addEventListener("click", (e) => { e.preventDefault(); void switchMode("cad"); });
  document.addEventListener("click", (e) => {
    const easyTarget = e.target?.closest?.("#cadHomeModeEasy");
    const cadTarget = e.target?.closest?.("#cadHomeModeCad");
    if (!easyTarget && !cadTarget) return;
    e.preventDefault();
    e.stopPropagation();
    void switchMode(easyTarget ? "easy" : "cad");
  }, true);


  const canHandle = (e) => {
    const dt = e?.dataTransfer;
    if (!dt) return false;
    if (dt.files && dt.files.length > 0) return true;
    const types = dt.types ? Array.from(dt.types) : [];
    if (types.includes("Files")) return true;
    const items = dt.items ? Array.from(dt.items) : [];
    return items.some((it) => String(it?.kind || "").toLowerCase() === "file");
  };
  const extractFiles = (dt) => {
    const out = [];
    if (!dt) return out;
    if (dt.files && dt.files.length) {
      for (const f of Array.from(dt.files)) if (f) out.push(f);
    }
    if (!out.length && dt.items && dt.items.length) {
      for (const it of Array.from(dt.items)) {
        if (String(it?.kind || "").toLowerCase() !== "file") continue;
        const f = it.getAsFile?.();
        if (f) out.push(f);
      }
    }
    return out;
  };
  const stopNative = (e, stopProp = true) => {
    if (!canHandle(e)) return;
    if (e.cancelable) e.preventDefault();
    if (stopProp && typeof e.stopPropagation === "function") e.stopPropagation();
  };
  const onDragOver = (e) => {
    stopNative(e);
    if (!canHandle(e)) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  };
  const onDrop = async (e) => {
    stopNative(e);
    if (!canHandle(e)) return;
    const files = extractFiles(e.dataTransfer);
    if (!files.length) return;
    try {
      const app = await ensureViewerFullApp();
      await app?.importDroppedFiles?.(files, { replaceAll: true, clearFirst: true });
      applyViewerFullAppCustomizations(app);
    } catch (err) {
      console.error("Viewer drop import failed", err);
    }
  };
  const onWindowDragEnter = (e) => {
    stopNative(e, false);
  };
  const onWindowDragOver = (e) => {
    stopNative(e, false);
  };
  const onWindowDrop = (e) => {
    stopNative(e, false);
  };
  document.addEventListener("dragenter", onWindowDragEnter, true);
  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("drop", onDrop, true);
  window.addEventListener("dragenter", onWindowDragEnter, true);
  window.addEventListener("dragover", onWindowDragOver, true);
  window.addEventListener("drop", onWindowDrop, true);

  void ensureViewerFullApp();
}

const mode = getUrlMode();
if (mode === "viewer") {
  initViewerShell();
} else {
  import("./app.js");
}

