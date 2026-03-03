import { nextShapeId, addShape, addGroup, nextGroupId } from "./state.js";

export function lineIntersectionInfinite(p1, p2, p3, p4) {
    const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
    const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;
    const det = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(det) < 1e-12) return null;
    const x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / det;
    const y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / det;
    return { x, y };
}

function lineLineIp(oa, ob) {
    return lineIntersectionInfinite(
        { x: oa.x1, y: oa.y1 }, { x: oa.x2, y: oa.y2 },
        { x: ob.x1, y: ob.y1 }, { x: ob.x2, y: ob.y2 }
    );
}

function getOffsetEndPoint(o, endKey) {
    return (endKey === 'p1')
        ? { x: Number(o.x1), y: Number(o.y1) }
        : { x: Number(o.x2), y: Number(o.y2) };
}

function setOffsetEndPoint(o, endKey, p) {
    if (!o || !p) return;
    if (endKey === 'p1') { o.x1 = p.x; o.y1 = p.y; }
    else if (endKey === 'p2') { o.x2 = p.x; o.y2 = p.y; }
}

function splitTrunkOffsetByBranch(trunkObj, branchBaseId, offsetLines, nextVirtualBaseIdRef, map) {
    if (!trunkObj) return;
    const b1 = map.get(`${branchBaseId}:1`);
    const b2 = map.get(`${branchBaseId}:-1`);
    if (!b1 || !b2) return;
    const ip1 = lineLineIp(trunkObj, b1);
    const ip2 = lineLineIp(trunkObj, b2);
    if (!ip1 || !ip2) return;
    if (![ip1.x, ip1.y, ip2.x, ip2.y].every(Number.isFinite)) return;
    const tx1 = Number(trunkObj.x1), ty1 = Number(trunkObj.y1), tx2 = Number(trunkObj.x2), ty2 = Number(trunkObj.y2);
    const dx = tx2 - tx1, dy = ty2 - ty1;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 1e-12) return;
    const t1 = ((ip1.x - tx1) * dx + (ip1.y - ty1) * dy) / len2;
    const t2 = ((ip2.x - tx1) * dx + (ip2.y - ty1) * dy) / len2;
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return;
    let a = { p: ip1, t: t1 }, b = { p: ip2, t: t2 };
    if (a.t > b.t) { const tmp = a; a = b; b = tmp; }
    const segTol = 1e-6;
    if (Math.abs(a.t - b.t) <= segTol) return;
    if (a.t < -segTol || b.t > 1 + segTol) return;
    const clampT = (t) => Math.max(0, Math.min(1, t));
    const pa = (a.t === clampT(a.t)) ? a.p : { x: tx1 + dx * clampT(a.t), y: ty1 + dy * clampT(a.t) };
    const pb = (b.t === clampT(b.t)) ? b.p : { x: tx1 + dx * clampT(b.t), y: ty1 + dy * clampT(b.t) };
    const leftLen = Math.hypot(pa.x - tx1, pa.y - ty1);
    const rightLen = Math.hypot(tx2 - pb.x, ty2 - pb.y);
    if (leftLen <= 1e-9 && rightLen <= 1e-9) return;
    if (leftLen <= 1e-9) {
        trunkObj.x1 = pb.x; trunkObj.y1 = pb.y;
        return;
    }
    if (rightLen <= 1e-9) {
        trunkObj.x2 = pa.x; trunkObj.y2 = pa.y;
        return;
    }
    const extra = {
        baseId: nextVirtualBaseIdRef.val--,
        side: Number(trunkObj.side),
        x1: pb.x, y1: pb.y, x2: tx2, y2: ty2
    };
    trunkObj.x2 = pa.x;
    trunkObj.y2 = pa.y;
    offsetLines.push(extra);
}


function trimTBranchToBestTrunk(branchBaseId, branchEnd, trunkBaseId, trunkSideHint, map, offsetLines, nextVirtualBaseIdRef) {
    if (!(branchEnd === 'p1' || branchEnd === 'p2')) return;
    // Dynamic lookup: Find all existing segments of this trunk
    const trunkOffsets = offsetLines.filter(o =>
        o.baseId === trunkBaseId &&
        (trunkSideHint == null || o.side === trunkSideHint)
    );
    if (trunkOffsets.length === 0) return;
    let chosenTrunk = null;
    for (const branchSide of [1, -1]) {
        const ob = map.get(`${branchBaseId}:${branchSide}`);
        if (!ob) continue;
        const ep = getOffsetEndPoint(ob, branchEnd);
        let best = null;
        let bestScore = Infinity;
        let bestTrunk = null;
        for (const ot of trunkOffsets) {
            const ip = lineLineIp(ob, ot);
            if (!ip || !Number.isFinite(ip.x) || !Number.isFinite(ip.y)) continue;
            const d = Math.hypot(ip.x - ep.x, ip.y - ep.y);
            if (d < bestScore) {
                bestScore = d;
                best = ip;
                bestTrunk = ot;
            }
        }
        if (best) {
            setOffsetEndPoint(ob, branchEnd, best);
            if (!chosenTrunk && bestTrunk) chosenTrunk = bestTrunk;
        }
    }
    if (chosenTrunk) splitTrunkOffsetByBranch(chosenTrunk, branchBaseId, offsetLines, nextVirtualBaseIdRef, map);
}

