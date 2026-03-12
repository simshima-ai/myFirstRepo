import { nextShapeId, addShape, addGroup, nextGroupId } from "./state.js";
import { segmentIntersectionParamPoint, segmentCircleIntersectionPoints, lineCircleInfiniteIntersectionPoints, circleCircleIntersectionPoints, isAngleOnArc } from "./solvers.js";
import { getEffectiveGridSize, snapPoint } from "./geom.js";
import { sampleBSplinePoints } from "./bspline_utils.js";

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
    const midLen = Math.hypot(pb.x - pa.x, pb.y - pa.y);
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
    const extraMid = {
        baseId: nextVirtualBaseIdRef.val--,
        rootBaseId: trunkRootBaseId,
        side: Number(trunkObj.side),
        x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y
    };
    trunkObj.rootBaseId = trunkRootBaseId;
    trunkObj.x2 = pa.x;
    trunkObj.y2 = pa.y;
    // Keep center bridge at branch junctions to avoid dropped inside segment
    // on multi-line connected shapes (e.g. connected squares).
    if (midLen > 1e-9) offsetLines.push(extraMid);
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

function collectHighDegreeBaseJunctions(baseLines, eps = 1e-6) {
    const e = Math.max(1e-9, Number(eps) || 1e-6);
    const keyOf = (x, y) => `${Math.round(Number(x) / e)}:${Math.round(Number(y) / e)}`;
    const map = new Map();
    for (const l of (baseLines || [])) {
        if (!l || String(l.type || "line") !== "line") continue;
        const id = Number(l.id);
        const p1 = { x: Number(l.x1), y: Number(l.y1), end: "p1" };
        const p2 = { x: Number(l.x2), y: Number(l.y2), end: "p2" };
        for (const p of [p1, p2]) {
            if (![p.x, p.y].every(Number.isFinite)) continue;
            const k = keyOf(p.x, p.y);
            if (!map.has(k)) map.set(k, { x: p.x, y: p.y, incidences: [] });
            map.get(k).incidences.push({ lineId: id, endKey: p.end });
        }
    }
    return Array.from(map.values()).filter((j) => (j?.incidences?.length || 0) >= 3);
}

function collectTJunctionsFromAdjPairs(baseAdjPairs, eps = 1e-6) {
    const e = Math.max(1e-9, Number(eps) || 1e-6);
    const keyOf = (x, y) => `${Math.round(Number(x) / e)}:${Math.round(Number(y) / e)}`;
    const map = new Map();
    const ensure = (x, y) => {
        const k = keyOf(x, y);
        if (!map.has(k)) map.set(k, { x: Number(x), y: Number(y), incidences: [] });
        return map.get(k);
    };
    for (const p of (baseAdjPairs || [])) {
        const jx = Number(p?.junctionX), jy = Number(p?.junctionY);
        if (![jx, jy].every(Number.isFinite)) continue;
        if (!((p?.aEnd && !p?.bEnd) || (!p?.aEnd && p?.bEnd))) continue;
        const j = ensure(jx, jy);
        const aId = Number(p?.aId), bId = Number(p?.bId);
        if (Number.isFinite(aId)) j.incidences.push({ lineId: aId, endKey: p?.aEnd || null });
        if (Number.isFinite(bId)) j.incidences.push({ lineId: bId, endKey: p?.bEnd || null });
    }
    return Array.from(map.values()).filter((j) => (j?.incidences?.length || 0) >= 2);
}

function findClosestOffsetEndpointForTarget(offsetLines, lineId, side, targetPt, tol = 1e-5) {
    const t = Math.max(1e-9, Number(tol) || 1e-5);
    let best = null;
    let bestDist = Infinity;
    for (const o of (offsetLines || [])) {
        if (!o) continue;
        if (Number(o.side) !== Number(side)) continue;
        const rb = Number(o.rootBaseId ?? o.baseId);
        if (rb !== Number(lineId)) continue;
        const p1 = { x: Number(o.x1), y: Number(o.y1), endKey: "p1", obj: o };
        const p2 = { x: Number(o.x2), y: Number(o.y2), endKey: "p2", obj: o };
        for (const p of [p1, p2]) {
            if (![p.x, p.y].every(Number.isFinite)) continue;
            const d = Math.hypot(Number(p.x) - Number(targetPt.x), Number(p.y) - Number(targetPt.y));
            if (d < bestDist) {
                bestDist = d;
                best = p;
            }
        }
    }
    if (!best || bestDist > t) return null;
    return best;
}

function expectedOffsetEndpointFromBase(line, endKey, side, offsetDist) {
    const x1 = Number(line?.x1), y1 = Number(line?.y1), x2 = Number(line?.x2), y2 = Number(line?.y2);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-9) return null;
    const tx = dx / len, ty = dy / len;
    const nx = -ty * Number(side), ny = tx * Number(side);
    const bx = (endKey === "p2") ? x2 : x1;
    const by = (endKey === "p2") ? y2 : y1;
    return { x: bx + nx * Number(offsetDist), y: by + ny * Number(offsetDist) };
}

function hasConnectorLike(offsetLines, pA, pB, tol = 1e-8) {
    const t = Math.max(1e-10, Number(tol) || 1e-8);
    for (const o of (offsetLines || [])) {
        if (!o || String(o.type || "line") !== "line") continue;
        const a1 = { x: Number(o.x1), y: Number(o.y1) };
        const a2 = { x: Number(o.x2), y: Number(o.y2) };
        if (![a1.x, a1.y, a2.x, a2.y].every(Number.isFinite)) continue;
        const dDir = Math.hypot(a1.x - Number(pA.x), a1.y - Number(pA.y)) + Math.hypot(a2.x - Number(pB.x), a2.y - Number(pB.y));
        const dRev = Math.hypot(a1.x - Number(pB.x), a1.y - Number(pB.y)) + Math.hypot(a2.x - Number(pA.x), a2.y - Number(pA.y));
        if (Math.min(dDir, dRev) <= t) return true;
    }
    return false;
}

