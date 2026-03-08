export function bindViewportResize(helpers, draw) {
    const getViewportSize = () => {
        const vv = window.visualViewport;
        const width = Math.max(
            1,
            Number(vv?.width)
            || Number(window.innerWidth)
            || Number(document.documentElement?.clientWidth)
            || 1
        );
        const height = Math.max(
            1,
            Number(vv?.height)
            || Number(window.innerHeight)
            || Number(document.documentElement?.clientHeight)
            || 1
        );
        return { width, height };
    };
    let viewportResizeRaf = null;
    const applyViewportResize = () => {
        viewportResizeRaf = null;
        const vp = getViewportSize();
        if (document.documentElement?.style) {
            document.documentElement.style.setProperty("--app-vw", `${Math.round(vp.width)}px`);
            document.documentElement.style.setProperty("--app-vh", `${Math.round(vp.height)}px`);
        }
        if (helpers.resizeCanvas) helpers.resizeCanvas();
        else if (draw) draw();
    };
    const queueViewportResize = () => {
        if (viewportResizeRaf != null) return;
        if (typeof requestAnimationFrame === "function") {
            viewportResizeRaf = requestAnimationFrame(applyViewportResize);
        } else {
            applyViewportResize();
        }
    };
    window.addEventListener("resize", queueViewportResize);
    window.addEventListener("orientationchange", queueViewportResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", queueViewportResize);
        window.visualViewport.addEventListener("scroll", queueViewportResize);
    }
    queueViewportResize();
}
