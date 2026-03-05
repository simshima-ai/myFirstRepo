import { clamp } from "./geom.js";

function ensureCircleDimAttributes(dim) {
    if (!dim || dim.type !== "circleDim") return;
    if (!Array.isArray(dim.attributes)) {
        dim.attributes = [{
            id: "circle_center_follow",
            name: "follow_target_center",
            target: "controller:center",
            value: "true"
        }];
    }
}

export function circleDimHasCenterFollowAttribute(dim) {
    const attrs = Array.isArray(dim?.attributes) ? dim.attributes : [];
    return attrs.some(a => {
        const id = String(a?.id ?? "");
        const name = String(a?.name ?? a?.key ?? a?.type ?? "");
        const target = String(a?.target ?? "");
        return id === "circle_center_follow" || (name === "follow_target_center" && target === "controller:center");
    });
}

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
    // Prefer px/py for offset (stored after placement or drag), fall back to dimOffset
    let off;
    if (Number.isFinite(Number(dim.px)) && Number.isFinite(Number(dim.py))) {
        off = (Number(dim.px) - x1) * nx + (Number(dim.py) - y1) * ny;
    } else {
        off = Number(dim.dimOffset) || 0;
    }

    const d1 = { x: x1 + nx * off, y: y1 + ny * off };
    const d2 = { x: x2 + nx * off, y: y2 + ny * off };
    const allCtrl = { x: (d1.x + d2.x) * 0.5, y: (d1.y + d2.y) * 0.5 };
    return {
        x1, y1, x2, y2,
        tx, ty, nx, ny,
        len, off,
        d1, d2, allCtrl
    };
}

/**
 * Returns geometry for a chain dimension.
 * Returns { segments, nx, ny, off } where each segment has the same structure as getDimGeometry().
 */
export function getDimChainGeometry(dim) {
    if (!Array.isArray(dim.points) || dim.points.length < 2) return null;

    const px = Number(dim.px ?? 0), py = Number(dim.py ?? 0);

    // Dominant direction: first point → last point
    const p0 = dim.points[0];
    const pLast = dim.points[dim.points.length - 1];
    const ovx = pLast.x - p0.x, ovy = pLast.y - p0.y;
    const ovLen = Math.hypot(ovx, ovy);
    if (ovLen < 1e-9) return null;

    // Common normal (perpendicular to dominant direction)
    const nx = -ovy / ovLen, ny = ovx / ovLen;
    const ux = ovx / ovLen, uy = ovy / ovLen;

    // Offset: perpendicular distance from p0 to placement point
    const off = (px - p0.x) * nx + (py - p0.y) * ny;

    const dimPoints = dim.points.map((pt) => {
        const t = (Number(pt.x) - Number(p0.x)) * ux + (Number(pt.y) - Number(p0.y)) * uy;
        return {
            t,
            x: Number(p0.x) + ux * t + nx * off,
            y: Number(p0.y) + uy * t + ny * off
        };
    });

    const chainMid = {
        x: (dimPoints[0].x + dimPoints[dimPoints.length - 1].x) * 0.5,
        y: (dimPoints[0].y + dimPoints[dimPoints.length - 1].y) * 0.5
    };

    const segments = [];
    for (let i = 0; i < dim.points.length - 1; i++) {
        const pt1 = dim.points[i], pt2 = dim.points[i + 1];
        const dpt1 = dimPoints[i], dpt2 = dimPoints[i + 1];
        const dvx = dpt2.x - dpt1.x, dvy = dpt2.y - dpt1.y;
        const sLen = Math.hypot(dvx, dvy);
        if (sLen < 1e-9) continue;
        segments.push({
            x1: pt1.x, y1: pt1.y,
            x2: pt2.x, y2: pt2.y,
            tx: dvx / sLen, ty: dvy / sLen,
            nx, ny,
            len: Math.abs(Number(dpt2.t) - Number(dpt1.t)),
            off,
            d1: { x: dpt1.x, y: dpt1.y },
            d2: { x: dpt2.x, y: dpt2.y },
            chainMid,
        });
    }
    if (!segments.length) return null;
    return { segments, nx, ny, ux, uy, off, dimPoints, chainMid };
}

/**
 * Returns geometry for a circleDim object.
 */
