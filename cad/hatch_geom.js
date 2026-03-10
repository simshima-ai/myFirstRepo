import { dist } from "./geom.js";
import { sampleBSplinePoints } from "./bspline_utils.js";

/**
 * Normalize angle to [0, 2ﾏ)
 */
export function normPos(a) {
    const twoPi = Math.PI * 2;
    let v = a % twoPi;
    if (v < 0) v += twoPi;
    return v;
}

/**
 * Check if angle `a` is on arc from `start` to `end`
 */
export function angleOnArc(a, start, end, ccw, eps = 1e-6) {
    const aa = normPos(a);
    const s = normPos(start);
    const e = normPos(end);
    if (ccw) {
        // CCW: Angle increases from start to end (across 0 if s > e)
        if (s <= e) return aa >= s - eps && aa <= e + eps;
        return aa >= s - eps || aa <= e + eps;
    } else {
        // CW: Angle decreases from start to end (across 0 if s < e)
        if (s >= e) return aa <= s + eps && aa >= e - eps;
        return aa <= s + eps || aa >= e - eps;
    }
}

export function isHatchBoundaryShape(s) {
    if (!s) return false;
    return s.type === "line" || s.type === "arc" || s.type === "circle" || s.type === "rect" || s.type === "bspline" || s.type === "polyline";
}

export function normalizeHatchBoundaryIds(boundaryIds) {
    return Array.from(
        new Set(
            (boundaryIds || [])
                .map((v) => Number(v))
                .filter((v) => Number.isFinite(v))
        )
    ).sort((a, b) => a - b);
}

export function hatchBoundaryIdsKey(boundaryIds) {
    return normalizeHatchBoundaryIds(boundaryIds).join(",");
}

function hatchEndpointNode(nodes, p, eps) {
    for (let i = 0; i < nodes.length; i++) {
        if (Math.hypot(nodes[i].x - p.x, nodes[i].y - p.y) <= eps) return i;
    }
    nodes.push({ x: p.x, y: p.y });
    return nodes.length - 1;
}

function hatchLoopNodePoint(loop, nodeIdx) {
    if (!loop || !Array.isArray(loop.steps) || loop.steps.length === 0) return null;
    for (const st of loop.steps) {
        const e = st.edge;
        if (!e) continue;
        if (nodeIdx === e.n1) {
            if (e.type === "line") return { x: e.s.x1, y: e.s.y1 };
            if (e.type === "arc")
                return {
                    x: e.s.cx + Math.cos(e.s.a1) * e.s.r,
                    y: e.s.cy + Math.sin(e.s.a1) * e.s.r,
                };
        }
        if (nodeIdx === e.n2) {
            if (e.type === "line") return { x: e.s.x2, y: e.s.y2 };
            if (e.type === "arc")
                return {
                    x: e.s.cx + Math.cos(e.s.a2) * e.s.r,
                    y: e.s.cy + Math.sin(e.s.a2) * e.s.r,
                };
        }
    }
    return null;
}

