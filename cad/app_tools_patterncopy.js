import { nextShapeId, pushHistory, setSelection } from "./state.js";
import { rotatePointAround } from "./solvers.js";
import { getSelectedShapes } from "./app_selection.js";
function patternShiftShapeDeep(node, dx, dy) {
    if (!node || typeof node !== "object") return;
    const shiftXKeys = new Set(["x", "x1", "x2", "cx", "px", "tx", "originX"]);
    const shiftYKeys = new Set(["y", "y1", "y2", "cy", "py", "ty", "originY"]);
    if (Array.isArray(node)) {
        for (const item of node) patternShiftShapeDeep(item, dx, dy);
        return;
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "number" && Number.isFinite(v)) {
            if (shiftXKeys.has(k)) node[k] = v + Number(dx || 0);
            else if (shiftYKeys.has(k)) node[k] = v + Number(dy || 0);
            continue;
        }
        if (v && typeof v === "object") patternShiftShapeDeep(v, dx, dy);
    }
}

function patternRemapRefsDeep(node, shapeIdMap) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) patternRemapRefsDeep(item, shapeIdMap);
        return;
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (typeof v === "number" && Number.isFinite(v)) {
            if (k !== "id" && k !== "groupId" && k !== "layerId" && k.toLowerCase().endsWith("id")) {
                const mapped = shapeIdMap.get(Number(v));
                if (Number.isFinite(Number(mapped))) node[k] = Number(mapped);
            }
            continue;
        }
        if (Array.isArray(v) && k.toLowerCase().endsWith("ids")) {
            node[k] = v.map((vv) => {
                const mapped = shapeIdMap.get(Number(vv));
                return Number.isFinite(Number(mapped)) ? Number(mapped) : vv;
            });
            continue;
        }
        if (v && typeof v === "object") patternRemapRefsDeep(v, shapeIdMap);
    }
}

function appendShapeToGroupIfNeeded(state, shape) {
    const gid = Number(shape?.groupId);
    if (!Number.isFinite(gid)) return;
    const g = (state.groups || []).find(gr => Number(gr.id) === gid);
    if (!g) return;
    if (!Array.isArray(g.shapeIds)) g.shapeIds = [];
    if (!g.shapeIds.map(Number).includes(Number(shape.id))) g.shapeIds.push(Number(shape.id));
}

function getRootSelectedGroupIds(state) {
    const selected = new Set((state.selection?.groupIds || []).map(Number).filter(Number.isFinite));
    if (!selected.size) return [];
    const byId = new Map((state.groups || []).map(g => [Number(g.id), g]));
    const roots = [];
    for (const gid of selected) {
        let cur = byId.get(gid);
        let hasSelectedAncestor = false;
        while (cur && cur.parentId != null) {
            const pid = Number(cur.parentId);
            if (selected.has(pid)) { hasSelectedAncestor = true; break; }
            cur = byId.get(pid);
        }
        if (!hasSelectedAncestor) roots.push(gid);
    }
    return roots;
}

function collectGroupSubtreeIdsFromRoot(state, rootId) {
    const byParent = new Map();
    for (const g of (state.groups || [])) {
        const pid = (g.parentId == null) ? null : Number(g.parentId);
        if (!byParent.has(pid)) byParent.set(pid, []);
        byParent.get(pid).push(Number(g.id));
    }
    const out = [];
    const seen = new Set();
    const stack = [Number(rootId)];
    while (stack.length) {
        const gid = Number(stack.pop());
        if (!Number.isFinite(gid) || seen.has(gid)) continue;
        seen.add(gid);
        out.push(gid);
        const kids = byParent.get(gid) || [];
        for (let i = kids.length - 1; i >= 0; i--) stack.push(Number(kids[i]));
    }
    return out;
}