function bridgeMissingHighDegreeJunctionSegments(offsetLines, baseLines, nextVirtualBaseIdRef, offsetDist, baseAdjPairs = null) {
    const joints = collectHighDegreeBaseJunctions(baseLines, 1e-6);
    const tJoints = collectTJunctionsFromAdjPairs(baseAdjPairs, 1e-6);
    for (const tj of tJoints) joints.push(tj);
    if (!joints.length) return;
    const endpointTol = 1e-3;
    const baseById = new Map((baseLines || []).filter((l) => l && String(l.type || "line") === "line").map((l) => [Number(l.id), l]));
    const connectByAngularOrder = (pts, joint, side) => {
        if (!Array.isArray(pts) || pts.length < 2) return;
        const angPts = pts
            .map((p) => ({
                x: Number(p.x),
                y: Number(p.y),
                lineId: Number(p.lineId),
                ang: Math.atan2(Number(p.y) - Number(joint.y), Number(p.x) - Number(joint.x)),
            }))
            .filter((p) => [p.x, p.y, p.ang].every(Number.isFinite));
        if (angPts.length < 2) return;
        angPts.sort((a, b) => Number(a.ang) - Number(b.ang));
        let cutIdx = 0;
        let maxGap = -1;
        for (let i = 0; i < angPts.length; i++) {
            const a = Number(angPts[i].ang);
            const b = Number(angPts[(i + 1) % angPts.length].ang);
            let gap = b - a;
            if (gap <= 0) gap += Math.PI * 2;
            if (gap > maxGap) {
                maxGap = gap;
                cutIdx = i;
            }
        }
        const ordered = [];
        for (let k = 0; k < angPts.length; k++) {
            ordered.push(angPts[(cutIdx + 1 + k) % angPts.length]);
        }
        for (let i = 0; i < ordered.length - 1; i++) {
            const pA = ordered[i];
            const pB = ordered[i + 1];
            if (Math.hypot(Number(pA.x) - Number(pB.x), Number(pA.y) - Number(pB.y)) <= 1e-9) continue;
            if (hasConnectorLike(offsetLines, pA, pB, 1e-8)) continue;
            offsetLines.push({
                baseId: nextVirtualBaseIdRef.val--,
                rootBaseId: Number.isFinite(Number(pA.lineId)) ? Number(pA.lineId) : Number(pB.lineId),
                side: Number(side),
                x1: Number(pA.x),
                y1: Number(pA.y),
                x2: Number(pB.x),
                y2: Number(pB.y),
            });
        }
    };
    for (const j of joints) {
        for (const side of [1, -1]) {
            const pts = [];
            for (const inc of (j.incidences || [])) {
                const base = baseById.get(Number(inc.lineId));
                if (!base) continue;
                const expected = expectedOffsetEndpointFromBase(base, inc.endKey, side, offsetDist);
                if (!expected) continue;
                const ep = findClosestOffsetEndpointForTarget(offsetLines, inc.lineId, side, expected, Math.max(endpointTol, Number(offsetDist) * 0.75));
                if (!ep) continue;
                pts.push({ x: Number(ep.x), y: Number(ep.y), lineId: Number(inc.lineId) });
            }
            const uniq = [];
            for (const p of pts) {
                let hit = false;
                for (const q of uniq) {
                    if (Math.hypot(Number(p.x) - Number(q.x), Number(p.y) - Number(q.y)) <= 1e-6) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) uniq.push(p);
            }
            connectByAngularOrder(uniq, j, side);

            // Fallback pass: use actual current endpoints around the junction
            // to catch points left unconnected by expected-endpoint matching.
            const lineIdSet = new Set((j.incidences || []).map((inc) => Number(inc?.lineId)).filter(Number.isFinite));
            const searchR = Math.max(endpointTol * 8, Math.abs(Number(offsetDist) || 0) * 2.2);
            const around = [];
            for (const o of (offsetLines || [])) {
                if (!o || String(o.type || "line") !== "line") continue;
                if (Number(o.side) !== Number(side)) continue;
                const rb = Number(o.rootBaseId ?? o.baseId);
                if (!lineIdSet.has(rb)) continue;
                const ends = [
                    { x: Number(o.x1), y: Number(o.y1), lineId: rb },
                    { x: Number(o.x2), y: Number(o.y2), lineId: rb },
                ];
                for (const ep of ends) {
                    if (![ep.x, ep.y].every(Number.isFinite)) continue;
                    if (Math.hypot(Number(ep.x) - Number(j.x), Number(ep.y) - Number(j.y)) > searchR) continue;
                    around.push(ep);
                }
            }
            const aroundUniq = [];
            for (const p of around) {
                let hit = false;
                for (const q of aroundUniq) {
                    if (Math.hypot(Number(p.x) - Number(q.x), Number(p.y) - Number(q.y)) <= 1e-6) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) aroundUniq.push(p);
            }
            connectByAngularOrder(aroundUniq, j, side);
        }
    }
}