function collectBoundaryAnchorPoints(shapes) {
    const out = [];
    const push = (x, y) => {
        const nx = Number(x), ny = Number(y);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
        out.push({ x: nx, y: ny });
    };
    for (const s of (shapes || [])) {
        if (!s) continue;
        if (s.type === "line") {
            push(s.x1, s.y1);
            push(s.x2, s.y2);
        } else if (s.type === "arc") {
            const cx = Number(s.cx), cy = Number(s.cy), r = Number(s.r);
            const a1 = Number(s.a1), a2 = Number(s.a2);
            if ([cx, cy, r, a1, a2].every(Number.isFinite)) {
                push(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
                push(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
            }
        } else if (s.type === "rect") {
            push(s.x1, s.y1);
            push(s.x2, s.y1);
            push(s.x2, s.y2);
            push(s.x1, s.y2);
        } else if (s.type === "polyline") {
            const pts = Array.isArray(s.points) ? s.points : [];
            if (pts.length > 0) {
                push(pts[0]?.x, pts[0]?.y);
                push(pts[pts.length - 1]?.x, pts[pts.length - 1]?.y);
            }
        }
    }
    return out;
}

function nearestPointOnSegment(a, b, p) {
    const ax = Number(a?.x), ay = Number(a?.y);
    const bx = Number(b?.x), by = Number(b?.y);
    const px = Number(p?.x), py = Number(p?.y);
    if (![ax, ay, bx, by, px, py].every(Number.isFinite)) return null;
    const vx = bx - ax, vy = by - ay;
    const vv = vx * vx + vy * vy;
    if (vv <= 1e-18) return null;
    let t = ((px - ax) * vx + (py - ay) * vy) / vv;
    t = Math.max(0, Math.min(1, t));
    const x = ax + vx * t, y = ay + vy * t;
    return { t, x, y, d: Math.hypot(px - x, py - y) };
}

function buildTempPolylineFromBspline(bspline, anchors, eps) {
    const sampled = sampleBSplinePoints(bspline.controlPoints, Number(bspline.degree) || 3);
    if (!Array.isArray(sampled) || sampled.length < 2) return null;
    const insertsBySeg = new Map();
    const addInsert = (segIdx, t, x, y) => {
        if (!Number.isInteger(segIdx) || segIdx < 0 || segIdx >= sampled.length - 1) return;
        const nx = Number(x), ny = Number(y), nt = Number(t);
        if (![nx, ny, nt].every(Number.isFinite)) return;
        const arr = insertsBySeg.get(segIdx) || [];
        for (const it of arr) {
            if (Math.hypot(Number(it.x) - nx, Number(it.y) - ny) <= eps) return;
        }
        arr.push({ t: nt, x: nx, y: ny });
        insertsBySeg.set(segIdx, arr);
    };
    for (const ap of (anchors || [])) {
        let best = null;
        for (let i = 1; i < sampled.length; i++) {
            const hit = nearestPointOnSegment(sampled[i - 1], sampled[i], ap);
            if (!hit) continue;
            if (!best || hit.d < best.d) best = { ...hit, segIdx: i - 1 };
        }
        if (best && best.d <= eps * 1.5) addInsert(best.segIdx, best.t, ap.x, ap.y);
    }
    const out = [];
    const pushUnique = (x, y) => {
        const nx = Number(x), ny = Number(y);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
        const last = out[out.length - 1];
        if (last && Math.hypot(Number(last.x) - nx, Number(last.y) - ny) <= eps * 0.5) return;
        out.push({ x: nx, y: ny });
    };
    pushUnique(sampled[0].x, sampled[0].y);
    for (let i = 1; i < sampled.length; i++) {
        const segIdx = i - 1;
        const ins = (insertsBySeg.get(segIdx) || []).slice().sort((a, b) => Number(a.t) - Number(b.t));
        for (const it of ins) pushUnique(it.x, it.y);
        pushUnique(sampled[i].x, sampled[i].y);
    }
    if (out.length < 2) return null;
    return {
        id: Number(bspline.id),
        type: "polyline",
        points: out,
        closed: false,
        layerId: bspline.layerId,
        groupId: bspline.groupId,
    };
}

function preprocessHatchBoundaryShapes(boundaryShapes, viewScale) {
    const scale = Math.max(1e-9, Number(viewScale) || 1);
    const eps = Math.max(1e-4, 2 / scale);
    const anchors = collectBoundaryAnchorPoints(boundaryShapes);
    return (boundaryShapes || []).map((s) => {
        if (!s || s.type !== "bspline") return s;
        return buildTempPolylineFromBspline(s, anchors, eps) || s;
    });
}

export function hatchBoundaryToEdges(boundaryShapes, viewScale) {
    const eps = Math.max(1e-4, 2 / Math.max(1e-9, viewScale));
    const nodes = [];
    const edges = [];
    const circles = [];
    for (const s of boundaryShapes) {
        if (s.type === "circle") {
            circles.push(s);
            continue;
        }
        if (s.type === "line") {
            const n1 = hatchEndpointNode(nodes, { x: s.x1, y: s.y1 }, eps);
            const n2 = hatchEndpointNode(nodes, { x: s.x2, y: s.y2 }, eps);
            edges.push({ type: "line", n1, n2, s, sourceShapeId: s.id });
            continue;
        }
        if (s.type === "arc") {
            const p1 = {
                x: s.cx + Math.cos(s.a1) * s.r,
                y: s.cy + Math.sin(s.a1) * s.r,
            };
            const p2 = {
                x: s.cx + Math.cos(s.a2) * s.r,
                y: s.cy + Math.sin(s.a2) * s.r,
            };
            const n1 = hatchEndpointNode(nodes, p1, eps);
            const n2 = hatchEndpointNode(nodes, p2, eps);
            edges.push({ type: "arc", n1, n2, s, sourceShapeId: s.id });
            continue;
        }
        if (s.type === "rect") {
            const minX = Math.min(s.x1, s.x2),
                maxX = Math.max(s.x1, s.x2);
            const minY = Math.min(s.y1, s.y2),
                maxY = Math.max(s.y1, s.y2);
            const p = [
                { x: minX, y: minY },
                { x: maxX, y: minY },
                { x: maxX, y: maxY },
                { x: minX, y: maxY },
            ];
            for (let i = 0; i < 4; i++) {
                const a = p[i],
                    b = p[(i + 1) % 4];
                const n1 = hatchEndpointNode(nodes, a, eps);
                const n2 = hatchEndpointNode(nodes, b, eps);
                edges.push({
                    type: "line",
                    n1,
                    n2,
                    s: { x1: a.x, y1: a.y, x2: b.x, y2: b.y },
                    sourceShapeId: s.id,
                });
            }
        }
        if (s.type === "polyline") {
            const pts = Array.isArray(s.points) ? s.points : [];
            if (pts.length < 2) continue;
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                const n1 = hatchEndpointNode(nodes, { x: Number(a.x), y: Number(a.y) }, eps);
                const n2 = hatchEndpointNode(nodes, { x: Number(b.x), y: Number(b.y) }, eps);
                edges.push({
                    type: "line",
                    n1,
                    n2,
                    s: { x1: Number(a.x), y1: Number(a.y), x2: Number(b.x), y2: Number(b.y) },
                    sourceShapeId: s.id,
                });
            }
            if (s.closed && pts.length >= 3) {
                const a = pts[pts.length - 1];
                const b = pts[0];
                const n1 = hatchEndpointNode(nodes, { x: Number(a.x), y: Number(a.y) }, eps);
                const n2 = hatchEndpointNode(nodes, { x: Number(b.x), y: Number(b.y) }, eps);
                edges.push({
                    type: "line",
                    n1,
                    n2,
                    s: { x1: Number(a.x), y1: Number(a.y), x2: Number(b.x), y2: Number(b.y) },
                    sourceShapeId: s.id,
                });
            }
        }
        if (s.type === "bspline") {
            const pts = sampleBSplinePoints(s.controlPoints, Number(s.degree) || 3);
            if (pts.length < 2) continue;
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                const n1 = hatchEndpointNode(nodes, a, eps);
                const n2 = hatchEndpointNode(nodes, b, eps);
                edges.push({
                    type: "line",
                    n1,
                    n2,
                    s: { x1: Number(a.x), y1: Number(a.y), x2: Number(b.x), y2: Number(b.y) },
                    sourceShapeId: s.id,
                });
            }
        }
    }
    return { nodes, edges, circles };
}

