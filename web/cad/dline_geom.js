import { nextShapeId, addShape, addGroup, nextGroupId } from "./state.js";
import { segmentIntersectionParamPoint, segmentCircleIntersectionPoints, lineCircleInfiniteIntersectionPoints, circleCircleIntersectionPoints, isAngleOnArc } from "./solvers.js";
import { getEffectiveGridSize, snapPoint } from "./geom.js";

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

function splitTrunkOffsetByBranch(trunkObj, branchBaseId, offsetLines, nextVirtualBaseIdRef, map, branchSegBySide = null) {
    if (!trunkObj) return;
    const b1 = branchSegBySide?.[1] || map.get(`${branchBaseId}:1`);
    const b2 = branchSegBySide?.[-1] || map.get(`${branchBaseId}:-1`);
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
    const trunkRootBaseId = Number(trunkObj.rootBaseId ?? trunkObj.baseId);
    const extra = {
        baseId: nextVirtualBaseIdRef.val--,
        rootBaseId: trunkRootBaseId,
        side: Number(trunkObj.side),
        x1: pb.x, y1: pb.y, x2: tx2, y2: ty2
    };
    trunkObj.rootBaseId = trunkRootBaseId;
    trunkObj.x2 = pa.x;
    trunkObj.y2 = pa.y;
    offsetLines.push(extra);
}


