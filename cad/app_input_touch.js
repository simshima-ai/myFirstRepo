export function createTouchInputController(state, dom, deps) {
    const {
        getMouseScreen,
        panByScreenDelta,
        zoomAt
    } = deps;

    const touchPointers = new Map();
    const pinchState = { active: false, lastDistance: 0, lastCenter: null };

    const upsertTouchPointer = (e) => {
        if (e.pointerType !== "touch") return;
        const p = getMouseScreen(dom, e);
        touchPointers.set(e.pointerId, { x: Number(p.x) || 0, y: Number(p.y) || 0 });
    };

    const removeTouchPointer = (e) => {
        if (e.pointerType !== "touch") return;
        touchPointers.delete(e.pointerId);
        if (touchPointers.size < 2) {
            pinchState.active = false;
            pinchState.lastDistance = 0;
            pinchState.lastCenter = null;
        }
    };

    const getTwoTouchMetrics = () => {
        if (touchPointers.size < 2) return null;
        const pts = Array.from(touchPointers.values());
        const p0 = pts[0];
        const p1 = pts[1];
        const cx = (Number(p0.x) + Number(p1.x)) * 0.5;
        const cy = (Number(p0.y) + Number(p1.y)) * 0.5;
        const dx = Number(p1.x) - Number(p0.x);
        const dy = Number(p1.y) - Number(p0.y);
        const distance = Math.hypot(dx, dy);
        if (!(distance > 0)) return null;
        return { center: { x: cx, y: cy }, distance };
    };

    const isTouchMultiSelect = (e) => !!(state.ui?.touchMode && state.ui?.touchMultiSelect && e?.pointerType === "touch");

    return {
        isAppendSelect(e) {
            return !!(e?.shiftKey || isTouchMultiSelect(e));
        },
        onPointerDown(e) {
            if (e.pointerType !== "touch") return false;
            upsertTouchPointer(e);
            if (touchPointers.size >= 2) {
                const m = getTwoTouchMetrics();
                if (m) {
                    pinchState.active = true;
                    pinchState.lastDistance = m.distance;
                    pinchState.lastCenter = m.center;
                }
                if (e.cancelable) e.preventDefault();
                return true;
            }
            return false;
        },
        onPointerMove(e, drawFast) {
            if (e.pointerType === "touch") upsertTouchPointer(e);
            if (!(pinchState.active && touchPointers.size >= 2)) return false;
            const m = getTwoTouchMetrics();
            if (m) {
                if (pinchState.lastCenter) {
                    const dx = Number(m.center.x) - Number(pinchState.lastCenter.x);
                    const dy = Number(m.center.y) - Number(pinchState.lastCenter.y);
                    if (Number.isFinite(dx) && Number.isFinite(dy) && (Math.abs(dx) > 0 || Math.abs(dy) > 0)) {
                        panByScreenDelta(state, dx, dy);
                    }
                }
                if (pinchState.lastDistance > 0) {
                    const factor = m.distance / pinchState.lastDistance;
                    if (Number.isFinite(factor) && factor > 0) {
                        zoomAt(state, m.center, factor);
                    }
                }
                pinchState.lastDistance = m.distance;
                pinchState.lastCenter = m.center;
                if (drawFast) drawFast();
            }
            if (e.cancelable) e.preventDefault();
            return true;
        },
        onPointerEnd(e) {
            removeTouchPointer(e);
        }
    };
}
