import { normalizeRad, isAngleOnArc } from "./solvers.js";
import { mmPerUnit } from "./geom.js";
import { getGroup } from "./state.js";
import { createDim, createLine } from "./app_tools_misc.js";

export function trimClickedLineAtNearestIntersection(state, worldRaw, helpers, options = null) {
    const { setStatus, pushHistory, nextShapeId, addShape, removeShapeById, clearSelection, setSelection, getTrimHoverCandidate, hitTestShapes } = helpers;
    // Note: helpers are already bound to state via closures in app.js.
    // Call them WITHOUT passing state again: addShape(shape), removeShapeById(id), etc.
    const excludedShapeIds = new Set((options?.excludedShapeIds || []).map(Number).filter(Number.isFinite));
    const skipHistory = !!options?.skipHistory;
    const silent = !!options?.silent;
    const allowedTargetTypes = Array.isArray(options?.allowedTargetTypes)
        ? new Set(options.allowedTargetTypes.map(v => String(v || "").toLowerCase()))
        : null;
    const probeState = (excludedShapeIds.size > 0)
        ? { ...state, shapes: (state.shapes || []).filter(s => !excludedShapeIds.has(Number(s?.id))) }
        : state;
    const cand = getTrimHoverCandidate(probeState, worldRaw);
    if (cand && allowedTargetTypes) {
        const t = String(cand.targetType || "line").toLowerCase();
        if (!allowedTargetTypes.has(t)) return false;
    }
    if (!cand) {
        const hit = hitTestShapes(probeState, worldRaw);
        if (!hit || hit.type !== "line") return false;
        if (allowedTargetTypes && !allowedTargetTypes.has("line")) return false;
        if (!skipHistory) pushHistory();
        const id = Number(hit.id);
        removeShapeById(id);
        clearSelection();
        if (!silent && setStatus) setStatus(`Trim deleted line #${id}`);
        return true;
    }
    const isNoDelete = !!state.trimSettings?.noDelete;
    if (cand.targetType === "circle" || cand.targetType === "arc") {
        if (!skipHistory) pushHistory();
        const a = cand.arc || cand.circle;
        const keepIds = [];
        const inGroups = (state.groups || []).filter(g => (g.shapeIds || []).some(id => Number(id) === Number(a.id)));

        if (cand.mode === "delete-arc" || cand.mode === "delete-circle") {
            if (!isNoDelete) removeShapeById(Number(a.id));
            else keepIds.push(Number(a.id));
        } else if (cand.mode === "arc-remove-arc") {
            if (isNoDelete) {
                const remArc = { ...a, id: nextShapeId(), a1: cand.remA1, a2: cand.remA2, type: "arc" };
                addShape(remArc);
                for (const g of inGroups) g.shapeIds.push(Number(remArc.id));
                keepIds.push(Number(remArc.id));
            }
            a.type = "arc";
            a.a1 = cand.keepA1; a.a2 = cand.keepA2; a.ccw = (a.ccw !== false);
            keepIds.push(Number(a.id));
        } else if (cand.mode === "arc-remove-middle") {
            if (isNoDelete) {
                const remArc = { ...a, id: nextShapeId(), a1: cand.remA1, a2: cand.remA2, type: "arc" };
                addShape(remArc);
                for (const g of inGroups) g.shapeIds.push(Number(remArc.id));
                keepIds.push(Number(remArc.id));
            }
            a.type = "arc";
            a.a1 = cand.keep1A1; a.a2 = cand.keep1A2; a.ccw = (cand.keepCCW !== false);
            keepIds.push(Number(a.id));
            const a2new = { ...a, id: nextShapeId(), a1: cand.keep2A1, a2: cand.keep2A2, ccw: (cand.keepCCW !== false) };
            addShape(a2new);
            for (const g of inGroups) g.shapeIds.push(Number(a2new.id));
            keepIds.push(Number(a2new.id));
        }

        if (keepIds.length) setSelection(keepIds);
        if (!silent && setStatus) setStatus(isNoDelete ? `Split ${a.type} #${a.id}` : `Trimmed ${a.type} #${a.id}`);
        return true;
    }

    const line = cand.line;
    if (!skipHistory) pushHistory();
    const inGroups = (state.groups || []).filter(g => (g.shapeIds || []).some(id => Number(id) === Number(line.id)));

    if (cand.mode === "delete-line") {
        if (!isNoDelete) {
            removeShapeById(Number(line.id));
            setSelection([]);
        } else {
            setSelection([Number(line.id)]);
        }
    } else if (cand.mode === "p1") {
        if (isNoDelete) {
            const cutLine = { ...line, id: nextShapeId(), x2: cand.ip.x, y2: cand.ip.y };
            addShape(cutLine);
            for (const g of inGroups) g.shapeIds.push(Number(cutLine.id));
        }
        line.x1 = cand.ip.x; line.y1 = cand.ip.y;
        setSelection(isNoDelete ? [Number(line.id), Number(state.shapes[state.shapes.length - 1].id)] : [Number(line.id)]);
    } else if (cand.mode === "p2") {
        if (isNoDelete) {
            const cutLine = { ...line, id: nextShapeId(), x1: cand.ip.x, y1: cand.ip.y };
            addShape(cutLine);
            for (const g of inGroups) g.shapeIds.push(Number(cutLine.id));
        }
        line.x2 = cand.ip.x; line.y2 = cand.ip.y;
        setSelection(isNoDelete ? [Number(line.id), Number(state.shapes[state.shapes.length - 1].id)] : [Number(line.id)]);
    } else if (cand.mode === "middle") {
        const ox1 = Number(line.x1), oy1 = Number(line.y1);
        const ox2 = Number(line.x2), oy2 = Number(line.y2);
        const left = cand.ip1, right = cand.ip2;

        if (isNoDelete) {
            const midLine = { ...line, id: nextShapeId(), x1: left.x, y1: left.y, x2: right.x, y2: right.y };
            addShape(midLine);
            for (const g of inGroups) g.shapeIds.push(Number(midLine.id));
        }
        line.x1 = ox1; line.y1 = oy1; line.x2 = left.x; line.y2 = left.y;
        const newLine = { ...line, id: nextShapeId(), x1: right.x, y1: right.y, x2: ox2, y2: oy2 };
        addShape(newLine);
        for (const g of inGroups) g.shapeIds.push(Number(newLine.id));
        setSelection([Number(line.id), Number(newLine.id)]);
    }

    if (!silent && setStatus) setStatus(isNoDelete ? `Split line #${line.id}` : `Trimmed line #${line.id}`);
    return true;
}

