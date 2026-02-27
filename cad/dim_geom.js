import { clamp } from "./geom.js";

/**
 * Returns basic geometry for a linear dimension.
 */
export function getDimGeometry(dim) {
    const x1 = Number(dim.x1), y1 = Number(dim.y1);
    const x2 = Number(dim.x2), y2 = Number(dim.y2);
    const vx = x2 - x1, vy = y2 - y1;
    const len = Math.hypot(vx, vy);
    if (len < 1e-9) return null;

    const tx = vx / len, ty = vy / len;
    const nx = -ty, ny = tx;
    const off = Number(dim.dimOffset) || 0;

    return {
        x1, y1, x2, y2,
        tx, ty, nx, ny,
        len, off,
        d1: { x: x1 + nx * off, y: y1 + ny * off },
        d2: { x: x2 + nx * off, y: y2 + ny * off }
    };
}

/**
 * Returns geometry for a chain dimension.
 */
export function getDimChainGeometry(dim) {
    if (!Array.isArray(dim.points) || dim.points.length < 2) return null;
    const p1 = dim.points[0], p2 = dim.points[1];
    const vx = p2.x - p1.x, vy = p2.y - p1.y;
    const len = Math.hypot(vx, vy);
    if (len < 1e-9) return null;

    const t = { x: vx / len, y: vy / len };
    const n = { x: -t.y, y: t.x };
    return { t, n };
}

/**
 * Returns geometry specifically for radial/diameter dimensions on circles/arcs.
 */
export function getSpecialDimGeometry(dim, shapes) {
    if (!dim.dimRef) return null;
    const ref = shapes.find(s => s.id === dim.dimRef.targetId);
    if (!ref) return null;

    let cx = 0, cy = 0, r = 0;
    if (ref.type === 'circle') {
        cx = Number(ref.cx); cy = Number(ref.cy); r = Number(ref.r);
    } else if (ref.type === 'arc') {
        cx = Number(ref.cx); cy = Number(ref.cy); r = Number(ref.r);
    } else return null;

    const x2 = Number(dim.x2), y2 = Number(dim.y2);
    const vx = x2 - cx, vy = y2 - cy;
    const d = Math.hypot(vx, vy);
    if (d < 1e-9) return null;

    const ux = vx / d, uy = vy / d;
    return {
        kind: ref.type,
        cx, cy, r,
        u: { x: ux, y: uy },
        n: { x: -uy, y: ux },
        len: d
    };
}

/**
 * Returns geometry for angular dimensions.
 */
export function getDimAngleGeometry(dim) {
    const cx = Number(dim.cx), cy = Number(dim.cy);
    const r = Number(dim.r);
    const a1 = Number(dim.a1), a2 = Number(dim.a2);
    return { cx, cy, r, a1, a2 };
}

/**
 * Calculates part hits for interactive dimension editing.
 */
export function hitTestDimPart(dim, worldX, worldY, shapes, scale = 1.0) {
    const tol = 8 / scale;
    if (dim.type === 'dim') {
        const g = getDimGeometry(dim);
        if (!g) return null;

        // Extension points
        if (Math.hypot(worldX - g.x1, worldY - g.y1) < tol) return 'p1';
        if (Math.hypot(worldX - g.x2, worldY - g.y2) < tol) return 'p2';

        // Dimension line targets
        if (Math.hypot(worldX - g.d1.x, worldY - g.d1.y) < tol) return 'target1';
        if (Math.hypot(worldX - g.d2.x, worldY - g.d2.y) < tol) return 'target2';

        // Check dimension line segment
        const dist = distToSegment(worldX, worldY, g.d1.x, g.d1.y, g.d2.x, g.d2.y);
        if (dist < tol) return 'line';

        // Text
        const tx = Number(dim.tx), ty = Number(dim.ty);
        if (Number.isFinite(tx) && Math.hypot(worldX - tx, worldY - ty) < tol) return 'text';

        // Radial specifics
        if (dim.dimRef) {
            const sg = getSpecialDimGeometry(dim, shapes);
            if (sg) {
                if (Math.hypot(worldX - dim.x2, worldY - dim.y2) < tol) return 'edge';
            }
        }
    } else if (dim.type === 'dimchain') {
        const g = getDimChainGeometry(dim);
        if (!g) return null;
        const off = Number(dim.dimOffset) || 0;
        for (let i = 0; i < dim.points.length; i++) {
            const p = dim.points[i];
            const dp = { x: p.x + g.n.x * off, y: p.y + g.n.y * off };
            if (Math.hypot(worldX - dp.x, worldY - dp.y) < tol) return `target:${i}`;
            if (Math.hypot(worldX - p.x, worldY - p.y) < tol) return `p:${i}`;
        }
        // Text/line simplified for now
        if (Math.hypot(worldX - (dim.tx || 0), worldY - (dim.ty || 0)) < tol) return 'text';
    } else if (dim.type === 'dimangle') {
        const g = getDimAngleGeometry(dim);
        if (!g) return null;
        // Simplified
        if (Math.hypot(worldX - (dim.tx || 0), worldY - (dim.ty || 0)) < tol) return 'text';
    }
    return null;
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