function completeMissingByIntersectionGraph(offsetLines, baseAdjPairs, nextVirtualBaseIdRef, eps = 1e-6) {
    const e = Math.max(1e-9, Number(eps) || 1e-6);
    if (!Array.isArray(offsetLines) || offsetLines.length < 2 || !Array.isArray(baseAdjPairs) || !baseAdjPairs.length) return;

    // 1) Keep one representative segment per side:baseLine for vector/t-parameter queries.
    const repByLineKey = new Map();
    for (const o of offsetLines) {
        if (!o || String(o.type || "line") !== "line") continue;
        const side = (Number(o.side) === -1) ? -1 : 1;
        const root = Number(o.rootBaseId ?? o.baseId);
        if (!Number.isFinite(root)) continue;
        const lk = `${side}:${root}`;
        const len = Math.hypot(Number(o.x2) - Number(o.x1), Number(o.y2) - Number(o.y1));
        const prev = repByLineKey.get(lk);
        const prevLen = prev ? Math.hypot(Number(prev.x2) - Number(prev.x1), Number(prev.y2) - Number(prev.y1)) : -1;
        if (!prev || len > prevLen) repByLineKey.set(lk, o);
    }

    // 2) Build intersection node list (keep existing intersection calculation policy).
    const nodes = [];
    const nodeKey = (x, y) => `${Math.round(Number(x) / e)}:${Math.round(Number(y) / e)}`;
    const nodeIdxByKey = new Map();
    const ensureNode = (x, y) => {
        const k = nodeKey(x, y);
        if (nodeIdxByKey.has(k)) return nodeIdxByKey.get(k);
        const idx = nodes.length;
        nodes.push({ id: idx, x: Number(x), y: Number(y), lineKeys: new Set() });
        nodeIdxByKey.set(k, idx);
        return idx;
    };
    const isPairActiveOnSide = (p, side) => {
        if (p?.aEnd && p?.bEnd) return true;
        if (p?.aEnd && !p?.bEnd) return Number(p?.trunkSide) === Number(side);
        if (!p?.aEnd && p?.bEnd) return Number(p?.trunkSide) === Number(side);
        return false;
    };
    for (const p of baseAdjPairs) {
        const aId = Number(p?.aId), bId = Number(p?.bId);
        if (!Number.isFinite(aId) || !Number.isFinite(bId)) continue;
        for (const side of [1, -1]) {
            if (!isPairActiveOnSide(p, side)) continue;
            const oa = repByLineKey.get(`${side}:${aId}`);
            const ob = repByLineKey.get(`${side}:${bId}`);
            if (!oa || !ob) continue;
            const ip = lineLineIp(oa, ob);
            if (!ip || !Number.isFinite(Number(ip.x)) || !Number.isFinite(Number(ip.y))) continue;
            const ni = ensureNode(Number(ip.x), Number(ip.y));
            nodes[ni].lineKeys.add(`${side}:${aId}`);
            nodes[ni].lineKeys.add(`${side}:${bId}`);
        }
    }
    if (!nodes.length) return;

    // 3) Build per-line ordered node table.
    const nodesByLineKey = new Map();
    for (const n of nodes) {
        for (const lk of n.lineKeys) {
            if (!nodesByLineKey.has(lk)) nodesByLineKey.set(lk, []);
            nodesByLineKey.get(lk).push(n);
        }
    }
    const orderedByLineKey = new Map();
    for (const [lk, arr] of nodesByLineKey.entries()) {
        const rep = repByLineKey.get(String(lk));
        if (!rep || !Array.isArray(arr) || arr.length < 2) continue;
        const x1 = Number(rep.x1), y1 = Number(rep.y1), x2 = Number(rep.x2), y2 = Number(rep.y2);
        const dx = x2 - x1, dy = y2 - y1;
        const len2 = dx * dx + dy * dy;
        if (len2 <= 1e-12) continue;
        const sorted = arr
            .map((n) => ({ n, t: ((Number(n.x) - x1) * dx + (Number(n.y) - y1) * dy) / len2 }))
            .filter((it) => Number.isFinite(it.t))
            .sort((a, b) => Number(a.t) - Number(b.t));
        if (sorted.length >= 2) orderedByLineKey.set(String(lk), sorted);
    }

    // 4) Maintain connection list with duplicate guard.
    const connList = [];
    const connKeySet = new Set();
    const addConn = (side, aId, bId, lineId) => {
        if (!Number.isFinite(aId) || !Number.isFinite(bId) || aId === bId) return false;
        const u = Math.min(Number(aId), Number(bId));
        const v = Math.max(Number(aId), Number(bId));
        const s = (Number(side) === -1) ? -1 : 1;
        const key = `${s}:${u}:${v}`;
        if (connKeySet.has(key)) return false;
        connKeySet.add(key);
        connList.push({ side: s, aId: u, bId: v, lineId: Number(lineId) });
        return true;
    };

    // Seed existing connections that already match node-node segments.
    for (const o of offsetLines) {
        if (!o || String(o.type || "line") !== "line") continue;
        const a = ensureNode(Number(o.x1), Number(o.y1));
        const b = ensureNode(Number(o.x2), Number(o.y2));
        const root = Number(o.rootBaseId ?? o.baseId);
        addConn(Number(o.side), a, b, root);
    }

    const degreeOf = (nodeId) => {
        let d = 0;
        for (const c of connList) {
            if (Number(c.aId) === Number(nodeId) || Number(c.bId) === Number(nodeId)) d++;
        }
        return d;
    };

    // 5) Queue process: for each node, find up to 2 connections.
    const queue = nodes.map((n) => Number(n.id)).filter(Number.isFinite);
    const visited = new Set();
    while (queue.length) {
        const nid = Number(queue.shift());
        if (!Number.isFinite(nid) || visited.has(nid)) continue;
        visited.add(nid);
        const n = nodes[nid];
        if (!n) continue;
        let deg = degreeOf(nid);
        if (deg >= 2) continue;

        const candidates = [];
        const pushCandidate = (lk, otherNode, distScore) => {
            if (!otherNode) return;
            const oid = Number(otherNode.id);
            if (!Number.isFinite(oid) || oid === nid) return;
            const p = String(lk).split(":");
            const side = (Number(p[0]) === -1) ? -1 : 1;
            const lineId = Number(p[1]);
            if (!Number.isFinite(lineId)) return;
            const u = Math.min(nid, oid), v = Math.max(nid, oid);
            const key = `${side}:${u}:${v}`;
            if (connKeySet.has(key)) return;
            if (!Number.isFinite(Number(distScore)) || Number(distScore) <= 1e-9) return;
            candidates.push({ side, lineId, otherId: oid, score: Number(distScore) });
        };

        for (const lk of (n.lineKeys || [])) {
            const sorted = orderedByLineKey.get(String(lk));
            if (!sorted || sorted.length < 2) continue;
            let idx = -1;
            for (let i = 0; i < sorted.length; i++) {
                if (Number(sorted[i].n.id) === nid) { idx = i; break; }
            }
            if (idx < 0) continue;
            if (idx > 0) {
                const prev = sorted[idx - 1].n;
                const d = Math.hypot(Number(prev.x) - Number(n.x), Number(prev.y) - Number(n.y));
                pushCandidate(lk, prev, d);
            }
            if (idx + 1 < sorted.length) {
                const next = sorted[idx + 1].n;
                const d = Math.hypot(Number(next.x) - Number(n.x), Number(next.y) - Number(n.y));
                pushCandidate(lk, next, d);
            }
        }
        candidates.sort((a, b) => Number(a.score) - Number(b.score));
        for (const c of candidates) {
            if (deg >= 2) break;
            if (addConn(c.side, nid, c.otherId, c.lineId)) {
                deg = degreeOf(nid);
            }
        }
    }

    // 6) Draw all missing lines in one batch from connection list.
    for (const c of connList) {
        const a = nodes[Number(c.aId)];
        const b = nodes[Number(c.bId)];
        if (!a || !b) continue;
        const exists = (offsetLines || []).some((o) => {
            if (!o || String(o.type || "line") !== "line") return false;
            const side = (Number(o.side) === -1) ? -1 : 1;
            if (side !== Number(c.side)) return false;
            const ax = Number(o.x1), ay = Number(o.y1), bx = Number(o.x2), by = Number(o.y2);
            const dDir = Math.hypot(ax - Number(a.x), ay - Number(a.y)) + Math.hypot(bx - Number(b.x), by - Number(b.y));
            const dRev = Math.hypot(ax - Number(b.x), ay - Number(b.y)) + Math.hypot(bx - Number(a.x), by - Number(a.y));
            return Math.min(dDir, dRev) <= e * 2;
        });
        if (exists) continue;
        offsetLines.push({
            baseId: nextVirtualBaseIdRef.val--,
            rootBaseId: Number(c.lineId),
            side: Number(c.side),
            x1: Number(a.x),
            y1: Number(a.y),
            x2: Number(b.x),
            y2: Number(b.y),
        });
    }
}

function trimOffsetLineConnections(offsetLines, baseAdjPairs, baseLines = null, offsetDist = 0) {
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
    bridgeMissingHighDegreeJunctionSegments(offsetLines, baseLines, nextVirtualBaseIdRef, offsetDist, baseAdjPairs);
    completeMissingByIntersectionGraph(offsetLines, baseAdjPairs, nextVirtualBaseIdRef, 1e-6);
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
        rootBaseId: Number.isFinite(Number(baseLine.rootBaseId)) ? Number(baseLine.rootBaseId) : Number(baseLine.id),
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

export function expandDoubleLineBasesFromSelection(state) {
    const selected = (state.selection?.ids || [])
        .map((id) => state.shapes.find((s) => Number(s.id) === Number(id)))
        .filter((s) => !!s);
    const expanded = [];
    const sourceByExpandedId = new Map();
    let virtualLineId = -1;
    for (const s of selected) {
        const t = String(s?.type || "");
        if (t === "line" || t === "circle" || t === "arc") {
            expanded.push(s);
            sourceByExpandedId.set(Number(s.id), s);
            continue;
        }
        if (t !== "polyline") continue;
        const pts = Array.isArray(s.points) ? s.points : [];
        if (pts.length < 2) continue;
        const makeLine = (a, b) => {
            const x1 = Number(a?.x), y1 = Number(a?.y), x2 = Number(b?.x), y2 = Number(b?.y);
            if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
            if (Math.hypot(x2 - x1, y2 - y1) <= 1e-9) return null;
            return {
                id: virtualLineId--,
                type: "line",
                x1, y1, x2, y2,
                rootBaseId: Number(s.id)
            };
        };
        for (let i = 0; i < pts.length - 1; i++) {
            const seg = makeLine(pts[i], pts[i + 1]);
            if (!seg) continue;
            expanded.push(seg);
            sourceByExpandedId.set(Number(seg.id), s);
        }
        if (s.closed) {
            const seg = makeLine(pts[pts.length - 1], pts[0]);
            if (seg) {
                expanded.push(seg);
                sourceByExpandedId.set(Number(seg.id), s);
            }
        }
        continue;
    }
    for (const s of selected) {
        const t = String(s?.type || "");
        if (t !== "bspline") continue;
        const sampled = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
        if (!Array.isArray(sampled) || sampled.length < 2) continue;
        const makeLine = (a, b) => {
            const x1 = Number(a?.x), y1 = Number(a?.y), x2 = Number(b?.x), y2 = Number(b?.y);
            if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
            if (Math.hypot(x2 - x1, y2 - y1) <= 1e-9) return null;
            return {
                id: virtualLineId--,
                type: "line",
                x1, y1, x2, y2,
                rootBaseId: Number(s.id)
            };
        };
        for (let i = 0; i < sampled.length - 1; i++) {
            const seg = makeLine(sampled[i], sampled[i + 1]);
            if (!seg) continue;
            expanded.push(seg);
            sourceByExpandedId.set(Number(seg.id), s);
        }
    }
    return { bases: expanded, sourceByExpandedId };
}

function computeLineSideFromMouse(line, mousePt) {
    if (!line || !mousePt) return 1;
    const x1 = Number(line.x1), y1 = Number(line.y1), x2 = Number(line.x2), y2 = Number(line.y2);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-9) return 1;
    const tx = dx / len, ty = dy / len;
    const nx = -ty, ny = tx;
    const t = Math.max(0, Math.min(len, (mousePt.x - x1) * tx + (mousePt.y - y1) * ty));
    const qx = x1 + tx * t, qy = y1 + ty * t;
    return ((mousePt.x - qx) * nx + (mousePt.y - qy) * ny) >= 0 ? 1 : -1;
}