function applyTransformToShapeDeep(node, transformPoint) {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
        for (const item of node) applyTransformToShapeDeep(item, transformPoint);
        return;
    }
    const pairs = [
        ["x", "y"], ["x1", "y1"], ["x2", "y2"], ["cx", "cy"],
        ["px", "py"], ["tx", "ty"], ["originX", "originY"]
    ];
    for (const [kx, ky] of pairs) {
        if (Object.prototype.hasOwnProperty.call(node, kx) && Object.prototype.hasOwnProperty.call(node, ky)) {
            const x = Number(node[kx]), y = Number(node[ky]);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                const p = transformPoint(x, y);
                node[kx] = Number(p.x);
                node[ky] = Number(p.y);
            }
        }
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === "object") applyTransformToShapeDeep(v, transformPoint);
    }
}

function makeCopiedGroupName(baseName, usedNameKeys) {
    const base = String(baseName || "Group").trim() || "Group";
    let i = 1;
    while (i < 1000000) {
        const cand = `${base}_${i}`;
        const key = cand.toLowerCase();
        if (!usedNameKeys.has(key)) {
            usedNameKeys.add(key);
            return cand;
        }
        i += 1;
    }
    return `${base}_${Date.now()}`;
}

function cloneGroupsWithTransform(state, rootGroupIds, transformPoint, options = {}) {
    const flipOrientation = !!options.flipOrientation;
    const rotationDeltaRad = Number(options.rotationDeltaRad || 0);
    const groups = Array.isArray(state.groups) ? state.groups : [];
    const byId = new Map(groups.map(g => [Number(g.id), g]));
    const uniqueGroupIds = [];
    const gidSet = new Set();
    for (const rootId of (rootGroupIds || [])) {
        for (const gid of collectGroupSubtreeIdsFromRoot(state, rootId)) {
            if (gidSet.has(gid)) continue;
            gidSet.add(gid);
            uniqueGroupIds.push(gid);
        }
    }
    if (!uniqueGroupIds.length) return { newRootGroupIds: [], newShapeIds: [] };

    const groupIdMap = new Map();
    for (const oldGid of uniqueGroupIds) {
        const newGid = Number(state.nextGroupId) || 1;
        state.nextGroupId = newGid + 1;
        groupIdMap.set(oldGid, newGid);
    }

    const shapeIdMap = new Map();
    const clones = [];
    for (const oldGid of uniqueGroupIds) {
        const g = byId.get(oldGid);
        const shapeIds = Array.isArray(g?.shapeIds) ? g.shapeIds : [];
        for (const sidRaw of shapeIds) {
            const sid = Number(sidRaw);
            if (!Number.isFinite(sid) || shapeIdMap.has(sid)) continue;
            const src = (state.shapes || []).find(s => Number(s.id) === sid);
            if (!src) continue;
            const newSid = Number(nextShapeId(state));
            shapeIdMap.set(sid, newSid);
            const c = JSON.parse(JSON.stringify(src));
            c.id = newSid;
            c.groupId = Number(groupIdMap.get(oldGid));
            applyTransformToShapeDeep(c, transformPoint);
            if (c.type === "arc") {
                const cx = Number(c.cx), cy = Number(c.cy), a1 = Number(c.a1), a2 = Number(c.a2);
                if ([cx, cy, a1, a2].every(Number.isFinite)) {
                    const p1 = transformPoint(cx + Math.cos(a1) * Number(c.r || 0), cy + Math.sin(a1) * Number(c.r || 0));
                    const p2 = transformPoint(cx + Math.cos(a2) * Number(c.r || 0), cy + Math.sin(a2) * Number(c.r || 0));
                    c.a1 = Math.atan2(Number(p1.y) - Number(c.cy), Number(p1.x) - Number(c.cx));
                    c.a2 = Math.atan2(Number(p2.y) - Number(c.cy), Number(p2.x) - Number(c.cx));
                    c.ccw = flipOrientation ? !(src.ccw !== false) : (src.ccw !== false);
                }
            } else if (c.type === "circleDim" && Math.abs(rotationDeltaRad) > 1e-12) {
                if (Number.isFinite(Number(c.ang))) c.ang = Number(c.ang) + rotationDeltaRad;
            }
            clones.push(c);
        }
    }
    for (const c of clones) patternRemapRefsDeep(c, shapeIdMap);
    if (clones.length) state.shapes.push(...clones);

    const newGroups = [];
    const usedNameKeys = new Set((state.groups || []).map(g => String(g?.name || "").trim().toLowerCase()).filter(Boolean));
    for (const oldGid of uniqueGroupIds) {
        const oldG = byId.get(oldGid);
        if (!oldG) continue;
        const gid = Number(groupIdMap.get(oldGid));
        const mappedParent = (oldG.parentId == null)
            ? oldG.parentId
            : (groupIdMap.get(Number(oldG.parentId)) ?? oldG.parentId);
        const origin = transformPoint(Number(oldG.originX) || 0, Number(oldG.originY) || 0);
        const newShapeIds = (Array.isArray(oldG.shapeIds) ? oldG.shapeIds : [])
            .map(id => shapeIdMap.get(Number(id)))
            .filter(id => Number.isFinite(Number(id)));
        newGroups.push({
            ...JSON.parse(JSON.stringify(oldG)),
            id: gid,
            name: makeCopiedGroupName(oldG?.name, usedNameKeys),
            parentId: mappedParent,
            originX: Number(origin.x),
            originY: Number(origin.y),
            rotationDeg: Number(oldG.rotationDeg || 0) + (rotationDeltaRad * 180 / Math.PI),
            shapeIds: newShapeIds,
        });
    }
    if (newGroups.length) state.groups = [...newGroups, ...state.groups];
    return {
        newRootGroupIds: (rootGroupIds || []).map(id => Number(groupIdMap.get(Number(id)))).filter(Number.isFinite),
        newShapeIds: clones.map(s => Number(s.id)),
    };
}

