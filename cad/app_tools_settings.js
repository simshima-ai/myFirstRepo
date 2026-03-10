import { getSelectedShapes } from "./app_selection.js";

function buildRandomColorMap(ids) {
    const out = {};
    const uniq = Array.from(new Set((ids || []).map(v => Number(v)).filter(Number.isFinite)));
    if (!uniq.length) return out;
    // Spread hues with golden-angle stepping to avoid similar neighboring colors.
    const baseHue = Math.random() * 360;
    const step = 137.50776405003785;
    for (let i = 0; i < uniq.length; i++) {
        const id = Number(uniq[i]);
        const hue = (baseHue + i * step) % 360;
        // Slight variation only, keeping contrast stable.
        const sat = 70 + ((i * 7) % 12);   // 70..81
        const light = 42 + ((i * 11) % 10); // 42..51
        out[id] = `hsl(${Math.round(hue)} ${sat}% ${light}%)`;
    }
    return out;
}

export function setObjectSnapEnabled(state, val) {
    if (!state.objectSnap) state.objectSnap = {};
    state.objectSnap.enabled = !!val;
}
export function setObjectSnapKind(state, kind, val) {
    if (!state.objectSnap) state.objectSnap = {};
    state.objectSnap[kind] = !!val;
}
export function setGridSize(state, size) {
    const prevSize = Math.max(1e-9, Number(state.grid?.size) || 1);
    const nextSize = Math.max(1, Number(size) || 1);
    state.grid.size = nextSize;
    const prevBasePx = Number(state.grid?.autoBasePxAtReset);
    if (Number.isFinite(prevBasePx) && prevBasePx > 0) {
        state.grid.autoBasePxAtReset = prevBasePx * (nextSize / prevSize);
    } else {
        const sc = Math.max(1e-9, Number(state.view?.scale) || 1);
        state.grid.autoBasePxAtReset = nextSize * sc;
    }
    state.grid.autoLevel = 100;
}
export function setGridSnap(state, val) {
    state.grid.snap = !!val;
}
export function setGridShow(state, val) {
    state.grid.show = !!val;
}
export function setGridAuto(state, val) {
    const next = !!val;
    const prev = !!state.grid.auto;
    state.grid.auto = next;
    // Re-baseline auto-grid when enabling during arbitrary zoom level.
    if (next && !prev) {
        const sc = Math.max(1e-9, Number(state.view?.scale) || 1);
        const base = Math.max(1e-9, Number(state.grid?.size) || 100);
        state.grid.autoBasePxAtReset = base * sc;
        state.grid.autoLevel = 100;
    }
}
export function setGridAutoThresholds(state, t50, t10, t5, t1, timing = null) {
    const v50 = Math.max(100, Math.min(2000, Math.round(Number(t50) || 130)));
    const v10 = Math.max(v50, Math.min(2000, Math.round(Number(t10) || 180)));
    const v5 = Math.max(v10, Math.min(2000, Math.round(Number(t5) || 240)));
    const v1 = Math.max(v5, Math.min(2000, Math.round(Number(t1) || 320)));
    state.grid.autoThreshold50 = v50;
    state.grid.autoThreshold10 = v10;
    state.grid.autoThreshold5 = v5;
    state.grid.autoThreshold1 = v1;
    if (Number.isFinite(Number(timing))) {
        state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Number(timing))));
    } else {
        const s = Math.max(0, Math.min(1, (v50 - 110) / 130));
        state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Math.sqrt(s) * 100)));
    }
}
export function setLayerColorize(state, helpers, val) {
    if (!state.ui) state.ui = {};
    if (!state.ui.layerView) state.ui.layerView = {};
    state.ui.layerView.colorize = !!val;
    if (state.ui.layerView.colorize) {
        state.ui.layerView.colorMap = buildRandomColorMap((state.layers || []).map(l => Number(l.id)));
    }
    if (helpers.draw) helpers.draw();
}
export function setGroupColorize(state, helpers, val) {
    if (!state.ui) state.ui = {};
    if (!state.ui.groupView) state.ui.groupView = {};
    state.ui.groupView.colorize = !!val;
    if (state.ui.groupView.colorize) {
        state.ui.groupView.colorMap = buildRandomColorMap((state.groups || []).map(g => Number(g.id)));
    }
    if (helpers.draw) helpers.draw();
}
export function setEditOnlyActiveLayer(state, helpers, val) {
    if (!state.ui) state.ui = {};
    if (!state.ui.layerView) state.ui.layerView = {};
    state.ui.layerView.editOnlyActive = !!val;
    if (state.ui.layerView.editOnlyActive) {
        const activeLayerId = Number(state.activeLayerId);
        const selectedIds = Array.isArray(state.selection?.ids) ? state.selection.ids : [];
        state.selection.ids = selectedIds
            .map(Number)
            .filter((sid) => {
                const s = (state.shapes || []).find(sh => Number(sh.id) === sid);
                if (!s) return false;
                return Number(s.layerId ?? activeLayerId) === activeLayerId;
            });
        // Group selection can include shapes across multiple layers.
        // Clear it when active-layer-only edit is enabled to avoid cross-layer edits.
        if (state.selection) state.selection.groupIds = [];
        state.activeGroupId = null;
    }
    if (helpers.draw) helpers.draw();
}
export function setGroupRotateSnap(state, val) {
    state.groupRotateSettings.snapDeg = val;
}
export function setVertexLinkCoincident(state, val) {
    if (!state.vertexEdit) state.vertexEdit = {};
    state.vertexEdit.linkCoincident = !!val;
}
export function setLineInputs(state, len, ang) {
    if (len !== null) state.lineSettings.length = len;
    if (ang !== null) {
        state.lineSettings.angleDeg = ang;
        state.lineSettings.angle = ang; // legacy alias
    }
}
export function setLineSizeLocked(state, helpers, on = null) {
    if (!state.lineSettings) state.lineSettings = {};
    const next = (on == null) ? !state.lineSettings.sizeLocked : !!on;
    state.lineSettings.sizeLocked = next;
    if (helpers?.setStatus) helpers.setStatus(next ? "線作成: サイズ固定 ON" : "線作成: サイズ固定 OFF");
    if (helpers?.draw) helpers.draw();
}
export function setLineAnchor(state, anchor) {
    const key = String(anchor || "endpoint_a").toLowerCase();
    if (key === "center" || key === "endpoint_b") {
        state.lineSettings.anchor = key;
    } else {
        state.lineSettings.anchor = "endpoint_a";
    }
}
export function setRectInputs(state, w, h) {
    if (w !== null) state.rectSettings.width = w;
    if (h !== null) state.rectSettings.height = h;
}
export function setRectSizeLocked(state, helpers, on = null) {
    if (!state.rectSettings) state.rectSettings = {};
    const next = (on == null) ? !state.rectSettings.sizeLocked : !!on;
    state.rectSettings.sizeLocked = next;
    if (helpers?.setStatus) {
        helpers.setStatus(next ? "四角作成: サイズ固定 ON" : "四角作成: サイズ固定 OFF");
    }
    if (helpers?.draw) helpers.draw();
}
export function setRectAnchor(state, anchor) {
    const allowed = new Set(["tl", "tc", "tr", "cl", "c", "cr", "bl", "bc", "br"]);
    const key = String(anchor || "c").toLowerCase();
    state.rectSettings.anchor = allowed.has(key) ? key : "c";
}
export function setCircleRadiusInput(state, r) {
    state.circleSettings.radius = r;
}
export function setCircleMode(state, helpers, mode) {
    if (!state.circleSettings) state.circleSettings = {};
    const key = String(mode || "").toLowerCase();
    const next = (key === "fixed" || key === "threepoint" || key === "drag") ? key : "drag";
    state.circleSettings.mode = next;
    state.circleSettings.radiusLocked = (next === "fixed");
    if (!state.input) state.input = {};
    if (next !== "threepoint") state.input.circleThreePointRefs = [];
    state.input.dragStartWorld = null;
    if (helpers?.setStatus) {
        if (next === "fixed") helpers.setStatus("円作成: 半径固定モード");
        else if (next === "threepoint") helpers.setStatus("円作成: 三点指示モード");
        else helpers.setStatus("円作成: マウスドラッグモード");
    }
    if (helpers?.draw) helpers.draw();
}
export function setCircleRadiusLocked(state, helpers, on = null) {
    if (!state.circleSettings) state.circleSettings = {};
    const next = (on == null) ? !state.circleSettings.radiusLocked : !!on;
    state.circleSettings.radiusLocked = next;
    state.circleSettings.mode = next ? "fixed" : (state.circleSettings.mode === "fixed" ? "drag" : (state.circleSettings.mode || "drag"));
    if (!state.input) state.input = {};
    if (state.circleSettings.mode !== "threepoint") state.input.circleThreePointRefs = [];
    state.input.dragStartWorld = null;
    if (helpers?.setStatus) {
        helpers.setStatus(next ? "円作成: 半径固定 ON" : "円作成: 半径固定 OFF");
    }
    if (helpers?.draw) helpers.draw();
}
export function setPositionSize(state, helpers, v) {
    const next = Math.max(1, Number(v) || 3);
    if (!state.positionSettings) state.positionSettings = { size: next, lineWidthMm: 0.1, lineType: "solid" };
    const selectedPositions = getSelectedShapes(state).filter(s => s.type === "position");
    const needsShapeUpdate = selectedPositions.some(s => Number(s.size ?? 3) !== next);
    if (needsShapeUpdate && helpers.pushHistory) helpers.pushHistory();
    if (needsShapeUpdate) {
        for (const s of selectedPositions) s.size = next;
    }
    const prevSetting = Number(state.positionSettings.size ?? 3);
    if (prevSetting !== next) state.positionSettings.size = next;
    if (needsShapeUpdate || prevSetting !== next) {
        if (helpers.draw) helpers.draw();
    }
}