function trimTBranchToBestTrunk(branchBaseId, branchEnd, trunkBaseId, trunkSideHint, map, offsetLines, nextVirtualBaseIdRef) {
    if (!(branchEnd === 'p1' || branchEnd === 'p2')) return;
    // Dynamic lookup: Find all existing segments that originate from this trunk
    // (including segments split out by previous T-branch trims).
    const trunkOffsets = offsetLines.filter(o =>
        Number(o.rootBaseId ?? o.baseId) === Number(trunkBaseId) &&
        (trunkSideHint == null || o.side === trunkSideHint)
    );
    if (trunkOffsets.length === 0) return;
    let chosenTrunk = null;
    let chosenTrunkScore = Infinity;
    const branchSegBySide = {};
    for (const branchSide of [1, -1]) {
        const branchOffsets = offsetLines.filter(o =>
            Number(o.rootBaseId ?? o.baseId) === Number(branchBaseId)
            && Number(o.side) === Number(branchSide)
        );
        if (branchOffsets.length === 0) continue;
        let best = null;
        let bestScore = Infinity;
        let bestBranch = null;
        let bestTrunk = null;
        for (const ob of branchOffsets) {
            const ep = getOffsetEndPoint(ob, branchEnd);
            for (const ot of trunkOffsets) {
                const ip = lineLineIp(ob, ot);
                if (!ip || !Number.isFinite(ip.x) || !Number.isFinite(ip.y)) continue;
                const d = Math.hypot(ip.x - ep.x, ip.y - ep.y);
                if (d < bestScore) {
                    bestScore = d;
                    best = ip;
                    bestBranch = ob;
                    bestTrunk = ot;
                }
            }
        }
        if (best && bestBranch) {
            setOffsetEndPoint(bestBranch, branchEnd, best);
            branchSegBySide[branchSide] = bestBranch;
            if (bestTrunk && bestScore < chosenTrunkScore) {
                chosenTrunkScore = bestScore;
                chosenTrunk = bestTrunk;
            }
        }
    }
    if (chosenTrunk) splitTrunkOffsetByBranch(chosenTrunk, branchBaseId, offsetLines, nextVirtualBaseIdRef, map, branchSegBySide);
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

function extendOffsetLinesBothEnds(offsetLines, extendDist) {
    const ext = Math.max(0, Number(extendDist) || 0);
    if (ext <= 1e-9) return;
    for (const o of offsetLines) {
        const dx = Number(o.x2) - Number(o.x1);
        const dy = Number(o.y2) - Number(o.y1);
        const len = Math.hypot(dx, dy);
        if (len <= 1e-9) continue;
        const tx = dx / len;
        const ty = dy / len;
        o.x1 = Number(o.x1) - tx * ext;
        o.y1 = Number(o.y1) - ty * ext;
        o.x2 = Number(o.x2) + tx * ext;
        o.y2 = Number(o.y2) + ty * ext;
    }
}

function buildConnectedEndTargetMap(baseAdjPairs) {
    const map = new Map();
    const ensureEntry = (baseId) => {
        const id = Number(baseId);
        if (!Number.isFinite(id)) return null;
        let entry = map.get(id);
        if (!entry) {
            entry = { p1: new Set(), p2: new Set() };
            map.set(id, entry);
        }
        return entry;
    };
    const addTarget = (baseId, endKey, targetId) => {
        if (!(endKey === "p1" || endKey === "p2")) return;
        const t = Number(targetId);
        if (!Number.isFinite(t)) return;
        const entry = ensureEntry(baseId);
        if (!entry) return;
        entry[endKey].add(t);
    };
    for (const p of (baseAdjPairs || [])) {
        addTarget(p?.aId, p?.aEnd, p?.bId);
        addTarget(p?.bId, p?.bEnd, p?.aId);
    }
    return map;
}

function collectLineIntersectionCutParams(offsetLine, targetShapes) {
    const a1 = { x: Number(offsetLine.x1), y: Number(offsetLine.y1) };
    const a2 = { x: Number(offsetLine.x2), y: Number(offsetLine.y2) };
    const out = [];
    const pushT = (t) => {
        const tv = Number(t);
        if (!Number.isFinite(tv)) return;
        for (const v of out) {
            if (Math.abs(v - tv) <= 1e-6) return;
        }
        out.push(tv);
    };
    for (const s of (targetShapes || [])) {
        if (!s) continue;
        const st = String(s.type || "");
        if (st === "line") {
            const b1 = { x: Number(s.x1), y: Number(s.y1) };
            const b2 = { x: Number(s.x2), y: Number(s.y2) };
            const ip = segmentIntersectionParamPoint(a1, a2, b1, b2);
            if (ip) pushT(ip.t);
            continue;
        }
        if (st === "circle") {
            for (const ip of segmentCircleIntersectionPoints(a1, a2, s)) pushT(ip.t);
            continue;
        }
        if (st === "arc") {
            for (const ip of segmentCircleIntersectionPoints(a1, a2, s)) {
                const th = Math.atan2(Number(ip.y) - Number(s.cy), Number(ip.x) - Number(s.cx));
                if (isAngleOnArc(th, Number(s.a1) || 0, Number(s.a2) || 0, s.ccw !== false)) pushT(ip.t);
            }
            continue;
        }
    }
    out.sort((a, b) => a - b);
    return out;
}

function trimExtendedOffsetsByTargetIntersections(offsetLines, targetBases, baseAdjPairs) {
    const endTargetMap = buildConnectedEndTargetMap(baseAdjPairs);
    const shapeById = new Map();
    for (const s of (targetBases || [])) {
        const id = Number(s?.id);
        if (!s || !Number.isFinite(id)) continue;
        shapeById.set(id, s);
    }
    const epsT = 1e-6;
    for (const o of offsetLines) {
        const baseId = Number(o.baseId);
        const connected = endTargetMap.get(baseId);
        if (!connected) continue;
        let tStart = 0;
        let tEnd = 1;
        if (connected.p1 && connected.p1.size) {
            const p1Targets = Array.from(connected.p1).map(id => shapeById.get(id)).filter(Boolean);
            const cutsP1 = collectLineIntersectionCutParams(o, p1Targets);
            const tNearStart = cutsP1.find(t => t > epsT);
            if (Number.isFinite(tNearStart)) tStart = Math.max(tStart, tNearStart);
        }
        if (connected.p2 && connected.p2.size) {
            const p2Targets = Array.from(connected.p2).map(id => shapeById.get(id)).filter(Boolean);
            const cutsP2 = collectLineIntersectionCutParams(o, p2Targets);
            let tNearEnd = null;
            for (let i = cutsP2.length - 1; i >= 0; i--) {
                if (cutsP2[i] < 1 - epsT) { tNearEnd = cutsP2[i]; break; }
            }
            if (Number.isFinite(tNearEnd)) tEnd = Math.min(tEnd, tNearEnd);
        }
        if (tEnd - tStart <= epsT) {
            o.__drop = true;
            continue;
        }
        const x1 = Number(o.x1), y1 = Number(o.y1), x2 = Number(o.x2), y2 = Number(o.y2);
        const dx = x2 - x1, dy = y2 - y1;
        o.x1 = x1 + dx * tStart;
        o.y1 = y1 + dy * tStart;
        o.x2 = x1 + dx * tEnd;
        o.y2 = y1 + dy * tEnd;
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
        rootBaseId: Number(baseLine.id),
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

function findAdjacentLineArcPairs(lines, arcs, tol = 1e-4) {
    const eps = Math.max(1e-9, Number(tol) || 1e-4);
    const out = [];
    const arcEndPoint = (a, key) => {
        const th = (key === "a2") ? Number(a.a2) : Number(a.a1);
        return { x: Number(a.cx) + Math.cos(th) * Number(a.r), y: Number(a.cy) + Math.sin(th) * Number(a.r) };
    };
    for (const l of (lines || [])) {
        const lp = [
            { key: "p1", x: Number(l.x1), y: Number(l.y1) },
            { key: "p2", x: Number(l.x2), y: Number(l.y2) },
        ];
        for (const a of (arcs || [])) {
            const ap = [
                { key: "a1", ...arcEndPoint(a, "a1") },
                { key: "a2", ...arcEndPoint(a, "a2") },
            ];
            for (const pL of lp) {
                for (const pA of ap) {
                    const d = Math.hypot(Number(pL.x) - Number(pA.x), Number(pL.y) - Number(pA.y));
                    if (d <= eps) {
                        out.push({
                            lineId: Number(l.id),
                            lineEnd: pL.key,
                            arcId: Number(a.id),
                            arcEnd: pA.key,
                            dist: d,
                        });
                    }
                }
            }
        }
    }
    return out;
}

function connectLineArcOffsets(offsets, lineArcPairs) {
    if (!Array.isArray(offsets) || !offsets.length || !Array.isArray(lineArcPairs) || !lineArcPairs.length) return;
    const lineMap = new Map();
    const arcMap = new Map();
    for (const o of offsets) {
        if (!o) continue;
        const key = `${Number(o.baseId)}:${Number(o.side)}`;
        if (o.type === "arc") arcMap.set(key, o);
        else if (o.type !== "circle") lineMap.set(key, o);
    }
    const getLineEnd = (o, key) => (key === "p2")
        ? { x: Number(o.x2), y: Number(o.y2) }
        : { x: Number(o.x1), y: Number(o.y1) };
    const setLineEnd = (o, key, p) => {
        if (key === "p2") { o.x2 = Number(p.x); o.y2 = Number(p.y); }
        else { o.x1 = Number(p.x); o.y1 = Number(p.y); }
    };
    const arcEndPoint = (a, key) => {
        const th = (key === "a2") ? Number(a.a2) : Number(a.a1);
        return { x: Number(a.cx) + Math.cos(th) * Number(a.r), y: Number(a.cy) + Math.sin(th) * Number(a.r) };
    };
    const pairs = lineArcPairs.slice().sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0));
    for (const p of pairs) {
        for (const side of [1, -1]) {
            const lo = lineMap.get(`${Number(p.lineId)}:${side}`);
            const ao = arcMap.get(`${Number(p.arcId)}:${side}`);
            if (!lo || !ao) continue;
            const anchor = getLineEnd(lo, p.lineEnd);
            const other = getLineEnd(lo, p.lineEnd === "p1" ? "p2" : "p1");
            const arcAnchor = arcEndPoint(ao, p.arcEnd);
            const ips = lineCircleInfiniteIntersectionPoints(anchor, other, ao, Number(ao.r) || 0) || [];
            if (!ips.length) continue;
            let best = null;
            let bestScore = Infinity;
            for (const ip of ips) {
                const dLine = Math.hypot(Number(ip.x) - Number(anchor.x), Number(ip.y) - Number(anchor.y));
                const dArc = Math.hypot(Number(ip.x) - Number(arcAnchor.x), Number(ip.y) - Number(arcAnchor.y));
                const score = dLine + dArc * 0.75;
                if (score < bestScore) {
                    bestScore = score;
                    best = ip;
                }
            }
            if (!best) continue;
            setLineEnd(lo, p.lineEnd, best);
        }
    }
}

function cancelExtendedEndsAtLineArcConnections(offsetLines, lineArcPairs, extendDist) {
    const ext = Math.max(0, Number(extendDist) || 0);
    if (ext <= 1e-9 || !Array.isArray(offsetLines) || !offsetLines.length || !Array.isArray(lineArcPairs) || !lineArcPairs.length) return;
    const endMap = new Map();
    const markEnd = (lineId, endKey) => {
        const id = Number(lineId);
        if (!Number.isFinite(id) || (endKey !== "p1" && endKey !== "p2")) return;
        let set = endMap.get(id);
        if (!set) {
            set = new Set();
            endMap.set(id, set);
        }
        set.add(endKey);
    };
    for (const p of lineArcPairs) markEnd(p?.lineId, p?.lineEnd);

    for (const o of offsetLines) {
        const ends = endMap.get(Number(o?.baseId));
        if (!ends || !ends.size) continue;
        const dx = Number(o.x2) - Number(o.x1);
        const dy = Number(o.y2) - Number(o.y1);
        const len = Math.hypot(dx, dy);
        if (len <= 1e-9) continue;
        const tx = dx / len;
        const ty = dy / len;
        // Extension was applied to both sides. At line-arc connected ends, cancel only that end extension.
        if (ends.has("p1")) {
            o.x1 = Number(o.x1) + tx * ext;
            o.y1 = Number(o.y1) + ty * ext;
        }
        if (ends.has("p2")) {
            o.x2 = Number(o.x2) - tx * ext;
            o.y2 = Number(o.y2) - ty * ext;
        }
    }
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
    const arcBases = bases.filter(s => s.type === 'arc');
    const pairs = findAdjacentBaseLinePairs(lineBases);
    const lineArcPairs = findAdjacentLineArcPairs(lineBases, arcBases);
    // Sort pairs to ensure deterministic processing order
    pairs.sort((a, b) => (a.aId - b.aId) || (a.bId - b.bId) || (String(a.aEnd).localeCompare(String(b.aEnd))));
    const lineOffsets = offsets.filter(o => o.type !== 'circle' && o.type !== 'arc');
    // Build same full (no-trim) base first, then apply trim stages.
    extendOffsetLinesBothEnds(lineOffsets, Math.abs(off));
    cancelExtendedEndsAtLineArcConnections(lineOffsets, lineArcPairs, Math.abs(off));
    for (const o of lineOffsets) {
        o.fullX1 = Number(o.x1);
        o.fullY1 = Number(o.y1);
        o.fullX2 = Number(o.x2);
        o.fullY2 = Number(o.y2);
    }
    if (!state.dlineSettings?.noTrim) {
        trimOffsetLineConnections(lineOffsets, pairs);
        connectLineArcOffsets(offsets, lineArcPairs);
        trimExtendedOffsetsByTargetIntersections(lineOffsets, bases, pairs);
    }
    // Arc offset should preserve original angular span.
    const baseArcById = new Map();
    for (const s of bases) {
        if (s?.type === "arc") baseArcById.set(Number(s.id), s);
    }
    for (const o of offsets) {
        if (!o || o.type !== "arc") continue;
        const baseArc = baseArcById.get(Number(o.baseId));
        if (!baseArc) continue;
        o.a1 = Number(baseArc.a1) || 0;
        o.a2 = Number(baseArc.a2) || 0;
        o.ccw = baseArc.ccw !== false;
    }
    return offsets.filter(o => !o.__drop).map(o => {
        if (o.type === 'circle') {
            return { type: 'circle', cx: o.cx, cy: o.cy, r: o.r, baseId: o.baseId, side: o.side };
        }
        if (o.type === 'arc') {
            return { type: 'arc', cx: o.cx, cy: o.cy, r: o.r, a1: o.a1, a2: o.a2, ccw: !!o.ccw, baseId: o.baseId, side: o.side };
        }
        return {
            type: 'line',
            x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
            fullX1: o.fullX1, fullY1: o.fullY1, fullX2: o.fullX2, fullY2: o.fullY2,
            baseId: o.baseId, side: o.side
        };
    });
}

export function buildDoubleLineTrimDeleteCandidates(preview, eps = 1e-6) {
    const out = [];
    const e = Math.max(1e-9, Number(eps) || 1e-6);
    if (!Array.isArray(preview)) return out;
    for (const o of preview) {
        if (!o || o.type !== "line") continue;
        const x1 = Number(o.x1), y1 = Number(o.y1), x2 = Number(o.x2), y2 = Number(o.y2);
        const fx1 = Number(o.fullX1), fy1 = Number(o.fullY1), fx2 = Number(o.fullX2), fy2 = Number(o.fullY2);
        if (![x1, y1, x2, y2, fx1, fy1, fx2, fy2].every(Number.isFinite)) continue;
        if (Math.hypot(fx1 - x1, fy1 - y1) > e) {
            out.push({ type: "line", x1: fx1, y1: fy1, x2: x1, y2: y1, baseId: o.baseId, side: o.side });
        }
        if (Math.hypot(fx2 - x2, fy2 - y2) > e) {
            out.push({ type: "line", x1: x2, y1: y2, x2: fx2, y2: fy2, baseId: o.baseId, side: o.side });
        }
    }
    return out;
}

export function buildDoubleLineTargetLineIntersections(preview, targetBases, eps = 1e-6) {
    const out = [];
    const e = Math.max(1e-9, Number(eps) || 1e-6);
    const targets = (targetBases || []).filter(s => s && (s.type === "line" || s.type === "circle" || s.type === "arc"));
    if (!Array.isArray(preview) || !preview.length || !targets.length) return out;
    const pushPoint = (x, y) => {
        const px = Number(x), py = Number(y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return;
        for (const p of out) {
            if (Math.hypot(Number(p.x) - px, Number(p.y) - py) <= e) return;
        }
        out.push({ x: px, y: py });
    };

    const getPreviewLineEnds = (o) => {
        const fx1 = Number(o?.fullX1), fy1 = Number(o?.fullY1), fx2 = Number(o?.fullX2), fy2 = Number(o?.fullY2);
        if ([fx1, fy1, fx2, fy2].every(Number.isFinite)) return [{ x: fx1, y: fy1 }, { x: fx2, y: fy2 }];
        const x1 = Number(o?.x1), y1 = Number(o?.y1), x2 = Number(o?.x2), y2 = Number(o?.y2);
        if ([x1, y1, x2, y2].every(Number.isFinite)) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
        return null;
    };

    const isOnArc = (shapeArc, x, y) => {
        const th = Math.atan2(Number(y) - Number(shapeArc.cy), Number(x) - Number(shapeArc.cx));
        return isAngleOnArc(th, Number(shapeArc.a1) || 0, Number(shapeArc.a2) || 0, shapeArc.ccw !== false);
    };

    const addIntersections = (target, generated) => {
        const tt = String(target?.type || "");
        const gt = String(generated?.type || "");

        if (tt === "line" && gt === "line") {
            const t1 = { x: Number(target.x1), y: Number(target.y1) };
            const t2 = { x: Number(target.x2), y: Number(target.y2) };
            const ge = getPreviewLineEnds(generated);
            if (!ge) return;
            const ip = segmentIntersectionParamPoint(t1, t2, ge[0], ge[1]);
            if (ip) pushPoint(ip.x, ip.y);
            return;
        }

        if (tt === "line" && (gt === "circle" || gt === "arc")) {
            const t1 = { x: Number(target.x1), y: Number(target.y1) };
            const t2 = { x: Number(target.x2), y: Number(target.y2) };
            for (const ip of segmentCircleIntersectionPoints(t1, t2, generated)) {
                if (gt !== "arc" || isOnArc(generated, ip.x, ip.y)) pushPoint(ip.x, ip.y);
            }
            return;
        }

        if ((tt === "circle" || tt === "arc") && gt === "line") {
            const ge = getPreviewLineEnds(generated);
            if (!ge) return;
            for (const ip of segmentCircleIntersectionPoints(ge[0], ge[1], target)) {
                if (tt !== "arc" || isOnArc(target, ip.x, ip.y)) pushPoint(ip.x, ip.y);
            }
            return;
        }

        if ((tt === "circle" || tt === "arc") && (gt === "circle" || gt === "arc")) {
            const c1 = { x: Number(target.cx), y: Number(target.cy) };
            const c2 = { x: Number(generated.cx), y: Number(generated.cy) };
            const r1 = Math.abs(Number(target.r) || 0);
            const r2 = Math.abs(Number(generated.r) || 0);
            if (![c1.x, c1.y, c2.x, c2.y, r1, r2].every(Number.isFinite) || r1 <= 1e-9 || r2 <= 1e-9) return;
            const ips = circleCircleIntersectionPoints(c1, r1, c2, r2) || [];
            for (const ip of ips) {
                if (tt === "arc" && !isOnArc(target, ip.x, ip.y)) continue;
                if (gt === "arc" && !isOnArc(generated, ip.x, ip.y)) continue;
                pushPoint(ip.x, ip.y);
            }
            return;
        }
    };

    for (const t of targets) {
        for (const o of preview) {
            if (!o) continue;
            addIntersections(t, o);
        }
    }
    return out;
}

export function executeDoubleLine(state, previewOverride = null, options = null) {
    const bases = (state.selection?.ids || [])
        .map(id => state.shapes.find(s => Number(s.id) === Number(id)))
        .filter(s => s && (s.type === 'line' || s.type === 'circle' || s.type === 'arc'));
    if (bases.length === 0) return options?.returnMeta ? { ok: false, newShapeIds: [], groupId: null } : false;
    // Consistent with buildDoubleLinePreview
    bases.sort((a, b) => Number(a.id) - Number(b.id));

    const preview = (Array.isArray(previewOverride) && previewOverride.length > 0)
        ? previewOverride
        : state.dlinePreview;
    if (!preview || preview.length === 0) return options?.returnMeta ? { ok: false, newShapeIds: [], groupId: null } : false;

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

    const originRaw = { x: (minX + maxX) * 0.5, y: (minY + maxY) * 0.5 };
    let origin = originRaw;
    const gridStep = Number(getEffectiveGridSize(state.grid, state.view, state.pageSetup));
    if (Number.isFinite(gridStep) && gridStep > 1e-9) {
        origin = snapPoint(originRaw, gridStep);
    }

    addGroup(state, {
        id: groupId,
        name: `DLineGroup${groupId}`,
        shapeIds: newShapeIds,
        originX: Number(origin.x),
        originY: Number(origin.y),
        rotationDeg: 0,
        parentId: state.activeGroupId,
        layerId: state.activeLayerId,
    });

    // Clear preview and selection
    state.dlinePreview = null;
    state.selection.ids = [];

    if (options?.returnMeta) return { ok: true, newShapeIds: newShapeIds.slice(), groupId };
    return true;
}