function trimOffsetLineConnections(offsetLines, baseAdjPairs) {
    const map = new Map();
    for (const o of offsetLines) map.set(`${o.baseId}:${o.side}`, o);
    let nextVirtualBaseIdRef = { val: -1 };
    for (const p of baseAdjPairs) {
        if ((p.aEnd && !p.bEnd) || (!p.aEnd && p.bEnd)) {
            if (p.aEnd && !p.bEnd) trimTBranchToBestTrunk(p.aId, p.aEnd, p.bId, p.tBranch === 'a' ? p.trunkSide : null, map, offsetLines, nextVirtualBaseIdRef);
            else if (!p.aEnd && p.bEnd) trimTBranchToBestTrunk(p.bId, p.bEnd, p.aId, p.tBranch === 'b' ? p.trunkSide : null, map, offsetLines, nextVirtualBaseIdRef);
            continue;
        }
        for (const side of [1, -1]) {
            const oa = map.get(`${p.aId}:${side}`);
            const ob = map.get(`${p.bId}:${side}`);
            if (!oa || !ob) continue;
            const ip = lineLineIp(oa, ob);
            if (!ip || !Number.isFinite(ip.x) || !Number.isFinite(ip.y)) continue;
            if (p.aEnd === 'p1') { oa.x1 = ip.x; oa.y1 = ip.y; }
            else if (p.aEnd === 'p2') { oa.x2 = ip.x; oa.y2 = ip.y; }
            if (p.bEnd === 'p1') { ob.x1 = ip.x; ob.y1 = ip.y; }
            else if (p.bEnd === 'p2') { ob.x2 = ip.x; ob.y2 = ip.y; }
        }
    }
}

function buildOffsetLineData(baseLine, sideSign, offsetDist) {
    const x1 = Number(baseLine.x1), y1 = Number(baseLine.y1), x2 = Number(baseLine.x2), y2 = Number(baseLine.y2);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-9) return null;
    const tx = dx / len, ty = dy / len;
    const nx = -ty * sideSign, ny = tx * sideSign;
    return {
        baseId: Number(baseLine.id),
        side: sideSign,
        x1: x1 + nx * offsetDist,
        y1: y1 + ny * offsetDist,
        x2: x2 + nx * offsetDist,
        y2: y2 + ny * offsetDist
    };
}

function computeDoubleLineSideSigns(lines, mousePt) {
    const out = {};
    if (!mousePt) return out;
    for (const s of lines) {
        const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len <= 1e-9) continue;
        const tx = dx / len, ty = dy / len;
        const nx = -ty, ny = tx;
        const t = Math.max(0, Math.min(len, (mousePt.x - x1) * tx + (mousePt.y - y1) * ty));
        const qx = x1 + tx * t, qy = y1 + ty * t;
        const side = ((mousePt.x - qx) * nx + (mousePt.y - qy) * ny) >= 0 ? 1 : -1;
        out[s.id] = side;
    }
    return out;
}