function normalizeLineWidthPreset(v) {
    const presets = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
    const n = Number(v);
    if (!Number.isFinite(n)) return 0.25;
    let best = presets[0];
    let bestD = Math.abs(n - best);
    for (let i = 1; i < presets.length; i++) {
        const d = Math.abs(n - presets[i]);
        if (d < bestD) { bestD = d; best = presets[i]; }
    }
    return best;
}

function normalizeLineTypePreset(v) {
    const allowed = new Set(["solid", "dashed", "dotted", "dashdot", "longdash", "center", "hidden"]);
    const key = String(v || "solid").toLowerCase();
    return allowed.has(key) ? key : "solid";
}

function resolveToolStyleTarget(state, tool) {
    const key = String(tool || state.tool || "").toLowerCase();
    if (key === "line") return state.lineSettings;
    if (key === "rect") return state.rectSettings;
    if (key === "circle") return state.circleSettings;
    if (key === "position") return state.positionSettings;
    if (key === "text") return state.textSettings;
    if (key === "dim") return state.dimSettings;
    if (key === "hatch") return state.hatchSettings;
    if (key === "doubleline") return state.dlineSettings;
    if (key === "fillet") return state.filletSettings;
    return null;
}

export function setLineWidthMm(state, helpers, v, toolKey = null) {
    const { draw, setStatus } = helpers;
    const nearest = normalizeLineWidthPreset(v);
    const name = String(toolKey || state.tool || "tool");
    const target = resolveToolStyleTarget(state, name);
    if (target) target.lineWidthMm = nearest;
    if (setStatus) setStatus(`${name} 線幅を ${nearest} mm に設定`);
    if (draw) draw();
}