function getOffsetEndpointForLine(line, endKey, sign, offsetDist) {
    const x1 = Number(line.x1), y1 = Number(line.y1), x2 = Number(line.x2), y2 = Number(line.y2);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-9) return null;
    const tx = dx / len, ty = dy / len;
    const nx = -ty * Number(sign), ny = tx * Number(sign);
    const bx = (endKey === "p2") ? x2 : x1;
    const by = (endKey === "p2") ? y2 : y1;
    return { x: bx + nx * Number(offsetDist), y: by + ny * Number(offsetDist) };
}

function getOffsetEndpointForArc(arc, endKey, sign, offsetDist) {
    if (!arc) return null;
    const cx = Number(arc.cx), cy = Number(arc.cy), r0 = Number(arc.r);
    const a1 = Number(arc.a1), a2 = Number(arc.a2);
    if (![cx, cy, r0, a1, a2].every(Number.isFinite)) return null;
    const r = r0 + Number(sign) * Number(offsetDist);
    if (!(r > 1e-9)) return null;
    const th = (endKey === "a2") ? a2 : a1;
    return { x: cx + Math.cos(th) * r, y: cy + Math.sin(th) * r };
}

function computeArcSideFromMouse(arc, mousePt) {
    if (!arc || !mousePt) return 1;
    const cx = Number(arc.cx), cy = Number(arc.cy), r0 = Number(arc.r);
    if (![cx, cy, r0].every(Number.isFinite)) return 1;
    const d = Math.hypot(Number(mousePt.x) - cx, Number(mousePt.y) - cy);
    return d >= r0 ? 1 : -1;
}

function computeConnectedSingleSigns(lines, mousePt, offsetDist) {
    const out = {};
    const arr = Array.isArray(lines) ? lines.slice() : [];
    if (!arr.length) return out;
    const byId = new Map(arr.map((l) => [Number(l.id), l]));
    // Use a looser endpoint tolerance for side propagation so tiny numeric gaps
    // do not split one intended chain into multiple components.
    const chainTol = Math.max(1e-3, Math.abs(Number(offsetDist) || 0) * 1e-2);
    const pairs = findAdjacentBaseLinePairs(arr, chainTol).filter((p) => !!p && p.aEnd && p.bEnd);
    const adj = new Map();
    const addAdj = (fromId, fromEnd, toId, toEnd) => {
        const fid = Number(fromId), tid = Number(toId);
        if (!Number.isFinite(fid) || !Number.isFinite(tid)) return;
        if (!adj.has(fid)) adj.set(fid, []);
        adj.get(fid).push({ toId: tid, fromEnd, toEnd });
    };
    for (const p of pairs) {
        addAdj(p.aId, p.aEnd, p.bId, p.bEnd);
        addAdj(p.bId, p.bEnd, p.aId, p.aEnd);
    }
    const unvisited = new Set(arr.map((l) => Number(l.id)));
    const pickSeedId = () => {
        if (!mousePt) return unvisited.values().next().value;
        let bestId = null;
        let bestDist = Infinity;
        for (const id of unvisited) {
            const l = byId.get(Number(id));
            if (!l) continue;
            const x1 = Number(l.x1), y1 = Number(l.y1), x2 = Number(l.x2), y2 = Number(l.y2);
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (len <= 1e-9) continue;
            const tx = dx / len, ty = dy / len;
            const t = Math.max(0, Math.min(len, (mousePt.x - x1) * tx + (mousePt.y - y1) * ty));
            const qx = x1 + tx * t, qy = y1 + ty * t;
            const d = Math.hypot(Number(mousePt.x) - qx, Number(mousePt.y) - qy);
            if (d < bestDist) { bestDist = d; bestId = Number(id); }
        }
        return (bestId != null) ? bestId : unvisited.values().next().value;
    };
    while (unvisited.size) {
        const seedId = Number(pickSeedId());
        if (!Number.isFinite(seedId)) break;
        const seedLine = byId.get(seedId);
        const seedSign = computeLineSideFromMouse(seedLine, mousePt);
        out[seedId] = (seedSign === -1) ? -1 : 1;
        const q = [seedId];
        unvisited.delete(seedId);
        while (q.length) {
            const curId = Number(q.shift());
            const curLine = byId.get(curId);
            const curSign = (out[curId] === -1) ? -1 : 1;
            const neighbors = adj.get(curId) || [];
            for (const e of neighbors) {
                const nid = Number(e.toId);
                if (!Number.isFinite(nid) || !byId.has(nid) || out[nid] === 1 || out[nid] === -1) continue;
                const nextLine = byId.get(nid);
                const pCur = getOffsetEndpointForLine(curLine, e.fromEnd, curSign, offsetDist);
                const pSame = getOffsetEndpointForLine(nextLine, e.toEnd, curSign, offsetDist);
                const pFlip = getOffsetEndpointForLine(nextLine, e.toEnd, -curSign, offsetDist);
                if (!pCur || !pSame || !pFlip) continue;
                const dSame = Math.hypot(Number(pCur.x) - Number(pSame.x), Number(pCur.y) - Number(pSame.y));
                const dFlip = Math.hypot(Number(pCur.x) - Number(pFlip.x), Number(pCur.y) - Number(pFlip.y));
                out[nid] = (dSame <= dFlip) ? curSign : -curSign;
                unvisited.delete(nid);
                q.push(nid);
            }
        }
        // If disconnected members remain in this component due missing adjacency, they will be seeded in next loop.
    }
    return out;
}

function findAdjacentBaseArcPairs(arcs, tol = 1e-4) {
    const eps = Math.max(1e-9, Number(tol) || 1e-4);
    const out = [];
    const ep = (a, key) => {
        const th = (key === "a2") ? Number(a.a2) : Number(a.a1);
        return {
            x: Number(a.cx) + Math.cos(th) * Number(a.r),
            y: Number(a.cy) + Math.sin(th) * Number(a.r),
            key,
        };
    };
    for (let i = 0; i < arcs.length; i++) {
        for (let j = i + 1; j < arcs.length; j++) {
            const a = arcs[i], b = arcs[j];
            const ae = [ep(a, "a1"), ep(a, "a2")];
            const be = [ep(b, "a1"), ep(b, "a2")];
            let best = null;
            let bestD = Infinity;
            for (const pa of ae) for (const pb of be) {
                const d = Math.hypot(Number(pa.x) - Number(pb.x), Number(pa.y) - Number(pb.y));
                if (d <= eps && d < bestD) {
                    bestD = d;
                    best = { aEnd: pa.key, bEnd: pb.key };
                }
            }
            if (best) {
                out.push({
                    aId: Number(a.id),
                    bId: Number(b.id),
                    aEnd: best.aEnd,
                    bEnd: best.bEnd,
                });
            }
        }
    }
    return out;
}

