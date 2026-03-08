import { createGroupFromSelection, getGroup, moveGroupOrigin, setSelection } from "./state.js";
import { getSelectedShapes, collectGroupTreeShapeIds } from "./app_selection.js";

export function moveSelectedShapes(state, helpers, dx, dy) {
    const sel = getSelectedShapes(state);
    if (sel.length === 0) return;
    helpers.pushHistory();
    for (const s of sel) {
        if (s.type === 'line' || s.type === 'rect' || s.type === 'dim') {
            s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy;
            if (s.type === 'dim' && s.px != null) { s.px += dx; s.py += dy; }
        } else if (s.type === 'circle' || s.type === 'arc') {
            s.cx += dx; s.cy += dy;
        } else if (s.type === 'text' || s.type === 'position') {
            if (s.x1 != null) { s.x1 += dx; s.y1 += dy; } else { s.x += dx; s.y += dy; }
        } else if (s.type === "image") {
            if (!!s.lockTransform) continue;
            s.x = Number(s.x || 0) + Number(dx || 0);
            s.y = Number(s.y || 0) + Number(dy || 0);
        } else if (s.type === 'dimchain') {
            if (Array.isArray(s.points)) {
                for (const pt of s.points) { pt.x += dx; pt.y += dy; }
            }
            if (s.px != null) { s.px += dx; s.py += dy; }
        }
    }
    helpers.draw();
}

export function mergeSelectedShapesToGroup(state, helpers) {
    const selIds = state.selection?.ids || [];
    if (selIds.length < 2) return;
    helpers.pushHistory();
    // Regroup selected objects even when they already belong to existing groups.
    const group = createGroupFromSelection(state, "");
    if (group) {
        state.activeGroupId = null;
        setSelection(state, collectGroupTreeShapeIds(state, group.id));
        if (helpers.draw) helpers.draw();
    }
}

export function cycleLayerMode(state, helpers, layerId) {
    const l = state.layers.find(ly => ly.id === layerId);
    if (!l) return;
    // Cycle: ON -> OFF -> LOCK -> ON
    const visible = l.visible !== false;
    const locked = l.locked === true;
    if (visible && !locked) {
        l.visible = false; l.locked = false; // OFF
    } else if (!visible) {
        l.visible = true; l.locked = true;   // LOCK
    } else {
        l.visible = true; l.locked = false;  // ON
    }
    if (helpers.draw) helpers.draw();
}

export function moveActiveGroupOrder(state, helpers, direction) {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const list = state.groups || [];
    const idx = list.findIndex(g => Number(g.id) === gid);
    if (idx < 0) return;
    const step = Number(direction) < 0 ? -1 : 1;
    const ni = idx + step;
    if (ni < 0 || ni >= list.length) return;
    if (helpers.pushHistory) helpers.pushHistory();
    const tmp = list[idx];
    list[idx] = list[ni];
    list[ni] = tmp;
    if (helpers.draw) helpers.draw();
}

export function moveActiveLayerOrder(state, helpers, direction) {
    const lid = Number(state.activeLayerId);
    if (!Number.isFinite(lid)) return;
    const list = state.layers || [];
    const idx = list.findIndex(l => Number(l.id) === lid);
    if (idx < 0) return;
    const step = Number(direction) < 0 ? -1 : 1;
    const ni = idx + step;
    if (ni < 0 || ni >= list.length) return;
    if (helpers.pushHistory) helpers.pushHistory();
    const tmp = list[idx];
    list[idx] = list[ni];
    list[ni] = tmp;
    if (helpers.draw) helpers.draw();
}

export function renameActiveLayer(state, helpers, name) {
    const l = state.layers.find(ly => ly.id === state.activeLayerId);
    if (l && name.trim()) {
        l.name = name.trim();
        if (helpers.draw) helpers.draw();
    }
}