export function buildHatchLoopsFromBoundaryIds(shapes, boundaryIds, viewScale) {
    const ids = Array.from(
        new Set(
            (boundaryIds || []).map((v) => Number(v)).filter((v) => Number.isFinite(v))
        )
    );
    const boundaryShapesRaw = ids
        .map((id) => shapes.find((s) => s.id === id))
        .filter(Boolean);
    if (boundaryShapesRaw.length === 0)
        return { ok: false, error: "No boundary selected" };
    const boundaryShapes = preprocessHatchBoundaryShapes(boundaryShapesRaw, viewScale);

    const { nodes, edges } = hatchBoundaryToEdges(boundaryShapes, viewScale);
    const loops = [];
    // Circles are independent closed loops
    for (const s of boundaryShapes) {
        if (s.type !== "circle") continue;
        const r = Number(s.r) || 0;
        if (r <= 1e-9) continue;
        loops.push({
            steps: [{ kind: "circle", cx: s.cx, cy: s.cy, r }],
            sourceShapeIds: [s.id],
        });
    }

    if (edges.length > 0) {
        if (edges.length < 2) return { ok: false, error: "Not enough boundary edges" };
        const adj = nodes.map(() => []);
        edges.forEach((e, idx) => {
            adj[e.n1].push(idx);
            adj[e.n2].push(idx);
        });
        for (let i = 0; i < adj.length; i++) {
            if (adj[i].length < 2)
                return { ok: false, error: "Boundary has open endpoint(s)" };
        }

        const used = new Array(edges.length).fill(false);
        for (let ei = 0; ei < edges.length; ei++) {
            if (used[ei]) continue;
            const first = edges[ei];
            let nextNode = first.n2;
            let prevEdge = ei;
            used[ei] = true;
            const steps = [{ edge: first, from: first.n1, to: first.n2 }];
            let guard = 0;
            while (nextNode !== first.n1 && guard++ < edges.length + 5) {
                const cand = adj[nextNode];
                let nextEdgeIdx = -1;
                for (const ci of cand) {
                    if (ci === prevEdge) continue;
                    if (!used[ci]) {
                        nextEdgeIdx = ci;
                        break;
                    }
                }
                if (nextEdgeIdx < 0) {
                    for (const ci of cand) {
                        if (ci === prevEdge) continue;
                        nextEdgeIdx = ci;
                        break;
                    }
                }
                if (!Number.isInteger(nextEdgeIdx) || nextEdgeIdx < 0) break;
                if (used[nextEdgeIdx]) break;
                const ne = edges[nextEdgeIdx];
                const to = ne.n1 === nextNode ? ne.n2 : ne.n1;
                steps.push({ edge: ne, from: nextNode, to });
                used[nextEdgeIdx] = true;
                prevEdge = nextEdgeIdx;
                nextNode = to;
            }
            if (nextNode !== first.n1)
                return { ok: false, error: "Failed to close boundary loop" };
            const src = new Set();
            for (const st of steps) {
                if (st.edge && Number.isFinite(Number(st.edge.sourceShapeId)))
                    src.add(Number(st.edge.sourceShapeId));
            }
            loops.push({ steps, sourceShapeIds: Array.from(src) });
        }
    }

    if (loops.length === 0) return { ok: false, error: "髢蛾伜沺縺ｫ縺ｪ縺｣縺ｦ縺・∪縺帙ｓ" };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const loop of loops) {
        const lb = loopBounds(loop);
        if (lb) {
            minX = Math.min(minX, lb.minX);
            minY = Math.min(minY, lb.minY);
            maxX = Math.max(maxX, lb.maxX);
            maxY = Math.max(maxY, lb.maxY);
        }
    }
    return { ok: true, loops, bounds: { minX, minY, maxX, maxY } };
}