export function getCircleDimGeometry(dim, shapes) {
    if (!dim.dimRef) return null;
    ensureCircleDimAttributes(dim);
    const ref = shapes.find(s => Number(s.id) === Number(dim.dimRef.targetId));
    if (!ref || (ref.type !== 'circle' && ref.type !== 'arc')) return null;

    const cx = Number(ref.cx), cy = Number(ref.cy), r = Number(ref.r);
    // Angle of dimension line
    const ang = Number(dim.ang ?? 0);
    const ux = Math.cos(ang), uy = Math.sin(ang);

    // Arrow tip distances from center (defaults to r for radial, r/ -r for diameter)
    const off1 = Number(dim.off1 ?? r);
    const off2 = Number(dim.off2 ?? (dim.kind === "diameter" ? -r : 0));

    const p1 = { x: cx + ux * off1, y: cy + uy * off1 };
    const p2 = { x: cx + ux * off2, y: cy + uy * off2 };

    let hasRelativeText = Number.isFinite(Number(dim.tdx)) && Number.isFinite(Number(dim.tdy));
    if (!hasRelativeText && Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))) {
        // Backward compatibility: migrate absolute text position to center-relative once.
        dim.tdx = Number(dim.tx) - cx;
        dim.tdy = Number(dim.ty) - cy;
        hasRelativeText = true;
    }
    const tx = hasRelativeText ? (cx + Number(dim.tdx)) : Number(dim.tx ?? (p1.x + ux * 10));
    const ty = hasRelativeText ? (cy + Number(dim.tdy)) : Number(dim.ty ?? (p1.y + uy * 10));

    return {
        cx, cy, r, ang, ux, uy,
        off1, off2,
        p1, p2, tx, ty
    };
}

/**
 * Returns geometry specifically for radial/diameter dimensions on circles/arcs.
 * @deprecated Use getCircleDimGeometry for circleDim type.
 */