export function setToolLineType(state, helpers, v, toolKey = null) {
    const { draw, setStatus } = helpers;
    const type = normalizeLineTypePreset(v);
    const name = String(toolKey || state.tool || "tool");
    const target = resolveToolStyleTarget(state, name);
    if (target) {
        target.lineType = type;
        // Hatch uses dedicated property as render/export source.
        if (name === "hatch") target.lineType = type;
    }
    if (setStatus) setStatus(`${name} 線種を ${type} に設定`);
    if (draw) draw();
}

export function setToolColor(state, helpers, color, toolKey = null) {
    const { draw, setStatus } = helpers;
    const next = normalizeHexColor(color, "#0f172a");
    const name = String(toolKey || state.tool || "tool");
    const target = resolveToolStyleTarget(state, name);
    if (target) target.color = next;
    if (setStatus) setStatus(`${name} 色を ${next} に設定`);
    if (draw) draw();
}

export function setSelectedLineWidthMm(state, helpers, v) {
    const { pushHistory, draw, setStatus } = helpers;
    const presets = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2];
    const n = Number(v);
    const nearest = (() => {
        if (!Number.isFinite(n)) return 0.25;
        let best = presets[0];
        let bestD = Math.abs(n - best);
        for (let i = 1; i < presets.length; i++) {
            const d = Math.abs(n - presets[i]);
            if (d < bestD) { bestD = d; best = presets[i]; }
        }
        return best;
    })();
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const isStyleEditableShape = (s) => {
        if (!s) return false;
        return s.type === "line"
            || s.type === "polyline"
            || s.type === "circle"
            || s.type === "arc"
            || s.type === "imagetrace"
            || s.type === "position"
            || s.type === "dim"
            || s.type === "dimchain"
            || s.type === "dimangle"
            || s.type === "circleDim";
    };
    const selected = (state.shapes || []).filter(s => selIds.has(Number(s.id)) && isStyleEditableShape(s));
    if (!selected.length) {
        if (setStatus) setStatus("線幅変更: 対象オブジェクトなし");
        if (draw) draw();
        return;
    }
    const hasAnyDiff = selected.some(s => Math.abs((Number(s.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0) - nearest) > 1e-9);
    if (hasAnyDiff) pushHistory();
    for (const s of selected) {
        s.lineWidthMm = nearest;
    }
    if (setStatus) setStatus(`選択オブジェクトの線幅を ${nearest} mm に設定`);
    if (draw) draw();
}

