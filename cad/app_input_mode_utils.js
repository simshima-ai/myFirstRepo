export function normalizeLineType(v) {
    const allowed = new Set(["solid", "dashed", "dotted", "dashdot", "longdash", "center", "hidden"]);
    const key = String(v || "solid").toLowerCase();
    return allowed.has(key) ? key : "solid";
}

export function resolveCircleCreateMode(state) {
    const raw = String(state?.circleSettings?.mode || "").toLowerCase();
    if (raw === "drag" || raw === "fixed" || raw === "threepoint") return raw;
    return state?.circleSettings?.radiusLocked ? "fixed" : "drag";
}

export function resolveLineCreateMode(state) {
    const raw = String(state?.lineSettings?.mode || (state?.lineSettings?.continuous ? "continuous" : "segment")).toLowerCase();
    if (raw === "continuous" || raw === "freehand") return raw;
    return "segment";
}
