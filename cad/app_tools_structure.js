import { createGroupFromSelection, getGroup, moveGroupOrigin, setSelection } from "./state.js";
import { getSelectedShapes, collectGroupTreeShapeIds } from "./app_selection.js";
import { mmPerUnit } from "./geom.js";

function pointKey(x, y, tol = 1e-6) {
    const nx = Number(x) || 0;
    const ny = Number(y) || 0;
    const qx = Math.round(nx / tol);
    const qy = Math.round(ny / tol);
    return `${qx},${qy}`;
}

function normalizeRad(a) {
    let x = Number(a) || 0;
    const tau = Math.PI * 2;
    while (x < 0) x += tau;
    while (x >= tau) x -= tau;
    return x;
}

function getArcSweepRad(a1, a2, ccw) {
    const tau = Math.PI * 2;
    const n1 = normalizeRad(a1);
    const n2 = normalizeRad(a2);
    return ccw
        ? ((n2 - n1) + tau) % tau
        : ((n1 - n2) + tau) % tau;
}

function getPaperRadiusMm(state, radiusWorld) {
    const r = Math.max(0, Math.abs(Number(radiusWorld) || 0));
    const pageScale = Math.max(1e-9, Number(state?.pageSetup?.scale ?? 1) || 1);
    const unitMm = Math.max(1e-9, Number(mmPerUnit(state?.pageSetup?.unit || "mm")) || 1);
    return (r * unitMm) / pageScale;
}

function getAdaptiveSegmentCount(state, radiusWorld, sweepRad = Math.PI * 2) {
    const paperRadiusMm = getPaperRadiusMm(state, radiusWorld);
    const sweep = Math.max(0, Number(sweepRad) || 0);
    if (paperRadiusMm <= 1e-9 || sweep <= 1e-9) return 0;
    const rawFullSegments = 16 * Math.pow(Math.max(0.1, paperRadiusMm) / 5, 0.60206);
    const fullSegments = Math.max(16, Math.min(384, Math.round(rawFullSegments)));
    return Math.max(2, Math.ceil(fullSegments * (sweep / (Math.PI * 2))));
}

function buildCirclePolylinePoints(state, shape) {
    const cx = Number(shape?.cx);
    const cy = Number(shape?.cy);
    const r = Math.abs(Number(shape?.r) || 0);
    if (![cx, cy, r].every(Number.isFinite) || r <= 1e-9) return [];
    const segments = getAdaptiveSegmentCount(state, r, Math.PI * 2);
    const pts = [];
    for (let i = 0; i < segments; i++) {
        const t = (Math.PI * 2 * i) / segments;
        pts.push({
            x: cx + Math.cos(t) * r,
            y: cy + Math.sin(t) * r,
        });
    }
    return pts;
}

function buildArcPolylinePoints(state, shape) {
    const cx = Number(shape?.cx);
    const cy = Number(shape?.cy);
    const r = Math.abs(Number(shape?.r) || 0);
    const a1 = Number(shape?.a1);
    const a2 = Number(shape?.a2);
    const ccw = shape?.ccw !== false;
    if (![cx, cy, r, a1, a2].every(Number.isFinite) || r <= 1e-9) return [];
    const sweep = getArcSweepRad(a1, a2, ccw);
    const segments = getAdaptiveSegmentCount(state, r, sweep);
    const dir = ccw ? 1 : -1;
    const pts = [];
    for (let i = 0; i <= segments; i++) {
        const t = a1 + dir * (sweep * (i / segments));
        pts.push({
            x: cx + Math.cos(t) * r,
            y: cy + Math.sin(t) * r,
        });
    }
    return pts;
}

