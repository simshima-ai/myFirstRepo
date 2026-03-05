import { translateShape, nextShapeId, addShape } from "./state.js";
import { normPos, angleOnArc, buildHatchLoopsFromBoundaryIds } from "./hatch_geom.js";

/**
 * Rotates a shape around a center point (ox, oy) by rad (radians).
 */
export function rotateShapeAround(s, ox, oy, rad) {
    if (!s) return;
    const c = Math.cos(rad), s_ = Math.sin(rad);

    const rot = (px, py) => {
        const x = px - ox, y = py - oy;
        return {
            x: ox + x * c - y * s_,
            y: oy + x * s_ + y * c
        };
    };

    if (s.type === 'line' || s.type === 'rect' || s.type === 'dim') {
        const p1 = rot(Number(s.x1) || 0, Number(s.y1) || 0);
        const p2 = rot(Number(s.x2) || 0, Number(s.y2) || 0);
        s.x1 = p1.x; s.y1 = p1.y;
        s.x2 = p2.x; s.y2 = p2.y;
        if (s.type === 'dim' && s.px != null) {
            const p = rot(Number(s.px) || 0, Number(s.py) || 0);
            s.px = p.x; s.py = p.y;
        }
        return;
    }
    if (s.type === 'circle') {
        const p = rot(Number(s.cx) || 0, Number(s.cy) || 0);
        s.cx = p.x; s.cy = p.y;
        return;
    }
    if (s.type === 'arc') {
        const p = rot(Number(s.cx) || 0, Number(s.cy) || 0);
        s.cx = p.x; s.cy = p.y;
        s.a1 = (Number(s.a1) || 0) + rad;
        s.a2 = (Number(s.a2) || 0) + rad;
        return;
    }
    if (s.type === 'text' || s.type === 'position') {
        const p = rot(Number(s.x1 ?? s.x) || 0, Number(s.y1 ?? s.y) || 0);
        if (s.x1 != null) { s.x1 = p.x; s.y1 = p.y; }
        else { s.x = p.x; s.y = p.y; }
        if (s.type === 'text') {
            s.textRotate = (Number(s.textRotate) || 0) + (rad * 180 / Math.PI);
        }
        return;
    }
}

/**
 * Reflects a shape across a line defined by (px1, py1) and (px2, py2).
 */
export function reflectShapeAcrossLine(s, px1, py1, px2, py2) {
    if (!s) return;
    const dx = px2 - px1, dy = py2 - py1;
    const d2 = dx * dx + dy * dy;
    if (d2 <= 1e-12) return;

    const reflect = (x, y) => {
        const t = ((x - px1) * dx + (y - py1) * dy) / d2;
        const nx = px1 + dx * t, ny = py1 + dy * t;
        return { x: 2 * nx - x, y: 2 * ny - y };
    };

    if (s.type === 'line' || s.type === 'rect' || s.type === 'dim') {
        const p1 = reflect(Number(s.x1) || 0, Number(s.y1) || 0);
        const p2 = reflect(Number(s.x2) || 0, Number(s.y2) || 0);
        s.x1 = p1.x; s.y1 = p1.y;
        s.x2 = p2.x; s.y2 = p2.y;
        if (s.type === 'dim' && s.px != null) {
            const p = reflect(Number(s.px) || 0, Number(s.py) || 0);
            s.px = p.x; s.py = p.y;
        }
        return;
    }
    if (s.type === 'circle') {
        const p = reflect(Number(s.cx) || 0, Number(s.cy) || 0);
        s.cx = p.x; s.cy = p.y;
        return;
    }
    if (s.type === 'arc') {
        const p = reflect(Number(s.cx) || 0, Number(s.cy) || 0);
        s.cx = p.x; s.cy = p.y;
        // Mirrored angle: reflect normal across line normal or just flip
        const lineAngle = Math.atan2(dy, dx);
        const a1Raw = Number(s.a1) || 0;
        const a2Raw = Number(s.a2) || 0;
        s.a1 = 2 * lineAngle - a1Raw;
        s.a2 = 2 * lineAngle - a2Raw;
        s.ccw = !s.ccw; // Flip winding
        return;
    }
    if (s.type === 'text' || s.type === 'position') {
        const p = reflect(Number(s.x1 ?? s.x) || 0, Number(s.y1 ?? s.y) || 0);
        if (s.x1 != null) { s.x1 = p.x; s.y1 = p.y; }
        else { s.x = p.x; s.y = p.y; }
        // Text mirroring is tricky, usually we don't mirror the text glyphs but maybe the orientation
        return;
    }
}

