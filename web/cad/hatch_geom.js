import { dist } from "./geom.js";

/**
 * Normalize angle to [0, 2π)
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
    return s.type === "line" || s.type === "arc" || s.type === "circle" || s.type === "rect" || s.type === "bspline";
}

function sampleBSplinePoints(controlPoints, degreeRaw = 3) {
    const cps = Array.isArray(controlPoints) ? controlPoints
        .map((p) => ({ x: Number(p?.x), y: Number(p?.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : [];
    if (cps.length < 2) return [];
    const degree = Math.max(1, Math.min(Number(degreeRaw) || 3, cps.length - 1));
    const n = cps.length - 1;
    const m = n + degree + 1;
    const knots = new Array(m + 1).fill(0);
    for (let i = 0; i <= m; i++) {
        if (i <= degree) knots[i] = 0;
        else if (i >= m - degree) knots[i] = 1;
        else knots[i] = (i - degree) / (m - 2 * degree);
    }
    const basis = (i, p, u) => {
        if (p === 0) {
            if (u === 1) return i === n ? 1 : 0;
            return (knots[i] <= u && u < knots[i + 1]) ? 1 : 0;
        }
        const d1 = knots[i + p] - knots[i];
        const d2 = knots[i + p + 1] - knots[i + 1];
        const a = d1 > 1e-12 ? ((u - knots[i]) / d1) * basis(i, p - 1, u) : 0;
        const b = d2 > 1e-12 ? ((knots[i + p + 1] - u) / d2) * basis(i + 1, p - 1, u) : 0;
        return a + b;
    };
    const spans = Math.max(1, n - degree + 1);
    const sampleCount = Math.max(24, Math.min(720, spans * 32));
    const out = [];
    for (let s = 0; s <= sampleCount; s++) {
        const u = s / sampleCount;
        let x = 0;
        let y = 0;
        for (let i = 0; i <= n; i++) {
            const w = basis(i, degree, u);
            if (!w) continue;
            x += cps[i].x * w;
            y += cps[i].y * w;
        }
        out.push({ x, y });
    }
    return out;
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
    const boundaryShapes = ids
        .map((id) => shapes.find((s) => s.id === id))
        .filter(Boolean);
    if (boundaryShapes.length === 0)
        return { ok: false, error: "境界が未選択です" };

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
        if (edges.length < 2) return { ok: false, error: "閉領域になっていません" };
        const adj = nodes.map(() => []);
        edges.forEach((e, idx) => {
            adj[e.n1].push(idx);
            adj[e.n2].push(idx);
        });
        for (let i = 0; i < adj.length; i++) {
            if (adj[i].length !== 2)
                return { ok: false, error: "閉領域になっていません" };
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
                const nextEdgeIdx = cand[0] === prevEdge ? cand[1] : cand[0];
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
                return { ok: false, error: "閉領域の追跡に失敗しました" };
            const src = new Set();
            for (const st of steps) {
                if (st.edge && Number.isFinite(Number(st.edge.sourceShapeId)))
                    src.add(Number(st.edge.sourceShapeId));
            }
            loops.push({ steps, sourceShapeIds: Array.from(src) });
        }
    }

    if (loops.length === 0) return { ok: false, error: "閉領域になっていません" };

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