function computeConnectedSingleArcSigns(arcs, mousePt, offsetDist) {
    const out = {};
    const arr = Array.isArray(arcs) ? arcs.slice() : [];
    if (!arr.length) return out;
    const byId = new Map(arr.map((a) => [Number(a.id), a]));
    const chainTol = Math.max(1e-3, Math.abs(Number(offsetDist) || 0) * 1e-2);
    const pairs = findAdjacentBaseArcPairs(arr, chainTol);
    const adj = new Map();
    const addAdj = (fromId, fromEnd, toId, toEnd) => {
        const fid = Number(fromId), tid = Number(toId);
        if (!Number.isFinite(fid) || !Number.isFinite(tid)) return;
        if (!adj.has(fid)) adj.set(fid, []);
        adj.get(fid).push({ toId: tid, fromEnd, toEnd });
    };
    for (const p of pairs) {
        addAdj(p.aId, p.aEnd, p.bId, p.bEnd);
        addAdj(p.bId, p.bEnd, p.aId, p.aEnd);
    }
    const unvisited = new Set(arr.map((a) => Number(a.id)));
    const pickSeedId = () => {
        if (!mousePt) return unvisited.values().next().value;
        let bestId = null;
        let bestDist = Infinity;
        for (const id of unvisited) {
            const a = byId.get(Number(id));
            if (!a) continue;
            const cx = Number(a.cx), cy = Number(a.cy), r0 = Number(a.r);
            if (![cx, cy, r0].every(Number.isFinite)) continue;
            const d = Math.abs(Math.hypot(Number(mousePt.x) - cx, Number(mousePt.y) - cy) - r0);
            if (d < bestDist) {
                bestDist = d;
                bestId = Number(id);
            }
        }
        return (bestId != null) ? bestId : unvisited.values().next().value;
    };
    while (unvisited.size) {
        const seedId = Number(pickSeedId());
        if (!Number.isFinite(seedId)) break;
        const seedArc = byId.get(seedId);
        const seedSign = computeArcSideFromMouse(seedArc, mousePt);
        out[seedId] = (seedSign === -1) ? -1 : 1;
        const q = [seedId];
        unvisited.delete(seedId);
        while (q.length) {
            const curId = Number(q.shift());
            const curArc = byId.get(curId);
            const curSign = (out[curId] === -1) ? -1 : 1;
            const neighbors = adj.get(curId) || [];
            for (const e of neighbors) {
                const nid = Number(e.toId);
                if (!Number.isFinite(nid) || !byId.has(nid) || out[nid] === 1 || out[nid] === -1) continue;
                const nextArc = byId.get(nid);
                const pCur = getOffsetEndpointForArc(curArc, e.fromEnd, curSign, offsetDist);
                const pSame = getOffsetEndpointForArc(nextArc, e.toEnd, curSign, offsetDist);
                const pFlip = getOffsetEndpointForArc(nextArc, e.toEnd, -curSign, offsetDist);
                if (!pCur || !pSame || !pFlip) continue;
                const dSame = Math.hypot(Number(pCur.x) - Number(pSame.x), Number(pCur.y) - Number(pSame.y));
                const dFlip = Math.hypot(Number(pCur.x) - Number(pFlip.x), Number(pCur.y) - Number(pFlip.y));
                out[nid] = (dSame <= dFlip) ? curSign : -curSign;
                unvisited.delete(nid);
                q.push(nid);
            }
        }
    }
    return out;
}

function pointToSegmentDistance(p, l) {
    const x1 = Number(l.x1), y1 = Number(l.y1), x2 = Number(l.x2), y2 = Number(l.y2);
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len <= 1e-9) return Infinity;
    const tx = dx / len, ty = dy / len;
    const t = Math.max(0, Math.min(len, (Number(p.x) - x1) * tx + (Number(p.y) - y1) * ty));
    const qx = x1 + tx * t, qy = y1 + ty * t;
    return Math.hypot(Number(p.x) - qx, Number(p.y) - qy);
}

function pointToArcRadialDistance(p, a) {
    const cx = Number(a.cx), cy = Number(a.cy), r = Number(a.r);
    if (![cx, cy, r].every(Number.isFinite)) return Infinity;
    return Math.abs(Math.hypot(Number(p.x) - cx, Number(p.y) - cy) - r);
}

function computeConnectedSingleMixedSigns(lines, arcs, mousePt, offsetDist) {
    const lineArr = Array.isArray(lines) ? lines.slice() : [];
    const arcArr = Array.isArray(arcs) ? arcs.slice() : [];
    const outLine = {};
    const outArc = {};
    if (!lineArr.length && !arcArr.length) return { lineSigns: outLine, arcSigns: outArc };

    const lineById = new Map(lineArr.map((l) => [Number(l.id), l]));
    const arcById = new Map(arcArr.map((a) => [Number(a.id), a]));

    const chainTol = Math.max(1e-3, Math.abs(Number(offsetDist) || 0) * 1e-2);
    const ll = findAdjacentBaseLinePairs(lineArr, chainTol).filter((p) => !!p && p.aEnd && p.bEnd);
    const aa = findAdjacentBaseArcPairs(arcArr, chainTol);
    const la = findAdjacentLineArcPairs(lineArr, arcArr, chainTol);

    const adj = new Map();
    const addEdge = (fromKey, toKey, fromEnd, toEnd) => {
        if (!adj.has(fromKey)) adj.set(fromKey, []);
        adj.get(fromKey).push({ toKey, fromEnd, toEnd });
    };

    for (const p of ll) {
        const aKey = `L:${Number(p.aId)}`;
        const bKey = `L:${Number(p.bId)}`;
        addEdge(aKey, bKey, p.aEnd, p.bEnd);
        addEdge(bKey, aKey, p.bEnd, p.aEnd);
    }
    for (const p of aa) {
        const aKey = `A:${Number(p.aId)}`;
        const bKey = `A:${Number(p.bId)}`;
        addEdge(aKey, bKey, p.aEnd, p.bEnd);
        addEdge(bKey, aKey, p.bEnd, p.aEnd);
    }
    for (const p of la) {
        const lKey = `L:${Number(p.lineId)}`;
        const aKey = `A:${Number(p.arcId)}`;
        addEdge(lKey, aKey, p.lineEnd, p.arcEnd);
        addEdge(aKey, lKey, p.arcEnd, p.lineEnd);
    }

    const allKeys = [];
    for (const l of lineArr) allKeys.push(`L:${Number(l.id)}`);
    for (const a of arcArr) allKeys.push(`A:${Number(a.id)}`);
    const unvisited = new Set(allKeys);

    const getShapeByKey = (k) => {
        if (String(k).startsWith("L:")) return lineById.get(Number(String(k).slice(2)));
        return arcById.get(Number(String(k).slice(2)));
    };
    const isLineKey = (k) => String(k).startsWith("L:");
    const getSeedSign = (k) => {
        const s = getShapeByKey(k);
        return isLineKey(k) ? computeLineSideFromMouse(s, mousePt) : computeArcSideFromMouse(s, mousePt);
    };
    const getOffsetEndpointByKey = (k, endKey, sign) => {
        const s = getShapeByKey(k);
        if (!s) return null;
        return isLineKey(k)
            ? getOffsetEndpointForLine(s, endKey, sign, offsetDist)
            : getOffsetEndpointForArc(s, endKey, sign, offsetDist);
    };
    const getDistanceToMouse = (k) => {
        const s = getShapeByKey(k);
        if (!s || !mousePt) return 0;
        return isLineKey(k) ? pointToSegmentDistance(mousePt, s) : pointToArcRadialDistance(mousePt, s);
    };
    const setSign = (k, sg) => {
        const id = Number(String(k).slice(2));
        if (isLineKey(k)) outLine[id] = (sg === -1) ? -1 : 1;
        else outArc[id] = (sg === -1) ? -1 : 1;
    };
    const hasSign = (k) => {
        const id = Number(String(k).slice(2));
        const v = isLineKey(k) ? outLine[id] : outArc[id];
        return v === 1 || v === -1;
    };
    const getSign = (k) => {
        const id = Number(String(k).slice(2));
        const v = isLineKey(k) ? outLine[id] : outArc[id];
        return (v === -1) ? -1 : 1;
    };

    while (unvisited.size) {
        let seedKey = null;
        let bestDist = Infinity;
        for (const k of unvisited) {
            const d = getDistanceToMouse(k);
            if (d < bestDist) {
                bestDist = d;
                seedKey = k;
            }
        }
        if (!seedKey) seedKey = unvisited.values().next().value;
        if (!seedKey) break;

        setSign(seedKey, getSeedSign(seedKey));
        unvisited.delete(seedKey);
        const q = [seedKey];
        while (q.length) {
            const cur = q.shift();
            const curSign = getSign(cur);
            const neighbors = adj.get(cur) || [];
            for (const e of neighbors) {
                const nxt = String(e.toKey || "");
                if (!nxt || hasSign(nxt)) continue;
                const pCur = getOffsetEndpointByKey(cur, e.fromEnd, curSign);
                const pSame = getOffsetEndpointByKey(nxt, e.toEnd, curSign);
                const pFlip = getOffsetEndpointByKey(nxt, e.toEnd, -curSign);
                if (!pCur || !pSame || !pFlip) continue;
                const dSame = Math.hypot(Number(pCur.x) - Number(pSame.x), Number(pCur.y) - Number(pSame.y));
                const dFlip = Math.hypot(Number(pCur.x) - Number(pFlip.x), Number(pCur.y) - Number(pFlip.y));
                setSign(nxt, (dSame <= dFlip) ? curSign : -curSign);
                unvisited.delete(nxt);
                q.push(nxt);
            }
        }
    }

    return { lineSigns: outLine, arcSigns: outArc };
}