export function beginOrAdvanceDim(state, worldRaw, helpers) {
    const { setStatus, hitTestShapes } = helpers;
    const world = { x: worldRaw.x, y: worldRaw.y };
    const circleMode = state.dimSettings?.circleMode || "radius";
    const circleArrowSide = state.dimSettings?.circleArrowSide === "inside" ? "inside" : "outside";
    const linearMode = state.dimSettings?.linearMode || "single";
    const snapMode = String(state.dimSettings?.snapMode || "endpoint");
    const lineObjectPickEnabled = (snapMode === "object" || snapMode === "endpoint");

    if (!state.dimDraft) {
        const hit = hitTestShapes(state, worldRaw);
        if (linearMode === "angle") {
            if (hit && hit.type === "line") {
                state.dimDraft = {
                    type: "dimangle",
                    line1Id: Number(hit.id),
                    pick1: { x: world.x, y: world.y }
                };
                if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
                return "p1";
            }
            if (setStatus) setStatus("角度寸法: 1本目のラインをクリック");
            return "noop";
        }
        // Object mode: clicking a line creates a linear dimension from line endpoints immediately.
        if (lineObjectPickEnabled && linearMode !== "chain" && hit && hit.type === "line") {
            state.dimDraft = {
                p1: { x: Number(hit.x1), y: Number(hit.y1) },
                p2: { x: Number(hit.x2), y: Number(hit.y2) },
                place: { x: world.x, y: world.y },
                sourceLineId: Number(hit.id),
            };
            return "place";
        }
        if (hit && (hit.type === 'circle' || hit.type === 'arc')) {
            const cx = Number(hit.cx), cy = Number(hit.cy), r = Number(hit.r);
            const ang = Math.atan2(world.y - cy, world.x - cx);
            const ux = Math.cos(ang), uy = Math.sin(ang);
            const textOff = r + 20 / Math.max(1e-9, state.view.scale);
            state.dimDraft = {
                type: "circleDim",
                dimRef: { targetId: Number(hit.id) },
                kind: circleMode === "diameter" ? "diameter" : "radius",
                circleArrowSide,
                ang: ang,
                off1: r + 20 / state.view.scale,
                off2: circleMode === "diameter" ? -r : 0,
                tdx: ux * textOff, tdy: uy * textOff
            };
            return "place";
        }

        if (linearMode === "chain") {
            state.dimDraft = {
                type: "dimchain",
                points: [{ x: world.x, y: world.y }],
                hoverPoint: { x: world.x, y: world.y },
                hoverPlace: { x: world.x, y: world.y },
                awaitingPlacement: false
            };
            if (setStatus) setStatus("逶ｴ蛻怜ｯｸ豕包ｼ・轤ｹ逶ｮ繧帝∈謚槭＠縺ｦ縺上□縺輔＞");
            return "p1";
        } else {
            state.dimDraft = { p1: { x: world.x, y: world.y }, hover: { x: world.x, y: world.y } };
            if (setStatus) setStatus("蟇ｸ豕包ｼ・轤ｹ逶ｮ繧帝∈謚槭＠縺ｦ縺上□縺輔＞");
            return "p1";
        }
    }

    if (state.dimDraft.type === "dimchain") {
        if (state.dimDraft.awaitingPlacement) {
            state.dimDraft.place = { x: world.x, y: world.y };
            return "place";
        }
        if (state.dimDraft.points.length === 1) {
            state.dimDraft.points.push({ x: world.x, y: world.y });
            if (setStatus) setStatus("Chain dim: click more points, then press Enter to place.");
            return "p2";
        }
        state.dimDraft.points.push({ x: world.x, y: world.y });
        return "point";
    }

    if (state.dimDraft.type === "dimangle") {
        const hit = hitTestShapes(state, worldRaw);
        if (!hit || hit.type !== "line") {
            if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
            return "noop";
        }
        const line1Id = Number(state.dimDraft.line1Id);
        const line2Id = Number(hit.id);
        if (line1Id === line2Id) {
            if (setStatus) setStatus("角度寸法: 別のラインを選択してください");
            return "noop";
        }
        const line1 = (state.shapes || []).find(s => Number(s?.id) === line1Id && s.type === "line");
        const line2 = (state.shapes || []).find(s => Number(s?.id) === line2Id && s.type === "line");
        if (!line1 || !line2) {
            if (setStatus) setStatus("角度寸法: ラインが見つかりません");
            return "noop";
        }
        const solved = solveDimAngleFromLines(state, line1, line2, state.dimDraft.pick1 || world, world);
        if (!solved) {
            if (setStatus) setStatus("角度寸法: 平行ラインには作成できません");
            return "noop";
        }
        state.dimDraft = {
            type: "dimangle",
            line1Id,
            line2Id,
            ...solved
        };
        return "place";
    }

    if (state.dimDraft.dimRef && state.dimDraft.type === "circleDim") {
        const ref = state.shapes.find(s => Number(s?.id) === Number(state.dimDraft?.dimRef?.targetId));
        if (ref && (ref.type === "circle" || ref.type === "arc")) {
            const cx = Number(ref.cx), cy = Number(ref.cy);
            state.dimDraft.tdx = world.x - cx;
            state.dimDraft.tdy = world.y - cy;
        } else {
            state.dimDraft.tx = world.x;
            state.dimDraft.ty = world.y;
        }
        return "place";
    }

    if (state.dimDraft.dimRef) return "circle-ref";

    if (!state.dimDraft.p2) {
        if (Math.hypot(world.x - state.dimDraft.p1.x, world.y - state.dimDraft.p1.y) < 1e-9) return "noop";
        state.dimDraft.p2 = { x: world.x, y: world.y };
        if (setStatus) setStatus("蟇ｸ豕包ｼ夐・鄂ｮ菴咲ｽｮ繧呈欠螳壹＠縺ｦ縺上□縺輔＞");
        return "p2";
    }

    state.dimDraft.place = { x: world.x, y: world.y };
    return "place";
}