function findAdjacentBaseLinePairs(lines, tol = 1e-4) {
    const eps = tol;
    const out = [];
    function endpointOnSegment(p, l) {
        const x1 = Number(l.x1), y1 = Number(l.y1), x2 = Number(l.x2), y2 = Number(l.y2);
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 <= 1e-12) return null;
        const t = ((p.x - x1) * dx + (p.y - y1) * dy) / len2;
        if (t < -1e-9 || t > 1 + 1e-9) return null;
        const qx = x1 + dx * t, qy = y1 + dy * t;
        const d = Math.hypot(p.x - qx, p.y - qy);
        if (d > eps) return null;
        return { t, x: qx, y: qy };
    }
    for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
            const a = lines[i], b = lines[j];
            const ptsA = [{ x: a.x1, y: a.y1, end: 'p1' }, { x: a.x2, y: a.y2, end: 'p2' }];
            const ptsB = [{ x: b.x1, y: b.y1, end: 'p1' }, { x: b.x2, y: b.y2, end: 'p2' }];
            let best = null;
            let bestD = Infinity;
            for (const pa of ptsA) for (const pb of ptsB) {
                const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
                if (d <= eps && d < bestD) { bestD = d; best = { aEnd: pa.end, bEnd: pb.end }; }
            }
            if (best) {
                out.push({ aId: Number(a.id), bId: Number(b.id), aEnd: best.aEnd, bEnd: best.bEnd });
                continue;
            }
            for (const pa of ptsA) {
                const hit = endpointOnSegment(pa, b);
                if (!hit) continue;
                const tEdgeTol = 1e-6;
                if (hit.t <= tEdgeTol || hit.t >= 1 - tEdgeTol) continue;
                const bdx = Number(b.x2) - Number(b.x1), bdy = Number(b.y2) - Number(b.y1);
                const blen = Math.hypot(bdx, bdy);
                if (blen <= 1e-9) continue;
                const bnx = -bdy / blen, bny = bdx / blen;
                const aOther = (pa.end === 'p1') ? { x: Number(a.x2), y: Number(a.y2) } : { x: Number(a.x1), y: Number(a.y1) };
                const dot = (aOther.x - pa.x) * bnx + (aOther.y - pa.y) * bny;
                out.push({ aId: Number(a.id), bId: Number(b.id), aEnd: pa.end, bEnd: null, tBranch: 'a', trunkSide: (dot >= 0 ? 1 : -1) });
            }
            for (const pb of ptsB) {
                const hit = endpointOnSegment(pb, a);
                if (!hit) continue;
                const tEdgeTol = 1e-6;
                if (hit.t <= tEdgeTol || hit.t >= 1 - tEdgeTol) continue;
                const adx = Number(a.x2) - Number(a.x1), ady = Number(a.y2) - Number(a.y1);
                const alen = Math.hypot(adx, ady);
                if (alen <= 1e-9) continue;
                const anx = -ady / alen, any = adx / alen;
                const bOther = (pb.end === 'p1') ? { x: Number(b.x2), y: Number(b.y2) } : { x: Number(b.x1), y: Number(b.y1) };
                const dot = (bOther.x - pb.x) * anx + (bOther.y - pb.y) * any;
                out.push({ aId: Number(a.id), bId: Number(b.id), aEnd: null, bEnd: pb.end, tBranch: 'b', trunkSide: (dot >= 0 ? 1 : -1) });
            }
        }
    }
    return out;
}

export function buildDoubleLinePreview(state, mousePt = null) {
    const bases = (state.selection?.ids || [])
        .map(id => state.shapes.find(s => Number(s.id) === Number(id)))
        .filter(s => s && (s.type === 'line' || s.type === 'circle' || s.type === 'arc'));
    if (bases.length === 0) return null;
    // Fix selection order dependency
    bases.sort((a, b) => Number(a.id) - Number(b.id));
    const off = Number(state.dlineSettings?.offset) || 10;
    const mode = state.dlineSettings?.mode || 'both';
    const lineBases = bases.filter(s => s.type === 'line');
    const signsMap = (mode === 'single' && mousePt) ? computeDoubleLineSideSigns(lineBases, mousePt) : null;
    const offsets = [];
    for (const s of bases) {
        if (s.type === 'line') {
            if (mode === 'single') {
                const sg = (signsMap && signsMap[s.id]) ? signsMap[s.id] : 1;
                const o = buildOffsetLineData(s, sg, off);
                if (o) offsets.push(o);
            } else {
                const op = buildOffsetLineData(s, 1, off);
                const om = buildOffsetLineData(s, -1, off);
                if (op) offsets.push(op);
                if (om) offsets.push(om);
            }
            continue;
        }
        if (s.type === 'circle') {
            const cx = Number(s.cx), cy = Number(s.cy), r0 = Number(s.r);
            if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r0)) continue;
            const pickSign = () => {
                if (!mousePt) return 1;
                const d = Math.hypot(Number(mousePt.x) - cx, Number(mousePt.y) - cy);
                return d >= r0 ? 1 : -1;
            };
            const pushCircle = (sg) => {
                const r = r0 + sg * off;
                if (r <= 1e-9) return;
                offsets.push({ type: 'circle', baseId: Number(s.id), side: sg, cx, cy, r });
            };
            if (mode === 'single') pushCircle(pickSign());
            else { pushCircle(1); pushCircle(-1); }
            continue;
        }
        if (s.type === 'arc') {
            const cx = Number(s.cx), cy = Number(s.cy), r0 = Number(s.r);
            const a1 = Number(s.a1), a2 = Number(s.a2);
            const ccw = !!s.ccw;
            if (![cx, cy, r0, a1, a2].every(Number.isFinite)) continue;
            const pickSign = () => {
                if (!mousePt) return 1;
                const d = Math.hypot(Number(mousePt.x) - cx, Number(mousePt.y) - cy);
                return d >= r0 ? 1 : -1;
            };
            const pushArc = (sg) => {
                const r = r0 + sg * off;
                if (r <= 1e-9) return;
                offsets.push({ type: 'arc', baseId: Number(s.id), side: sg, cx, cy, r, a1, a2, ccw });
            };
            if (mode === 'single') pushArc(pickSign());
            else { pushArc(1); pushArc(-1); }
            continue;
        }
    }
    const pairs = findAdjacentBaseLinePairs(lineBases);
    // Sort pairs to ensure deterministic processing order
    pairs.sort((a, b) => (a.aId - b.aId) || (a.bId - b.bId) || (String(a.aEnd).localeCompare(String(b.aEnd))));
    const lineOffsets = offsets.filter(o => o.type !== 'circle' && o.type !== 'arc');
    trimOffsetLineConnections(lineOffsets, pairs);
    return offsets.map(o => {
        if (o.type === 'circle') {
            return { type: 'circle', cx: o.cx, cy: o.cy, r: o.r, baseId: o.baseId, side: o.side };
        }
        if (o.type === 'arc') {
            return { type: 'arc', cx: o.cx, cy: o.cy, r: o.r, a1: o.a1, a2: o.a2, ccw: !!o.ccw, baseId: o.baseId, side: o.side };
        }
        return { type: 'line', x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2, baseId: o.baseId, side: o.side };
    });
}