export function setSelectedLineType(state, helpers, v) {
    const { pushHistory, draw, setStatus } = helpers;
    const type = normalizeLineTypePreset(v);
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selected = (state.shapes || []).filter((s) => {
        if (!selIds.has(Number(s.id))) return false;
        return s.type === "line"
            || s.type === "polyline"
            || s.type === "circle"
            || s.type === "arc"
            || s.type === "imagetrace"
            || s.type === "position"
            || s.type === "dim"
            || s.type === "dimchain"
            || s.type === "dimangle"
            || s.type === "circleDim";
    });
    if (!selected.length) {
        if (setStatus) setStatus("線種変更: 対象オブジェクトなし");
        if (draw) draw();
        return;
    }
    const hasAnyDiff = selected.some((s) => String(s.lineType || "solid") !== type);
    if (hasAnyDiff) pushHistory();
    for (const s of selected) s.lineType = type;
    if (setStatus) setStatus(`選択オブジェクトの線種を ${type} に設定`);
    if (draw) draw();
}

function normalizeHexColor(v, fallback = "#0f172a") {
    const s = String(v || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : fallback;
}

export function setSelectedColor(state, helpers, color) {
    const { pushHistory, draw, setStatus } = helpers;
    const next = normalizeHexColor(color, "#0f172a");
    const selIds = new Set((state.selection?.ids || []).map(Number));
    const selected = (state.shapes || []).filter((s) => selIds.has(Number(s.id)));
    if (!selected.length) {
        if (setStatus) setStatus("色変更: 対象オブジェクトなし");
        if (draw) draw();
        return;
    }
    const getCurrent = (s) => {
        if (s.type === "text") return normalizeHexColor(s.textColor, "#0f172a");
        if (s.type === "hatch") return normalizeHexColor(s.lineColor, "#0f172a");
        return normalizeHexColor(s.color, "#0f172a");
    };
    const hasAnyDiff = selected.some((s) => getCurrent(s) !== next);
    if (hasAnyDiff) pushHistory();
    for (const s of selected) {
        if (s.type === "text") s.textColor = next;
        else if (s.type === "hatch") s.lineColor = next;
        else s.color = next;
    }
    if (setStatus) setStatus(`選択オブジェクトの色を ${next} に設定`);
    if (draw) draw();
}
export function setSelectionCircleCenterMark(state, helpers, on) {
    const sel = getSelectedShapes(state).filter(s => s.type === "circle" || s.type === "arc");
    if (sel.length) {
        helpers.pushHistory();
        for (const s of sel) s.showCenterMark = !!on;
        helpers.draw();
    }
}
export function setFilletRadius(state, v) {
    state.filletSettings.radius = v;
}
export function setFilletLineMode(state, mode) {
    state.filletSettings.lineMode = mode;
}
export function setFilletNoTrim(state, on) {
    if (!state.filletSettings) state.filletSettings = {};
    state.filletSettings.noTrim = !!on;
}
export function setVertexMoveInputs(state, dx, dy) {
    if (dx !== null) state.vertexEdit.moveDx = dx;
    if (dy !== null) state.vertexEdit.moveDy = dy;
}
export function updateSelectedImageSettings(state, helpers, settings = {}) {
    const { pushHistory, draw, setStatus } = helpers;
    const selected = getSelectedShapes(state).filter((s) => s && s.type === "image");
    if (!selected.length) return;

    const hasWidth = Object.prototype.hasOwnProperty.call(settings, "width");
    const hasHeight = Object.prototype.hasOwnProperty.call(settings, "height");
    const hasLock = Object.prototype.hasOwnProperty.call(settings, "lockAspect");
    const hasTransformLock = Object.prototype.hasOwnProperty.call(settings, "lockTransform");
    const reqWidth = Math.max(1, Number(settings.width) || 0);
    const reqHeight = Math.max(1, Number(settings.height) || 0);
    const reqLock = !!settings.lockAspect;
    const reqTransformLock = !!settings.lockTransform;

    const deriveAspect = (shape) => {
        const nw = Number(shape?.naturalWidth);
        const nh = Number(shape?.naturalHeight);
        if (nw > 0 && nh > 0) return nw / nh;
        const w = Number(shape?.width);
        const h = Number(shape?.height);
        if (w > 0 && h > 0) return w / h;
        return 1;
    };

    const planned = [];
    for (const s of selected) {
        let nextW = Math.max(1, Number(s.width) || 1);
        let nextH = Math.max(1, Number(s.height) || 1);
        let nextLock = !!s.lockAspect;
        let nextTransformLock = !!s.lockTransform;
        if (hasLock) nextLock = reqLock;
        if (hasTransformLock) nextTransformLock = reqTransformLock;
        const aspect = Math.max(1e-9, deriveAspect(s));

        if (!nextTransformLock) {
            if (hasWidth && hasHeight) {
                if (nextLock) {
                    nextW = reqWidth;
                    nextH = Math.max(1, reqWidth / aspect);
                } else {
                    nextW = reqWidth;
                    nextH = reqHeight;
                }
            } else if (hasWidth) {
                nextW = reqWidth;
                if (nextLock) nextH = Math.max(1, reqWidth / aspect);
            } else if (hasHeight) {
                nextH = reqHeight;
                if (nextLock) nextW = Math.max(1, reqHeight * aspect);
            }
        }

        if (
            Math.abs(nextW - Number(s.width)) > 1e-9 ||
            Math.abs(nextH - Number(s.height)) > 1e-9 ||
            nextLock !== !!s.lockAspect ||
            nextTransformLock !== !!s.lockTransform
        ) {
            planned.push({
                shape: s,
                width: nextW,
                height: nextH,
                lockAspect: nextLock,
                lockTransform: nextTransformLock
            });
        }
    }

    if (!planned.length) return;
    pushHistory();
    for (const row of planned) {
        row.shape.width = row.width;
        row.shape.height = row.height;
        row.shape.lockAspect = row.lockAspect;
        row.shape.lockTransform = row.lockTransform;
    }
    if (setStatus) setStatus(selected.length === 1 ? "画像設定を更新" : `${selected.length}個の画像設定を更新`);
    if (draw) draw();
}