function computeSingleModeGlobalSign(bases, mousePt) {
    if (!Array.isArray(bases) || !bases.length || !mousePt) return 1;
    const lineBases = bases.filter(s => s && s.type === "line");
    if (lineBases.length) {
        let best = null;
        let bestDist = Infinity;
        for (const s of lineBases) {
            const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (len <= 1e-9) continue;
            const tx = dx / len, ty = dy / len;
            const nx = -ty, ny = tx;
            const t = Math.max(0, Math.min(len, (mousePt.x - x1) * tx + (mousePt.y - y1) * ty));
            const qx = x1 + tx * t, qy = y1 + ty * t;
            const dist = Math.hypot(Number(mousePt.x) - qx, Number(mousePt.y) - qy);
            if (dist < bestDist) {
                bestDist = dist;
                best = ((mousePt.x - qx) * nx + (mousePt.y - qy) * ny) >= 0 ? 1 : -1;
            }
        }
        if (best === 1 || best === -1) return best;
    }
    // Fallback for circle/arc-only selection.
    let best = 1;
    let bestDist = Infinity;
    for (const s of bases) {
        if (!s || (s.type !== "circle" && s.type !== "arc")) continue;
        const cx = Number(s.cx), cy = Number(s.cy), r0 = Number(s.r);
        if (![cx, cy, r0].every(Number.isFinite)) continue;
        const d = Math.hypot(Number(mousePt.x) - cx, Number(mousePt.y) - cy);
        const dr = Math.abs(d - r0);
        if (dr < bestDist) {
            bestDist = dr;
            best = d >= r0 ? 1 : -1;
        }
    }
    return (best === -1) ? -1 : 1;
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
                out.push({
                    aId: Number(a.id), bId: Number(b.id),
                    aEnd: pa.end, bEnd: null,
                    tBranch: 'a',
                    trunkSide: (dot >= 0 ? 1 : -1),
                    junctionX: Number(hit.x),
                    junctionY: Number(hit.y)
                });
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
                out.push({
                    aId: Number(a.id), bId: Number(b.id),
                    aEnd: null, bEnd: pb.end,
                    tBranch: 'b',
                    trunkSide: (dot >= 0 ? 1 : -1),
                    junctionX: Number(hit.x),
                    junctionY: Number(hit.y)
                });
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

function connectLineArcOffsets(offsets, lineArcPairs, lineBases = null, debugConnMarkers = null, lastSourceRef = null) {
    if (!Array.isArray(offsets) || !offsets.length || !Array.isArray(lineArcPairs) || !lineArcPairs.length) return;
    const lineMap = new Map();
    const arcMap = new Map();
    const baseLineMap = new Map((Array.isArray(lineBases) ? lineBases : [])
        .map((l) => [Number(l?.id), l])
        .filter((row) => Number.isFinite(Number(row[0]))));
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
    const signedSideOnBaseLine = (baseLine, pt) => {
        const x1 = Number(baseLine?.x1), y1 = Number(baseLine?.y1);
        const x2 = Number(baseLine?.x2), y2 = Number(baseLine?.y2);
        const px = Number(pt?.x), py = Number(pt?.y);
        if (![x1, y1, x2, y2, px, py].every(Number.isFinite)) return NaN;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len <= 1e-9) return NaN;
        const nx = -dy / len, ny = dx / len; // base normal (+ side)
        return (px - x1) * nx + (py - y1) * ny;
    };
    const baseSegs = Array.from(baseLineMap.values()).filter(Boolean);
    const segmentCrossCountOnBaseLines = (a, b, ignoreBaseId = NaN) => {
        const a1 = { x: Number(a?.x), y: Number(a?.y) };
        const a2 = { x: Number(b?.x), y: Number(b?.y) };
        if (![a1.x, a1.y, a2.x, a2.y].every(Number.isFinite)) return 9999;
        let count = 0;
        for (const s of baseSegs) {
            if (!s) continue;
            const sid = Number(s.id);
            if (Number.isFinite(ignoreBaseId) && sid === Number(ignoreBaseId)) continue;
            const b1 = { x: Number(s.x1), y: Number(s.y1) };
            const b2 = { x: Number(s.x2), y: Number(s.y2) };
            if (![b1.x, b1.y, b2.x, b2.y].every(Number.isFinite)) continue;
            const ip = segmentIntersectionParamPoint(a1, a2, b1, b2);
            if (!ip) continue;
            const t = Number(ip.t), u = Number(ip.u);
            if (!Number.isFinite(t) || !Number.isFinite(u)) continue;
            // Endpoint touch is allowed. Interior-interior crossing is penalized.
            if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) count += 1;
        }
        return count;
    };
    const pairs = lineArcPairs.slice().sort((a, b) => Number(a.dist || 0) - Number(b.dist || 0));
    for (const p of pairs) {
        const baseLine = baseLineMap.get(Number(p.lineId)) || null;
        for (const side of [1, -1]) {
            const lo = lineMap.get(`${Number(p.lineId)}:${side}`);
            if (!lo) continue;
            const anchor = getLineEnd(lo, p.lineEnd);
            const otherEnd = (p.lineEnd === "p2")
                ? { x: Number(lo.x1), y: Number(lo.y1) }
                : { x: Number(lo.x2), y: Number(lo.y2) };
            const aoSame = arcMap.get(`${Number(p.arcId)}:${side}`);
            const aoOpp = arcMap.get(`${Number(p.arcId)}:${-side}`);
            const candidates = [];
            if (aoSame) {
                const pt = arcEndPoint(aoSame, p.arcEnd);
                if ([Number(pt.x), Number(pt.y)].every(Number.isFinite)) {
                    const d = Math.hypot(Number(pt.x) - Number(anchor.x), Number(pt.y) - Number(anchor.y));
                    candidates.push({ pt, d, pref: 0 });
                }
            }
            if (aoOpp) {
                const pt = arcEndPoint(aoOpp, p.arcEnd);
                if ([Number(pt.x), Number(pt.y)].every(Number.isFinite)) {
                    const d = Math.hypot(Number(pt.x) - Number(anchor.x), Number(pt.y) - Number(anchor.y));
                    candidates.push({ pt, d, pref: 1 });
                }
            }
            if (!candidates.length) continue;
            // Prefer endpoint that stays on the same side of the source line.
            // This prevents final connection from flipping inner/outer.
            const scored = candidates.map((c) => {
                const ss = signedSideOnBaseLine(baseLine, c.pt);
                const sideMatch = Number.isFinite(ss) ? (Number(side) * Number(ss) >= -1e-7 ? 1 : 0) : 0;
                const crossCount = segmentCrossCountOnBaseLines(otherEnd, c.pt, Number(p.lineId));
                return { ...c, sideMatch, crossCount };
            });
            scored.sort((a, b) =>
                Number(b.sideMatch) - Number(a.sideMatch)
                || Number(a.crossCount) - Number(b.crossCount)
                || Number(a.d) - Number(b.d)
                || Number(a.pref) - Number(b.pref)
            );
            const picked = scored[0]?.pt;
            if (debugConnMarkers && picked) {
                const rr = Math.max(0.4, Math.abs(Number(lo?.side) || 1) * 0.0 + 0.7);
                debugConnMarkers.push({
                    type: "circle",
                    cx: Number(anchor.x),
                    cy: Number(anchor.y),
                    r: rr,
                    color: "#f59e0b", // start
                });
                debugConnMarkers.push({
                    type: "circle",
                    cx: Number(picked.x),
                    cy: Number(picked.y),
                    r: rr,
                    color: "#06b6d4", // end
                });
            }
            if (lastSourceRef && typeof lastSourceRef === "object") {
                const bx = (p.lineEnd === "p2") ? Number(baseLine?.x2) : Number(baseLine?.x1);
                const by = (p.lineEnd === "p2") ? Number(baseLine?.y2) : Number(baseLine?.y1);
                if (Number.isFinite(bx) && Number.isFinite(by)) {
                    lastSourceRef.point = { x: bx, y: by };
                }
            }
            setLineEnd(lo, p.lineEnd, picked);
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
    const { bases } = expandDoubleLineBasesFromSelection(state);
    if (bases.length === 0) return null;
    // Fix selection order dependency
    bases.sort((a, b) => Number(a.id) - Number(b.id));
    const off = Number(state.dlineSettings?.offset) || 5;
    const mode = state.dlineSettings?.mode || 'both';
    const lineBases = bases.filter(s => s.type === 'line');
    const arcBases = bases.filter(s => s.type === 'arc');
    const globalSingleSign = (mode === 'single') ? computeSingleModeGlobalSign(bases, mousePt) : 1;
    const mixedSigns = (mode === 'single' && mousePt)
        ? computeConnectedSingleMixedSigns(lineBases, arcBases, mousePt, off)
        : null;
    const signsMap = mixedSigns?.lineSigns || null;
    const arcSignsMap = mixedSigns?.arcSigns || null;
    const offsets = [];
    const debugArcSide = !!state?.ui?.debugDoubleLineArcSide;
    const debugMarkers = [];
    for (const s of bases) {
        if (s.type === 'line') {
            if (mode === 'single') {
                const sg = (signsMap && (signsMap[s.id] === 1 || signsMap[s.id] === -1))
                    ? Number(signsMap[s.id])
                    : ((globalSingleSign === -1) ? -1 : 1);
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
                return (globalSingleSign === -1) ? -1 : 1;
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
                const sg = arcSignsMap ? Number(arcSignsMap[s.id]) : NaN;
                if (sg === 1 || sg === -1) return sg;
                return (globalSingleSign === -1) ? -1 : 1;
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
    const lineArcPairs = findAdjacentLineArcPairs(lineBases, arcBases);
    // Sort pairs to ensure deterministic processing order
    pairs.sort((a, b) => (a.aId - b.aId) || (a.bId - b.bId) || (String(a.aEnd).localeCompare(String(b.aEnd))));
    const lineOffsets = offsets.filter(o => o.type !== 'circle' && o.type !== 'arc');
    // Keep original offset endpoints as "full" baseline.
    // Connection/join logic below will directly rewrite end points.
    for (const o of lineOffsets) {
        o.fullX1 = Number(o.x1);
        o.fullY1 = Number(o.y1);
        o.fullX2 = Number(o.x2);
        o.fullY2 = Number(o.y2);
    }
    const lineArcDebugMarkers = [];
    const lineArcLastSourceRef = { point: null };
    state.dlineLastConnectSourcePoint = null;
    if (!state.dlineSettings?.noTrim) {
        // Trim mode: resolve connected line segments by intersection-first geometry.
        // This avoids angle-dependent misses/overshoots on non-right corners.
        trimOffsetLineConnections(lineOffsets, pairs, lineBases, Math.abs(off));
        connectLineArcOffsets(
            offsets,
            lineArcPairs,
            lineBases,
            (debugArcSide ? lineArcDebugMarkers : null),
            lineArcLastSourceRef
        );
    }
    if (lineArcLastSourceRef?.point && Number.isFinite(Number(lineArcLastSourceRef.point.x)) && Number.isFinite(Number(lineArcLastSourceRef.point.y))) {
        state.dlineLastConnectSourcePoint = {
            x: Number(lineArcLastSourceRef.point.x),
            y: Number(lineArcLastSourceRef.point.y),
        };
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
    if (debugArcSide) {
        const markerDist = Math.max(0.5, Math.abs(Number(off) || 0) * 0.35);
        const getBaseRefPoint = (b) => {
            const t = String(b?.type || "");
            if (t === "line") {
                const x1 = Number(b.x1), y1 = Number(b.y1), x2 = Number(b.x2), y2 = Number(b.y2);
                if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
                return { x: (x1 + x2) * 0.5, y: (y1 + y2) * 0.5 };
            }
            if (t === "arc") {
                const cx = Number(b.cx), cy = Number(b.cy), r = Number(b.r);
                const a1 = Number(b.a1), a2 = Number(b.a2);
                if (![cx, cy, r, a1, a2].every(Number.isFinite) || r <= 1e-9) return null;
                let da = a2 - a1;
                if (!!b.ccw && da < 0) da += Math.PI * 2;
                if (!b.ccw && da > 0) da -= Math.PI * 2;
                const am = a1 + da * 0.5;
                return { x: cx + Math.cos(am) * r, y: cy + Math.sin(am) * r };
            }
            if (t === "circle") {
                const cx = Number(b.cx), cy = Number(b.cy);
                if (![cx, cy].every(Number.isFinite)) return null;
                return { x: cx, y: cy };
            }
            return null;
        };
        const getMarkerPoint = (b, side) => {
            const sg = (Number(side) === -1) ? -1 : 1;
            const t = String(b?.type || "");
            if (t === "line") {
                const x1 = Number(b.x1), y1 = Number(b.y1), x2 = Number(b.x2), y2 = Number(b.y2);
                if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
                const mx = (x1 + x2) * 0.5;
                const my = (y1 + y2) * 0.5;
                const dx = x2 - x1, dy = y2 - y1;
                const len = Math.hypot(dx, dy);
                if (len <= 1e-9) return null;
                const nx = -dy / len;
                const ny = dx / len;
                return { x: mx + nx * sg * markerDist, y: my + ny * sg * markerDist };
            }
            if (t === "arc") {
                const cx = Number(b.cx), cy = Number(b.cy), r = Number(b.r);
                const a1 = Number(b.a1), a2 = Number(b.a2);
                if (![cx, cy, r, a1, a2].every(Number.isFinite) || r <= 1e-9) return null;
                let da = a2 - a1;
                if (!!b.ccw && da < 0) da += Math.PI * 2;
                if (!b.ccw && da > 0) da -= Math.PI * 2;
                const am = a1 + da * 0.5;
                const rr = Math.max(1e-9, r + sg * markerDist);
                return { x: cx + Math.cos(am) * rr, y: cy + Math.sin(am) * rr };
            }
            if (t === "circle") {
                const cx = Number(b.cx), cy = Number(b.cy), r = Number(b.r);
                if (![cx, cy, r].every(Number.isFinite) || r <= 1e-9) return null;
                const th = Math.PI * 0.25;
                const rr = Math.max(1e-9, r + sg * markerDist);
                return { x: cx + Math.cos(th) * rr, y: cy + Math.sin(th) * rr };
            }
            return null;
        };
        const refs = [];
        for (const b of bases) {
            const rp = getBaseRefPoint(b);
            if (rp) refs.push(rp);
        }
        let ccx = 0, ccy = 0;
        if (refs.length) {
            for (const p of refs) { ccx += p.x; ccy += p.y; }
            ccx /= refs.length; ccy /= refs.length;
        }
        for (const b of bases) {
            if (!b) continue;
            const t = String(b.type || "");
            if (t !== "line" && t !== "arc" && t !== "circle") continue;
            const pPos = getMarkerPoint(b, 1);
            const pNeg = getMarkerPoint(b, -1);
            if (!pPos && !pNeg) continue;
            let chosen = pPos || pNeg;
            if (pPos && pNeg) {
                const dPos = (pPos.x - ccx) * (pPos.x - ccx) + (pPos.y - ccy) * (pPos.y - ccy);
                const dNeg = (pNeg.x - ccx) * (pNeg.x - ccx) + (pNeg.y - ccy) * (pNeg.y - ccy);
                chosen = (dPos >= dNeg) ? pPos : pNeg;
            }
            debugMarkers.push({
                type: "circle",
                cx: chosen.x,
                cy: chosen.y,
                r: Math.max(0.4, markerDist * 0.22),
            });
        }
        state.dlineDebugMarkers = debugMarkers.concat(lineArcDebugMarkers);
    } else {
        state.dlineDebugMarkers = [];
    }
    return offsets.filter(o => !o.__drop).map(o => {
        if (o.type === 'circle') {
            return {
                type: 'circle',
                cx: o.cx, cy: o.cy, r: o.r,
                baseId: o.baseId, sourceBaseId: Number(o.rootBaseId ?? o.baseId), side: o.side
            };
        }
        if (o.type === 'arc') {
            return {
                type: 'arc',
                cx: o.cx, cy: o.cy, r: o.r, a1: o.a1, a2: o.a2, ccw: !!o.ccw,
                baseId: o.baseId, sourceBaseId: Number(o.rootBaseId ?? o.baseId), side: o.side
            };
        }
        return {
            type: 'line',
            x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2,
            fullX1: o.fullX1, fullY1: o.fullY1, fullX2: o.fullX2, fullY2: o.fullY2,
            baseId: o.baseId, sourceBaseId: Number(o.rootBaseId ?? o.baseId), side: o.side
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

export function buildDoubleLineLineTrimMarkers(preview, targetBases, offsetDist = 0, mode = "both", eps = 1e-6) {
    const out = [];
    const e = Math.max(1e-9, Number(eps) || 1e-6);
    const targets = (targetBases || []).filter((s) => s && String(s.type || "") === "line");
    if (!Array.isArray(preview) || !preview.length || !targets.length) return out;
    const pushPoint = (x, y) => {
        const px = Number(x), py = Number(y);
        if (!Number.isFinite(px) || !Number.isFinite(py)) return;
        for (const p of out) {
            if (Math.hypot(Number(p.x) - px, Number(p.y) - py) <= e) return;
        }
        out.push({ x: px, y: py });
    };
    const half = Math.max(0, Number(offsetDist) * 0.5);
    const isBoth = String(mode || "both") === "both";
    for (const o of preview) {
        if (!o || String(o.type || "") !== "line") continue;
        const x1 = Number.isFinite(Number(o.fullX1)) ? Number(o.fullX1) : Number(o.x1);
        const y1 = Number.isFinite(Number(o.fullY1)) ? Number(o.fullY1) : Number(o.y1);
        const x2 = Number.isFinite(Number(o.fullX2)) ? Number(o.fullX2) : Number(o.x2);
        const y2 = Number.isFinite(Number(o.fullY2)) ? Number(o.fullY2) : Number(o.y2);
        if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        const tx = (len > 1e-9) ? (dx / len) : 1;
        const ty = (len > 1e-9) ? (dy / len) : 0;
        const a1 = { x: x1, y: y1 };
        const a2 = { x: x2, y: y2 };
        const cuts = [];
        const pushCut = (ip) => {
            if (!ip || !Number.isFinite(Number(ip.t))) return;
            const t = Math.max(0, Math.min(1, Number(ip.t)));
            for (const c of cuts) {
                if (Math.abs(Number(c.t) - t) <= e) return;
            }
            cuts.push({ t, x: Number(ip.x), y: Number(ip.y) });
        };
        for (const s of targets) {
            const b1 = { x: Number(s.x1), y: Number(s.y1) };
            const b2 = { x: Number(s.x2), y: Number(s.y2) };
            if (![b1.x, b1.y, b2.x, b2.y].every(Number.isFinite)) continue;
            pushCut(segmentIntersectionParamPoint(a1, a2, b1, b2));
        }
        if (!cuts.length) continue;
        cuts.sort((u, v) => Number(u.t) - Number(v.t));
        if (isBoth) {
            for (const c of cuts) {
                if (Number(c.t) <= e || Number(c.t) >= 1 - e) continue;
                pushPoint(Number(c.x) - tx * half, Number(c.y) - ty * half);
                pushPoint(Number(c.x) + tx * half, Number(c.y) + ty * half);
            }
        } else {
            const tStart = cuts.find((c) => Number(c.t) > e) || null;
            let tEnd = null;
            for (let i = cuts.length - 1; i >= 0; i--) {
                if (Number(cuts[i].t) < 1 - e) { tEnd = cuts[i]; break; }
            }
            if (tStart) pushPoint(Number(tStart.x) - tx * half, Number(tStart.y) - ty * half);
            if (tEnd) pushPoint(Number(tEnd.x) + tx * half, Number(tEnd.y) + ty * half);
        }
    }
    return out;
}

export function executeDoubleLine(state, previewOverride = null, options = null) {
    const expanded = expandDoubleLineBasesFromSelection(state);
    const bases = expanded.bases;
    const sourceByExpandedId = expanded.sourceByExpandedId;
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
        const refBase = sourceByExpandedId.get(Number(o.sourceBaseId ?? o.baseId))
            || sourceByExpandedId.get(Number(o.baseId))
            || bases.find(v => Number(v.id) === Number(o.baseId));
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