export function appendHatchLoopPath(ctx, loop) {
    if (!loop || !Array.isArray(loop.steps) || loop.steps.length === 0) return;
    const step0 = loop.steps[0];
    if (step0.kind === "circle") {
        ctx.moveTo(step0.cx + step0.r, step0.cy);
        ctx.arc(step0.cx, step0.cy, step0.r, 0, Math.PI * 2);
        ctx.closePath();
        return;
    }
    const start = step0.edge ? hatchLoopNodePoint(loop, step0.from) : null;
    if (!start) return;
    ctx.moveTo(start.x, start.y);
    for (const st of loop.steps) {
        const e = st.edge;
        if (!e) continue;
        const pTo = hatchLoopNodePoint(loop, st.to);
        if (!pTo) continue;
        if (e.type === "line") {
            ctx.lineTo(pTo.x, pTo.y);
        } else if (e.type === "arc") {
            const a1 = e.s.a1,
                a2 = e.s.a2,
                ccw = !!e.s.ccw;
            const forward = st.from === e.n1 && st.to === e.n2;
            if (forward) ctx.arc(e.s.cx, e.s.cy, e.s.r, a1, a2, ccw);
            else ctx.arc(e.s.cx, e.s.cy, e.s.r, a2, a1, !ccw);
        }
    }
    ctx.closePath();
}

