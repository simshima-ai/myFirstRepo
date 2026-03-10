import { bindDimSettingsEvents, bindLayerAndGroupBasicEvents, bindPageAndPatternEvents } from "./ui_bindings.js";
import { setupColorPaletteUi } from "./ui_color_palette.js";
import { bindToolParameterEvents } from "./ui_tool_param_events.js";
import { createHtmlLikeLeftMenuRegistry, leftMenuItemKey, getViewportSizeForUi, isLeftMenuItemVisible, bindSnapItemsToLeftMenuVisibility } from "./ui_left_menu_core.js";
import { getUiLanguage, normalizePositiveNumber } from "./ui_i18n.js";
import {
  clampGridAutoTiming,
  gridAutoTimingFromThreshold50,
  gridAutoTimingLabelText,
  gridThresholdsFromTiming,
  normalizeGridPreset,
  normalizeLineTypePreset,
  normalizeLineWidthPreset,
  normalizeMaxZoomPreset,
  normalizeMenuScalePreset,
  normalizePageScalePreset,
} from "./ui_numeric.js";
import { refreshUiMain } from "./ui_refresh_main.js";
import { bindInitTailEvents } from "./ui_init_tail_events.js";
import { bindGroupListInitEvents } from "./ui_init_group_list_events.js";
export function initUiMain(state, dom, actions, deps = {}) {
  const createToolRegistry = (typeof deps?.createToolRegistry === 'function') ? deps.createToolRegistry : (() => []);
  const refreshUi = (s, d) => refreshUiMain(s, d);
  bindSnapItemsToLeftMenuVisibility(dom);
  const toElementTarget = (node) => {
    if (!node) return null;
    if (node.nodeType === 1) return node;
    return node.parentElement || null;
  };
  const parseDragPayload = (e) => {
    const rawG = state.ui?.groupDragDrop?.draggingGroupId;
    const rawS = state.ui?.groupDragDrop?.draggingShapeId;
    const rawSS = state.ui?.groupDragDrop?.draggingShapeIds;
    let groupId = (rawG != null && Number.isFinite(Number(rawG))) ? Number(rawG) : null;
    let shapeId = (rawS != null && Number.isFinite(Number(rawS))) ? Number(rawS) : null;
    let shapeIds = Array.isArray(rawSS) ? rawSS.map(Number).filter(Number.isFinite) : [];
    try {
      const raw = e?.dataTransfer?.getData?.("text/plain");
      if (typeof raw === "string" && raw.length) {
        if (raw.startsWith("shapes:")) {
          shapeIds = raw.slice(7).split(",").map((v) => Number(v)).filter(Number.isFinite);
          if (shapeIds.length === 1) shapeId = Number(shapeIds[0]);
        } else if (raw.startsWith("shape:")) {
          const sid = Number(raw.slice(6));
          if (Number.isFinite(sid)) shapeId = sid;
        } else {
          const gid = Number(raw);
          if (Number.isFinite(gid)) groupId = gid;
        }
      }
    } catch (_) { }
    return { groupId, shapeId, shapeIds };
  };
  const resolveGroupDropTarget = (fromEl) => {
    const el = toElementTarget(fromEl);
    const groupRow = el?.closest?.("[data-group-row]");
    if (groupRow) {
      const gid = Number(groupRow.dataset.groupRow);
      return Number.isFinite(gid) ? { gid, row: groupRow } : null;
    }
    const objRow = el?.closest?.("[data-group-shape-row]");
    if (objRow) {
      const ownerGid = Number(objRow.dataset.ownerGroupId);
      if (!Number.isFinite(ownerGid)) return null;
      const ownerRow = dom.groupList?.querySelector?.(`[data-group-row="${ownerGid}"]`) || null;
      return { gid: ownerGid, row: ownerRow };
    }
    return null;
  };
  const refreshUiDeferred = () => {
    setTimeout(() => { refreshUi(state, dom); }, 0);
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => refreshUi(state, dom)));
    }
  };
  const { bindColorInputPalette } = setupColorPaletteUi({
    state,
    dom,
    getUiLanguage,
    getViewportSizeForUi,
  });
  let groupPanelResizeDrag = null;
  const onGroupPanelResizeMove = (e) => {
    if (!groupPanelResizeDrag) return;
    if (!state.ui.panelLayout) state.ui.panelLayout = {};
    const dx = e.clientX - groupPanelResizeDrag.startX;
    const dy = e.clientY - groupPanelResizeDrag.startY;
    if (groupPanelResizeDrag.mode === "width" || groupPanelResizeDrag.mode === "both") {
      state.ui.panelLayout.rightPanelWidth = Math.max(180, Math.min(900, Math.round(groupPanelResizeDrag.startWidth - dx)));
    }
    if (groupPanelResizeDrag.mode === "height" || groupPanelResizeDrag.mode === "both") {
      state.ui.panelLayout.groupPanelHeight = Math.max(180, Math.min(2000, Math.round(groupPanelResizeDrag.startHeight - dy)));
    }
    if (groupPanelResizeDrag.mode === "layerHeight") {
      const nextListH = Math.max(40, Math.min(2000, Math.round((groupPanelResizeDrag.startListHeight ?? 120) - dy)));
      state.ui.panelLayout.layerPanelListHeight = nextListH;
    }
    refreshUi(state, dom);
  };
  const stopGroupPanelResizeDrag = () => {
    if (!groupPanelResizeDrag) return;
    groupPanelResizeDrag = null;
    window.removeEventListener("mousemove", onGroupPanelResizeMove);
    window.removeEventListener("mouseup", stopGroupPanelResizeDrag);
  };

  const toolTargets = {
    tools: dom.toolButtons,
    edit: dom.editToolButtons || dom.toolButtons,
    files: dom.fileToolButtons || dom.toolButtons,
  };
  const positionOneLeftFlyout = (wrapEl) => {
    if (!wrapEl) return;
    const main = wrapEl.querySelector(".left-flyout-main");
    const menu = wrapEl.querySelector(".left-flyout-menu");
    if (!main || !menu) return;
    const gap = 6;
    const pad = 8;
    const vp = getViewportSizeForUi();
    const maxMenuH = Math.max(80, vp.height - pad * 2);
    menu.style.maxHeight = `${Math.round(maxMenuH)}px`;
    const br = main.getBoundingClientRect();
    const mr = menu.getBoundingClientRect();
    const menuW = Math.max(82, Number(mr.width || 0), Number(menu.scrollWidth || 0));
    const menuH = Math.min(maxMenuH, Math.max(0, Number(mr.height || 0), Number(menu.scrollHeight || 0)));
    let x = br.right + gap;
    let y = br.top;
    if ((x + menuW + pad) > vp.width) x = Math.max(pad, br.left - gap - menuW);
    if ((y + menuH + pad) > vp.height) y = Math.max(pad, vp.height - menuH - pad);
    y = Math.max(pad, y);
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
  };
  const positionOpenedLeftFlyouts = () => {
    const opened = document.querySelectorAll(".tool-buttons .left-flyout.open");
    opened.forEach((el) => positionOneLeftFlyout(el));
  };
  let actionPopoverEl = null;
  let actionPopoverOwner = null;
  const ensureActionPopover = () => {
    if (actionPopoverEl) return actionPopoverEl;
    const el = document.createElement("div");
    el.className = "left-action-popover";
    el.style.position = "fixed";
    el.style.display = "none";
    el.style.flexDirection = "column";
    el.style.gap = "6px";
    el.style.padding = "6px";
    el.style.border = "1px solid var(--line)";
    el.style.borderRadius = "8px";
    el.style.background = "rgba(255,255,255,0.98)";
    el.style.boxShadow = "var(--shadow-soft)";
    el.style.zIndex = "1200";
    el.style.minWidth = "82px";
    el.style.maxHeight = "calc(var(--app-vh) - 16px)";
    el.style.overflowY = "auto";
    el.style.overscrollBehavior = "contain";
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
    document.body.appendChild(el);
    actionPopoverEl = el;
    return el;
  };
  const closeActionPopover = () => {
    if (actionPopoverOwner) actionPopoverOwner.setAttribute("aria-expanded", "false");
    actionPopoverOwner = null;
    if (!actionPopoverEl) return;
    actionPopoverEl.style.display = "none";
    actionPopoverEl.innerHTML = "";
    actionPopoverEl.style.left = "";
    actionPopoverEl.style.top = "";
  };
  const positionActionPopover = (anchorBtn) => {
    if (!anchorBtn) return;
    const pop = ensureActionPopover();
    const gap = 6;
    const pad = 8;
    const br = anchorBtn.getBoundingClientRect();
    const pr = pop.getBoundingClientRect();
    const popW = Math.max(82, Number(pr.width || 0), Number(pop.scrollWidth || 0));
    const vp = getViewportSizeForUi();
    const popH = Math.max(0, Math.min(vp.height - pad * 2, Number(pr.height || 0), Number(pop.scrollHeight || 0)));
    let x = br.right + gap;
    let y = br.top;
    if ((x + popW + pad) > vp.width) x = Math.max(pad, br.left - gap - popW);
    if ((y + popH + pad) > vp.height) y = Math.max(pad, vp.height - popH - pad);
    y = Math.max(pad, y);
    pop.style.left = `${Math.round(x)}px`;
    pop.style.top = `${Math.round(y)}px`;
  };
  const openActionPopover = (anchorBtn, item) => {
    const pop = ensureActionPopover();
    pop.innerHTML = "";
    const opts = Array.isArray(item?.options) ? item.options : [];
    for (const opt of opts) {
      const optBtn = document.createElement("button");
      optBtn.type = "button";
      optBtn.textContent = opt.label;
      optBtn.dataset.action = opt.id;
      const fn = actions[opt.id];
      if (typeof fn === "function") {
        optBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          fn();
          closeActionPopover();
        });
      } else {
        optBtn.disabled = true;
      }
      pop.appendChild(optBtn);
    }
    pop.style.display = "flex";
    pop.style.visibility = "hidden";
    positionActionPopover(anchorBtn);
    pop.style.visibility = "";
    actionPopoverOwner = anchorBtn;
    anchorBtn.setAttribute("aria-expanded", "true");
  };
  const closeLeftFlyouts = (exceptEl = null) => {
    const opened = document.querySelectorAll(".tool-buttons .left-flyout.open");
    opened.forEach((el) => {
      if (exceptEl && el === exceptEl) return;
      el.classList.remove("open");
      const main = el.querySelector(".left-flyout-main");
      const menu = el.querySelector(".left-flyout-menu");
      if (main) main.setAttribute("aria-expanded", "false");
      if (menu) {
        menu.classList.remove("floating");
        menu.style.left = "";
        menu.style.top = "";
      }
    });
  };
  if (!state.ui._leftFlyoutGlobalCloseBound) {
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (t?.closest?.(".tool-buttons .left-flyout")) return;
      if (t?.closest?.(".left-action-popover")) return;
      if (t?.closest?.("[data-action-popover-trigger='1']")) return;
      closeLeftFlyouts();
      closeActionPopover();
    });
    window.addEventListener("resize", () => {
      positionOpenedLeftFlyouts();
      if (actionPopoverOwner) positionActionPopover(actionPopoverOwner);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        positionOpenedLeftFlyouts();
        if (actionPopoverOwner) positionActionPopover(actionPopoverOwner);
      });
      window.visualViewport.addEventListener("scroll", () => {
        positionOpenedLeftFlyouts();
        if (actionPopoverOwner) positionActionPopover(actionPopoverOwner);
      });
    }
    window.addEventListener("scroll", () => {
      positionOpenedLeftFlyouts();
      if (actionPopoverOwner) positionActionPopover(actionPopoverOwner);
    }, true);
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeLeftFlyouts();
        closeActionPopover();
      }
    });
    state.ui._leftFlyoutGlobalCloseBound = true;
  }
  for (const el of [toolTargets.tools, toolTargets.edit, toolTargets.files]) {
    if (el) el.innerHTML = "";
  }
  const resolveToolTarget = (item) => {
    const g = String(item?.group || "");
    if (g === "edit") return toolTargets.edit;
    if (g === "file") return toolTargets.files;
    return toolTargets.tools;
  };
  const appendSep = (target) => {
    if (!target) return;
    const last = target.lastElementChild;
    if (last && last.classList?.contains?.("left-sep")) return;
    const sep = document.createElement("div");
    sep.className = "left-sep";
    target.appendChild(sep);
  };
  let lastTarget = toolTargets.tools;
  for (const item of createHtmlLikeLeftMenuRegistry()) {
    const target = resolveToolTarget(item);
    if (item.type === "sep") {
      appendSep(lastTarget);
      continue;
    }
    lastTarget = target;
    if (item.type === "action-flyout" && String(item.id) === "export") {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = item.label;
      btn.dataset.action = item.id;
      btn.dataset.menuItemKey = leftMenuItemKey(item);
      if (item.group) btn.dataset.menuGroup = item.group;
      btn.dataset.actionPopoverTrigger = "1";
      btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("mousedown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const opened = actionPopoverOwner === btn && actionPopoverEl && actionPopoverEl.style.display !== "none";
        closeLeftFlyouts();
        if (opened) {
          closeActionPopover();
          return;
        }
        openActionPopover(btn, item);
      });
      target?.appendChild(btn);
      continue;
    }
    if (item.type === "action-flyout") {
      const wrap = document.createElement("div");
      wrap.className = "left-flyout";
      wrap.dataset.menuItemKey = leftMenuItemKey(item);
      if (item.group) wrap.dataset.menuGroup = item.group;
      wrap.addEventListener("mousedown", (e) => e.stopPropagation());
      wrap.addEventListener("click", (e) => e.stopPropagation());
      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.textContent = item.label;
      mainBtn.dataset.action = item.id;
      mainBtn.className = "left-flyout-main";
      mainBtn.setAttribute("aria-expanded", "false");
      mainBtn.addEventListener("mousedown", (e) => e.stopPropagation());
      mainBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = !wrap.classList.contains("open");
        closeLeftFlyouts(willOpen ? wrap : null);
        wrap.classList.toggle("open", willOpen);
        mainBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen) {
          menu.classList.add("floating");
          positionOneLeftFlyout(wrap);
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => positionOneLeftFlyout(wrap));
          }
        } else {
          menu.classList.remove("floating");
          menu.style.left = "";
          menu.style.top = "";
        }
      });
      const menu = document.createElement("div");
      menu.className = "left-flyout-menu";
      menu.addEventListener("mousedown", (e) => e.stopPropagation());
      menu.addEventListener("click", (e) => e.stopPropagation());
      for (const opt of (item.options || [])) {
        const optBtn = document.createElement("button");
        optBtn.type = "button";
        optBtn.textContent = opt.label;
        optBtn.dataset.action = opt.id;
        const fn = actions[opt.id];
        if (typeof fn === "function") {
          optBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            fn();
            wrap.classList.remove("open");
            mainBtn.setAttribute("aria-expanded", "false");
          });
        } else {
          optBtn.disabled = true;
          if (opt.implemented === false) optBtn.title = "Not implemented";
        }
        menu.appendChild(optBtn);
      }
      wrap.append(mainBtn, menu);
      target?.appendChild(wrap);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = item.label;
    btn.dataset.menuItemKey = leftMenuItemKey(item);
    if (item.group) btn.dataset.menuGroup = item.group;
    if (item.type === "tool") {
      btn.dataset.tool = item.id;
      const activateTool = () => {
        if (item.id === "select") {
          if (state.tool === "select") {
            const cur = String(state.ui?.selectPickMode || "object");
            actions.setSelectPickMode?.(cur === "group" ? "object" : "group");
          } else {
            actions.setTool("select");
          }
          return;
        }
        if (item.id === "settings" && state.tool === "settings") {
          actions.setTool("select");
          return;
        }
        actions.setTool(item.id);
      };
      let suppressClickUntil = 0;
      btn.addEventListener("pointerup", (e) => {
        if (e.pointerType !== "touch") return;
        e.preventDefault();
        suppressClickUntil = Date.now() + 500;
        activateTool();
      });
      btn.addEventListener("click", (e) => {
        if (Date.now() < suppressClickUntil) {
          e.preventDefault();
          return;
        }
        activateTool();
      });
    } else {
      btn.dataset.action = item.id;
      const fn = actions[item.id];
      if (typeof fn === "function") {
        btn.addEventListener("click", () => fn());
      } else {
        btn.disabled = true;
        if (item.implemented === false) btn.title = "Not implemented";
      }
    }
    target?.appendChild(btn);
  }

  const panelStacks = document.querySelectorAll(".right-stack, .sidebar");
  panelStacks.forEach((stack) => {
    stack.addEventListener("click", (e) => {
      const btn = e.target.closest?.(".panel-toggle.section-title");
      if (!btn) return;
      const sec = btn.closest?.(".section[data-panel-id]");
      const panelId = sec?.getAttribute?.("data-panel-id");
      if (!panelId) return;
      e.preventDefault();
      if (!state.ui.rightPanelCollapsed) state.ui.rightPanelCollapsed = {};
      state.ui.rightPanelCollapsed[panelId] = !state.ui.rightPanelCollapsed[panelId];
      refreshUi(state, dom);
    });
    stack.addEventListener("click", (e) => {
      const btn = e.target.closest?.("[data-layer-inner-toggle]");
      if (!btn) return;
      e.preventDefault();
      const key = btn.getAttribute("data-layer-inner-toggle");
      if (!key) return;
      if (!state.ui.layerPanelInnerCollapsed) state.ui.layerPanelInnerCollapsed = {};
      state.ui.layerPanelInnerCollapsed[key] = !state.ui.layerPanelInnerCollapsed[key];
      refreshUi(state, dom);
    });
  });

  const rightStack = document.querySelector(".right-stack");
  if (rightStack) {
    const groupsSection = rightStack.querySelector(".section[data-panel-id='groups']");
    const groupsHeader = groupsSection?.querySelector?.(".panel-toggle.section-title");
    const bindPanelResizeHandle = (el, mode, sectionEl = groupsSection) => {
      if (!el) return;
      el.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        const secRect = sectionEl.getBoundingClientRect();
        const stackRect = rightStack.getBoundingClientRect();
        groupPanelResizeDrag = {
          mode,
          startX: e.clientX,
          startY: e.clientY,
          startWidth: Math.round(stackRect.width),
          startHeight: Math.round(secRect.height),
          startListHeight: (mode === "layerHeight")
            ? Math.round(sectionEl?.querySelector?.("#layerList")?.clientHeight || 0)
            : 0,
        };
        window.addEventListener("mousemove", onGroupPanelResizeMove);
        window.addEventListener("mouseup", stopGroupPanelResizeDrag);
      });
    };
    bindPanelResizeHandle(groupsSection?.querySelector?.("#groupPanelResizeHandleTop"), "height", groupsSection);
    bindPanelResizeHandle(groupsSection?.querySelector?.("#groupPanelResizeHandleLeft"), "width", groupsSection);
    const layersSection = rightStack.querySelector(".section[data-panel-id='layers']");
    bindPanelResizeHandle(layersSection?.querySelector?.("#layerPanelResizeHandleTop"), "layerHeight", layersSection);
    bindPanelResizeHandle(layersSection?.querySelector?.("#layerPanelResizeHandleLeft"), "width", layersSection);
    if (groupsHeader) {
      groupsHeader.addEventListener("dragover", (e) => {
        const payload = parseDragPayload(e);
        const hasShapeIds = Array.isArray(payload.shapeIds) && payload.shapeIds.length > 0;
        if (!Number.isFinite(payload.groupId) && !Number.isFinite(payload.shapeId) && !hasShapeIds) return;
        e.preventDefault();
        clearGroupDropHoverRow();
        groupsSection.classList.add("dnd-over-root");
        if (state.ui.groupDragDrop) state.ui.groupDragDrop.overGroupId = null;
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });
      groupsHeader.addEventListener("dragleave", (e) => {
        const related = e.relatedTarget;
        if (related && groupsSection.contains?.(related)) return;
        groupsSection.classList.remove("dnd-over-root");
      });
      groupsHeader.addEventListener("drop", (e) => {
        const payload = parseDragPayload(e);
        const draggedGroupId = payload.groupId;
        const draggedShapeId = payload.shapeId;
        const draggedShapeIds = Array.isArray(payload.shapeIds) ? payload.shapeIds.map(Number).filter(Number.isFinite) : [];
        if (!Number.isFinite(draggedGroupId) && !Number.isFinite(draggedShapeId) && draggedShapeIds.length === 0) return;
        e.preventDefault();
        groupsSection.classList.remove("dnd-over-root");
        clearGroupDropHoverRow();
        if (draggedShapeIds.length > 0 || Number.isFinite(draggedShapeId)) {
          // Root drop for shape is currently unsupported; just clear DnD state.
        } else if (Number.isFinite(draggedGroupId)) {
          actions.selectGroup?.(draggedGroupId);
          actions.unparentActiveGroup?.();
        }
        if (state.ui.groupDragDrop) {
          state.ui.groupDragDrop.draggingGroupId = null;
          state.ui.groupDragDrop.draggingShapeId = null;
          state.ui.groupDragDrop.draggingShapeIds = null;
          state.ui.groupDragDrop.overGroupId = null;
        }
        // Group/shape actions already call draw()+refreshUi(); avoid duplicate expensive refreshes.
      });
    }
  }

  const applyGridSizeValue = (raw) => {
    const v = normalizeGridPreset(raw);
    if (!state.grid) state.grid = {};
    state.grid.presetSize = v;
    if (dom.gridSizeInput) dom.gridSizeInput.value = String(v);
    if (dom.gridSizeContextInput) dom.gridSizeContextInput.value = String(v);
    if (!state.grid.customSizeEnabled) {
    actions.setGridSize(v);
    actions.refitViewToPage?.();
    }
  };
  if (!Number.isFinite(Number(state.grid?.presetSize))) state.grid.presetSize = Number(state.grid?.size) || 10;
  if (!Number.isFinite(Number(state.grid?.customSize))) state.grid.customSize = Number(state.grid?.size) || 10;
  if (typeof state.grid?.customSizeEnabled !== "boolean") state.grid.customSizeEnabled = false;
  dom.gridSizeInput.value = String(state.grid.customSizeEnabled ? state.grid.presetSize : state.grid.size);
  dom.gridSizeInput.addEventListener("change", () => applyGridSizeValue(dom.gridSizeInput.value));
  dom.gridSizeInput.addEventListener("input", () => applyGridSizeValue(dom.gridSizeInput.value));
  if (dom.gridSizeContextInput) {
    dom.gridSizeContextInput.value = String(state.grid.customSizeEnabled ? state.grid.presetSize : state.grid.size);
    dom.gridSizeContextInput.addEventListener("change", () => applyGridSizeValue(dom.gridSizeContextInput.value));
    dom.gridSizeContextInput.addEventListener("input", () => applyGridSizeValue(dom.gridSizeContextInput.value));
  }
  if (dom.customGridInput) {
    dom.customGridInput.value = String(Math.max(1, Number(state.grid.customSize) || 10));
    const applyCustomGrid = () => {
      if (!state.grid) state.grid = {};
      const v = Math.max(1, Number(normalizePositiveNumber(dom.customGridInput.value, state.grid.customSize ?? 10, 1)));
      dom.customGridInput.value = String(v);
      state.grid.customSize = v;
      if (state.grid.customSizeEnabled) {
        actions.setGridSize(v);
        actions.refitViewToPage?.();
      }
    };
    dom.customGridInput.addEventListener("change", applyCustomGrid);
    dom.customGridInput.addEventListener("input", applyCustomGrid);
  }
  if (dom.customGridToggle) {
    dom.customGridToggle.checked = !!state.grid.customSizeEnabled;
    dom.customGridToggle.addEventListener("change", () => {
      if (!state.grid) state.grid = {};
      state.grid.customSizeEnabled = !!dom.customGridToggle.checked;
      const v = state.grid.customSizeEnabled
        ? Math.max(1, Number(state.grid.customSize) || 10)
        : Math.max(1, Number(state.grid.presetSize ?? state.grid.size ?? 10) || 10);
      actions.setGridSize(v);
      actions.refitViewToPage?.();
      actions.render?.();
    });
  }

  dom.gridSnapToggle.checked = !!state.grid.snap;
  dom.gridSnapToggle.addEventListener("change", () => {
    if (dom.gridSnapContextToggle) dom.gridSnapContextToggle.checked = !!dom.gridSnapToggle.checked;
    actions.setGridSnap(!!dom.gridSnapToggle.checked);
  });
  if (dom.gridSnapContextToggle) {
    dom.gridSnapContextToggle.checked = !!state.grid.snap;
    dom.gridSnapContextToggle.addEventListener("change", () => {
      dom.gridSnapToggle.checked = !!dom.gridSnapContextToggle.checked;
      actions.setGridSnap(!!dom.gridSnapContextToggle.checked);
    });
  }
  if (dom.gridShowToggle) {
    dom.gridShowToggle.checked = !!state.grid.show;
    dom.gridShowToggle.addEventListener("change", () => { if (dom.gridShowContextToggle) dom.gridShowContextToggle.checked = !!dom.gridShowToggle.checked; actions.setGridShow(!!dom.gridShowToggle.checked); });
  }
  if (dom.gridShowContextToggle) {
    dom.gridShowContextToggle.checked = !!state.grid.show;
    dom.gridShowContextToggle.addEventListener("change", () => { if (dom.gridShowToggle) dom.gridShowToggle.checked = !!dom.gridShowContextToggle.checked; actions.setGridShow(!!dom.gridShowContextToggle.checked); });
  }
  if (dom.gridAutoToggle) {
    dom.gridAutoToggle.checked = !!state.grid.auto;
    dom.gridAutoToggle.addEventListener("change", () => { if (dom.gridAutoContextToggle) dom.gridAutoContextToggle.checked = !!dom.gridAutoToggle.checked; actions.setGridAuto(!!dom.gridAutoToggle.checked); });
  }
  if (dom.gridAutoContextToggle) {
    dom.gridAutoContextToggle.checked = !!state.grid.auto;
    dom.gridAutoContextToggle.addEventListener("change", () => { if (dom.gridAutoToggle) dom.gridAutoToggle.checked = !!dom.gridAutoContextToggle.checked; actions.setGridAuto(!!dom.gridAutoContextToggle.checked); });
  }
  if (dom.gridAutoTimingSlider) {
    const baseTiming = Number.isFinite(Number(state.grid?.autoTiming))
      ? Number(state.grid.autoTiming)
      : gridAutoTimingFromThreshold50(state.grid?.autoThreshold50 ?? 130);
    dom.gridAutoTimingSlider.value = String(clampGridAutoTiming(baseTiming));
    const onGridAutoTimingChange = () => {
      const timing = clampGridAutoTiming(dom.gridAutoTimingSlider.value);
      const th = gridThresholdsFromTiming(timing);
      actions.setGridAutoThresholds?.(th.th50, th.th10, th.th5, th.th1, timing);
      if (dom.gridAutoTimingLabel) dom.gridAutoTimingLabel.textContent = gridAutoTimingLabelText(timing);
      if (dom.gridAutoTimingHint) dom.gridAutoTimingHint.textContent = `蜈･髢ｾ蛟､: 50=${th.th50}% / 10=${th.th10}% / 5=${th.th5}% / 1=${th.th1}%`;
    };
    dom.gridAutoTimingSlider.addEventListener("input", onGridAutoTimingChange);
    onGridAutoTimingChange();
  }
  if (dom.objSnapToggle) {
    dom.objSnapToggle.checked = state.objectSnap?.enabled !== false;
    dom.objSnapToggle.addEventListener("change", () => actions.setObjectSnapEnabled(!!dom.objSnapToggle.checked));
  }
  if (dom.objSnapEndpointToggle) {
    dom.objSnapEndpointToggle.checked = state.objectSnap?.endpoint !== false;
    dom.objSnapEndpointToggle.addEventListener("change", () => actions.setObjectSnapKind("endpoint", !!dom.objSnapEndpointToggle.checked));
  }
  if (dom.objSnapMidpointToggle) {
    dom.objSnapMidpointToggle.checked = !!state.objectSnap?.midpoint;
    dom.objSnapMidpointToggle.addEventListener("change", () => actions.setObjectSnapKind("midpoint", !!dom.objSnapMidpointToggle.checked));
  }
  if (dom.objSnapCenterToggle) {
    dom.objSnapCenterToggle.checked = state.objectSnap?.center !== false;
    dom.objSnapCenterToggle.addEventListener("change", () => actions.setObjectSnapKind("center", !!dom.objSnapCenterToggle.checked));
  }
  if (dom.objSnapIntersectionToggle) {
    dom.objSnapIntersectionToggle.checked = state.objectSnap?.intersection !== false;
    dom.objSnapIntersectionToggle.addEventListener("change", () => actions.setObjectSnapKind("intersection", !!dom.objSnapIntersectionToggle.checked));
  }
  if (dom.objSnapTangentToggle) {
    dom.objSnapTangentToggle.checked = !!state.objectSnap?.tangent;
    dom.objSnapTangentToggle.addEventListener("change", () => actions.setObjectSnapKind("tangent", !!dom.objSnapTangentToggle.checked));
  }
  if (dom.objSnapVectorToggle) {
    dom.objSnapVectorToggle.checked = !!state.objectSnap?.vector;
    dom.objSnapVectorToggle.addEventListener("change", () => actions.setObjectSnapKind("vector", !!dom.objSnapVectorToggle.checked));
  }

  if (dom.resetViewBtn) dom.resetViewBtn.addEventListener("click", () => actions.resetView());
  if (dom.undoBtn) dom.undoBtn.addEventListener("click", () => actions.undo());
  if (dom.redoBtn) dom.redoBtn.addEventListener("click", () => actions.redo());
  if (dom.saveJsonBtn) dom.saveJsonBtn.addEventListener("click", () => actions.saveJson());
  if (dom.loadJsonBtn) dom.loadJsonBtn.addEventListener("click", () => actions.loadJson());
  {
    const manualBtn = document.getElementById("openManualBtn");
    if (manualBtn) {
      manualBtn.addEventListener("click", (e) => {
        const lang = getUiLanguage(state);
        const href = (lang === "ja") ? "/manual.html" : "/manual_en.html";
        manualBtn.setAttribute("href", href);
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        window.location.assign(href);
      });
    }
  }
  {
    const applyTraceParamsFromUi = () => {
      actions.setTraceParams?.({
        maxDim: Number(dom.traceMaxDimInput?.value),
        edgePercent: Number(dom.traceEdgePercentInput?.value),
        simplify: Number(dom.traceSimplifyInput?.value),
        minSeg: Number(dom.traceMinSegInput?.value),
        maxSegments: Number(dom.traceMaxSegmentsInput?.value),
        offsetX: Number(dom.traceOffsetXInput?.value),
        offsetY: Number(dom.traceOffsetYInput?.value),
        invert: dom.traceInvertToggle?.checked ? 1 : 0,
        lineWidthMm: Number(dom.traceLineWidthInput?.value),
        lineType: normalizeLineTypePreset(dom.traceLineTypeInput?.value || "solid"),
      });
    };
    for (const el of [
      dom.traceMaxDimInput,
      dom.traceEdgePercentInput,
      dom.traceSimplifyInput,
      dom.traceMinSegInput,
      dom.traceMaxSegmentsInput,
      dom.traceOffsetXInput,
      dom.traceOffsetYInput,
      dom.traceLineWidthInput,
      dom.traceLineTypeInput,
      dom.traceInvertToggle,
    ]) {
      if (!el) continue;
      el.addEventListener("change", applyTraceParamsFromUi);
      el.addEventListener("input", applyTraceParamsFromUi);
    }
    if (dom.traceRegenerateBtn) {
      dom.traceRegenerateBtn.addEventListener("click", () => actions.traceRegenerate?.());
    }
    if (dom.traceClosePanelBtn) {
      dom.traceClosePanelBtn.addEventListener("click", () => actions.closeTracePanel?.());
    }
  }
  {
    const applyImportAdjustFromUi = () => {
      actions.setImportAdjustParam?.({
        scale: Number(dom.importAdjustScaleInput?.value),
        dx: Number(dom.importAdjustDxInput?.value),
        dy: Number(dom.importAdjustDyInput?.value),
        flipX: !!dom.importAdjustFlipXToggle?.checked,
        flipY: !!dom.importAdjustFlipYToggle?.checked,
      });
    };
    for (const el of [
      dom.importAdjustScaleInput,
      dom.importAdjustDxInput,
      dom.importAdjustDyInput,
      dom.importAdjustFlipXToggle,
      dom.importAdjustFlipYToggle,
    ]) {
      if (!el) continue;
      el.addEventListener("change", applyImportAdjustFromUi);
      el.addEventListener("input", applyImportAdjustFromUi);
    }
    if (dom.importAdjustApplyBtn) {
      dom.importAdjustApplyBtn.addEventListener("click", () => actions.applyImportAdjust?.());
    }
    if (dom.importAdjustCancelBtn) {
      dom.importAdjustCancelBtn.addEventListener("click", () => actions.cancelImportAdjust?.());
    }
    if (dom.importDxfAsPolylineToggle) {
      dom.importDxfAsPolylineToggle.addEventListener("change", () => {
        actions.setImportDxfAsPolyline?.(!!dom.importDxfAsPolylineToggle.checked);
      });
    }
  }
  if (dom.activeLayerSelect) {
    dom.activeLayerSelect.addEventListener("change", () => actions.setActiveLayer(Number(dom.activeLayerSelect.value)));
  }
  if (dom.addLayerBtn) {
    dom.addLayerBtn.addEventListener("click", () => actions.addLayer(dom.newLayerNameInput?.value || ""));
  }
  if (dom.newLayerNameInput) {
    dom.newLayerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.addLayer(dom.newLayerNameInput.value || "");
      }
    });
  }
  if (dom.renameLayerBtn) {
    dom.renameLayerBtn.addEventListener("click", () => actions.renameActiveLayer?.(dom.renameLayerNameInput?.value || ""));
  }
  if (dom.renameLayerNameInput) {
    dom.renameLayerNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.renameActiveLayer?.(dom.renameLayerNameInput.value || "");
      }
    });
  }
  if (dom.moveSelectionLayerBtn) {
    dom.moveSelectionLayerBtn.addEventListener("click", () => actions.moveSelectionToLayer?.());
  }
  if (dom.deleteLayerBtn) {
    dom.deleteLayerBtn.addEventListener("click", () => actions.deleteActiveLayer?.());
  }
  if (dom.moveLayerUpBtn) {
    dom.moveLayerUpBtn.addEventListener("click", () => actions.moveActiveLayerOrder?.(-1));
  }
  if (dom.moveLayerDownBtn) {
    dom.moveLayerDownBtn.addEventListener("click", () => actions.moveActiveLayerOrder?.(1));
  }
  if (dom.moveGroupUpBtn) {
    dom.moveGroupUpBtn.addEventListener("click", () => actions.moveActiveGroupOrder?.(-1));
  }
  if (dom.moveGroupDownBtn) {
    dom.moveGroupDownBtn.addEventListener("click", () => actions.moveActiveGroupOrder?.(1));
  }
  if (dom.renameGroupBtn) {
    dom.renameGroupBtn.addEventListener("click", () => actions.renameActiveGroup?.(dom.renameGroupNameInput?.value || ""));
  }
  if (dom.renameGroupNameInput) {
    dom.renameGroupNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        actions.renameActiveGroup?.(dom.renameGroupNameInput.value || "");
      }
    });
  }
  if (dom.groupColorizeToggle) {
    dom.groupColorizeToggle.addEventListener("change", () => actions.setGroupColorize?.(!!dom.groupColorizeToggle.checked));
  }
  if (dom.groupCurrentLayerOnlyToggle) {
    dom.groupCurrentLayerOnlyToggle.addEventListener("change", () => actions.setGroupCurrentLayerOnly?.(!!dom.groupCurrentLayerOnlyToggle.checked));
  }
  if (dom.layerColorizeToggle) {
    dom.layerColorizeToggle.addEventListener("change", () => actions.setLayerColorize?.(!!dom.layerColorizeToggle.checked));
  }
  if (dom.editOnlyActiveLayerToggle) {
    dom.editOnlyActiveLayerToggle.addEventListener("change", () => actions.setEditOnlyActiveLayer?.(!!dom.editOnlyActiveLayerToggle.checked));
  }
  bindLayerAndGroupBasicEvents(state, dom, actions);
  bindDimSettingsEvents(state, dom, actions);
  bindPageAndPatternEvents(state, dom, actions, {
    refreshUi,
    refreshUiDeferred,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
    bindColorInputPalette,
  });
  bindGroupListInitEvents({
    state,
    dom,
    actions,
    refreshUi,
    stopGroupPanelResizeDrag,
    toElementTarget,
    parseDragPayload,
  });

  bindInitTailEvents({
    state,
    dom,
    actions,
    bindColorInputPalette,
    normalizePositiveNumber,
    normalizeLineWidthPreset,
    normalizeLineTypePreset,
    normalizePageScalePreset,
    normalizeMaxZoomPreset,
    normalizeMenuScalePreset,
  });
}

