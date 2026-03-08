import {
    screenToWorld, snapPoint, getEffectiveGridSize
} from "./geom.js";

export function panByScreenDelta(state, dx, dy) {
    state.view.offsetX += dx;
    state.view.offsetY += dy;
}

export function zoomAt(state, screen, factor) {
    const prevScale = state.view.scale;
    const nextScale = Math.max(state.view.minScale, Math.min(state.view.maxScale, prevScale * factor));
    if (Math.abs(nextScale - prevScale) < 1e-12) return;
    const wx = (screen.x - state.view.offsetX) / prevScale;
    const wy = (screen.y - state.view.offsetY) / prevScale;
    state.view.scale = nextScale;
    state.view.offsetX = screen.x - wx * nextScale;
    state.view.offsetY = screen.y - wy * nextScale;
}

export function getMouseScreen(dom, e) {
    const rect = dom.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

export function getMouseWorld(state, dom, e, snapped = false) {
    const screen = getMouseScreen(dom, e);
    const world = screenToWorld(state.view, screen);
    if (!snapped || !state.grid.snap) return world;
    const gridStep = getEffectiveGridSize(state.grid, state.view, state.pageSetup);
    return snapPoint(world, gridStep);
}
