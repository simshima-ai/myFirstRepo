import { addGroup, nextGroupId, getGroup, nextShapeId, pushHistory, setSelection } from "./state.js";
import { getSelectedShapes, ensureUngroupedShapesHaveGroups } from "./app_selection.js";
export function executeHatch(state, helpers) {
    const { setStatus, draw, addShape, nextShapeId, buildHatchLoopsFromBoundaryIds } = helpers;
    try {
        const ids = state.hatchDraft?.boundaryIds || [];
        if (ids.length === 0) {
            if (setStatus) setStatus("Hatch: 蠅・阜繧帝∈謚槭＠縺ｦ縺上□縺輔＞");
            return;
        }
        const parsed = buildHatchLoopsFromBoundaryIds(state.shapes, ids, state.view.scale);
        if (!parsed.ok) {
            if (setStatus) setStatus(`Hatch Error: ${parsed.error || "蠅・阜縺碁哩縺倥※縺・∪縺帙ｓ"}`);
            if (draw) draw();
            return;
        }
        let targetGroupId = null;
        const boundaryObjs = ids.map(id => state.shapes.find(s => s.id === id)).filter(Boolean);
        if (boundaryObjs.length > 0) {
            const groupIds = new Set(boundaryObjs.map(s => s.groupId).filter(id => id != null));
            if (groupIds.size === 1) {
                targetGroupId = Array.from(groupIds)[0];
            }
        }

        if (boundaryObjs.length > 0 && targetGroupId === null) {
            const gid = nextGroupId(state);
            const newG = {
                id: gid,
                name: "Hatch Group",
                shapeIds: [...ids],
                parentId: null,
                originX: 0, originY: 0,
                rotationDeg: 0,
            };
            const b = parsed.bounds;
            if (b) {
                newG.originX = (b.minX + b.maxX) * 0.5;
                newG.originY = (b.minY + b.maxY) * 0.5;
            }
            const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
            newG.originX = Math.round(Number(newG.originX || 0) / gridStep) * gridStep;
            newG.originY = Math.round(Number(newG.originY || 0) / gridStep) * gridStep;
            addGroup(state, newG);
            targetGroupId = gid;
            boundaryObjs.forEach(s => s.groupId = gid);
        }

        pushHistory(state);
        const shape = {
            id: nextShapeId(),
            type: "hatch",
            boundaryIds: [...ids],
            pitchMm: Number(state.hatchSettings?.pitchMm ?? 5),
            angleDeg: Number(state.hatchSettings?.angleDeg ?? 45),
            hatchAngleDeg: Number(state.hatchSettings?.angleDeg ?? 45),
            pattern: state.hatchSettings?.pattern ?? "single",
            hatchPattern: state.hatchSettings?.pattern ?? "single",
            crossAngleDeg: Number(state.hatchSettings?.crossAngleDeg ?? 90),
            hatchCrossAngleDeg: Number(state.hatchSettings?.crossAngleDeg ?? 90),
            rangeScale: Number(state.hatchSettings?.rangeScale ?? 1.2),
            hatchRangeScale: Number(state.hatchSettings?.rangeScale ?? 1.2),
            parallelRangeScale: Number(state.hatchSettings?.parallelRangeScale ?? 1.2),
            hatchParallelRangeScale: Number(state.hatchSettings?.parallelRangeScale ?? 1.2),
            lineShiftMm: Number(state.hatchSettings?.lineShiftMm ?? 0),
            lineType: state.hatchSettings?.lineType ?? "solid",
            lineColor: String(state.hatchSettings?.lineColor || "#0f172a"),
            lineDashMm: Number(state.hatchSettings?.lineDashMm ?? 5),
            lineGapMm: Number(state.hatchSettings?.lineGapMm ?? 2),
            repetitionPaddingMm: Number(state.hatchSettings?.repetitionPaddingMm ?? 2),
            fillEnabled: !!state.hatchSettings?.fillEnabled,
            fillColor: String(state.hatchSettings?.fillColor || "#dbeafe"),
            lineWidthMm: Math.max(0.01, Number(state.hatchSettings?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25),
            layerId: state.activeLayerId,
            groupId: targetGroupId,
        };
        addShape(shape);

        if (targetGroupId != null) {
            const parentGroup = getGroup(state, targetGroupId);
            if (parentGroup) {
                if (!parentGroup.shapeIds) parentGroup.shapeIds = [];
                if (!parentGroup.shapeIds.includes(shape.id)) parentGroup.shapeIds.push(shape.id);
            }
        }

        state.hatchDraft.boundaryIds = [];
        if (setStatus) setStatus(`Hatch #${shape.id} created (${ids.length} boundaries)`);
        if (draw) draw();
    } catch (err) {
        if (setStatus) setStatus(`Hatch Error: ${err?.message || err}`);
        if (draw) draw();
    }
}

export function exportJsonObject(state, helpers) {
    const { snapshotModel } = helpers;
    return {
        format: "s-cad",
        version: state.buildVersion,
        model: snapshotModel ? snapshotModel() : { shapes: state.shapes, groups: state.groups, layers: state.layers },
        grid: { ...state.grid },
        view: { ...state.view },
    pageSetup: { ...state.pageSetup },
    lineWidthMm: Math.max(0.01, Number(state.lineWidthMm ?? 0.25) || 0.25),
  };
}

export function importJsonObject(state, data, helpers) {
    const { restoreModel, setStatus, draw } = helpers;
    if (!data || data.format !== "s-cad") {
        if (setStatus) setStatus("Invalid s-cad JSON");
        return;
    }
    if (!data.model) {
        if (setStatus) setStatus("Missing model");
        return;
    }
    restoreModel(state, data.model);
    ensureUngroupedShapesHaveGroups(state);

    if (data.grid) {
        if (Number.isFinite(Number(data.grid.size))) state.grid.size = Math.max(1, Number(data.grid.size));
        state.grid.snap = !!data.grid.snap;
        state.grid.show = data.grid.show !== false;
        state.grid.auto = data.grid.auto !== false;
        if (Number.isFinite(Number(data.grid.autoThreshold50))) state.grid.autoThreshold50 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold50))));
        if (Number.isFinite(Number(data.grid.autoThreshold10))) state.grid.autoThreshold10 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold10))));
        if (Number.isFinite(Number(data.grid.autoThreshold5))) state.grid.autoThreshold5 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold5))));
        if (Number.isFinite(Number(data.grid.autoThreshold1))) state.grid.autoThreshold1 = Math.max(100, Math.min(2000, Math.round(Number(data.grid.autoThreshold1))));
        if (Number.isFinite(Number(data.grid.autoBasePxAtReset))) state.grid.autoBasePxAtReset = Math.max(1e-9, Number(data.grid.autoBasePxAtReset));
        if (state.grid.autoThreshold10 < state.grid.autoThreshold50) state.grid.autoThreshold10 = state.grid.autoThreshold50;
        if (state.grid.autoThreshold5 < state.grid.autoThreshold10) state.grid.autoThreshold5 = state.grid.autoThreshold10;
        if (state.grid.autoThreshold1 < state.grid.autoThreshold5) state.grid.autoThreshold1 = state.grid.autoThreshold5;
        if (Number.isFinite(Number(data.grid.autoTiming))) {
            state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Number(data.grid.autoTiming))));
        } else {
            const v50 = Math.max(110, Math.min(240, Number(state.grid.autoThreshold50) || 130));
            const s = Math.max(0, Math.min(1, (v50 - 110) / 130));
            state.grid.autoTiming = Math.max(0, Math.min(100, Math.round(Math.sqrt(s) * 100)));
        }
    }
    if (data.view) {
        if (Number.isFinite(Number(data.view.scale))) state.view.scale = Number(data.view.scale);
        if (Number.isFinite(Number(data.view.offsetX))) state.view.offsetX = Number(data.view.offsetX);
        if (Number.isFinite(Number(data.view.offsetY))) state.view.offsetY = Number(data.view.offsetY);
    }
    if (data.pageSetup && state.pageSetup) {
        state.pageSetup.size = String(data.pageSetup.size || state.pageSetup.size || "A4");
        state.pageSetup.orientation = (String(data.pageSetup.orientation || state.pageSetup.orientation || "landscape") === "portrait") ? "portrait" : "landscape";
        state.pageSetup.scale = Math.max(0.0001, Number(data.pageSetup.scale ?? state.pageSetup.scale ?? 1) || 1);
        state.pageSetup.unit = String(data.pageSetup.unit || state.pageSetup.unit || "mm");
        state.pageSetup.showFrame = data.pageSetup.showFrame !== false;
        state.pageSetup.innerMarginMm = Math.max(0, Number(data.pageSetup.innerMarginMm ?? state.pageSetup.innerMarginMm ?? 10) || 0);
    }
    state.lineWidthMm = Math.max(0.01, Number(data.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
    for (const s of (state.shapes || [])) {
        if (typeof s?.lineType !== "string" && typeof s?.hatchLineType === "string") {
            s.lineType = String(s.hatchLineType || "solid");
        }
        if (s?.type === "hatch") {
            if (typeof s.lineColor !== "string") s.lineColor = String(state.hatchSettings?.lineColor || "#0f172a");
            if (typeof s.fillColor !== "string") s.fillColor = String(state.hatchSettings?.fillColor || "#dbeafe");
            if (typeof s.fillEnabled !== "boolean") s.fillEnabled = !!state.hatchSettings?.fillEnabled;
        }
        if (!Number.isFinite(Number(s?.lineWidthMm))) s.lineWidthMm = state.lineWidthMm;
        if (typeof s?.lineType !== "string") s.lineType = "solid";
    }
    state.preview = null;
    state.polylineDraft = null;
    state.dimDraft = null;
    state.selection.drag.active = false;
    state.selection.drag.shapeSnapshots = null;
    state.selection.box.active = false;
    state.history.past = [];
    state.history.future = [];

    if (setStatus) setStatus("Imported JSON successfully");
    if (draw) draw();
}

export function saveJsonToFile(state, helpers) {
    const { setStatus, draw } = helpers;
    const data = exportJsonObject(state, helpers);
    const text = JSON.stringify(data, null, 2);
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Avoid revoking too early: some browsers can produce empty files if revoked immediately.
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (setStatus) setStatus(`Saved ${name}`);
    if (draw) draw();
}

export function saveJsonAsToFile(state, helpers) {
    const { setStatus, draw } = helpers;
    const data = exportJsonObject(state, helpers);
    const text = JSON.stringify(data, null, 2);
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fallback = `s-cad_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
    let name = window.prompt("保存ファイル名", fallback);
    if (name == null) {
        if (setStatus) setStatus("別名保存をキャンセルしました");
        if (draw) draw();
        return;
    }
    name = String(name).trim();
    if (!name) name = fallback;
    if (!/\.json$/i.test(name)) name += ".json";
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (setStatus) setStatus(`Saved ${name}`);
    if (draw) draw();
}

export function loadJsonFromFileDialog(state, dom) {
    if (!dom.jsonFileInput) return;
    const mode = String(state.ui?.jsonFileMode || "replace");
    if (mode === "import" || mode === "append") {
        dom.jsonFileInput.accept = ".json,application/json,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,image/*";
    } else {
        dom.jsonFileInput.accept = ".json,application/json";
    }
    dom.jsonFileInput.value = "";
    dom.jsonFileInput.click();
}

export function importJsonObjectAppend(state, data, helpers) {
    const { setStatus, draw } = helpers;
    if (!data || data.format !== "s-cad" || !data.model) {
        if (setStatus) setStatus("Invalid s-cad JSON");
        if (draw) draw();
        return false;
    }
    const model = data.model || {};
    const srcShapes = Array.isArray(model.shapes) ? model.shapes : [];
    const srcGroups = Array.isArray(model.groups) ? model.groups : [];
    const srcLayers = Array.isArray(model.layers) ? model.layers : [];
    pushHistory(state);

    const layerIdMap = new Map();
    const normalizeLayerName = (name) => String(name || "").trim().toLowerCase();
    const findLayerByName = (name) => {
        const key = normalizeLayerName(name);
        return (state.layers || []).find((l) => normalizeLayerName(l?.name) === key);
    };
    for (const l of srcLayers) {
        const srcId = Number(l?.id);
        if (!Number.isFinite(srcId)) continue;
        const existing = findLayerByName(l?.name);
        if (existing) {
            layerIdMap.set(srcId, Number(existing.id));
            continue;
        }
        const newId = Number(state.nextLayerId) || 1;
        state.nextLayerId = newId + 1;
        state.layers.push({
            id: newId,
            name: String(l?.name || `Layer ${newId}`),
            visible: l?.visible !== false,
            locked: l?.locked === true,
        });
        layerIdMap.set(srcId, newId);
    }

    const shapeIdMap = new Map();
    for (const s of srcShapes) {
        const oldId = Number(s?.id);
        if (!Number.isFinite(oldId)) continue;
        shapeIdMap.set(oldId, Number(nextShapeId(state)));
    }
    const groupIdMap = new Map();
    for (const g of srcGroups) {
        const oldId = Number(g?.id);
        if (!Number.isFinite(oldId)) continue;
        groupIdMap.set(oldId, Number(nextGroupId(state)));
    }

    const importedShapes = [];
    for (const src of srcShapes) {
        const oldId = Number(src?.id);
        const newId = Number(shapeIdMap.get(oldId));
        if (!Number.isFinite(newId)) continue;
        const c = JSON.parse(JSON.stringify(src));
        c.id = newId;
        if (Number.isFinite(Number(c.layerId))) {
            c.layerId = Number(layerIdMap.get(Number(c.layerId)) ?? state.activeLayerId);
        } else {
            c.layerId = state.activeLayerId;
        }
        if (Number.isFinite(Number(c.groupId))) {
            c.groupId = Number(groupIdMap.get(Number(c.groupId)) ?? c.groupId);
        }
        patternRemapRefsDeep(c, shapeIdMap);
        importedShapes.push(c);
    }

    const importedGroups = [];
    for (const src of srcGroups) {
        const oldId = Number(src?.id);
        const newId = Number(groupIdMap.get(oldId));
        if (!Number.isFinite(newId)) continue;
        const g = JSON.parse(JSON.stringify(src));
        g.id = newId;
        g.parentId = (g.parentId == null) ? null : Number(groupIdMap.get(Number(g.parentId)) ?? null);
        g.shapeIds = Array.isArray(g.shapeIds)
            ? g.shapeIds.map((sid) => Number(shapeIdMap.get(Number(sid)))).filter((sid) => Number.isFinite(sid))
            : [];
        importedGroups.push(g);
    }

    if (importedGroups.length) state.groups = [...importedGroups, ...(state.groups || [])];
    if (importedShapes.length) state.shapes = [...(state.shapes || []), ...importedShapes];
    state.selection.ids = importedShapes.map((s) => Number(s.id));
    state.selection.groupIds = importedGroups.map((g) => Number(g.id));
    state.activeGroupId = state.selection.groupIds.length ? Number(state.selection.groupIds[state.selection.groupIds.length - 1]) : state.activeGroupId;
    if (setStatus) setStatus(`インポート完了: ${importedShapes.length} 個のオブジェクト`);
    if (draw) draw();
    return true;
}

export function createLine(p1, p2) {
    return { id: 0, type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color: "#0f172a" };
}

export function createRect(p1, p2) {
    return { id: 0, type: "rect", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, color: "#0f172a" };
}

export function createCircle(center, edge) {
    return { id: 0, type: "circle", cx: center.x, cy: center.y, r: Math.hypot(edge.x - center.x, edge.y - center.y), color: "#0f172a" };
}

export function createPosition(p) {
    return { id: 0, type: "position", x: p.x, y: p.y, color: "#0f172a" };
}

export function createText(p, settings) {
    return {
        id: 0, type: "text", x1: p.x, y1: p.y,
        text: settings.content,
        textColor: "#0f172a",
        textSizePt: settings.sizePt,
        textRotate: settings.rotate,
        textFontFamily: settings.fontFamily,
        textBold: settings.bold,
        textItalic: settings.italic,
    };
}

export function createDim(patch) {
    return {
        id: 0,
        type: "dim",
        dimOffset: 24,
        extOffset: 2,
        extOver: 2,
        textOffset: 10,
        textAlong: 0,
        textRotate: "auto",
        fontSize: 12,
        precision: 1,
        rOverrun: 5,
        dimArrowType: 'open',
        dimArrowSizePt: 10,
        dimArrowDirection: "normal",
        ...patch
    };
}

export function createArc(center, radius, a1, a2, ccw = true) {
    return { id: 0, type: "arc", cx: center.x, cy: center.y, r: radius, a1, a2, ccw: !!ccw, color: "#0f172a" };
}

export function applyLineInput(state, helpers, len, ang) {
    const { pushHistory, draw, setStatus } = helpers;
    const sel = getSelectedShapes(state).filter(s => s.type === "line");
    if (sel.length === 0) return;
    pushHistory();
    const rad = ang * Math.PI / 180;
    for (const s of sel) {
        s.x2 = s.x1 + len * Math.cos(rad);
        s.y2 = s.y1 + len * Math.sin(rad);
    }
    if (setStatus) setStatus(`Applied Line Input (L=${len}, A=${ang})`);
    if (draw) draw();
}

export function applyRectInput(state, helpers, w, h) {
    const { pushHistory, draw, setStatus } = helpers;
    const sel = getSelectedShapes(state).filter(s => s.type === "rect");
    if (sel.length === 0) return;
    pushHistory();
    for (const s of sel) {
        s.x2 = s.x1 + w;
        s.y2 = s.y1 + h;
    }
    if (setStatus) setStatus(`Applied Rect Input (W=${w}, H=${h})`);
    if (draw) draw();
}