export function executeDoubleLine(state) {
    const bases = (state.selection?.ids || [])
        .map(id => state.shapes.find(s => Number(s.id) === Number(id)))
        .filter(s => s && (s.type === 'line' || s.type === 'circle' || s.type === 'arc'));
    if (bases.length === 0) return false;
    // Consistent with buildDoubleLinePreview
    bases.sort((a, b) => Number(a.id) - Number(b.id));

    const preview = state.dlinePreview;
    if (!preview || preview.length === 0) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of preview) {
        if (o.type === 'circle' || o.type === 'arc') {
            minX = Math.min(minX, o.cx - o.r); minY = Math.min(minY, o.cy - o.r);
            maxX = Math.max(maxX, o.cx + o.r); maxY = Math.max(maxY, o.cy + o.r);
        } else {
            minX = Math.min(minX, o.x1, o.x2); minY = Math.min(minY, o.y1, o.y2);
            maxX = Math.max(maxX, o.x1, o.x2); maxY = Math.max(maxY, o.y1, o.y2);
        }
    }

    const groupId = nextGroupId(state);
    const newShapeIds = [];

    for (const o of preview) {
        const refBase = bases.find(v => Number(v.id) === Number(o.baseId));
        const toolLineWidth = Math.max(0.01, Number(state.dlineSettings?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        const toolLineType = String(state.dlineSettings?.lineType || "solid");
        const s = {
            id: nextShapeId(state),
            type: o.type || 'line',
            stroke: refBase?.stroke || "#0f172a",
            strokeDash: refBase?.strokeDash || "solid",
            strokeWidth: refBase?.strokeWidth || 1.5,
            lineWidthMm: toolLineWidth,
            lineType: toolLineType,
            layerId: state.activeLayerId,
            groupId: groupId,
        };
        if (s.type === 'circle') {
            s.cx = o.cx; s.cy = o.cy; s.r = o.r;
        } else if (s.type === 'arc') {
            s.cx = o.cx; s.cy = o.cy; s.r = o.r;
            s.a1 = o.a1; s.a2 = o.a2; s.ccw = !!o.ccw;
        } else {
            s.type = 'line';
            s.x1 = o.x1; s.y1 = o.y1; s.x2 = o.x2; s.y2 = o.y2;
        }
        addShape(state, s);
        newShapeIds.push(s.id);
    }

    addGroup(state, {
        id: groupId,
        name: `DLineGroup${groupId}`,
        shapeIds: newShapeIds,
        originX: (minX + maxX) * 0.5,
        originY: (minY + maxY) * 0.5,
        rotationDeg: 0,
        parentId: state.activeGroupId,
        layerId: state.activeLayerId,
    });

    // Clear preview and selection
    state.dlinePreview = null;
    state.selection.ids = [];

    return true;
}
