import { snapshotModel, isLayerVisible } from "./state.js";
import { getObjectSnapPoint } from "./solvers.js";
import { snapPoint, getEffectiveGridSize, mmPerUnit } from "./geom.js";
import {
  hitTestDimPart,
  getDimGeometry,
  getDimChainGeometry,
  getCircleDimGeometry,
  getDimAngleGeometry,
  getLinearDimTextHandleWorld
} from "./dim_geom.js";

export function hitTestDimHandle(state, worldRaw) {
  if (state.tool !== "select") return null;
  const tol = 10 / Math.max(1e-9, state.view.scale);
  const dimMmToWorld = (mm) => {
    const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
    const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
    return Math.max(0, Number(mm) || 0) * pageScale / Math.max(1e-9, unitMm);
  };
  const selectedIds = new Set((state.selection.ids || []).map(Number));
  for (let i = state.shapes.length - 1; i >= 0; i--) {
    const s = state.shapes[i];
    if (!s || (s.type !== "dim" && s.type !== "dimchain" && s.type !== "dimangle" && s.type !== "circleDim")) continue;
    if (!selectedIds.has(Number(s.id))) continue;
    if (!isLayerVisible(state, s.layerId)) continue;
    const part = hitTestDimPart(s, worldRaw.x, worldRaw.y, state.shapes, state.view.scale);
    if (part) return { id: Number(s.id), dim: s, part };
    if (s.type === "dim") {
      const g = getDimGeometry(s);
      if (g) {
        const extOffWorld = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
        const defaultVisWorld = Math.max(0, Math.abs(Number(g.off) || 0) - extOffWorld);
        const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
        const sign = Math.sign(Number(g.off) || 0) || 1;
        const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
        const vis1 = Number.isFinite(Number(visLens[0])) ? Math.max(0, Number(visLens[0])) : defaultVisWorld;
        const vis2 = Number.isFinite(Number(visLens[1])) ? Math.max(0, Number(visLens[1])) : defaultVisWorld;
        const hp1 = { x: Number(g.d1.x) - enx * vis1, y: Number(g.d1.y) - eny * vis1 };
        const hp2 = { x: Number(g.d2.x) - enx * vis2, y: Number(g.d2.y) - eny * vis2 };
        if (Math.hypot(worldRaw.x - hp1.x, worldRaw.y - hp1.y) < tol) return { id: Number(s.id), dim: s, part: "extVisDim:0" };
        if (Math.hypot(worldRaw.x - hp2.x, worldRaw.y - hp2.y) < tol) return { id: Number(s.id), dim: s, part: "extVisDim:1" };
      }
    }
    if (s.type === "dimchain") {
      const g = getDimChainGeometry(s);
      if (g && Array.isArray(g.dimPoints) && Array.isArray(s.points) && g.dimPoints.length === s.points.length) {
        const extOffWorld = dimMmToWorld(Number(s.extOffset ?? 2) || 0);
        const defaultVisWorld = Math.max(0, Math.abs(Number(g.off) || 0) - extOffWorld);
        const visLens = Array.isArray(s.extVisLens) ? s.extVisLens : [];
        const sign = Math.sign(Number(g.off) || 0) || 1;
        const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
        for (let i = 0; i < g.dimPoints.length; i++) {
          const dpt = g.dimPoints[i];
          const vis = Number.isFinite(Number(visLens[i])) ? Math.max(0, Number(visLens[i])) : defaultVisWorld;
          const hp = { x: Number(dpt.x) - enx * vis, y: Number(dpt.y) - eny * vis };
          if (Math.hypot(worldRaw.x - hp.x, worldRaw.y - hp.y) < tol) return { id: Number(s.id), dim: s, part: `extVis:${i}` };
        }
      }
    }
  }
  return null;
}

export function beginDimHandleDrag(state, hit, worldRaw = null) {
  const dim = hit?.dim || hit;
  state.input.dimHandleDrag.active = true;
  state.input.dimHandleDrag.dimId = Number(dim.id);
  state.input.dimHandleDrag.part = String(hit?.part || "line");
  state.input.dimHandleDrag.modelSnapshotBeforeMove = snapshotModel(state);
  state.input.dimHandleDrag.moved = false;
  state.input.dimHandleDrag.lastWorld = worldRaw ? { x: Number(worldRaw.x) || 0, y: Number(worldRaw.y) || 0 } : null;
}