export function deleteActiveLayer(state, helpers) {
    const layers = Array.isArray(state.layers) ? state.layers : [];
    if (layers.length <= 1) return;
    const activeId = Number(state.activeLayerId);
    const idx = layers.findIndex(l => Number(l.id) === activeId);
    if (idx < 0) return;
    const fallbackIdx = idx > 0 ? (idx - 1) : 1;
    const fallback = layers[fallbackIdx];
    if (!fallback) return;
    if (helpers.pushHistory) helpers.pushHistory();
    const fallbackId = Number(fallback.id);
    for (const s of (state.shapes || [])) {
        if (Number(s.layerId) === activeId) s.layerId = fallbackId;
    }
    state.layers = layers.filter(l => Number(l.id) !== activeId);
    state.activeLayerId = fallbackId;
    if (helpers.draw) helpers.draw();
}
export function renameActiveGroup(state, helpers, name) {
    const g = (state.groups || []).find(gg => Number(gg.id) === Number(state.activeGroupId));
    if (g && String(name || "").trim()) {
        g.name = String(name).trim();
        if (helpers.draw) helpers.draw();
    }
}

export function moveSelectionToLayer(state, helpers) {
    const sel = getSelectedShapes(state);
    if (sel.length === 0) return;
    helpers.pushHistory();
    for (const s of sel) s.layerId = state.activeLayerId;
    helpers.draw();
}

export function deleteActiveGroup(state, helpers) {
    if (state.activeGroupId == null) return;
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    helpers.pushHistory();
    // Delete group container only; keep member shapes as ungrouped.
    state.groups = (state.groups || []).filter(g => Number(g.id) !== gid);
    for (const s of (state.shapes || [])) {
        if (Number(s.groupId) === gid) s.groupId = null;
    }
    if (state.selection) {
        state.selection.groupIds = (state.selection.groupIds || []).map(Number).filter(id => Number(id) !== gid);
    }
    if (Number(state.activeGroupId) === gid) state.activeGroupId = null;
    helpers.draw();
}

export function unparentActiveGroup(state, helpers) {
    if (state.activeGroupId == null) return;
    const g = getGroup(state, state.activeGroupId);
    if (g) {
        helpers.pushHistory();
        g.parentId = null;
        helpers.draw();
    }
}

export function moveActiveGroup(state, helpers, dx, dy) {
    if (state.activeGroupId == null) return;
    helpers.pushHistory();
    moveGroupOrigin(state, state.activeGroupId, dx, dy);
    helpers.draw();
}

export function updateSelectedTextSettings(state, helpers, settings) {
    const sel = getSelectedShapes(state).filter(s => s.type === "text");
    if (sel.length === 0) return;
    helpers.pushHistory();
    for (const s of sel) {
        if (settings.text !== undefined) s.text = settings.text;
        if (settings.textSizePt !== undefined) s.textSizePt = settings.textSizePt;
        if (settings.textRotate !== undefined) s.textRotate = settings.textRotate;
        if (settings.textFontFamily !== undefined) s.textFontFamily = settings.textFontFamily;
        if (settings.textBold !== undefined) s.textBold = settings.textBold;
        if (settings.textItalic !== undefined) s.textItalic = settings.textItalic;
        if (settings.textColor !== undefined) s.textColor = settings.textColor;
    }
    helpers.draw();
}

export function moveSelectedVertices(state, helpers, dx, dy) {
    // This needs beginVertexDrag / applyVertexDrag logic or simplified version
    const sel = state.selection.vertices || [];
    if (sel.length === 0) return;
    helpers.pushHistory();
    // Simplified vertex move
    for (const v of sel) {
        const s = state.shapes.find(sh => sh.id === v.shapeId);
        if (!s) continue;
        if (v.part === 'p1' || v.part === 'x1') { s.x1 += dx; s.y1 += dy; }
        else if (v.part === 'p2' || v.part === 'x2') { s.x2 += dx; s.y2 += dy; }
        else if (v.part === 'center') { s.cx += dx; s.cy += dy; }
    }
    helpers.draw();
}

