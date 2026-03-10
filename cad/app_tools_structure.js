import { createGroupFromSelection, getGroup, moveGroupOrigin, setSelection } from "./state.js";
import { getSelectedShapes, collectGroupTreeShapeIds } from "./app_selection.js";

function pointKey(x, y, tol = 1e-6) {
    const nx = Number(x) || 0;
    const ny = Number(y) || 0;
    const qx = Math.round(nx / tol);
    const qy = Math.round(ny / tol);
    return `${qx},${qy}`;
}

export function moveSelectedShapes(state, helpers, dx, dy) {
    const sel = getSelectedShapes(state);
    if (sel.length === 0) return;
    helpers.pushHistory();
    for (const s of sel) {
        if (s.type === 'line' || s.type === 'rect' || s.type === 'dim') {
            s.x1 += dx; s.y1 += dy; s.x2 += dx; s.y2 += dy;
            if (s.type === 'dim' && s.px != null) { s.px += dx; s.py += dy; }
        } else if (s.type === 'polyline') {
            if (Array.isArray(s.points)) {
                for (const p of s.points) {
                    if (!p) continue;
                    p.x = Number(p.x) + Number(dx || 0);
                    p.y = Number(p.y) + Number(dy || 0);
                }
            }
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

export function lineToPolyline(state, helpers) {
    const selected = getSelectedShapes(state);
    const lineShapes = selected.filter((s) => String(s?.type || "") === "line");
    if (lineShapes.length === 0) {
        helpers.setStatus?.("No line selected");
        helpers.draw?.();
        return;
    }

    const edges = [];
    const nodeMap = new Map();
    const addNodeEdge = (k, edgeIdx) => {
        let set = nodeMap.get(k);
        if (!set) {
            set = new Set();
            nodeMap.set(k, set);
        }
        set.add(edgeIdx);
    };
    for (const s of lineShapes) {
        const a = pointKey(s.x1, s.y1);
        const b = pointKey(s.x2, s.y2);
        if (a === b) continue;
        const idx = edges.length;
        edges.push({ shape: s, a, b });
        addNodeEdge(a, idx);
        addNodeEdge(b, idx);
    }
    if (edges.length === 0) {
        helpers.setStatus?.("No valid lines selected");
        helpers.draw?.();
        return;
    }

    const visited = new Set();
    const components = [];
    for (let i = 0; i < edges.length; i++) {
        if (visited.has(i)) continue;
        const stack = [i];
        const comp = [];
        while (stack.length) {
            const ei = stack.pop();
            if (visited.has(ei)) continue;
            visited.add(ei);
            comp.push(ei);
            const e = edges[ei];
            const aSet = nodeMap.get(e.a) || new Set();
            const bSet = nodeMap.get(e.b) || new Set();
            for (const ni of aSet) if (!visited.has(ni)) stack.push(ni);
            for (const ni of bSet) if (!visited.has(ni)) stack.push(ni);
        }
        if (comp.length) components.push(comp);
    }

    const builtChains = [];
    for (const comp of components) {
        const remaining = new Set(comp);
        const remNodeMap = new Map();
        const addRem = (k, ei) => {
            let set = remNodeMap.get(k);
            if (!set) {
                set = new Set();
                remNodeMap.set(k, set);
            }
            set.add(ei);
        };
        for (const ei of comp) {
            const e = edges[ei];
            addRem(e.a, ei);
            addRem(e.b, ei);
        }
        const removeEdge = (ei) => {
            if (!remaining.has(ei)) return;
            remaining.delete(ei);
            const e = edges[ei];
            remNodeMap.get(e.a)?.delete(ei);
            remNodeMap.get(e.b)?.delete(ei);
        };
        const pickStartNode = () => {
            for (const [k, set] of remNodeMap.entries()) {
                if (!set || set.size === 0) continue;
                if (set.size !== 2) return k;
            }
            const firstEdgeIdx = remaining.values().next().value;
            if (firstEdgeIdx == null) return null;
            return edges[firstEdgeIdx].a;
        };
        const pickEdge = (set) => {
            const arr = Array.from(set || []);
            if (!arr.length) return null;
            arr.sort((a, b) => Number(edges[a]?.shape?.id || 0) - Number(edges[b]?.shape?.id || 0));
            return arr[0];
        };

        while (remaining.size > 0) {
            const startNode = pickStartNode();
            if (!startNode) break;
            const chain = [];
            let currentNode = startNode;
            let prevEdge = null;
            while (true) {
                const nodeEdges = remNodeMap.get(currentNode);
                if (!nodeEdges || nodeEdges.size === 0) break;
                const candidates = new Set(nodeEdges);
                if (prevEdge != null) candidates.delete(prevEdge);
                const nextEdge = pickEdge(candidates.size ? candidates : nodeEdges);
                if (nextEdge == null) break;
                const e = edges[nextEdge];
                const nextNode = (e.a === currentNode) ? e.b : e.a;
                chain.push({ edgeIdx: nextEdge, from: currentNode, to: nextNode });
                removeEdge(nextEdge);
                prevEdge = nextEdge;
                currentNode = nextNode;
                const deg = (remNodeMap.get(currentNode)?.size || 0);
                if (deg !== 1) break;
            }
            if (chain.length) builtChains.push(chain);
        }
    }

    if (!builtChains.length) {
        helpers.setStatus?.("No polyline chain generated");
        helpers.draw?.();
        return;
    }

    helpers.pushHistory?.();
    const sourceIds = new Set(edges.map((e) => Number(e.shape.id)).filter(Number.isFinite));
    for (const id of sourceIds) {
        helpers.removeShapeById?.(id);
    }

    const createdIds = [];
    let polylineCount = 0;
    for (const chain of builtChains) {
        if (!chain.length) continue;
        const firstItem = chain[0];
        const firstEdge = edges[firstItem.edgeIdx];
        const firstSrc = firstEdge.shape;
        const firstSameDir = (firstEdge.a === firstItem.from && firstEdge.b === firstItem.to);
        const points = [
            firstSameDir
                ? { x: Number(firstSrc.x1), y: Number(firstSrc.y1) }
                : { x: Number(firstSrc.x2), y: Number(firstSrc.y2) }
        ];
        let styleRef = firstSrc;
        for (const item of chain) {
            const e = edges[item.edgeIdx];
            const src = e.shape;
            const sameDir = (e.a === item.from && e.b === item.to);
            const endPoint = sameDir
                ? { x: Number(src.x2), y: Number(src.y2) }
                : { x: Number(src.x1), y: Number(src.y1) };
            const last = points[points.length - 1];
            if (!last || Math.hypot(Number(last.x) - Number(endPoint.x), Number(last.y) - Number(endPoint.y)) > 1e-9) {
                points.push(endPoint);
            }
            if (!styleRef && src) styleRef = src;
        }
        if (points.length < 2) continue;

        const p0 = points[0];
        const pN = points[points.length - 1];
        const closed = Math.hypot(Number(p0.x) - Number(pN.x), Number(p0.y) - Number(pN.y)) <= 1e-9;
        const normalizedPoints = (closed && points.length > 2) ? points.slice(0, -1) : points.slice();
        if (normalizedPoints.length < 2) continue;

        const polyline = {
            id: helpers.nextShapeId?.(),
            type: "polyline",
            points: normalizedPoints.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
            closed: !!closed,
            layerId: Number(styleRef?.layerId ?? state.activeLayerId),
            lineWidthMm: Math.max(0.01, Number(styleRef?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25),
            lineType: String(styleRef?.lineType || "solid"),
            color: String(styleRef?.color || "#0f172a"),
            groupId: null,
        };
        helpers.addShape?.(polyline);
        createdIds.push(Number(polyline.id));
        polylineCount++;
    }

    setSelection(state, createdIds);
    helpers.setStatus?.(`Line->Polyline: ${polylineCount} polyline(s)`);
    helpers.draw?.();
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

