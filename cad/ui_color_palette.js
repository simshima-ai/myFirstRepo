export function setupColorPaletteUi(params) {
  const { state, dom, getUiLanguage, getViewportSizeForUi } = params;

  const normalizeHexColor = (v, fallback = "#0f172a") => {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
  };

  const FIXED_PALETTE = [
    "#0f172a", "#334155", "#64748b", "#dc2626", "#ea580c", "#ca8a04",
    "#16a34a", "#059669", "#0891b2", "#2563eb", "#7c3aed", "#db2777",
  ];

  const getRecentColors = () => {
    if (!state.ui) state.ui = {};
    const src = Array.isArray(state.ui.recentColors) ? state.ui.recentColors : [];
    const out = [];
    for (const c of src) {
      const n = normalizeHexColor(c, "");
      if (!n) continue;
      if (!out.includes(n)) out.push(n);
      if (out.length >= 8) break;
    }
    state.ui.recentColors = out.slice();
    return out;
  };

  const pushRecentColor = (color) => {
    const c = normalizeHexColor(color, "");
    if (!c) return;
    const prev = getRecentColors();
    const next = [c, ...prev.filter((x) => x !== c)].slice(0, 8);
    if (!state.ui) state.ui = {};
    state.ui.recentColors = next;
  };

  let colorPaletteHideTimer = null;
  let colorPopupCtx = null;

  const hideColorPalettePopup = () => {
    if (colorPaletteHideTimer) {
      clearTimeout(colorPaletteHideTimer);
      colorPaletteHideTimer = null;
    }
    if (dom.colorPalettePopup) dom.colorPalettePopup.style.display = "none";
    colorPopupCtx = null;
  };

  const scheduleHideColorPalettePopup = () => {
    if (colorPaletteHideTimer) clearTimeout(colorPaletteHideTimer);
    colorPaletteHideTimer = setTimeout(() => hideColorPalettePopup(), 160);
  };

  const renderColorPalettePopupContents = () => {
    if (!dom.colorPalettePopup || !colorPopupCtx || !colorPopupCtx.inputEl) return;
    const { inputEl, applyColor } = colorPopupCtx;
    if (colorPaletteHideTimer) {
      clearTimeout(colorPaletteHideTimer);
      colorPaletteHideTimer = null;
    }
    const lang = getUiLanguage(state);
    const current = normalizeHexColor(inputEl.value, "#0f172a");
    if (!state.ui) state.ui = {};
    const livePreview = state.ui.colorPopupLivePreview !== false;

    dom.colorPalettePopup.innerHTML = "";
    dom.colorPalettePopup.style.display = "flex";
    dom.colorPalettePopup.style.flexDirection = "column";
    dom.colorPalettePopup.style.gap = "10px";
    dom.colorPalettePopup.style.minWidth = "280px";
    dom.colorPalettePopup.style.maxWidth = "340px";
    dom.colorPalettePopup.style.padding = "10px";

    const pending = normalizeHexColor(colorPopupCtx.pendingColor || current, current);
    colorPopupCtx.pendingColor = pending;

    const applyAndTrack = (hex, commit = false) => {
      const c = normalizeHexColor(hex, "#0f172a");
      colorPopupCtx.pendingColor = c;
      inputEl.value = c;
      if (livePreview || commit) {
        applyColor(c);
        pushRecentColor(c);
      }
    };

    const mkSectionLabel = (text) => {
      const el = document.createElement("div");
      el.textContent = text;
      el.style.fontSize = "12px";
      el.style.fontWeight = "700";
      el.style.color = "#334155";
      return el;
    };

    const preview = document.createElement("div");
    preview.style.height = "34px";
    preview.style.border = "1px solid #94a3b8";
    preview.style.borderRadius = "8px";
    preview.style.background = pending;
    dom.colorPalettePopup.appendChild(preview);

    const hexRow = document.createElement("div");
    hexRow.style.display = "grid";
    hexRow.style.gridTemplateColumns = "1fr auto";
    hexRow.style.gap = "8px";

    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.value = pending;
    hexInput.maxLength = 7;
    hexInput.style.fontSize = "14px";
    hexInput.style.fontWeight = "700";
    hexInput.style.padding = "8px 10px";
    hexInput.style.border = "1px solid #94a3b8";
    hexInput.style.borderRadius = "8px";

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = (lang === "en") ? "Apply" : "適用";
    applyBtn.style.minHeight = "34px";
    applyBtn.style.padding = "6px 12px";
    applyBtn.style.fontSize = "13px";

    applyBtn.addEventListener("click", () => {
      const c = normalizeHexColor(hexInput.value, colorPopupCtx.pendingColor || current);
      hexInput.value = c;
      preview.style.background = c;
      applyAndTrack(c, true);
      renderColorPalettePopupContents();
    });

    hexInput.addEventListener("input", () => {
      const c = normalizeHexColor(hexInput.value, "");
      if (!c) return;
      preview.style.background = c;
      applyAndTrack(c, false);
    });

    hexInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      applyBtn.click();
    });

    hexRow.append(hexInput, applyBtn);
    dom.colorPalettePopup.appendChild(hexRow);

    const mkChip = (c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.width = "44px";
      btn.style.height = "32px";
      btn.style.borderRadius = "8px";
      btn.style.border = "1px solid #64748b";
      btn.style.background = c;
      btn.style.touchAction = "manipulation";
      btn.style.userSelect = "none";
      btn.addEventListener("mousedown", (ev) => ev.preventDefault());
      btn.addEventListener("click", () => {
        hexInput.value = c;
        preview.style.background = c;
        applyAndTrack(c, false);
      });
      return btn;
    };

    dom.colorPalettePopup.appendChild(mkSectionLabel((lang === "en") ? "Palette" : "基本色"));
    const fixedWrap = document.createElement("div");
    fixedWrap.style.display = "grid";
    fixedWrap.style.gridTemplateColumns = "repeat(6, 44px)";
    fixedWrap.style.gap = "8px";
    for (const c of FIXED_PALETTE) fixedWrap.appendChild(mkChip(c));
    dom.colorPalettePopup.appendChild(fixedWrap);

    dom.colorPalettePopup.appendChild(mkSectionLabel((lang === "en") ? "Recent" : "最近使った色"));
    const recentWrap = document.createElement("div");
    recentWrap.style.display = "grid";
    recentWrap.style.gridTemplateColumns = "repeat(4, 44px)";
    recentWrap.style.gap = "8px";
    const recents = getRecentColors();
    for (let i = 0; i < 8; i += 1) {
      const c = recents[i] || "#ffffff";
      const chip = mkChip(c);
      if (!recents[i]) {
        chip.disabled = true;
        chip.style.opacity = "0.35";
      }
      recentWrap.appendChild(chip);
    }
    dom.colorPalettePopup.appendChild(recentWrap);

    const optRow = document.createElement("label");
    optRow.style.display = "inline-flex";
    optRow.style.alignItems = "center";
    optRow.style.gap = "6px";
    optRow.style.fontSize = "12px";
    optRow.textContent = (lang === "en") ? "Live Preview" : "ライブプレビュー";
    const liveToggle = document.createElement("input");
    liveToggle.type = "checkbox";
    liveToggle.checked = livePreview;
    liveToggle.addEventListener("change", () => {
      if (!state.ui) state.ui = {};
      state.ui.colorPopupLivePreview = !!liveToggle.checked;
      if (liveToggle.checked) applyAndTrack(hexInput.value, false);
    });
    optRow.appendChild(liveToggle);
    dom.colorPalettePopup.appendChild(optRow);

    const cmdRow = document.createElement("div");
    cmdRow.style.display = "flex";
    cmdRow.style.gap = "8px";
    cmdRow.style.justifyContent = "flex-end";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = (lang === "en") ? "Close" : "閉じる";
    closeBtn.style.minHeight = "34px";
    closeBtn.style.padding = "6px 12px";
    closeBtn.style.fontSize = "13px";
    closeBtn.addEventListener("click", () => hideColorPalettePopup());
    cmdRow.append(closeBtn);
    dom.colorPalettePopup.appendChild(cmdRow);
  };

  const showColorPalettePopupForInput = (inputEl, applyColor) => {
    if (!dom.colorPalettePopup || !inputEl || typeof applyColor !== "function") return;
    const sameInput = colorPopupCtx && colorPopupCtx.inputEl === inputEl;
    colorPopupCtx = {
      inputEl,
      applyColor,
      pendingColor: normalizeHexColor(inputEl.value, "#0f172a"),
    };
    renderColorPalettePopupContents();
    if (!sameInput) {
      const r = inputEl.getBoundingClientRect();
      const popup = dom.colorPalettePopup;
      const vp = getViewportSizeForUi();
      const popupW = Math.max(280, Number(popup.offsetWidth) || 280);
      const popupH = Math.max(240, Number(popup.offsetHeight) || 240);
      const left = Math.max(8, Math.min(vp.width - popupW - 8, Math.round(r.left)));
      const top = Math.max(8, Math.min(vp.height - popupH - 8, Math.round(r.bottom + 6)));
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    }
  };

  const bindColorInputPalette = (inputEl, applyColor) => {
    if (!inputEl || typeof applyColor !== "function") return;
    const applyFromInput = () => {
      const c = normalizeHexColor(inputEl.value, "#0f172a");
      inputEl.value = c;
      applyColor(c);
      pushRecentColor(c);
    };
    const openPopup = () => showColorPalettePopupForInput(inputEl, (c) => {
      inputEl.value = c;
      applyColor(c);
    });
    inputEl.addEventListener("input", applyFromInput);
    inputEl.addEventListener("change", applyFromInput);
    inputEl.addEventListener("focus", openPopup);
    inputEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      openPopup();
    });
    inputEl.addEventListener("click", (e) => {
      e.preventDefault();
      openPopup();
    });
    inputEl.addEventListener("blur", scheduleHideColorPalettePopup);
  };

  if (dom.colorPalettePopup) {
    dom.colorPalettePopup.addEventListener("mouseenter", () => {
      if (colorPaletteHideTimer) {
        clearTimeout(colorPaletteHideTimer);
        colorPaletteHideTimer = null;
      }
    });
    dom.colorPalettePopup.addEventListener("mouseleave", scheduleHideColorPalettePopup);
  }

  document.addEventListener("mousedown", (e) => {
    const t = e.target;
    if (!t) return;
    const isColorInput = t instanceof Element && t.matches("input[type='color']");
    const inPopup = dom.colorPalettePopup && t instanceof Element && dom.colorPalettePopup.contains(t);
    if (!isColorInput && !inPopup) hideColorPalettePopup();
  });

  return {
    bindColorInputPalette,
  };
}