export function applyDimHandleDrag(state, worldRaw) {
  const dd = state.input.dimHandleDrag;
  if (!dd.active) return;
  const dim = state.shapes.find(s => s && (s.id === dd.dimId || Number(s.id) === Number(dd.dimId)));
  if (!dim) return;
  const p = state.grid.snap ? snapPoint(worldRaw, getEffectiveGridSize(state.grid, state.view, state.pageSetup)) : worldRaw;
  const objectSnapPoint = getObjectSnapPoint(state, worldRaw, () => true);
  const pSnap = objectSnapPoint || p;
  const projectPointToAxis = (base, axis, point) => {
    const ax = Number(axis?.x) || 0;
    const ay = Number(axis?.y) || 0;
    const alen = Math.hypot(ax, ay);
    if (alen < 1e-9) return { x: Number(base?.x) || 0, y: Number(base?.y) || 0 };
    const ux = ax / alen, uy = ay / alen;
    const bx = Number(base?.x) || 0, by = Number(base?.y) || 0;
    const t = (point.x - bx) * ux + (point.y - by) * uy;
    return { x: bx + ux * t, y: by + uy * t };
  };
  const dimPtToWorld = (pt) => {
    const mm = Math.max(0, Number(pt) || 0) * (25.4 / 72);
    const pageScale = Math.max(0.0001, Number(state.pageSetup?.scale ?? 1) || 1);
    const unitMm = mmPerUnit(state.pageSetup?.unit || "mm");
    return mm * pageScale / Math.max(1e-9, unitMm);
  };
  const buildKeepSnapAttribFromPoint = (pt) => {
    if (objectSnapPoint && objectSnapPoint.kind === "intersection"
      && Number.isFinite(Number(objectSnapPoint.lineAId))
      && Number.isFinite(Number(objectSnapPoint.lineBId))) {
      return {
        type: "intersection",
        lineAId: Number(objectSnapPoint.lineAId),
        lineBId: Number(objectSnapPoint.lineBId),
      };
    }
    if (objectSnapPoint
      && Number.isFinite(Number(objectSnapPoint.shapeId))
      && String(objectSnapPoint.refType || "").length > 0) {
      return {
        type: "followPoint",
        shapeId: Number(objectSnapPoint.shapeId),
        refType: String(objectSnapPoint.refType),
        refKey: String(objectSnapPoint.refKey || "")
      };
    }
    if (Number.isFinite(Number(pt?.x)) && Number.isFinite(Number(pt?.y))) {
      return { type: "fixedPoint", x: Number(pt.x), y: Number(pt.y) };
    }
    return null;
  };
  const applyKeepSnapToDimTarget = (dimObj, targetKey, pt) => {
    const keepSnap = !!(state.objectSnap?.keepAttributes || state.objectSnap?.tangentKeep);
    if (!keepSnap || !dimObj || (targetKey !== "p1" && targetKey !== "p2")) return;
    const attrib = buildKeepSnapAttribFromPoint(pt);
    if (!attrib) return;
    if (targetKey === "p1") dimObj.p1Attrib = attrib;
    else dimObj.p2Attrib = attrib;
  };
  const alignDimChainTargets = (d) => {
    if (!d || !Array.isArray(d.points) || d.points.length < 2) return;
    const p0 = d.points[0];
    const pN = d.points[d.points.length - 1];
    const uxRaw = Number(pN.x) - Number(p0.x);
    const uyRaw = Number(pN.y) - Number(p0.y);
    const uLen = Math.hypot(uxRaw, uyRaw);
    if (uLen < 1e-9) return;
    const ux = uxRaw / uLen, uy = uyRaw / uLen;
    const bx = Number(p0.x), by = Number(p0.y);
    for (let i = 1; i < d.points.length - 1; i++) {
      const pt = d.points[i];
      const t = (Number(pt.x) - bx) * ux + (Number(pt.y) - by) * uy;
      pt.x = bx + ux * t;
      pt.y = by + uy * t;
    }
  };

  if (dim.type === "dim") {
    if (dd.part === "text") {
      const g0 = getDimGeometry(dim);
      if (g0) {
        const handle = getLinearDimTextHandleWorld(dim, g0, state.view.scale);
        const hdx = Number(handle?.offsetX || 0);
        const hdy = Number(handle?.offsetY || 0);
        const textX = Number(pSnap.x) - hdx;
        const textY = Number(pSnap.y) - hdy;
        dim.tx = textX;
        dim.ty = textY;
        dim.tdx = textX - Number(g0.allCtrl.x);
        dim.tdy = textY - Number(g0.allCtrl.y);
      } else {
        dim.tx = pSnap.x; dim.ty = pSnap.y;
      }
    }
    else if (dd.part === "p1") {
      dim.x1 = pSnap.x; dim.y1 = pSnap.y;
      applyKeepSnapToDimTarget(dim, "p1", pSnap);
    }
    else if (dd.part === "p2") {
      dim.x2 = pSnap.x; dim.y2 = pSnap.y;
      applyKeepSnapToDimTarget(dim, "p2", pSnap);
    }
    else if (dd.part === "all") {
      const prev = dd.lastWorld || pSnap;
      const dx = pSnap.x - Number(prev.x || 0);
      const dy = pSnap.y - Number(prev.y || 0);
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        dim.x1 = Number(dim.x1) + dx; dim.y1 = Number(dim.y1) + dy;
        dim.x2 = Number(dim.x2) + dx; dim.y2 = Number(dim.y2) + dy;
        dim.px = Number(dim.px) + dx; dim.py = Number(dim.py) + dy;
        if (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))) {
          dim.tx = Number(dim.tx) + dx;
          dim.ty = Number(dim.ty) + dy;
        }
      }
    }
    else if (dd.part === "target1" || dd.part === "target2") {
      const tp = pSnap;
      if (dd.part === "target1") { dim.x1 = tp.x; dim.y1 = tp.y; }
      else { dim.x2 = tp.x; dim.y2 = tp.y; }
      if (dd.part === "target1") applyKeepSnapToDimTarget(dim, "p1", tp);
      else applyKeepSnapToDimTarget(dim, "p2", tp);
    }
    else if (dd.part === "place") {
      dim.px = pSnap.x; dim.py = pSnap.y;
    }
    else if (dd.part.startsWith("extVisDim:")) {
      const idx = parseInt(dd.part.substring(10), 10);
      const g = getDimGeometry(dim);
      if (!isNaN(idx) && g && (idx === 0 || idx === 1)) {
        const sign = Math.sign(Number(g.off) || 0) || 1;
        const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
        const anchor = (idx === 0) ? g.d1 : g.d2;
        const dist = Math.max(0, (Number(anchor.x) - pSnap.x) * enx + (Number(anchor.y) - pSnap.y) * eny);
        if (!Array.isArray(dim.extVisLens)) dim.extVisLens = [];
        dim.extVisLens[idx] = dist;
      }
    }
    else if (dd.part === "edge") { dim.x2 = pSnap.x; dim.y2 = pSnap.y; }
    else { dim.px = pSnap.x; dim.py = pSnap.y; }
  } else if (dim.type === "dimchain") {
    if (dd.part === "text") {
      const g = getDimChainGeometry(dim);
      if (g) {
        const chainMid = g.chainMid || { x: 0, y: 0 };
        const defaultOff = dimPtToWorld(Math.max(1, Number(dim.fontSize ?? 12) || 12));
        const mx = Number(chainMid.x) + Number(g.nx) * defaultOff;
        const my = Number(chainMid.y) + Number(g.ny) * defaultOff;
        const base = {
          x: Number.isFinite(Number(dim.tx)) ? Number(dim.tx) : mx,
          y: Number.isFinite(Number(dim.ty)) ? Number(dim.ty) : my
        };
        const constrained = projectPointToAxis(base, { x: Number(g.nx), y: Number(g.ny) }, pSnap);
        dim.tx = constrained.x;
        dim.ty = constrained.y;
      } else {
        dim.tx = pSnap.x; dim.ty = pSnap.y;
      }
    }
    else if (dd.part.startsWith("p:")) {
      const idx = parseInt(dd.part.substring(2), 10);
      if (!isNaN(idx) && dim.points && dim.points[idx]) {
        dim.points[idx].x = pSnap.x; dim.points[idx].y = pSnap.y;
        alignDimChainTargets(dim);
      }
    }
    else if (dd.part.startsWith("target:")) {
      const idx = parseInt(dd.part.substring(7), 10);
      if (!isNaN(idx) && dim.points && dim.points[idx]) {
        dim.points[idx].x = pSnap.x; dim.points[idx].y = pSnap.y;
        alignDimChainTargets(dim);
      }
    }
    else if (dd.part === "all") {
      const prev = dd.lastWorld || pSnap;
      const dx = pSnap.x - Number(prev.x || 0);
      const dy = pSnap.y - Number(prev.y || 0);
      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        for (const pt of (dim.points || [])) {
          pt.x = Number(pt.x) + dx;
          pt.y = Number(pt.y) + dy;
        }
        dim.px = Number(dim.px || 0) + dx;
        dim.py = Number(dim.py || 0) + dy;
        if (Number.isFinite(Number(dim.tx)) && Number.isFinite(Number(dim.ty))) {
          dim.tx = Number(dim.tx) + dx;
          dim.ty = Number(dim.ty) + dy;
        }
      }
    }
    else if (dd.part.startsWith("extVis:")) {
      const idx = parseInt(dd.part.substring(7), 10);
      const g = getDimChainGeometry(dim);
      if (!isNaN(idx) && g && Array.isArray(g.dimPoints) && g.dimPoints[idx]) {
        const sign = Math.sign(Number(g.off) || 0) || 1;
        const enx = Number(g.nx) * sign, eny = Number(g.ny) * sign;
        const anchor = g.dimPoints[idx];
        const dist = Math.max(0, (Number(anchor.x) - pSnap.x) * enx + (Number(anchor.y) - pSnap.y) * eny);
        if (!Array.isArray(dim.extVisLens)) dim.extVisLens = [];
        dim.extVisLens[idx] = dist;
      }
    }
    else if (dd.part === "line" || dd.part === "place") { dim.px = pSnap.x; dim.py = pSnap.y; }
    else { dim.px = pSnap.x; dim.py = pSnap.y; }
  } else if (dim.type === "dimangle") {
    const g = getDimAngleGeometry(dim, state.shapes);
    if (g) {
      if (dd.part === "text") {
        const off = Math.max(Number(g.r) + 1e-6, (pSnap.x - Number(g.cx)) * Number(g.ux) + (pSnap.y - Number(g.cy)) * Number(g.uy));
        dim.textOffset = off;
        dim.tx = Number(g.cx) + Number(g.ux) * off;
        dim.ty = Number(g.cy) + Number(g.uy) * off;
      } else if (dd.part === "radius" || dd.part === "line" || dd.part === "place") {
        const nr = Math.max(1e-6, (pSnap.x - Number(g.cx)) * Number(g.ux) + (pSnap.y - Number(g.cy)) * Number(g.uy));
        dim.r = nr;
        if (Number.isFinite(Number(dim.textOffset))) {
          dim.textOffset = Math.max(nr + 1e-6, Number(dim.textOffset));
        }
      }
    }
  } else if (dim.type === "circleDim") {
    const g = getCircleDimGeometry(dim, state.shapes);
    if (g) {
      if (dd.part === "pArc") {
        const ang = Math.atan2(worldRaw.y - g.cy, worldRaw.x - g.cx);
        dim.ang = ang;
      } else if (dd.part === "centerCtrl") {
        return;
      } else if (dd.part === "off1" || dd.part === "off2") {
        const ux = Math.cos(g.ang), uy = Math.sin(g.ang);
        const dist = (pSnap.x - g.cx) * ux + (pSnap.y - g.cy) * uy;
        if (dd.part === "off1") dim.off1 = dist;
        else dim.off2 = dist;
      } else if (dd.part === "text") {
        dim.tdx = Number(pSnap.x) - Number(g.cx);
        dim.tdy = Number(pSnap.y) - Number(g.cy);
        dim.tx = Number(pSnap.x);
        dim.ty = Number(pSnap.y);
      }
    }
  }
  dd.lastWorld = { x: pSnap.x, y: pSnap.y };
  dd.moved = true;
}

export function endDimHandleDrag(state) {
  const dd = state.input.dimHandleDrag;
  const moved = !!dd.moved;
  const snapshot = dd.modelSnapshotBeforeMove;
  dd.active = false;
  dd.dimId = null;
  dd.part = null;
  dd.modelSnapshotBeforeMove = null;
  dd.moved = false;
  dd.lastWorld = null;
  return { moved, snapshot };
}