function mirrorPointAcrossLine(x, y, ax, ay, bx, by) {
    const vx = Number(bx) - Number(ax);
    const vy = Number(by) - Number(ay);
    const len2 = vx * vx + vy * vy;
    if (len2 <= 1e-12) return { x: Number(x), y: Number(y) };
    const t = (((Number(x) - Number(ax)) * vx) + ((Number(y) - Number(ay)) * vy)) / len2;
    const px = Number(ax) + vx * t;
    const py = Number(ay) + vy * t;
    return { x: 2 * px - Number(x), y: 2 * py - Number(y) };
}

export function setPatternCopyMode(state, mode) {
    const m = String(mode || "array").toLowerCase();
    state.patternCopySettings.mode = (m === "rotate" || m === "mirror") ? m : "array";
}

export function setPatternCopyCenterFromSelection(state, helpers) {
    const { setStatus, draw } = helpers;
    const selected = getSelectedShapes(state);
    const pos = selected.find(s => s && s.type === "position");
    if (!pos) {
        if (setStatus) setStatus("Pattern copy: select a position object as the center");
        if (draw) draw();
        return false;
    }
    state.input.patternCopyFlow.centerPositionId = Number(pos.id);
    if (setStatus) setStatus(`Pattern copy center set: Point #${pos.id}`);
    if (draw) draw();
    return true;
}

export function clearPatternCopyCenter(state, helpers) {
    const { setStatus, draw } = helpers;
    state.input.patternCopyFlow.centerPositionId = null;
    if (setStatus) setStatus("Pattern copy center cleared");
    if (draw) draw();
}

export function setPatternCopyAxisFromSelection(state, helpers) {
    const { setStatus, draw } = helpers;
    const selected = getSelectedShapes(state);
    const ln = selected.find(s => s && s.type === "line");
    if (!ln) {
        if (setStatus) setStatus("Pattern copy: select a line object as the axis");
        if (draw) draw();
        return false;
    }
    state.input.patternCopyFlow.axisLineId = Number(ln.id);
    if (setStatus) setStatus(`Pattern copy axis set: Line #${ln.id}`);
    if (draw) draw();
    return true;
}

