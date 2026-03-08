export function setupColorPaletteUi(params) {
  const { state, dom, getUiLanguage, getViewportSizeForUi } = params;

  const normalizeHexColor = (v, fallback = "#0f172a") => {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
  };
  const rgbToHex = (r, g, b) => `#${[r, g, b].map((n) => {
    const v = Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
    return v.toString(16).padStart(2, "0");
  }).join("")}`;
  const hexToRgb = (hex) => {
    const c = normalizeHexColor(hex, "#000000");
    return {
      r: parseInt(c.slice(1, 3), 16),
      g: parseInt(c.slice(3, 5), 16),
      b: parseInt(c.slice(5, 7), 16),
    };
  };
  const rgbToHsv = (r, g, b) => {
    const rn = (Number(r) || 0) / 255;
    const gn = (Number(g) || 0) / 255;
    const bn = (Number(b) || 0) / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h = 0;
    if (d > 1e-9) {
      if (max === rn) h = 60 * (((gn - bn) / d) % 6);
      else if (max === gn) h = 60 * (((bn - rn) / d) + 2);
      else h = 60 * (((rn - gn) / d) + 4);
    }
    if (h < 0) h += 360;
    const s = (max <= 1e-9) ? 0 : (d / max) * 100;
    const v = max * 100;
    return { h, s, v };
  };
  const hsvToRgb = (h, s, v) => {
    const hn = ((Number(h) || 0) % 360 + 360) % 360;
    const sn = Math.max(0, Math.min(100, Number(s) || 0)) / 100;
    const vn = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
    const c = vn * sn;
    const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
    const m = vn - c;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (hn < 60) { rp = c; gp = x; bp = 0; }
    else if (hn < 120) { rp = x; gp = c; bp = 0; }
    else if (hn < 180) { rp = 0; gp = c; bp = x; }
    else if (hn < 240) { rp = 0; gp = x; bp = c; }
    else if (hn < 300) { rp = x; gp = 0; bp = c; }
    else { rp = c; gp = 0; bp = x; }
    return {
      r: Math.round((rp + m) * 255),
      g: Math.round((gp + m) * 255),
      b: Math.round((bp + m) * 255),
    };
  };

  const getFileColorPalette = () => {
    if (!state.ui) state.ui = {};
    if (!Array.isArray(state.ui.colorPalette) || state.ui.colorPalette.length === 0) {
      state.ui.colorPalette = ["#000000", "#404040", "#808080", "#bfbfbf", "#ffffff", null, null, null, null, null];
    }
    const src = state.ui.colorPalette || [];
    const next = [];
    for (let i = 0; i < 10; i += 1) {
      const c = src[i];
      if (c == null || c === "") next.push(null);
      else {
        const n = normalizeHexColor(c, "");
        next.push(n || null);
      }
    }
    state.ui.colorPalette = next;
    return next;
  };
  const getPaletteSlots = () => {
    const p = getFileColorPalette().slice(0, 10);
    while (p.length < 10) p.push(null);
    return p;
  };
  const setPaletteSlot = (idx, colorOrNull) => {
    if (!state.ui) state.ui = {};
    const slots = getPaletteSlots();
    if (!Number.isFinite(Number(idx))) return;
    const i = Math.max(0, Math.min(9, Number(idx)));
    const c = (colorOrNull == null) ? null : normalizeHexColor(colorOrNull, "");
    slots[i] = c || null;
    state.ui.colorPalette = slots.slice(0, 10);
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
    const slots = getPaletteSlots();
    const lang = getUiLanguage(state);
    dom.colorPalettePopup.innerHTML = "";
    dom.colorPalettePopup.style.display = "flex";
    dom.colorPalettePopup.style.flexDirection = "column";
    dom.colorPalettePopup.style.gap = "6px";
    dom.colorPalettePopup.style.minWidth = "180px";
    const current = normalizeHexColor(inputEl.value, "#0f172a");
    const paletteWrap = document.createElement("div");
    paletteWrap.style.display = "grid";
    paletteWrap.style.gridTemplateColumns = "repeat(5, 18px)";
    paletteWrap.style.gap = "4px";
    if (!Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))) {
      const foundIdx = slots.findIndex((c) => c === current);
      colorPopupCtx.selectedPaletteIndex = (foundIdx >= 0) ? foundIdx : 0;
    }
    for (let i = 0; i < slots.length; i += 1) {
      const c = slots[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.title = c || ((lang === "en") ? "Empty Slot" : "空スロット");
      btn.style.width = "18px";
      btn.style.height = "18px";
      btn.style.padding = "0";
      btn.style.borderRadius = "3px";
      const isSelectedSlot = Number(colorPopupCtx.selectedPaletteIndex) === i;
      btn.style.border = isSelectedSlot ? "2px solid #4f46e5" : "1px solid #475569";
      btn.style.background = c || "#ffffff";
      if (!c) btn.style.backgroundImage = "linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 50%,#e2e8f0 50%,#e2e8f0 75%,transparent 75%,transparent)";
      if (!c) btn.style.backgroundSize = "8px 8px";
      btn.style.touchAction = "manipulation";
      btn.style.userSelect = "none";
      btn.addEventListener("mousedown", (ev) => ev.preventDefault());
      btn.addEventListener("click", () => {
        colorPopupCtx.selectedPaletteIndex = i;
        if (c) applyColor(c);
        renderColorPalettePopupContents();
      });
      paletteWrap.appendChild(btn);
    }
    dom.colorPalettePopup.appendChild(paletteWrap);

    if (colorPopupCtx.mode === "picker") {
      const hsv = colorPopupCtx.hsv || (() => {
        const rgb = hexToRgb(current);
        return rgbToHsv(rgb.r, rgb.g, rgb.b);
      })();
      colorPopupCtx.hsv = { h: hsv.h, s: hsv.s, v: hsv.v };
      const pickerPanel = document.createElement("div");
      pickerPanel.style.display = "grid";
      pickerPanel.style.gridTemplateColumns = "auto 1fr auto";
      pickerPanel.style.gap = "4px 6px";
      pickerPanel.style.alignItems = "center";
      const preview = document.createElement("div");
      preview.style.gridColumn = "1 / -1";
      preview.style.height = "20px";
      preview.style.border = "1px solid #94a3b8";
      preview.style.borderRadius = "4px";
      const hexLabel = document.createElement("div");
      hexLabel.style.gridColumn = "1 / -1";
      hexLabel.style.fontSize = "11px";
      hexLabel.style.color = "#334155";
      const mkSlider = (label, min, max, step, value) => {
        const l = document.createElement("span");
        l.textContent = label;
        l.style.fontSize = "11px";
        const r = document.createElement("input");
        r.type = "range";
        r.min = String(min);
        r.max = String(max);
        r.step = String(step);
        r.value = String(value);
        const v = document.createElement("span");
        v.style.fontSize = "11px";
        v.textContent = String(Math.round(Number(value) || 0));
        return { l, r, v };
      };
      const hRow = mkSlider((lang === "en") ? "Hue" : "色相", 0, 360, 1, colorPopupCtx.hsv.h);
      const sRow = mkSlider((lang === "en") ? "Sat" : "彩度", 0, 100, 1, colorPopupCtx.hsv.s);
      const vRow = mkSlider((lang === "en") ? "Val" : "明度", 0, 100, 1, colorPopupCtx.hsv.v);
      const applyHsv = () => {
        colorPopupCtx.hsv.h = Number(hRow.r.value) || 0;
        colorPopupCtx.hsv.s = Number(sRow.r.value) || 0;
        colorPopupCtx.hsv.v = Number(vRow.r.value) || 0;
        hRow.v.textContent = String(Math.round(colorPopupCtx.hsv.h));
        sRow.v.textContent = String(Math.round(colorPopupCtx.hsv.s));
        vRow.v.textContent = String(Math.round(colorPopupCtx.hsv.v));
        const rgb = hsvToRgb(colorPopupCtx.hsv.h, colorPopupCtx.hsv.s, colorPopupCtx.hsv.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        preview.style.background = hex;
        hexLabel.textContent = hex;
        applyColor(hex);
      };
      hRow.r.addEventListener("input", applyHsv);
      sRow.r.addEventListener("input", applyHsv);
      vRow.r.addEventListener("input", applyHsv);
      pickerPanel.append(preview, hexLabel, hRow.l, hRow.r, hRow.v, sRow.l, sRow.r, sRow.v, vRow.l, vRow.r, vRow.v);
      applyHsv();
      const cmdRow = document.createElement("div");
      cmdRow.style.display = "flex";
      cmdRow.style.gap = "6px";
      cmdRow.style.justifyContent = "flex-end";
      const regBtn = document.createElement("button");
      regBtn.type = "button";
      regBtn.textContent = (lang === "en") ? "Register This Color" : "この色を登録";
      regBtn.style.fontSize = "11px";
      regBtn.style.padding = "2px 8px";
      regBtn.addEventListener("click", () => {
        const rgb = hsvToRgb(colorPopupCtx.hsv.h, colorPopupCtx.hsv.s, colorPopupCtx.hsv.v);
        const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
        const idx = Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))
          ? Number(colorPopupCtx.selectedPaletteIndex)
          : 0;
        setPaletteSlot(idx, hex);
        applyColor(hex);
        colorPopupCtx.mode = "palette";
        renderColorPalettePopupContents();
      });
      const cancelBtn = document.createElement("button");
      cancelBtn.type = "button";
      cancelBtn.textContent = (lang === "en") ? "Cancel" : "キャンセル";
      cancelBtn.style.fontSize = "11px";
      cancelBtn.style.padding = "2px 8px";
      cancelBtn.addEventListener("click", () => {
        colorPopupCtx.mode = "palette";
        renderColorPalettePopupContents();
      });
      cmdRow.append(regBtn, cancelBtn);
      dom.colorPalettePopup.append(pickerPanel, cmdRow);
    } else {
      const cmdRow = document.createElement("div");
      cmdRow.style.display = "flex";
      cmdRow.style.gap = "6px";
      cmdRow.style.justifyContent = "flex-end";
      const openRegBtn = document.createElement("button");
      openRegBtn.type = "button";
      openRegBtn.textContent = (lang === "en") ? "Register" : "登録";
      openRegBtn.style.fontSize = "11px";
      openRegBtn.style.padding = "2px 8px";
      openRegBtn.addEventListener("click", () => {
        const idx = Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))
          ? Number(colorPopupCtx.selectedPaletteIndex)
          : 0;
        const slotColor = slots[idx] || current;
        const rgb = hexToRgb(slotColor);
        colorPopupCtx.hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        colorPopupCtx.mode = "picker";
        renderColorPalettePopupContents();
      });
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.textContent = (lang === "en") ? "Delete" : "削除";
      delBtn.style.fontSize = "11px";
      delBtn.style.padding = "2px 8px";
      delBtn.addEventListener("click", () => {
        const idx = Number.isFinite(Number(colorPopupCtx.selectedPaletteIndex))
          ? Number(colorPopupCtx.selectedPaletteIndex)
          : 0;
        setPaletteSlot(idx, null);
        renderColorPalettePopupContents();
      });
      cmdRow.append(openRegBtn, delBtn);
      dom.colorPalettePopup.appendChild(cmdRow);
    }
  };

  const showColorPalettePopupForInput = (inputEl, applyColor) => {
    if (!dom.colorPalettePopup || !inputEl || typeof applyColor !== "function") return;
    const sameInput = colorPopupCtx && colorPopupCtx.inputEl === inputEl;
    colorPopupCtx = { inputEl, applyColor, selectedPaletteIndex: null, mode: "palette", hsv: null };
    renderColorPalettePopupContents();
    if (!sameInput) {
      const r = inputEl.getBoundingClientRect();
      const popup = dom.colorPalettePopup;
      const vp = getViewportSizeForUi();
      const left = Math.max(8, Math.min(vp.width - 170, Math.round(r.left)));
      const top = Math.max(8, Math.min(vp.height - 120, Math.round(r.bottom + 6)));
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