/**
 * Instantiates copies from a buffer into the state.
 */
export function instantiateCopyBuffer(state, buffer, opts = {}) {
    const dx = Number(opts.dx) || 0;
    const dy = Number(opts.dy) || 0;
    const transformShape = opts.transformShape; // (s, src) => void
    const out = { createdShapeIds: [] };

    if (buffer.kind === 'shape') {
        for (const src of (buffer.shapes || [])) {
            const s = JSON.parse(JSON.stringify(src));
            s.id = nextShapeId(state);
            if (dx !== 0 || dy !== 0) {
                translateShape(s, dx, dy);
            }
            if (transformShape) transformShape(s, src);
            addShape(state, s);
            out.createdShapeIds.push(s.id);
        }
    }
    return out;
}

export function doPatternArrayCopy(state, shape, offsets) {
    if (!shape || !Array.isArray(offsets)) return null;
    const buffer = { kind: 'shape', shapes: [shape] };
    const createdIds = [];
    for (const offset of offsets) {
        const res = instantiateCopyBuffer(state, buffer, { dx: offset.dx, dy: offset.dy });
        createdIds.push(...res.createdShapeIds);
    }
    return createdIds;
}

export function doPatternMirrorCopy(state, shape, p1, p2) {
    if (!shape || !p1 || !p2) return null;
    const buffer = { kind: 'shape', shapes: [shape] };
    const res = instantiateCopyBuffer(state, buffer, {
        transformShape: (s) => reflectShapeAcrossLine(s, p1.x, p1.y, p2.x, p2.y)
    });
    return res.createdShapeIds;
}

export function doPatternRotateCopy(state, shape, center, angleDeg, count) {
    if (!shape || !center || !count) return null;
    const buffer = { kind: 'shape', shapes: [shape] };
    const createdIds = [];
    const radBase = angleDeg * Math.PI / 180;
    for (let i = 1; i <= count; i++) {
        const rad = radBase * i;
        const res = instantiateCopyBuffer(state, buffer, {
            transformShape: (s) => rotateShapeAround(s, center.x, center.y, rad)
        });
        createdIds.push(...res.createdShapeIds);
    }
    return createdIds;
}

export function getShapeBounds(s, shapes, state) {
    if (s.type === 'line' || s.type === 'rect') {
        return {
            minX: Math.min(s.x1, s.x2),
            minY: Math.min(s.y1, s.y2),
            maxX: Math.max(s.x1, s.x2),
            maxY: Math.max(s.y1, s.y2)
        };
    }
    if (s.type === 'circle') {
        const r = Math.abs(Number(s.r) || 0);
        return { minX: s.cx - r, minY: s.cy - r, maxX: s.cx + r, maxY: s.cy + r };
    }
    if (s.type === 'arc') {
        const r = Math.abs(Number(s.r) || 0);
        const a1 = Number(s.a1) || 0, a2 = Number(s.a2) || 0, ccw = s.ccw !== false;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const push = (px, py) => {
            minX = Math.min(minX, px); minY = Math.min(minY, py);
            maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
        };
        push(s.cx + Math.cos(a1) * r, s.cy + Math.sin(a1) * r);
        push(s.cx + Math.cos(a2) * r, s.cy + Math.sin(a2) * r);
        const card = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
        for (const a of card) {
            if (angleOnArc(a, a1, a2, ccw)) {
                push(s.cx + Math.cos(a) * r, s.cy + Math.sin(a) * r);
            }
        }
        return { minX, minY, maxX, maxY };
    }
    if (s.type === 'hatch') {
        const parsed = buildHatchLoopsFromBoundaryIds(shapes, s.boundaryIds || [], state.view.scale);
        if (parsed.ok && parsed.bounds) return parsed.bounds;
        return null;
    }
    if (s.type === 'text' || s.type === 'position') {
        const x = Number(s.x1 ?? s.x) || 0;
        const y = Number(s.y1 ?? s.y) || 0;
        // Use heuristic for text/position bounds
        const size = (s.type === 'position') ? (s.size || 20) : (s.textSizePt || 12);
        return { minX: x - size, minY: y - size, maxX: x + size, maxY: y + size };
    }
    return null;
}