export function updateDimHover(state, worldRaw, worldSnapped, helpers) {
    const { setStatus, hitTestShapes } = helpers;
    const world = worldSnapped ? { x: worldSnapped.x, y: worldSnapped.y } : { x: worldRaw.x, y: worldRaw.y };
    const { snapMode, circleMode, linearMode } = state.dimSettings;
    const lineObjectPickEnabled = (String(snapMode || "endpoint") === "object" || String(snapMode || "endpoint") === "endpoint");
    const circleArrowSide = state.dimSettings?.circleArrowSide === "inside" ? "inside" : "outside";

    if (!state.dimDraft) {
        const hit = hitTestShapes(state, worldRaw);
        // Dim tool candidate marker on mouse-over (line/circle/arc), independent from object-snap toggle.
        let hoverCandidate = null;
        if (hit && hit.type === "line") {
            const x1 = Number(hit.x1), y1 = Number(hit.y1), x2 = Number(hit.x2), y2 = Number(hit.y2);
            const vx = x2 - x1, vy = y2 - y1;
            const vv = vx * vx + vy * vy;
            if (vv > 1e-12) {
                let t = ((worldRaw.x - x1) * vx + (worldRaw.y - y1) * vy) / vv;
                if (t < 0) t = 0;
                if (t > 1) t = 1;
                hoverCandidate = { x: x1 + vx * t, y: y1 + vy * t, kind: "nearest" };
            } else {
                hoverCandidate = { x: x1, y: y1, kind: "nearest" };
            }
        } else if (hit && (hit.type === "circle" || hit.type === "arc")) {
            const cx = Number(hit.cx), cy = Number(hit.cy), r = Math.abs(Number(hit.r) || 0);
            if (r > 1e-9) {
                let ang = Math.atan2(worldRaw.y - cy, worldRaw.x - cx);
                if (hit.type === "arc" && !isAngleOnArc(ang, Number(hit.a1) || 0, Number(hit.a2) || 0, hit.ccw !== false)) {
                    const a1 = Number(hit.a1) || 0, a2 = Number(hit.a2) || 0;
                    const p1 = { x: cx + Math.cos(a1) * r, y: cy + Math.sin(a1) * r };
                    const p2 = { x: cx + Math.cos(a2) * r, y: cy + Math.sin(a2) * r };
                    const d1 = Math.hypot(worldRaw.x - p1.x, worldRaw.y - p1.y);
                    const d2 = Math.hypot(worldRaw.x - p2.x, worldRaw.y - p2.y);
                    hoverCandidate = (d1 <= d2) ? { ...p1, kind: "nearest" } : { ...p2, kind: "nearest" };
                } else {
                    hoverCandidate = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, kind: "nearest" };
                }
            }
        }
        // In single mode, always show a target marker before first click,
        // even when not hovering an object.
        if (!hoverCandidate && String(linearMode || "single") !== "chain") {
            hoverCandidate = { x: Number(world.x), y: Number(world.y), kind: "nearest" };
        }
        state.input.objectSnapHover = hoverCandidate;

        if (hit && (hit.type === "circle" || hit.type === "arc")) {
            const cx = Number(hit.cx), cy = Number(hit.cy), r = Number(hit.r);
            const ang = Math.atan2(world.y - cy, world.x - cx);
            const ux = Math.cos(ang), uy = Math.sin(ang);
            const textOff = r + 20 / Math.max(1e-9, state.view.scale);
            // Radial/Diameter Preview on hover
            state.input.dimHoveredShapeId = Number(hit.id);
            state.input.dimHoverPreview = {
                type: "circleDim",
                dimRef: { targetId: Number(hit.id) },
                kind: circleMode === "diameter" ? "diameter" : "radius",
                circleArrowSide,
                ang: ang,
                off1: r + 20 / state.view.scale,
                off2: circleMode === "diameter" ? -r : 0,
                tdx: ux * textOff, tdy: uy * textOff
            };
            if (setStatus) setStatus("繧ｯ繝ｪ繝・け縺ｧ蟇ｸ豕穂ｽ懈・");
            return;
        } else {
            state.input.dimHoverPreview = null;
        }

        if (String(linearMode || "single") === "angle") {
            if (hit && hit.type === "line") {
                state.input.dimHoveredShapeId = Number(hit.id);
                if (setStatus) setStatus("角度寸法: 1本目/2本目のラインをクリック");
            } else {
                state.input.dimHoveredShapeId = null;
                if (setStatus) setStatus("角度寸法: ライン上にマウスオーバーしてクリック");
            }
        } else if (lineObjectPickEnabled) {
            if (hit && hit.type === "line") {
                state.input.dimHoveredShapeId = Number(hit.id);
                if (setStatus) setStatus("Dim: line selected. Press Enter to confirm.");
            } else {
                state.input.dimHoveredShapeId = null;
                if (setStatus) setStatus("蟇ｸ豕包ｼ壼ｯｾ雎｡繧帝∈謚槭☆繧九°1轤ｹ逶ｮ繧偵け繝ｪ繝・け");
            }
        } else {
            state.input.dimHoveredShapeId = null;
            if (setStatus) setStatus("蟇ｸ豕包ｼ・轤ｹ逶ｮ繧偵け繝ｪ繝・け");
        }
        return;
    }

    state.input.dimHoveredShapeId = null;
    state.input.dimHoverPreview = null;

    if (state.dimDraft.type === "dimangle") {
        const hit = hitTestShapes(state, worldRaw);
        if (hit && hit.type === "line" && Number(hit.id) !== Number(state.dimDraft.line1Id)) {
            const x1 = Number(hit.x1), y1 = Number(hit.y1), x2 = Number(hit.x2), y2 = Number(hit.y2);
            const vx = x2 - x1, vy = y2 - y1;
            const vv = vx * vx + vy * vy;
            let p = { x: x1, y: y1, kind: "nearest" };
            if (vv > 1e-12) {
                let t = ((worldRaw.x - x1) * vx + (worldRaw.y - y1) * vy) / vv;
                if (t < 0) t = 0;
                if (t > 1) t = 1;
                p = { x: x1 + vx * t, y: y1 + vy * t, kind: "nearest" };
            }
            state.input.objectSnapHover = p;
            state.input.dimHoveredShapeId = Number(hit.id);
            if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
        } else {
            state.input.objectSnapHover = null;
            if (setStatus) setStatus("角度寸法: 2本目のラインをクリック");
        }
        return;
    }

    if (state.dimDraft.type === "dimchain") {
        if (state.dimDraft.awaitingPlacement) {
            state.dimDraft.hoverPlace = { x: world.x, y: world.y };
        } else {
            state.dimDraft.hoverPoint = { x: world.x, y: world.y };
        }
    } else if (state.dimDraft.dimRef) {
        state.dimDraft.x2 = world.x;
        state.dimDraft.y2 = world.y;
    } else if (!state.dimDraft.p2) {
        state.dimDraft.hover = { x: world.x, y: world.y };
    } else {
        state.dimDraft.place = { x: world.x, y: world.y };
    }
}