export function getSpecialDimGeometry(dim, shapes) {
    if (!dim.dimRef) return null;
    const ref = shapes.find(s => Number(s.id) === Number(dim.dimRef.targetId));
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
export function getDimAngleGeometry(dim, shapes = null) {
    const norm = (a) => {
        let r = Number(a) || 0;
        while (r < 0) r += Math.PI * 2;
        while (r >= Math.PI * 2) r -= Math.PI * 2;
        return r;
    };
    const pickRayAngle = (line, endKey, cx, cy) => {
        if (!line) return null;
        const ex = Number(endKey === "p2" ? line.x2 : line.x1);
        const ey = Number(endKey === "p2" ? line.y2 : line.y1);
        const ox = Number(endKey === "p2" ? line.x1 : line.x2);
        const oy = Number(endKey === "p2" ? line.y1 : line.y2);
        let vx = ex - cx, vy = ey - cy;
        if (Math.hypot(vx, vy) < 1e-9) {
            vx = ex - ox; vy = ey - oy;
        }
        if (Math.hypot(vx, vy) < 1e-9) return null;
        return Math.atan2(vy, vx);
    };
    const intersectLines = (l1, l2) => {
        const x1 = Number(l1.x1), y1 = Number(l1.y1), x2 = Number(l1.x2), y2 = Number(l1.y2);
        const x3 = Number(l2.x1), y3 = Number(l2.y1), x4 = Number(l2.x2), y4 = Number(l2.y2);
        const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (Math.abs(d) < 1e-12) return null;
        const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d;
        const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d;
        if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
        return { x: px, y: py };
    };

    let cx = Number(dim.cx), cy = Number(dim.cy);
    let a1 = Number(dim.a1), a2 = Number(dim.a2);
    let r = Math.max(1e-6, Math.abs(Number(dim.r) || 0));

    if (Array.isArray(shapes) && Number.isFinite(Number(dim.line1Id)) && Number.isFinite(Number(dim.line2Id))) {
        const l1 = shapes.find(s => Number(s?.id) === Number(dim.line1Id) && s.type === "line");
        const l2 = shapes.find(s => Number(s?.id) === Number(dim.line2Id) && s.type === "line");
        const ip = (l1 && l2) ? intersectLines(l1, l2) : null;
        if (ip) {
            const aa1 = pickRayAngle(l1, String(dim.line1RayEnd || "p1"), ip.x, ip.y);
            const aa2 = pickRayAngle(l2, String(dim.line2RayEnd || "p1"), ip.x, ip.y);
            if (Number.isFinite(aa1) && Number.isFinite(aa2)) {
                cx = ip.x;
                cy = ip.y;
                a1 = aa1;
                a2 = aa2;
            }
        }
    }

    a1 = norm(a1);
    a2 = norm(a2);
    let da = norm(a2 - a1);
    if (da > Math.PI) {
        const t = a1; a1 = a2; a2 = t;
        da = norm(a2 - a1);
    }
    const midA = a1 + da * 0.5;
    const ux = Math.cos(midA), uy = Math.sin(midA);
    const textOffRaw = Number(dim.textOffset);
    const textOff = Math.max(r + 1e-6, Number.isFinite(textOffRaw) ? textOffRaw : (r + Math.abs(Number(dim.fontSize ?? 12) || 12) * 0.25));
    const tx = cx + ux * textOff;
    const ty = cy + uy * textOff;
    return { cx, cy, r, a1, a2, angle: da, midA, ux, uy, tx, ty, textOffset: textOff };
}

/**
 * Calculates part hits for interactive dimension editing.
 */
export function hitTestDimPart(dim, worldX, worldY, shapes, scale = 1.0) {
    const tol = 8 / scale;
    const dimPtToWorld = (pt) => Math.max(0, Number(pt) || 0) / Math.max(1e-9, scale);
    if (dim.type === 'dim') {
        const g = getDimGeometry(dim);
        if (!g) return null;
        const mid = { x: (Number(g.d1.x) + Number(g.d2.x)) * 0.5, y: (Number(g.d1.y) + Number(g.d2.y)) * 0.5 };
        const place = { x: (mid.x + Number(g.d2.x)) * 0.5, y: (mid.y + Number(g.d2.y)) * 0.5 };
        if (Math.hypot(worldX - place.x, worldY - place.y) < tol) return 'place';

        // Extension points
        if (Math.hypot(worldX - g.x1, worldY - g.y1) < tol) return 'p1';
        if (Math.hypot(worldX - g.x2, worldY - g.y2) < tol) return 'p2';

        // Dimension line targets
        if (Math.hypot(worldX - g.d1.x, worldY - g.d1.y) < tol) return 'target1';
        if (Math.hypot(worldX - g.d2.x, worldY - g.d2.y) < tol) return 'target2';

        if (Math.hypot(worldX - g.allCtrl.x, worldY - g.allCtrl.y) < tol) return "all";
        // Check dimension line segment
        const dist = distToSegment(worldX, worldY, g.d1.x, g.d1.y, g.d2.x, g.d2.y);
        if (dist < tol) return 'line';

        // Text
        const tx = Number(dim.tx), ty = Number(dim.ty);
        const hasRel = Number.isFinite(Number(dim.tdx)) && Number.isFinite(Number(dim.tdy));
        const text = hasRel
            ? { x: Number(g.allCtrl.x) + Number(dim.tdx), y: Number(g.allCtrl.y) + Number(dim.tdy) }
            : (Number.isFinite(tx) && Number.isFinite(ty))
                ? { x: tx, y: ty }
                : {
                    x: g.allCtrl.x + g.nx * dimPtToWorld(Number(dim.fontSize ?? 12) || 12),
                    y: g.allCtrl.y + g.ny * dimPtToWorld(Number(dim.fontSize ?? 12) || 12)
                };
        if (Math.hypot(worldX - text.x, worldY - text.y) < tol) return 'text';

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
        const dimPoints = Array.isArray(g.dimPoints) ? g.dimPoints : [];
        if (dimPoints.length >= 2) {
            const d0 = dimPoints[0], dN = dimPoints[dimPoints.length - 1];
            const allCtrl = { x: (d0.x + dN.x) * 0.5, y: (d0.y + dN.y) * 0.5 };
            if (Math.hypot(worldX - allCtrl.x, worldY - allCtrl.y) < tol) return "all";
        }
        if (Math.hypot(worldX - Number(dim.px || 0), worldY - Number(dim.py || 0)) < tol) return "place";
        for (let i = 0; i < dim.points.length; i++) {
            const p = dim.points[i];
            const dp = dimPoints[i] || { x: p.x, y: p.y };
            if (Math.hypot(worldX - dp.x, worldY - dp.y) < tol) return `target:${i}`;
            if (Math.hypot(worldX - p.x, worldY - p.y) < tol) return `p:${i}`;
        }
        for (const seg of (g.segments || [])) {
            if (distToSegment(worldX, worldY, seg.d1.x, seg.d1.y, seg.d2.x, seg.d2.y) < tol) return "line";
        }
        const txt = (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty)))
            ? { x: Number(dim.tx), y: Number(dim.ty) }
            : {
                x: Number(g.chainMid?.x || 0) + Number(g.nx || 0) * (12 / Math.max(1e-9, scale)),
                y: Number(g.chainMid?.y || 0) + Number(g.ny || 0) * (12 / Math.max(1e-9, scale))
            };
        if (Math.hypot(worldX - txt.x, worldY - txt.y) < tol) return 'text';
    } else if (dim.type === 'dimangle') {
        const g = getDimAngleGeometry(dim, shapes);
        if (!g) return null;
        const rp = { x: Number(g.cx) + Number(g.ux) * Number(g.r), y: Number(g.cy) + Number(g.uy) * Number(g.r) };
        if (Math.hypot(worldX - rp.x, worldY - rp.y) < tol) return "radius";
        if (Math.hypot(worldX - Number(g.tx), worldY - Number(g.ty)) < tol) return 'text';
    } else if (dim.type === 'circleDim') {
        const g = getCircleDimGeometry(dim, shapes);
        if (!g) return null;
        const pArc = { x: g.cx + g.ux * g.r, y: g.cy + g.uy * g.r };
        if (Math.hypot(worldX - pArc.x, worldY - pArc.y) < tol) return 'pArc';
        if (Math.hypot(worldX - g.p1.x, worldY - g.p1.y) < tol) return 'off1';
        if (Math.hypot(worldX - g.p2.x, worldY - g.p2.y) < tol) return 'off2';
        if (circleDimHasCenterFollowAttribute(dim) && Math.hypot(worldX - g.cx, worldY - g.cy) < tol) return 'centerCtrl';
        if (Math.hypot(worldX - g.tx, worldY - g.ty) < tol) return 'text';
    }
    return null;
}

function distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
