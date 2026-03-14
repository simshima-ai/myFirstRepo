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
  hideEl(document.querySelector(".left-aux-stack"));
  hideEl(document.querySelector(".right-stack"));
  hideEl(document.querySelector(".top-context"));
  hideEl(document.querySelector(".bottom-left-overlay"));
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
  const toggleMenu = () => {
    if (!homeMenu) return;
    const nextOpen = !homeMenu.classList.contains("is-open");
    homeMenu.classList.toggle("is-open", nextOpen);
    homeLink?.setAttribute?.("aria-expanded", nextOpen ? "true" : "false");
  };
  if (homeLink) {
    homeLink.setAttribute("aria-expanded", "false");
    homeLink.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleMenu();
    });
  }
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t?.closest?.("#cadHomeLink")) return;
    if (t?.closest?.("#cadHomeMenu")) return;
    closeMenu();
  });

  let fullAppPromise = null;
  let viewerAppPromise = null;
  const loadFullApp = async () => {
    if (!fullAppPromise) fullAppPromise = import("./app.js").then(() => window.cadApp);
    return fullAppPromise;
  };
  const loadViewerApp = async () => {
    if (!viewerAppPromise) viewerAppPromise = import("./app_viewer.js").then(() => window.cadApp);
    return viewerAppPromise;
  };
  const switchMode = async (mode) => {
    closeMenu();
    window.location.href = `./cad.html?mode=${mode}`;
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
  document.addEventListener("dragover", (e) => {
    stopNative(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  }, true);
  document.addEventListener("drop", async (e) => {
    stopNative(e);
    const files = extractFiles(e.dataTransfer);
    if (!files.length) return;
    const app = await loadViewerApp();
    await app?.importDroppedFiles?.(files);
  }, true);
}

const mode = getUrlMode();
if (mode === "viewer") {
  initViewerShell();
} else {
  import("./app.js");
}