function createPolylineFromShapePoints(sourceShape, points, closed, state, helpers, commonGroupId) {
    const normalizedPoints = Array.isArray(points)
        ? points
            .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
            .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [];
    if (normalizedPoints.length < 2) return null;
    const polyline = {
        id: helpers.nextShapeId?.(),
        type: "polyline",
        points: normalizedPoints,
        closed: !!closed,
        layerId: Number(sourceShape?.layerId ?? state.activeLayerId),
        lineWidthMm: Math.max(0.01, Number(sourceShape?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25),
        lineType: String(sourceShape?.lineType || "solid"),
        color: String(sourceShape?.color || "#0f172a"),
        groupId: Number.isFinite(Number(commonGroupId))
            ? Number(commonGroupId)
            : (Number.isFinite(Number(sourceShape?.groupId)) ? Number(sourceShape.groupId) : null),
    };
    helpers.addShape?.(polyline);
    return polyline;
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
    const selectedShapeIds = new Set((state.selection?.ids || []).map(Number).filter(Number.isFinite));
    const selectedGroupIds = new Set((state.selection?.groupIds || []).map(Number).filter(Number.isFinite));
    const targetShapeIds = new Set(selectedShapeIds);
    for (const gid of selectedGroupIds) {
        const ids = collectGroupTreeShapeIds(state, gid);
        for (const sid of ids) targetShapeIds.add(Number(sid));
    }
    const targetShapes = (state.shapes || []).filter((s) => targetShapeIds.has(Number(s?.id)));
    if (!targetShapes.length) {
        helpers.setStatus?.("No target selected");
        helpers.draw?.();
        return;
    }

    const targetPolylines = targetShapes.filter((s) => String(s?.type || "") === "polyline");
    const targetLines = targetShapes.filter((s) => String(s?.type || "") === "line");
    const targetCircles = targetShapes.filter((s) => String(s?.type || "") === "circle");
    const targetArcs = targetShapes.filter((s) => String(s?.type || "") === "arc");
    if (!targetPolylines.length && !targetLines.length && !targetCircles.length && !targetArcs.length) {
        helpers.setStatus?.("No line/polyline/circle/arc selected");
        helpers.draw?.();
        return;
    }

    const commonGroupId = (() => {
        if (selectedGroupIds.size === 1) return Number(Array.from(selectedGroupIds)[0]);
        const gids = new Set(
            targetShapes
                .map((s) => Number(s?.groupId))
                .filter(Number.isFinite)
        );
        if (gids.size === 1) return Number(Array.from(gids)[0]);
        return null;
    })();

    helpers.pushHistory?.();
    const createdIds = [];
    let polylineToLineCount = 0;
    let lineToPolylineCount = 0;
    let circleToPolylineCount = 0;
    let arcToPolylineCount = 0;

    // 1) polyline -> lines (always for selected/targeted polylines)
    for (const s of targetPolylines) {
        const pts = Array.isArray(s.points) ? s.points : [];
        if (pts.length < 2) continue;
        const addLineSeg = (a, b) => {
            const x1 = Number(a?.x), y1 = Number(a?.y), x2 = Number(b?.x), y2 = Number(b?.y);
            if (![x1, y1, x2, y2].every(Number.isFinite)) return;
            if (Math.hypot(x2 - x1, y2 - y1) <= 1e-9) return;
            const line = {
                id: helpers.nextShapeId?.(),
                type: "line",
                x1, y1, x2, y2,
                layerId: Number(s.layerId ?? state.activeLayerId),
                lineWidthMm: Math.max(0.01, Number(s.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25),
                lineType: String(s.lineType || "solid"),
                color: String(s.color || "#0f172a"),
                groupId: Number.isFinite(Number(commonGroupId))
                    ? Number(commonGroupId)
                    : (Number.isFinite(Number(s.groupId)) ? Number(s.groupId) : null),
            };
            helpers.addShape?.(line);
            if (Number.isFinite(Number(line.id))) createdIds.push(Number(line.id));
        };
        for (let i = 0; i < pts.length - 1; i++) addLineSeg(pts[i], pts[i + 1]);
        if (s.closed && pts.length >= 2) addLineSeg(pts[pts.length - 1], pts[0]);
        helpers.removeShapeById?.(Number(s.id));
        polylineToLineCount++;
    }

    // 2) line -> polyline (only original targeted lines)
    const lineShapes = targetLines.filter((s) => Number.isFinite(Number(s?.id)));
    if (lineShapes.length > 0) {
        const targetLineIds = new Set(lineShapes.map((s) => Number(s.id)).filter(Number.isFinite));
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
        if (edges.length > 0) {
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

            if (builtChains.length > 0) {
                for (const id of targetLineIds) helpers.removeShapeById?.(id);
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
                    const chainGroupIds = new Set();
                    if (Number.isFinite(Number(firstSrc?.groupId))) chainGroupIds.add(Number(firstSrc.groupId));
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
                        if (Number.isFinite(Number(src?.groupId))) chainGroupIds.add(Number(src.groupId));
                    }
                    if (points.length < 2) continue;
                    const p0 = points[0];
                    const pN = points[points.length - 1];
                    const closed = Math.hypot(Number(p0.x) - Number(pN.x), Number(p0.y) - Number(pN.y)) <= 1e-9;
                    const normalizedPoints = (closed && points.length > 2) ? points.slice(0, -1) : points.slice();
                    if (normalizedPoints.length < 2) continue;
                    const groupId = (chainGroupIds.size === 1) ? Array.from(chainGroupIds)[0] : null;
                    const polyline = {
                        id: helpers.nextShapeId?.(),
                        type: "polyline",
                        points: normalizedPoints.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
                        closed: !!closed,
                        layerId: Number(styleRef?.layerId ?? state.activeLayerId),
                        lineWidthMm: Math.max(0.01, Number(styleRef?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25),
                        lineType: String(styleRef?.lineType || "solid"),
                        color: String(styleRef?.color || "#0f172a"),
                        groupId: Number.isFinite(Number(commonGroupId)) ? Number(commonGroupId) : groupId,
                    };
                    helpers.addShape?.(polyline);
                    if (Number.isFinite(Number(polyline.id))) createdIds.push(Number(polyline.id));
                    lineToPolylineCount++;
                }
            }
        }
    }

    // 3) circle -> polyline
    for (const s of targetCircles) {
        const points = buildCirclePolylinePoints(state, s);
        const polyline = createPolylineFromShapePoints(s, points, true, state, helpers, commonGroupId);
        if (!polyline) continue;
        helpers.removeShapeById?.(Number(s.id));
        if (Number.isFinite(Number(polyline.id))) createdIds.push(Number(polyline.id));
        circleToPolylineCount++;
    }

    // 4) arc -> polyline
    for (const s of targetArcs) {
        const points = buildArcPolylinePoints(state, s);
        const polyline = createPolylineFromShapePoints(s, points, false, state, helpers, commonGroupId);
        if (!polyline) continue;
        helpers.removeShapeById?.(Number(s.id));
        if (Number.isFinite(Number(polyline.id))) createdIds.push(Number(polyline.id));
        arcToPolylineCount++;
    }

    if (createdIds.length > 0) {
        if (Number.isFinite(Number(commonGroupId))) {
            const gid = Number(commonGroupId);
            const g = (state.groups || []).find((x) => Number(x?.id) === gid);
            if (g) {
                const merged = new Set((g.shapeIds || []).map(Number).filter(Number.isFinite));
                for (const id of createdIds) merged.add(Number(id));
                g.shapeIds = Array.from(merged);
                for (const s of (state.shapes || [])) {
                    if (merged.has(Number(s?.id))) s.groupId = gid;
                }
            }
        } else {
            setSelection(state, createdIds);
            const newGroup = createGroupFromSelection(state, "");
            if (newGroup) {
                state.activeGroupId = Number(newGroup.id);
                setSelection(state, collectGroupTreeShapeIds(state, newGroup.id));
            }
        }
    }

    if (createdIds.length > 0 && !Number.isFinite(Number(commonGroupId))) {
        // selection already updated above when regrouping new objects
    } else if (createdIds.length > 0) {
        setSelection(state, createdIds);
    }
    helpers.setStatus?.(`Polygon Convert: polyline->line ${polylineToLineCount}, line->polyline ${lineToPolylineCount}, circle->polyline ${circleToPolylineCount}, arc->polyline ${arcToPolylineCount}`);
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

