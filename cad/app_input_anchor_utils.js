export function getRectFromAnchor(anchorWorld, width, height, anchorKey) {
    const w = Math.max(0, Number(width) || 0);
    const h = Math.max(0, Number(height) || 0);
    const key = String(anchorKey || "c").toLowerCase();
    let ox = -w * 0.5;
    let oy = -h * 0.5;
    if (key === "tl") { ox = 0; oy = 0; }
    else if (key === "tc") { ox = -w * 0.5; oy = 0; }
    else if (key === "tr") { ox = -w; oy = 0; }
    else if (key === "cl") { ox = 0; oy = -h * 0.5; }
    else if (key === "cr") { ox = -w; oy = -h * 0.5; }
    else if (key === "bl") { ox = 0; oy = -h; }
    else if (key === "bc") { ox = -w * 0.5; oy = -h; }
    else if (key === "br") { ox = -w; oy = -h; }
    const p1 = { x: Number(anchorWorld.x) + ox, y: Number(anchorWorld.y) + oy };
    const p2 = { x: p1.x + w, y: p1.y + h };
    return { p1, p2 };
}

export function getFixedLineFromAnchor(anchorWorld, len, angleDeg, anchorKey) {
    const L = Math.max(0, Number(len) || 0);
    const a = (Number(angleDeg) || 0) * Math.PI / 180;
    const vx = Math.cos(a) * L;
    const vy = Math.sin(a) * L;
    const key = String(anchorKey || "endpoint_a").toLowerCase();
    if (key === "center") {
        return {
            p1: { x: Number(anchorWorld.x) - vx * 0.5, y: Number(anchorWorld.y) - vy * 0.5 },
            p2: { x: Number(anchorWorld.x) + vx * 0.5, y: Number(anchorWorld.y) + vy * 0.5 },
        };
    }
    if (key === "endpoint_b") {
        return {
            p1: { x: Number(anchorWorld.x) - vx, y: Number(anchorWorld.y) - vy },
            p2: { x: Number(anchorWorld.x), y: Number(anchorWorld.y) },
        };
    }
    return {
        p1: { x: Number(anchorWorld.x), y: Number(anchorWorld.y) },
        p2: { x: Number(anchorWorld.x) + vx, y: Number(anchorWorld.y) + vy },
    };
}
