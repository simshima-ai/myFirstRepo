export function setupColorPaletteUi(params) {
  const { state, dom, getUiLanguage, getViewportSizeForUi, selectSameColorByCurrent = null } = params;

  const normalizeHexColor = (v, fallback = "#0f172a") => {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
  };

  // Top row: grayscale, second row: balanced CAD-like muted hues.
  const FIXED_GRAYSCALE = [
    "#111827", "#374151", "#6b7280", "#9ca3af", "#d1d5db", "#f3f4f6",
  ];
  const FIXED_HUES = [
    "#ef4444", "#f97316", "#facc15", "#22c55e", "#38bdf8", "#6366f1",
  ];

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const hexToRgb = (hex) => {
    const c = normalizeHexColor(hex, "");
    if (!c) return { r: 15, g: 23, b: 42 };
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
    };
  };

  const rgbToHex = (r, g, b) => `#${
    clamp(Math.round(r), 0, 255).toString(16).padStart(2, "0")
  }${
    clamp(Math.round(g), 0, 255).toString(16).padStart(2, "0")
  }${
    clamp(Math.round(b), 0, 255).toString(16).padStart(2, "0")
  }`;

  const rgbToHsv = (r, g, b) => {
    const rn = clamp(r, 0, 255) / 255;
    const gn = clamp(g, 0, 255) / 255;
    const bn = clamp(b, 0, 255) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = ((bn - rn) / d) + 2;
      else h = ((rn - gn) / d) + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = (max === 0) ? 0 : (d / max);
    const v = max;
    return {
      h: Math.round(h),
      s: Math.round(s * 100),
      v: Math.round(v * 100),
    };
  };

  const hsvToRgb = (h, s, v) => {
    const hn = ((Number(h) % 360) + 360) % 360;
    const sn = clamp(Number(s), 0, 100) / 100;
    const vn = clamp(Number(v), 0, 100) / 100;
    const c = vn * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = vn - c;
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (hn < 60) { r1 = c; g1 = x; b1 = 0; }
    else if (hn < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (hn < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (hn < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (hn < 300) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  };

  const ensureCustomPaletteState = () => {
    if (!state.ui) state.ui = {};
    const src = Array.isArray(state.ui.customPaletteColors) ? state.ui.customPaletteColors : [];
    const out = [];
    for (let i = 0; i < 12; i += 1) {
      out.push(normalizeHexColor(src[i], ""));
    }
    state.ui.customPaletteColors = out;
    const idx = Number(state.ui.customPaletteActiveIndex);
    state.ui.customPaletteActiveIndex = Number.isFinite(idx) ? clamp(Math.round(idx), 0, 11) : 0;
    return out;
  };

  const setCustomPaletteColor = (index, color) => {
    const idx = clamp(Number(index) || 0, 0, 11);
    const c = normalizeHexColor(color, "");
    const arr = ensureCustomPaletteState();
    arr[idx] = c;
    state.ui.customPaletteColors = arr;
  };

  let colorPopupCtx = null;
  let prevTopContextDisplay = null;

  const updateSelectionHighlightSuppression = () => {
    if (!state.ui) state.ui = {};
    const id = String(colorPopupCtx?.inputEl?.id || "");
    const affectsSelectionColor = id === "selectionColorInput" || id === "selectionTextColorInput" || id === "dimSelectionColorInput";
    state.ui.suppressSelectionHighlight = !!(dom.colorPalettePopup && dom.colorPalettePopup.style.display !== "none" && affectsSelectionColor);
  };

  const hideColorPalettePopup = () => {
    if (dom.colorPalettePopup) dom.colorPalettePopup.style.display = "none";
    const topContext = document.getElementById("topContext");
    if (topContext && prevTopContextDisplay !== null) {
      topContext.style.display = prevTopContextDisplay;
      prevTopContextDisplay = null;
    }
    colorPopupCtx = null;
    if (state.ui) state.ui.suppressSelectionHighlight = false;
  };

  const getViewportRectForPopup = () => {
    const vv = window.visualViewport;
    if (vv && Number.isFinite(vv.width) && Number.isFinite(vv.height)) {
      return {
        left: Number(vv.offsetLeft) || 0,
        top: Number(vv.offsetTop) || 0,
        width: Number(vv.width) || 0,
        height: Number(vv.height) || 0,
      };
    }
    const vp = getViewportSizeForUi();
    return { left: 0, top: 0, width: Number(vp.width) || 0, height: Number(vp.height) || 0 };
  };

  const placeColorPalettePopup = () => {
    if (!dom.colorPalettePopup) return;
    const popup = dom.colorPalettePopup;
    const vp = getViewportRectForPopup();
    const margin = 8;
    const popupW = Math.max(224, Number(popup.offsetWidth) || 224);
    const popupH = Math.max(240, Number(popup.offsetHeight) || 240);
    const minLeft = vp.left + margin;
    const maxLeft = Math.max(minLeft, vp.left + vp.width - popupW - margin);
    const minTop = vp.top + margin;
    const maxTop = Math.max(minTop, vp.top + vp.height - popupH - margin);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const centeredLeft = Math.round(vp.left + (vp.width - popupW) / 2);
    const centeredTop = Math.round(vp.top + margin);
    const left = clamp(centeredLeft, minLeft, maxLeft);
    const top = clamp(centeredTop, minTop, maxTop);
    popup.style.left = `${Math.round(left)}px`;
    popup.style.top = `${Math.round(top)}px`;
  };

  const renderColorPalettePopupContents = () => {
    if (!dom.colorPalettePopup || !colorPopupCtx || !colorPopupCtx.inputEl) return;
    const { inputEl, applyColor } = colorPopupCtx;
    const lang = getUiLanguage(state);
    const current = normalizeHexColor(inputEl.value, "#0f172a");

    dom.colorPalettePopup.innerHTML = "";
    dom.colorPalettePopup.style.display = "flex";
    dom.colorPalettePopup.style.flexDirection = "column";
    dom.colorPalettePopup.style.gap = "8px";
    dom.colorPalettePopup.style.minWidth = "224px";
    dom.colorPalettePopup.style.maxWidth = "272px";
    dom.colorPalettePopup.style.padding = "8px";
    updateSelectionHighlightSuppression();

    const pending = normalizeHexColor(colorPopupCtx.pendingColor || current, current);
    colorPopupCtx.pendingColor = pending;
    const customPalette = ensureCustomPaletteState();
    if (!state.ui) state.ui = {};
    if (state.ui.colorPaletteSource !== "custom" && state.ui.colorPaletteSource !== "fixed") {
      state.ui.colorPaletteSource = "fixed";
    }

    let customPickerRef = null;
    let hRangeRef = null;
    let sRangeRef = null;
    let vRangeRef = null;
    let hValueRef = null;
    let sValueRef = null;
    let vValueRef = null;

    const applyAndTrack = (hex, commit = false, storeInCustom = true) => {
      const c = normalizeHexColor(hex, "#0f172a");
      colorPopupCtx.pendingColor = c;
      inputEl.value = c;
      if (customPickerRef) customPickerRef.value = c;
      // Live preview: reflect color immediately even before Apply.
      applyColor(c);
      if (commit) {
        if (storeInCustom) {
          const slot = Number(state.ui?.customPaletteActiveIndex ?? 0);
          setCustomPaletteColor(slot, c);
        }
      }
    };

    const syncHsvUiFromHex = (hex) => {
      const { r, g, b } = hexToRgb(hex);
      const hsv = rgbToHsv(r, g, b);
      if (hRangeRef) hRangeRef.value = String(hsv.h);
      if (sRangeRef) sRangeRef.value = String(hsv.s);
      if (vRangeRef) vRangeRef.value = String(hsv.v);
      if (hValueRef) hValueRef.textContent = `${hsv.h}`;
      if (sValueRef) sValueRef.textContent = `${hsv.s}%`;
      if (vValueRef) vValueRef.textContent = `${hsv.v}%`;
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
    preview.style.height = "28px";
    preview.style.border = "1px solid #94a3b8";
    preview.style.borderRadius = "7px";
    preview.style.background = pending;
    dom.colorPalettePopup.appendChild(preview);

    const hexRow = document.createElement("div");
    hexRow.style.display = "grid";
    hexRow.style.gridTemplateColumns = "1fr";
    hexRow.style.gap = "6px";

    const hexInput = document.createElement("input");
    hexInput.type = "text";
    hexInput.value = pending;
    hexInput.maxLength = 7;
    hexInput.style.fontSize = "12px";
    hexInput.style.fontWeight = "700";
    hexInput.style.padding = "6px 8px";
    hexInput.style.border = "1px solid #94a3b8";
    hexInput.style.borderRadius = "7px";

    const applyColorToUi = (c, commit = false, rerender = false, storeInCustom = true) => {
      hexInput.value = c;
      preview.style.background = c;
      applyAndTrack(c, commit, storeInCustom);
      updateChipSelection(c);
      syncHsvUiFromHex(c);
      if (rerender) renderColorPalettePopupContents();
    };

    hexInput.addEventListener("input", () => {
      const c = normalizeHexColor(hexInput.value, "");
      if (!c) return;
      applyColorToUi(c, false, false);
    });

    hexInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const c = normalizeHexColor(hexInput.value, colorPopupCtx.pendingColor || current);
      applyColorToUi(c, false, false);
    });

    hexRow.append(hexInput);
    dom.colorPalettePopup.appendChild(hexRow);

    const mkChip = (c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.colorChip = c;
      btn.style.width = "36px";
      btn.style.height = "26px";
      btn.style.borderRadius = "6px";
      btn.style.border = "1px solid #64748b";
      btn.style.background = c;
      btn.style.touchAction = "manipulation";
      btn.style.userSelect = "none";
      btn.style.position = "relative";
      btn.addEventListener("mousedown", (ev) => ev.preventDefault());
      btn.addEventListener("click", () => {
        state.ui.colorPaletteSource = "fixed";
        applyColorToUi(c, false, false, false);
        updateCustomSlotSelection();
      });
      return btn;
    };

    const updateChipSelection = (selectedColor) => {
      const selected = normalizeHexColor(selectedColor, "");
      const source = String(state.ui?.colorPaletteSource || "fixed");
      for (const chip of dom.colorPalettePopup.querySelectorAll("[data-color-chip]")) {
        const c = normalizeHexColor(chip.dataset.colorChip || "", "");
        const isActive = source === "fixed" && !!selected && c === selected;
        chip.style.outline = isActive ? "2px solid #0ea5e9" : "none";
        chip.style.outlineOffset = isActive ? "1px" : "0";
        chip.style.boxShadow = isActive ? "0 0 0 2px rgba(255,255,255,0.9) inset" : "none";
      }
    };

    const updateCustomSlotSelection = () => {
      const source = String(state.ui?.colorPaletteSource || "fixed");
      const active = Number(state.ui?.customPaletteActiveIndex ?? 0);
      for (const el of dom.colorPalettePopup.querySelectorAll("[data-custom-palette-slot]")) {
        const i = Number(el.dataset.customPaletteSlot || -1);
        const on = source === "custom" && i === active;
        el.style.outline = on ? "2px solid #0ea5e9" : "none";
        el.style.outlineOffset = on ? "1px" : "0";
      }
    };

    dom.colorPalettePopup.appendChild(mkSectionLabel("Palette"));
    const fixedWrap = document.createElement("div");
    fixedWrap.style.display = "grid";
    fixedWrap.style.gridTemplateColumns = "repeat(6, 36px)";
    fixedWrap.style.gap = "6px";
    for (const c of FIXED_GRAYSCALE) fixedWrap.appendChild(mkChip(c));
    for (const c of FIXED_HUES) fixedWrap.appendChild(mkChip(c));
    dom.colorPalettePopup.appendChild(fixedWrap);

    dom.colorPalettePopup.appendChild(mkSectionLabel("Custom Palette"));
    const customPaletteWrap = document.createElement("div");
    customPaletteWrap.style.display = "grid";
    customPaletteWrap.style.gridTemplateColumns = "repeat(6, 36px)";
    customPaletteWrap.style.gap = "6px";
    for (let i = 0; i < 12; i += 1) {
      const c = normalizeHexColor(customPalette[i], "");
      const slotBtn = document.createElement("button");
      slotBtn.type = "button";
      slotBtn.dataset.customPaletteSlot = String(i);
      slotBtn.style.width = "36px";
      slotBtn.style.height = "26px";
      slotBtn.style.borderRadius = "6px";
      slotBtn.style.touchAction = "manipulation";
      slotBtn.style.userSelect = "none";
      slotBtn.style.padding = "0";
      if (c) {
        slotBtn.style.border = "1px solid #64748b";
        slotBtn.style.background = c;
      } else {
        slotBtn.style.border = "1px dashed #94a3b8";
        slotBtn.style.background = "#f8fafc";
      }
      slotBtn.addEventListener("mousedown", (ev) => ev.preventDefault());
      slotBtn.addEventListener("click", () => {
        if (!state.ui) state.ui = {};
        state.ui.colorPaletteSource = "custom";
        state.ui.customPaletteActiveIndex = i;
        if (c) applyColorToUi(c, false, true);
        else renderColorPalettePopupContents();
      });
      customPaletteWrap.appendChild(slotBtn);
    }
    dom.colorPalettePopup.appendChild(customPaletteWrap);

    dom.colorPalettePopup.appendChild(mkSectionLabel("Create Color"));
    const customWrap = document.createElement("div");
    customWrap.style.display = "grid";
    customWrap.style.gridTemplateColumns = "auto 1fr";
    customWrap.style.gap = "6px";
    customWrap.style.alignItems = "center";

    const customPicker = document.createElement("input");
    customPicker.type = "color";
    customPicker.value = pending;
    customPicker.style.width = "48px";
    customPicker.style.minWidth = "48px";
    customPicker.style.height = "30px";
    customPicker.style.padding = "0";
    customPicker.style.border = "1px solid #94a3b8";
    customPicker.style.borderRadius = "7px";
    customPickerRef = customPicker;

    const hsvWrap = document.createElement("div");
    hsvWrap.style.display = "grid";
    hsvWrap.style.gridTemplateColumns = "1fr";
    hsvWrap.style.gap = "4px";

    const applyFromHsv = () => {
      const h = Number(hRangeRef?.value || 0);
      const s = Number(sRangeRef?.value || 0);
      const v = Number(vRangeRef?.value || 0);
      const rgb = hsvToRgb(h, s, v);
      const c = rgbToHex(rgb.r, rgb.g, rgb.b);
      // In custom-palette workflow, reflect slider color to active slot immediately.
      const slot = Number(state.ui?.customPaletteActiveIndex ?? 0);
      state.ui.colorPaletteSource = "custom";
      setCustomPaletteColor(slot, c);
      const slotBtn = dom.colorPalettePopup?.querySelector?.(`[data-custom-palette-slot="${slot}"]`);
      if (slotBtn) {
        slotBtn.style.border = "1px solid #64748b";
        slotBtn.style.background = c;
      }
      applyColorToUi(c, false, false);
      updateCustomSlotSelection();
    };

    const mkHsvRow = (label, min, max, value, setRefs) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "16px 1fr 40px";
      row.style.gap = "6px";
      row.style.alignItems = "center";

      const lb = document.createElement("div");
      lb.textContent = label;
      lb.style.fontSize = "11px";
      lb.style.color = "#475569";
      lb.style.fontWeight = "700";

      const range = document.createElement("input");
      range.type = "range";
      range.min = String(min);
      range.max = String(max);
      range.step = "1";
      range.value = String(value);
      range.addEventListener("input", () => applyFromHsv());
      range.addEventListener("change", () => applyFromHsv());

      const val = document.createElement("div");
      val.style.fontSize = "11px";
      val.style.color = "#64748b";
      val.style.textAlign = "right";

      row.append(lb, range, val);
      hsvWrap.appendChild(row);
      setRefs(range, val);
    };

    mkHsvRow("H", 0, 360, 0, (range, val) => { hRangeRef = range; hValueRef = val; });
    mkHsvRow("S", 0, 100, 0, (range, val) => { sRangeRef = range; sValueRef = val; });
    mkHsvRow("V", 0, 100, 0, (range, val) => { vRangeRef = range; vValueRef = val; });

    customPicker.addEventListener("input", () => {
      const c = normalizeHexColor(customPicker.value, colorPopupCtx.pendingColor || current);
      state.ui.colorPaletteSource = "custom";
      applyColorToUi(c, false, false);
      updateCustomSlotSelection();
    });
    customPicker.addEventListener("change", () => {
      const c = normalizeHexColor(customPicker.value, colorPopupCtx.pendingColor || current);
      state.ui.colorPaletteSource = "custom";
      applyColorToUi(c, false, false);
      updateCustomSlotSelection();
    });

    customWrap.append(customPicker, hsvWrap);
    dom.colorPalettePopup.appendChild(customWrap);

    const selectSameBtn = document.createElement("button");
    selectSameBtn.type = "button";
    selectSameBtn.textContent = lang === "ja" ? "\u540c\u3058\u8272\u3092\u9078\u629e" : "Select Same Color Objects";
    selectSameBtn.style.minHeight = "30px";
    selectSameBtn.style.padding = "4px 10px";
    selectSameBtn.style.fontSize = "12px";
    selectSameBtn.addEventListener("click", () => {
      if (typeof colorPopupCtx?.selectSameColorByCurrent === "function") {
        colorPopupCtx.selectSameColorByCurrent(normalizeHexColor(colorPopupCtx.pendingColor, "#0f172a"));
      }
    });
    dom.colorPalettePopup.appendChild(selectSameBtn);

    const cmdRow = document.createElement("div");
    cmdRow.style.display = "flex";
    cmdRow.style.gap = "6px";
    cmdRow.style.justifyContent = "stretch";
    cmdRow.style.gridTemplateColumns = "1fr 1fr";
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.textContent = lang === "ja" ? "\u9069\u7528" : "Apply";
    applyBtn.style.minHeight = "30px";
    applyBtn.style.padding = "4px 10px";
    applyBtn.style.fontSize = "12px";
    applyBtn.style.flex = "1 1 0";
    applyBtn.addEventListener("click", () => {
      const c = normalizeHexColor(colorPopupCtx?.pendingColor || hexInput.value, "#0f172a");
      applyAndTrack(c, true, true);
      hideColorPalettePopup();
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = lang === "ja" ? "\u30ad\u30e3\u30f3\u30bb\u30eb" : "Cancel";
    cancelBtn.style.minHeight = "30px";
    cancelBtn.style.padding = "4px 10px";
    cancelBtn.style.fontSize = "12px";
    cancelBtn.style.flex = "1 1 0";
    cancelBtn.addEventListener("click", () => {
      const initial = normalizeHexColor(colorPopupCtx?.initialColor || current, "#0f172a");
      inputEl.value = initial;
      applyColor(initial);
      hideColorPalettePopup();
    });
    cmdRow.append(applyBtn, cancelBtn);
    dom.colorPalettePopup.appendChild(cmdRow);

    syncHsvUiFromHex(colorPopupCtx.pendingColor);
    updateChipSelection(colorPopupCtx.pendingColor);
    updateCustomSlotSelection();
  };

  const showColorPalettePopupForInput = (inputEl, applyColor) => {
    if (!dom.colorPalettePopup || !inputEl || typeof applyColor !== "function") return;
    const sameInput = colorPopupCtx && colorPopupCtx.inputEl === inputEl;
    colorPopupCtx = {
      inputEl,
      applyColor,
      pendingColor: normalizeHexColor(inputEl.value, "#0f172a"),
      initialColor: normalizeHexColor(inputEl.value, "#0f172a"),
      selectSameColorByCurrent,
    };
    renderColorPalettePopupContents();
    updateSelectionHighlightSuppression();
    const topContext = document.getElementById("topContext");
    if (topContext) {
      if (prevTopContextDisplay === null) prevTopContextDisplay = topContext.style.display || "";
      topContext.style.display = "none";
    }
    if (!sameInput) placeColorPalettePopup();
    else placeColorPalettePopup();
  };

  const bindColorInputPalette = (inputEl, applyColor) => {
    if (!inputEl || typeof applyColor !== "function") return;
    const openPopup = () => showColorPalettePopupForInput(inputEl, (c) => {
      inputEl.value = c;
      applyColor(c);
    });
    inputEl.addEventListener("focus", openPopup);
    inputEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      openPopup();
    });
    inputEl.addEventListener("click", (e) => {
      e.preventDefault();
      openPopup();
    });
  };

  const onViewportChange = () => {
    if (!dom.colorPalettePopup || dom.colorPalettePopup.style.display === "none") return;
    if (!colorPopupCtx?.inputEl) return;
    placeColorPalettePopup();
  };
  window.addEventListener("resize", onViewportChange);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onViewportChange);
    window.visualViewport.addEventListener("scroll", onViewportChange);
  }

  return {
    bindColorInputPalette,
  };
}