export function cancelDimDraft(state) {
    state.dimDraft = null;
}

export function finalizeDimDraft(state, helpers) {
    const { pushHistory, addShape, setSelection, nextShapeId } = helpers;
    const d = state.dimDraft;
    if (!d) return false;

    let dim = null;
    if (d.type === 'circleDim') {
        dim = createDim({
            type: 'circleDim',
            kind: d.kind,
            dimRef: d.dimRef,
            circleArrowSide: d.circleArrowSide === "inside" ? "inside" : "outside",
            ang: d.ang,
            off1: d.off1,
            off2: d.off2,
            tdx: d.tdx, tdy: d.tdy,
            tx: d.tx, ty: d.ty,
            layerId: state.activeLayerId
        });
    } else if (d.dimRef) {
        // Fallback for old dim-radial style if any
        dim = createDim({
            type: 'dim',
            kind: d.kind,
            dimRef: d.dimRef,
            x2: d.x2, y2: d.y2,
            layerId: state.activeLayerId
        });
    } else if (d.type === "dimangle" && Number.isFinite(Number(d.cx)) && Number.isFinite(Number(d.cy))
        && Number.isFinite(Number(d.r)) && Number.isFinite(Number(d.a1)) && Number.isFinite(Number(d.a2))) {
        dim = createDim({
            type: "dimangle",
            cx: Number(d.cx), cy: Number(d.cy),
            r: Math.max(1e-6, Number(d.r)),
            a1: Number(d.a1), a2: Number(d.a2),
            line1Id: Number(d.line1Id),
            line2Id: Number(d.line2Id),
            line1RayEnd: String(d.line1RayEnd || "p1"),
            line2RayEnd: String(d.line2RayEnd || "p1"),
            textOffset: Number(d.textOffset),
            tx: Number(d.tx), ty: Number(d.ty),
            layerId: state.activeLayerId
        });
    } else if (d.points && d.points.length >= 2) {
        dim = createDim({
            type: 'dimchain',
            points: d.points.map(p => ({ x: p.x, y: p.y })),
            px: d.place.x, py: d.place.y,
            layerId: state.activeLayerId
        });
    } else if (d.p1 && d.p2 && d.place) {
        if (Math.hypot(d.p2.x - d.p1.x, d.p2.y - d.p1.y) < 1e-9) {
            state.dimDraft = null;
            return false;
        }
        dim = createDim({
            type: 'dim',
            x1: d.p1.x, y1: d.p1.y,
            x2: d.p2.x, y2: d.p2.y,
            px: d.place.x, py: d.place.y,
            layerId: state.activeLayerId
        });
        // Single-mode object-pick from line: bind dim endpoints to source line endpoints.
        if (Number.isFinite(Number(d.sourceLineId))) {
            const srcId = Number(d.sourceLineId);
            dim.p1Attrib = { type: "followPoint", shapeId: srcId, refType: "line_endpoint", refKey: "p1" };
            dim.p2Attrib = { type: "followPoint", shapeId: srcId, refType: "line_endpoint", refKey: "p2" };
            if (!Array.isArray(dim.attributes)) dim.attributes = [];
            dim.attributes.push({
                id: `attr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
                name: "keep_snap",
                value: `follow:line_endpoint:${srcId}:p1`,
                target: "vertex:p1"
            });
            dim.attributes.push({
                id: `attr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
                name: "keep_snap",
                value: `follow:line_endpoint:${srcId}:p2`,
                target: "vertex:p2"
            });
        }
    }

    if (dim && state.dimSettings) {
        const ds = state.dimSettings;
        if (ds.precision !== undefined) dim.precision = ds.precision;
        if (ds.textRotate !== undefined) dim.textRotate = ds.textRotate;
        if (ds.extOffset !== undefined) dim.extOffset = ds.extOffset;
        if (ds.extOver !== undefined) dim.extOver = ds.extOver;
        if (ds.fontSize !== undefined) dim.fontSize = ds.fontSize;
        if (ds.dimArrowType !== undefined) dim.dimArrowType = ds.dimArrowType;
        if (ds.dimArrowSize !== undefined) dim.dimArrowSizePt = ds.dimArrowSize;
        if (ds.dimArrowDirection !== undefined) dim.dimArrowDirection = (String(ds.dimArrowDirection) === "reverse" ? "reverse" : "normal");
        if (ds.rOvershoot !== undefined) dim.rOverrun = ds.rOvershoot;
        if (ds.circleArrowSide !== undefined) dim.circleArrowSide = (ds.circleArrowSide === "inside" ? "inside" : "outside");
        dim.lineWidthMm = Math.max(0.01, Number(ds.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        dim.lineType = String(ds.lineType || "solid");
    }

    if (dim) {
        if (pushHistory) pushHistory();
        dim.id = nextShapeId();
        dim.groupId = state.input.dimSessionGroupId;
        addShape(dim);

        if (!state.input.dimSessionGroupId) {
            // If we don't have a session group yet, find the one addShape created
            const createdShape = state.shapes.find(s => s.id === dim.id);
            if (createdShape && createdShape.groupId != null) {
                state.input.dimSessionGroupId = createdShape.groupId;
                // Rename the group to "Dim" if it was auto-named
                const g = getGroup(state, state.input.dimSessionGroupId);
                if (g && g.name.startsWith("Group ")) {
                    g.name = "Dim";
                }
            }
        } else {
            // Add to existing session group
            const g = getGroup(state, state.input.dimSessionGroupId);
            if (g) {
                if (!g.shapeIds.includes(dim.id)) g.shapeIds.push(dim.id);
            }
        }

        // Re-select the created dimension object itself (not group selection),
        // so its edit controllers are immediately adjustable.
        state.activeGroupId = null;
        setSelection([dim.id]);
        state.dimDraft = null;
        state.input.dimHoveredShapeId = null;
        state.input.dimHoverPreview = null;
        return true;
    }

    state.dimDraft = null;
    return false;
}

export function beginOrExtendPolyline(state, world) {
    if (!state.polylineDraft) {
        state.polylineDraft = {
            points: [{ x: world.x, y: world.y }],
            hoverPoint: { x: world.x, y: world.y },
        };
        return;
    }
    const pts = state.polylineDraft.points;
    const last = pts[pts.length - 1];
    if (Math.hypot(world.x - last.x, world.y - last.y) < 1e-9) return;
    pts.push({ x: world.x, y: world.y });
    state.polylineDraft.hoverPoint = { x: world.x, y: world.y };
}

export function updatePolylineHover(state, world) {
    if (!state.polylineDraft) return;
    state.polylineDraft.hoverPoint = { x: world.x, y: world.y };
}

export function cancelPolylineDraft(state) {
    state.polylineDraft = null;
}

export function finalizePolylineDraft(state, helpers) {
    const { pushHistory, addShapesAsGroup, setSelection, nextShapeId } = helpers;
    const d = state.polylineDraft;
    if (!d || !Array.isArray(d.points) || d.points.length < 2) {
        state.polylineDraft = null;
        return false;
    }
    const lines = [];
    const createdIds = [];
    if (pushHistory) pushHistory();
    for (let i = 0; i < d.points.length - 1; i++) {
        const a = d.points[i], b = d.points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue;
        const line = createLine(a, b);
        line.layerId = state.activeLayerId;
        line.id = nextShapeId();
        line.lineWidthMm = Math.max(0.01, Number(state.lineSettings?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25);
        line.lineType = String(state.lineSettings?.lineType || "solid");
        lines.push(line);
        createdIds.push(line.id);
    }
    state.polylineDraft = null;
    if (lines.length) {
        if (typeof addShapesAsGroup === "function") {
            addShapesAsGroup(lines);
        } else {
            // Fallback: add as one explicit group id
            const gid = Number(state.nextGroupId) || 1;
            state.nextGroupId = gid + 1;
            state.groups.unshift({
                id: gid,
                name: state.tool === "line" ? "Line Group" : "Polyline",
                shapeIds: createdIds.slice(),
                parentId: null,
                originX: 0,
                originY: 0,
                rotationDeg: 0,
            });
            for (const line of lines) {
                line.groupId = gid;
                state.shapes.push(line);
            }
        }
        setSelection(createdIds);
    }
    return createdIds.length > 0;
}

function lineInfiniteIntersection(l1, l2) {
    const x1 = Number(l1.x1), y1 = Number(l1.y1), x2 = Number(l1.x2), y2 = Number(l1.y2);
    const x3 = Number(l2.x1), y3 = Number(l2.y1), x4 = Number(l2.x2), y4 = Number(l2.y2);
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-12) return null;
    const px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / d;
    const py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / d;
    if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
    return { x: px, y: py };
}

function lineDirectionFromPick(line, center, pick) {
    const ax = Number(line.x1), ay = Number(line.y1), bx = Number(line.x2), by = Number(line.y2);
    const vx = bx - ax, vy = by - ay;
    const lv = Math.hypot(vx, vy);
    if (lv < 1e-12) return null;
    const ux = vx / lv, uy = vy / lv;
    const tx = Number(pick.x) - Number(center.x), ty = Number(pick.y) - Number(center.y);
    const sign = ((tx * ux + ty * uy) >= 0) ? 1 : -1;
    return { x: ux * sign, y: uy * sign };
}

function pickRayEndKey(line, center, dir) {
    const p1 = { x: Number(line.x1), y: Number(line.y1) };
    const p2 = { x: Number(line.x2), y: Number(line.y2) };
    const v1 = { x: p1.x - Number(center.x), y: p1.y - Number(center.y) };
    const v2 = { x: p2.x - Number(center.x), y: p2.y - Number(center.y) };
    const d1 = v1.x * Number(dir.x) + v1.y * Number(dir.y);
    const d2 = v2.x * Number(dir.x) + v2.y * Number(dir.y);
    return d2 > d1 ? "p2" : "p1";
}

function dimMmToWorldInTools(state, mm) {
    const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
    const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
    return (Math.max(0, Number(mm) || 0) * pageScale) / Math.max(1e-9, unitMm);
}

function solveDimAngleFromLines(state, line1, line2, pick1, pick2) {
    const c = lineInfiniteIntersection(line1, line2);
    if (!c) return null;
    const d1 = lineDirectionFromPick(line1, c, pick1);
    const d2 = lineDirectionFromPick(line2, c, pick2);
    if (!d1 || !d2) return null;
    let a1 = Math.atan2(d1.y, d1.x);
    let a2 = Math.atan2(d2.y, d2.x);
    let da = normalizeRad(a2 - a1);
    if (da > Math.PI) {
        const t = a1; a1 = a2; a2 = t;
        da = normalizeRad(a2 - a1);
    }
    if (da < 1e-6) return null;
    const rMin = dimMmToWorldInTools(state, 8);
    const rBase = dimMmToWorldInTools(state, 18);
    const distPick = Math.hypot(Number(pick2.x) - c.x, Number(pick2.y) - c.y);
    const r = Math.max(rMin, Math.min(distPick * 0.8, rBase * 2.5, Math.max(rBase, distPick * 0.35)));
    const midA = a1 + da * 0.5;
    const textOff = dimMmToWorldInTools(state, 4) + dimMmToWorldInTools(state, Number(state.dimSettings?.fontSize ?? 12) * 0.25);
    return {
        cx: c.x,
        cy: c.y,
        r,
        a1,
        a2,
        tx: c.x + Math.cos(midA) * (r + textOff),
        ty: c.y + Math.sin(midA) * (r + textOff),
        textOffset: r + textOff,
        line1RayEnd: pickRayEndKey(line1, c, d1),
        line2RayEnd: pickRayEndKey(line2, c, d2),
    };
}

export function popDimChainPoint(state, helpers) {
    const { draw, setStatus } = helpers;
    if (state.dimDraft && state.dimDraft.points && state.dimDraft.points.length > 0) {
        state.dimDraft.points.pop();
        if (state.dimDraft.points.length === 0) {
            state.dimDraft = null;
            if (setStatus) setStatus("Dim chain canceled.");
        } else {
            if (setStatus) setStatus(`Dim chain point removed (points: ${state.dimDraft.points.length})`);
        }
        if (draw) draw();
    }
}

export function applyDimSettingsToSelection(state, helpers, patch) {
    const { pushHistory, draw } = helpers;
    const selectedDimIds = (state.selection?.ids || []).map(Number);
    const selectedDims = (state.shapes || []).filter(s => selectedDimIds.includes(Number(s.id)) && (s.type === "dim" || s.type === "dimchain" || s.type === "dimangle" || s.type === "circleDim"));

    if (selectedDims.length > 0) {
        if (pushHistory) pushHistory();
        for (const dim of selectedDims) {
            Object.assign(dim, patch);
        }
        if (draw) draw();
    }
}