export function clearPatternCopyAxis(state, helpers) {
    const { setStatus, draw } = helpers;
    state.input.patternCopyFlow.axisLineId = null;
    if (setStatus) setStatus("Pattern copy axis cleared");
    if (draw) draw();
}

export function executePatternCopy(state, helpers) {
    const { setStatus, draw } = helpers;
    const mode = String(state.patternCopySettings?.mode || "array");
    const selected = getSelectedShapes(state);
    const rootGroupIds = getRootSelectedGroupIds(state);
    if (!selected.length && !rootGroupIds.length) {
        if (setStatus) setStatus("Pattern copy: select source objects first");
        if (draw) draw();
        return false;
    }

    const newIds = [];
    const newRootIds = [];
    if (mode === "array") {
        const countX = Math.max(1, Math.round(Number(state.patternCopySettings?.arrayCountX) || 1));
        const countY = Math.max(1, Math.round(Number(state.patternCopySettings?.arrayCountY) || 1));
        const dxBase = Number(state.patternCopySettings?.arrayDx) || 0;
        const dyBase = Number(state.patternCopySettings?.arrayDy) || 0;
        const instanceCount = Math.max(0, countX * countY - 1);
        if (instanceCount <= 0) {
            if (setStatus) setStatus("Pattern copy: array count is too small");
            if (draw) draw();
            return false;
        }
        pushHistory(state);
        for (let iy = 0; iy < countY; iy++) {
            for (let ix = 0; ix < countX; ix++) {
                if (ix === 0 && iy === 0) continue;
                const dx = ix * dxBase;
                const dy = iy * dyBase;
                if (rootGroupIds.length) {
                    const r = cloneGroupsWithTransform(state, rootGroupIds, (x, y) => ({ x: Number(x) + dx, y: Number(y) + dy }));
                    newIds.push(...r.newShapeIds);
                    newRootIds.push(...r.newRootGroupIds);
                } else {
                    const idMap = new Map();
                    for (const s of selected) idMap.set(Number(s.id), Number(nextShapeId(state)));
                    const clones = [];
                    for (const s of selected) {
                        const c = JSON.parse(JSON.stringify(s));
                        c.id = Number(idMap.get(Number(s.id)));
                        patternShiftShapeDeep(c, dx, dy);
                        clones.push(c);
                    }
                    for (const c of clones) {
                        patternRemapRefsDeep(c, idMap);
                        state.shapes.push(c);
                        appendShapeToGroupIfNeeded(state, c);
                        newIds.push(Number(c.id));
                    }
                }
            }
        }
    } else if (mode === "rotate") {
        const centerId = Number(state.input?.patternCopyFlow?.centerPositionId);
        const center = (state.shapes || []).find(s => Number(s.id) === centerId && s.type === "position");
        if (!center) {
            if (setStatus) setStatus("Pattern copy: rotation center is not set");
            if (draw) draw();
            return false;
        }
        const cx = Number(center.x), cy = Number(center.y);
        const angleDeg = Number(state.patternCopySettings?.rotateAngleDeg) || 0;
        const count = Math.max(1, Math.round(Number(state.patternCopySettings?.rotateCount) || 1));
        if (count <= 1) {
            if (setStatus) setStatus("Pattern copy: rotate count is too small");
            if (draw) draw();
            return false;
        }
        pushHistory(state);
        for (let i = 1; i < count; i++) {
            const deg = angleDeg * i;
            const rad = deg * Math.PI / 180;
            const tf = (x, y) => rotatePointAround(Number(x), Number(y), cx, cy, deg);
            if (rootGroupIds.length) {
                const r = cloneGroupsWithTransform(state, rootGroupIds, tf, { rotationDeltaRad: rad });
                newIds.push(...r.newShapeIds);
                newRootIds.push(...r.newRootGroupIds);
            } else {
                const idMap = new Map();
                for (const s of selected) idMap.set(Number(s.id), Number(nextShapeId(state)));
                const clones = [];
                for (const s of selected) {
                    const c = JSON.parse(JSON.stringify(s));
                    c.id = Number(idMap.get(Number(s.id)));
                    applyTransformToShapeDeep(c, tf);
                    if (c.type === "arc") {
                        c.a1 = Number(s.a1) + rad;
                        c.a2 = Number(s.a2) + rad;
                        c.ccw = (s.ccw !== false);
                    } else if (c.type === "circleDim" && Number.isFinite(Number(c.ang))) {
                        c.ang = Number(c.ang) + rad;
                    } else if (c.type === "text") {
                        c.textRotate = Number(c.textRotate || 0) + deg;
                    }
                    clones.push(c);
                }
                for (const c of clones) {
                    patternRemapRefsDeep(c, idMap);
                    state.shapes.push(c);
                    appendShapeToGroupIfNeeded(state, c);
                    newIds.push(Number(c.id));
                }
            }
        }
    } else if (mode === "mirror") {
        const axisId = Number(state.input?.patternCopyFlow?.axisLineId);
        const axis = (state.shapes || []).find(s => Number(s.id) === axisId && s.type === "line");
        if (!axis) {
            if (setStatus) setStatus("Pattern copy: mirror axis is not set");
            if (draw) draw();
            return false;
        }
        pushHistory(state);
        const ax = Number(axis.x1), ay = Number(axis.y1), bx = Number(axis.x2), by = Number(axis.y2);
        const tf = (x, y) => mirrorPointAcrossLine(x, y, ax, ay, bx, by);
        if (rootGroupIds.length) {
            const r = cloneGroupsWithTransform(state, rootGroupIds, tf, { flipOrientation: true });
            newIds.push(...r.newShapeIds);
            newRootIds.push(...r.newRootGroupIds);
        } else {
            const idMap = new Map();
            for (const s of selected) idMap.set(Number(s.id), Number(nextShapeId(state)));
            const clones = [];
            for (const s of selected) {
                const c = JSON.parse(JSON.stringify(s));
                c.id = Number(idMap.get(Number(s.id)));
                applyTransformToShapeDeep(c, tf);
                if (c.type === "arc") {
                    const p1 = tf(Number(s.cx) + Math.cos(Number(s.a1) || 0) * Number(s.r || 0), Number(s.cy) + Math.sin(Number(s.a1) || 0) * Number(s.r || 0));
                    const p2 = tf(Number(s.cx) + Math.cos(Number(s.a2) || 0) * Number(s.r || 0), Number(s.cy) + Math.sin(Number(s.a2) || 0) * Number(s.r || 0));
                    c.a1 = Math.atan2(Number(p1.y) - Number(c.cy), Number(p1.x) - Number(c.cx));
                    c.a2 = Math.atan2(Number(p2.y) - Number(c.cy), Number(p2.x) - Number(c.cx));
                    c.ccw = !(s.ccw !== false);
                }
                clones.push(c);
            }
            for (const c of clones) {
                patternRemapRefsDeep(c, idMap);
                state.shapes.push(c);
                appendShapeToGroupIfNeeded(state, c);
                newIds.push(Number(c.id));
            }
        }
    } else {
        if (setStatus) setStatus(`Pattern copy: ${mode} is still under adjustment`);
        if (draw) draw();
        return false;
    }

    if (newIds.length) setSelection(state, newIds);
    if (newRootIds.length) {
        state.selection.groupIds = Array.from(new Set(newRootIds.map(Number)));
        state.activeGroupId = Number(state.selection.groupIds[state.selection.groupIds.length - 1]);
    } else {
        state.activeGroupId = null;
    }
    if (setStatus) setStatus(`Pattern copy: created ${newIds.length} object(s)`);
    if (draw) draw();
    return newIds.length > 0;
}