export function loopBounds(loop) {
    if (!loop || !Array.isArray(loop.steps) || loop.steps.length === 0) return null;
    const s0 = loop.steps[0];
    if (s0.kind === "circle") {
        return {
            minX: s0.cx - s0.r,
            minY: s0.cy - s0.r,
            maxX: s0.cx + s0.r,
            maxY: s0.cy + s0.r,
        };
    }
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    const push = (p) => {
        if (!p) return;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    };
    for (const st of loop.steps) {
        const pFrom = hatchLoopNodePoint(loop, st.from);
        const pTo = hatchLoopNodePoint(loop, st.to);
        push(pFrom);
        push(pTo);
        if (st.edge && st.edge.type === "arc") {
            const e = st.edge.s;
            const a1 = normPos(e.a1);
            const a2 = normPos(e.a2);
            const ccw = !!e.ccw;
            const card = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
            for (const a of card) {
                if (angleOnArc(a, a1, a2, ccw)) {
                    push({ x: e.cx + Math.cos(a) * e.r, y: e.cy + Math.sin(a) * e.r });
                }
            }
        }
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
}

/**
 * Robust point-in-loop hit test using winding number or ray casting.
 * For simplicity here, we use a basic version that handles arcs by sampling or math.
 */
export function isPointInLoop(loop, p) {
    const bounds = loopBounds(loop);
    if (!bounds || p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY) return false;

    // Use a temporary canvas/path for accurate hit testing if available, 
    // but for head-less logic we'll use ray casting.
    // Simplifying: use Winding Number or parity check.
    // For now, let's use a standard Parity Rule (Ray Casting)
    let inside = false;
    const x = p.x, y = p.y;

    // For circles
    const s0 = loop.steps[0];
    if (s0.kind === "circle") {
        return Math.hypot(x - s0.cx, y - s0.cy) <= s0.r;
    }

    // For general loops (lines and arcs)
    for (const st of loop.steps) {
        const e = st.edge;
        if (!e) continue;
        const p1 = hatchLoopNodePoint(loop, st.from);
        const p2 = hatchLoopNodePoint(loop, st.to);
        if (!p1 || !p2) continue;

        if (e.type === "line") {
            if (((p1.y > y) !== (p2.y > y)) &&
                (x < (p2.x - p1.x) * (y - p1.y) / (p2.y - p1.y) + p1.x)) {
                inside = !inside;
            }
        } else if (e.type === "arc") {
            // Arcs are harder for ray casting. 
            // Approximation: subdivide arc into line segments for hit test
            const r = e.s.r, cx = e.s.cx, cy = e.s.cy;
            const a1 = e.s.a1, a2 = e.s.a2, ccw = !!e.s.ccw;
            const forward = st.from === e.n1 && st.to === e.n2;
            const startA = forward ? a1 : a2;
            const endA = forward ? a2 : a1;
            const actualCcw = forward ? ccw : !ccw;

            let diff = actualCcw ? (startA - endA) : (endA - startA);
            while (diff < 0) diff += Math.PI * 2;
            while (diff > Math.PI * 2) diff -= Math.PI * 2;

            const segments = Math.max(4, Math.ceil(diff / (Math.PI / 8)));
            for (let i = 0; i < segments; i++) {
                const t1 = i / segments;
                const t2 = (i + 1) / segments;
                const ang1 = startA + (actualCcw ? -t1 * diff : t1 * diff);
                const ang2 = startA + (actualCcw ? -t2 * diff : t2 * diff);
                const segP1 = { x: cx + Math.cos(ang1) * r, y: cy + Math.sin(ang1) * r };
                const segP2 = { x: cx + Math.cos(ang2) * r, y: cy + Math.sin(ang2) * r };

                if (((segP1.y > y) !== (segP2.y > y)) &&
                    (x < (segP2.x - segP1.x) * (y - segP1.y) / (segP2.y - segP1.y) + segP1.x)) {
                    inside = !inside;
                }
            }
        }
    }
    return inside;
}

export function isPointInHatch(shapes, hatchShape, p, viewScale) {
    const parsed = buildHatchLoopsFromBoundaryIds(shapes, hatchShape.boundaryIds, viewScale);
    if (!parsed.ok || !parsed.loops) return false;

    // Even-odd rule: point is inside if it's inside an odd number of loops
    let insideCount = 0;
    for (const loop of parsed.loops) {
        if (isPointInLoop(loop, p)) {
            insideCount++;
        }
    }
    return (insideCount % 2) === 1;
}

export function validateHatchBoundaryEndpoints(shapes, boundaryIds, viewScale) {
    const ids = normalizeHatchBoundaryIds(boundaryIds);
    const boundaryShapes = ids
        .map((id) => (shapes || []).find((s) => Number(s?.id) === Number(id)))
        .filter((s) => !!s && isHatchBoundaryShape(s));

    const edgeShapes = boundaryShapes.filter((s) => s.type !== "circle");
    if (edgeShapes.length === 0) {
        return {
            ok: true,
            ids,
            idsKey: hatchBoundaryIdsKey(ids),
            openNodes: [],
            nearMissPairs: [],
            endpointNearToleranceWorld: 0,
        };
    }

    const scale = Math.max(1e-9, Number(viewScale) || 1);
    const endpointNearToleranceWorld = 10 / scale; // ~10px
    const { nodes, edges } = hatchBoundaryToEdges(edgeShapes, scale);
    const degree = new Array(nodes.length).fill(0);
    for (const e of edges) {
        degree[e.n1] += 1;
        degree[e.n2] += 1;
    }

    const openNodeIdx = [];
    for (let i = 0; i < nodes.length; i++) {
        // Endpoint-match check focuses on dangling endpoints only.
        // Branch points (degree >= 3) are noisy for this diagnostic.
        if (degree[i] === 1) openNodeIdx.push(i);
    }
    const openNodes = openNodeIdx.map((idx) => ({
        x: Number(nodes[idx].x),
        y: Number(nodes[idx].y),
        degree: 1,
    }));

    const nearMissPairs = [];
    for (let i = 0; i < openNodeIdx.length; i++) {
        const ia = openNodeIdx[i];
        for (let j = i + 1; j < openNodeIdx.length; j++) {
            const ib = openNodeIdx[j];
            const a = nodes[ia];
            const b = nodes[ib];
            const d = dist(a, b);
            if (!(d > 1e-9 && d <= endpointNearToleranceWorld)) continue;
            nearMissPairs.push({
                a: { x: Number(a.x), y: Number(a.y), degree: Number(degree[ia]) || 0 },
                b: { x: Number(b.x), y: Number(b.y), degree: Number(degree[ib]) || 0 },
                distance: Number(d),
            });
        }
    }

    const parsed = buildHatchLoopsFromBoundaryIds(shapes || [], ids, scale);
    const loopOk = !!parsed?.ok;
    const loopError = loopOk ? "" : String(parsed?.error || "Boundary is not closed");

    return {
        ok: openNodes.length === 0 && loopOk,
        ids,
        idsKey: hatchBoundaryIdsKey(ids),
        openNodes,
        nearMissPairs,
        endpointNearToleranceWorld,
        loopOk,
        loopError,
    };
}
