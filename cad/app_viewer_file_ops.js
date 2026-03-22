import { parseSvgToCadShapes, parseDxfToCadShapes } from "./app_vector_import.js";
import {
  buildImportMeta,
  computeShapesBounds,
  resolveImportSourceUnit as resolveSharedImportSourceUnit,
  resolveUnitScale,
  suggestGridSizeFromBounds,
} from "./import_analysis.js";

function fileExt(file) {
  const name = String(file?.name || "").toLowerCase();
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i) : "";
}

function isSvgFile(file) {
  const ext = fileExt(file);
  if (ext === ".svg") return true;
  const type = String(file?.type || "").toLowerCase();
  return type === "image/svg+xml" || type === "text/svg+xml";
}

function isDxfFile(file) {
  const ext = fileExt(file);
  if (ext === ".dxf") return true;
  const type = String(file?.type || "").toLowerCase();
  return type.includes("dxf");
}

export function createViewerFileOpsRuntime(config) {
  const { state, nextShapeId, setSelection, setStatus, draw } = config || {};

  function resolveImportSourceUnit(kind, text) {
    return resolveSharedImportSourceUnit({
      manualUnit: state.ui?.importSourceUnit || "auto",
      sourceKind: kind,
      text,
    });
  }

  function snapshotShapesByIds(ids) {
    const idSet = new Set((ids || []).map(Number).filter(Number.isFinite));
    const out = [];
    for (const s of (state.shapes || [])) {
      const sid = Number(s?.id);
      if (!idSet.has(sid)) continue;
      out.push(JSON.parse(JSON.stringify(s)));
    }
    return out;
  }

  function getImportAdjustState() {
    if (!state.ui) state.ui = {};
    const ia = state.ui.importAdjust;
    if (ia && typeof ia === "object") return ia;
    const created = {
      active: false,
      groupId: null,
      shapeIds: [],
      originalShapes: [],
      params: { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false },
      sourceKind: "",
      detectedSourceUnit: "",
      baseUnitScale: 1,
    };
    state.ui.importAdjust = created;
    return created;
  }

  function transformPointImportAdjust(x, y, origin, params) {
    const ox = Number(origin?.x) || 0;
    const oy = Number(origin?.y) || 0;
    const s = Math.max(1e-6, Number(params?.scale) || 1);
    const flipSignX = params?.flipX ? -1 : 1;
    const flipSignY = params?.flipY ? -1 : 1;
    const dx = Number(params?.dx) || 0;
    const dy = Number(params?.dy) || 0;
    const rx = Number(x) - ox;
    const ry = Number(y) - oy;
    return { x: ox + rx * s * flipSignX + dx, y: oy + ry * s * flipSignY + dy };
  }

  function applyImportAdjustPreview() {
    const ia = getImportAdjustState();
    if (!ia.active) return false;
    const originals = Array.isArray(ia.originalShapes) ? ia.originalShapes : [];
    const bounds = computeShapesBounds(originals);
    if (!bounds) return false;
    const origin = { x: (bounds.minX + bounds.maxX) * 0.5, y: (bounds.minY + bounds.maxY) * 0.5 };
    const byId = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    const p = ia.params || { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
    for (const base of originals) {
      const target = byId.get(Number(base?.id));
      if (!target) continue;
      const t = String(base.type || "");
      if (t === "line" || t === "rect") {
        const p1 = transformPointImportAdjust(base.x1, base.y1, origin, p);
        const p2 = transformPointImportAdjust(base.x2, base.y2, origin, p);
        target.x1 = p1.x; target.y1 = p1.y; target.x2 = p2.x; target.y2 = p2.y;
      } else if (t === "polyline") {
        const dstPts = [];
        for (const pt of (Array.isArray(base.points) ? base.points : [])) {
          const tp = transformPointImportAdjust(Number(pt?.x), Number(pt?.y), origin, p);
          if (Number.isFinite(tp.x) && Number.isFinite(tp.y)) dstPts.push({ x: tp.x, y: tp.y });
        }
        if (dstPts.length >= 2) {
          target.points = dstPts;
          target.closed = !!base.closed;
        }
      } else if (t === "circle") {
        const c = transformPointImportAdjust(base.cx, base.cy, origin, p);
        target.cx = c.x; target.cy = c.y; target.r = Math.abs(Number(base.r) || 0) * Math.max(1e-6, Number(p.scale) || 1);
      } else if (t === "arc") {
        const c = transformPointImportAdjust(base.cx, base.cy, origin, p);
        const rBase = Math.abs(Number(base.r) || 0);
        const rNew = rBase * Math.max(1e-6, Number(p.scale) || 1);
        const a1 = Number(base.a1) || 0;
        const a2 = Number(base.a2) || 0;
        const e1 = { x: Number(base.cx) + Math.cos(a1) * rBase, y: Number(base.cy) + Math.sin(a1) * rBase };
        const e2 = { x: Number(base.cx) + Math.cos(a2) * rBase, y: Number(base.cy) + Math.sin(a2) * rBase };
        const te1 = transformPointImportAdjust(e1.x, e1.y, origin, p);
        const te2 = transformPointImportAdjust(e2.x, e2.y, origin, p);
        target.cx = c.x; target.cy = c.y; target.r = rNew;
        target.a1 = Math.atan2(te1.y - c.y, te1.x - c.x);
        target.a2 = Math.atan2(te2.y - c.y, te2.x - c.x);
        const baseCcw = base.ccw !== false;
        target.ccw = ((!!p.flipX) !== (!!p.flipY)) ? !baseCcw : baseCcw;
      } else if (t === "text") {
        const p1 = transformPointImportAdjust(base.x1, base.y1, origin, p);
        target.x1 = p1.x; target.y1 = p1.y;
        if (Number.isFinite(Number(base.x2)) && Number.isFinite(Number(base.y2))) {
          const p2 = transformPointImportAdjust(base.x2, base.y2, origin, p);
          target.x2 = p2.x; target.y2 = p2.y;
        }
        if (Number.isFinite(Number(base.textSizePt))) {
          target.textSizePt = Math.max(0.01, Number(base.textSizePt) * Math.max(1e-6, Number(p.scale) || 1));
        }
      } else if (t === "dim" || t === "dimchain" || t === "dimangle" || t === "circledim") {
        const pairs = [["x1", "y1"], ["x2", "y2"], ["px", "py"], ["tx", "ty"]];
        for (const [kx, ky] of pairs) {
          if (Number.isFinite(Number(base[kx])) && Number.isFinite(Number(base[ky]))) {
            const tp = transformPointImportAdjust(base[kx], base[ky], origin, p);
            target[kx] = tp.x;
            target[ky] = tp.y;
          }
        }
        for (const key of ["fontSize", "dimArrowSizePt", "extOffset", "extOver", "rOverrun"]) {
          if (Number.isFinite(Number(base[key]))) {
            target[key] = Math.max(0.01, Number(base[key]) * Math.max(1e-6, Number(p.scale) || 1));
          }
        }
      }
    }
    return true;
  }

  function beginImportAdjustSession(groupId, shapeIds, meta = null) {
    const ids = (shapeIds || []).map(Number).filter(Number.isFinite);
    if (!ids.length) return;
    const ia = getImportAdjustState();
    ia.active = true;
    ia.groupId = Number(groupId);
    ia.shapeIds = ids.slice();
    ia.originalShapes = snapshotShapesByIds(ids);
    ia.params = { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
    ia.sourceKind = String(meta?.sourceKind || "");
    ia.detectedSourceUnit = String(meta?.detectedSourceUnit || "");
    ia.baseUnitScale = Number.isFinite(Number(meta?.baseUnitScale)) ? Number(meta.baseUnitScale) : 1;
    if (!(Number.isFinite(ia.baseUnitScale) && ia.baseUnitScale > 0)) ia.baseUnitScale = 1;
    ia.params.scale = ia.baseUnitScale;
    applyImportAdjustPreview();
    ia.originalShapes = snapshotShapesByIds(ids);
    ia.params = { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
  }

  function setImportAdjustParam(patch) {
    const ia = getImportAdjustState();
    if (!ia.active) return false;
    if (!ia.params) ia.params = { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
    const p = patch || {};
    if (Object.prototype.hasOwnProperty.call(p, "scale")) ia.params.scale = Math.max(1e-6, Number(p.scale) || 1);
    if (Object.prototype.hasOwnProperty.call(p, "dx")) ia.params.dx = Number(p.dx) || 0;
    if (Object.prototype.hasOwnProperty.call(p, "dy")) ia.params.dy = Number(p.dy) || 0;
    if (Object.prototype.hasOwnProperty.call(p, "flipX")) ia.params.flipX = !!p.flipX;
    if (Object.prototype.hasOwnProperty.call(p, "flipY")) ia.params.flipY = !!p.flipY;
    const ok = applyImportAdjustPreview();
    if (ok) draw();
    return ok;
  }

  function applyImportAdjust() {
    const ia = getImportAdjustState();
    if (!ia.active) return false;
    ia.active = false;
    ia.originalShapes = [];
    setStatus("Import transform applied");
    draw();
    return true;
  }

  function cancelImportAdjust() {
    const ia = getImportAdjustState();
    if (!ia.active) return false;
    const byId = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    for (const base of (ia.originalShapes || [])) {
      const target = byId.get(Number(base?.id));
      if (!target) continue;
      const restored = JSON.parse(JSON.stringify(base));
      for (const k of Object.keys(target)) delete target[k];
      for (const k of Object.keys(restored)) target[k] = restored[k];
    }
    ia.active = false;
    ia.originalShapes = [];
    ia.params = { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
    setStatus("Import transform canceled");
    draw();
    return true;
  }

  function onImportSourceUnitChanged() {
    const ia = getImportAdjustState();
    if (!ia.active) return false;
    const prevBase = Number(ia.baseUnitScale);
    const srcUnit = resolveImportSourceUnit(String(ia.sourceKind || ""), "");
    const dstUnit = String(state.pageSetup?.unit || "mm").toLowerCase();
    const nextBase = resolveUnitScale(srcUnit, dstUnit);
    if (!(Number.isFinite(prevBase) && prevBase > 0 && Number.isFinite(nextBase) && nextBase > 0)) return false;
    const manualScale = Number(ia.params.scale);
    ia.params.scale = (Number.isFinite(manualScale) ? manualScale : 1) * (nextBase / prevBase);
    ia.baseUnitScale = nextBase;
    const ok = applyImportAdjustPreview();
    if (ok) draw();
    return ok;
  }

  function ensureImportAdjustSessionForActiveGroup() {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return false;
    const group = (state.groups || []).find((g) => Number(g?.id) === gid);
    const ids = Array.isArray(group?.shapeIds) ? group.shapeIds.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return false;
    beginImportAdjustSession(gid, ids, {
      sourceKind: String(state.importMeta?.sourceKind || ""),
      detectedSourceUnit: String(state.importMeta?.detectedUnit || "unitless"),
      baseUnitScale: 1,
    });
    return true;
  }

  function storeImportMeta(meta) {
    state.importMeta = meta && typeof meta === "object" ? { ...meta } : null;
  }

  function resetImportedModelState() {
    state.shapes = [];
    state.groups = [];
    state.activeGroupId = null;
    state.importMeta = null;
    if (!state.selection || typeof state.selection !== "object") state.selection = {};
    state.selection.ids = [];
    state.selection.groupIds = [];
    if (!state.selection.box || typeof state.selection.box !== "object") state.selection.box = {};
    if (!state.selection.drag || typeof state.selection.drag !== "object") state.selection.drag = {};
    state.selection.box.active = false;
    state.selection.drag.active = false;
    if (!state.ui) state.ui = {};
    state.ui.importAdjust = {
      active: false,
      groupId: null,
      shapeIds: [],
      originalShapes: [],
      params: { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false },
      sourceKind: "",
      detectedSourceUnit: "",
      baseUnitScale: 1,
    };
  }

  function applyViewerGridPresetFromBounds(bounds) {
    const size = suggestGridSizeFromBounds(bounds, { targetMinorLines: 50 });
    if (!(Number.isFinite(size) && size > 0)) return false;
    if (!state.grid || typeof state.grid !== "object") state.grid = {};
    state.grid.size = size;
    state.grid.presetSize = size;
    state.grid.customSize = size;
    state.grid.customSizeEnabled = false;
    state.grid.show = true;
    state.grid.auto = true;
    return true;
  }

  function getLiveImportBounds() {
    const ia = getImportAdjustState();
    const liveIds = Array.isArray(ia?.shapeIds) ? ia.shapeIds.map(Number).filter(Number.isFinite) : [];
    if (liveIds.length) {
      const idSet = new Set(liveIds);
      const liveShapes = (state.shapes || []).filter((s) => idSet.has(Number(s?.id)));
      const liveBounds = computeShapesBounds(liveShapes);
      if (liveBounds) return liveBounds;
    }
    const gid = Number(state.activeGroupId);
    if (Number.isFinite(gid)) {
      const groupShapes = (state.shapes || []).filter((s) => Number(s?.groupId) === gid);
      const groupBounds = computeShapesBounds(groupShapes);
      if (groupBounds) return groupBounds;
    }
    return computeShapesBounds(state.shapes || []);
  }

  function applySuggestedImportScale(multiplier) {
    const factor = Number(multiplier);
    if (!(Number.isFinite(factor) && factor > 0)) return false;
    const ia = getImportAdjustState();
    if (!ia.active && !ensureImportAdjustSessionForActiveGroup()) return false;
    const currentUnitScale = Math.max(1e-6, Number(state.importMeta?.unitScale) || 1);
    const originalUnitScale = Math.max(1e-6, Number(state.importMeta?.originalUnitScale) || currentUnitScale);
    const targetUnitScale = originalUnitScale * factor;
    const relativeScale = targetUnitScale / currentUnitScale;
    const ok = setImportAdjustParam({ scale: relativeScale, dx: 0, dy: 0 });
    if (!ok) return false;
    ia.originalShapes = snapshotShapesByIds(ia.shapeIds);
    ia.params = { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
    ia.baseUnitScale = targetUnitScale;
    if (state.importMeta && typeof state.importMeta === "object") {
      state.importMeta = {
        ...state.importMeta,
        unitScale: targetUnitScale,
      };
    }
    applyViewerGridPresetFromBounds(getLiveImportBounds());
    setStatus("Import scale updated");
    draw();
    return true;
  }

  function importVectorShapes(shapes, sourceName, mode = "import", importMeta = null) {
    const src = Array.isArray(shapes) ? shapes : [];
    if (!src.length) return false;
    const isSvgSource = String(sourceName || "").toLowerCase().endsWith(".svg") || String(sourceName || "").toLowerCase().includes("svg");
    const viewCenterWorld = () => {
      const vw = Math.max(1, Number(state.view?.viewportWidth || 1));
      const vh = Math.max(1, Number(state.view?.viewportHeight || 1));
      const sc = Math.max(1e-9, Number(state.view?.scale || 1));
      const ox = Number(state.view?.offsetX || 0);
      const oy = Number(state.view?.offsetY || 0);
      return { x: (vw * 0.5 - ox) / sc, y: (vh * 0.5 - oy) / sc };
    };
    const translateShape = (s, dx, dy) => {
      const t = String(s?.type || "").toLowerCase();
      if (t === "line" || t === "rect") { s.x1 = Number(s.x1) + dx; s.y1 = Number(s.y1) + dy; s.x2 = Number(s.x2) + dx; s.y2 = Number(s.y2) + dy; }
      else if (t === "polyline" && Array.isArray(s.points)) { s.points = s.points.map((p) => ({ x: Number(p?.x) + dx, y: Number(p?.y) + dy })); }
      else if (t === "circle" || t === "arc") { s.cx = Number(s.cx) + dx; s.cy = Number(s.cy) + dy; }
      else if (t === "text") {
        s.x1 = Number(s.x1) + dx; s.y1 = Number(s.y1) + dy;
        if (Number.isFinite(Number(s.x2))) s.x2 = Number(s.x2) + dx;
        if (Number.isFinite(Number(s.y2))) s.y2 = Number(s.y2) + dy;
      } else if (t === "dim" || t === "dimchain" || t === "dimangle" || t === "circledim") {
        for (const key of ["x1", "x2", "px", "tx"]) {
          if (Number.isFinite(Number(s[key]))) s[key] = Number(s[key]) + dx;
        }
        for (const key of ["y1", "y2", "py", "ty"]) {
          if (Number.isFinite(Number(s[key]))) s[key] = Number(s[key]) + dy;
        }
      }
    };
    let importSource = src.map((shape) => JSON.parse(JSON.stringify(shape || {})));
    if (isSvgSource) {
      const b = computeShapesBounds(importSource);
      if (b) {
        const c = viewCenterWorld();
        const cx = (b.minX + b.maxX) * 0.5;
        const cy = (b.minY + b.maxY) * 0.5;
        for (const s of importSource) translateShape(s, c.x - cx, c.y - cy);
      }
    }
    if (mode === "replace") {
      state.shapes = [];
      state.groups = [];
      state.activeGroupId = null;
      state.importMeta = null;
      state.selection.ids = [];
      state.selection.groupIds = [];
      state.selection.box.active = false;
      state.selection.drag.active = false;
      if (!state.ui) state.ui = {};
      state.ui.importAdjust = {
        active: false,
        groupId: null,
        shapeIds: [],
        originalShapes: [],
        params: { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false },
        sourceKind: "",
        detectedSourceUnit: "",
        baseUnitScale: 1,
      };
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const imported = [];
    const gid = Number(state.nextGroupId) || 1;
    state.nextGroupId = gid + 1;
    for (const raw of importSource) {
      const t = String(raw?.type || "").toLowerCase();
      if (!["line", "polyline", "rect", "circle", "arc", "text", "dim", "dimchain", "dimangle", "circledim"].includes(t)) continue;
      const s = { ...raw, id: nextShapeId(state), type: t, layerId: state.activeLayerId, groupId: gid, lineWidthMm: Math.max(0.01, Number(state.lineWidthMm ?? 0.25) || 0.25), lineType: "solid" };
      imported.push(s);
      if (t === "line" || t === "rect") { minX = Math.min(minX, Number(s.x1), Number(s.x2)); minY = Math.min(minY, Number(s.y1), Number(s.y2)); maxX = Math.max(maxX, Number(s.x1), Number(s.x2)); maxY = Math.max(maxY, Number(s.y1), Number(s.y2)); }
      else if (t === "polyline") { for (const p of (Array.isArray(s.points) ? s.points : [])) { minX = Math.min(minX, Number(p?.x)); minY = Math.min(minY, Number(p?.y)); maxX = Math.max(maxX, Number(p?.x)); maxY = Math.max(maxY, Number(p?.y)); } }
      else if (t === "circle" || t === "arc") { minX = Math.min(minX, Number(s.cx) - Number(s.r)); minY = Math.min(minY, Number(s.cy) - Number(s.r)); maxX = Math.max(maxX, Number(s.cx) + Number(s.r)); maxY = Math.max(maxY, Number(s.cy) + Number(s.r)); }
      else if (t === "text") { minX = Math.min(minX, Number(s.x1), Number(s.x2)); minY = Math.min(minY, Number(s.y1), Number(s.y2)); maxX = Math.max(maxX, Number(s.x1), Number(s.x2)); maxY = Math.max(maxY, Number(s.y1), Number(s.y2)); }
      else if (t === "dim" || t === "dimchain" || t === "dimangle" || t === "circledim") { for (const key of Object.keys(s || {})) { const value = Number(s[key]); if (!Number.isFinite(value)) continue; const lower = key.toLowerCase(); if (lower.startsWith("x") || lower === "cx" || lower === "px" || lower === "tx") { minX = Math.min(minX, value); maxX = Math.max(maxX, value); } if (lower.startsWith("y") || lower === "cy" || lower === "py" || lower === "ty") { minY = Math.min(minY, value); maxY = Math.max(maxY, value); } } }
    }
    if (!imported.length) return false;
    for (const s of imported) state.shapes.push(s);
    const ox = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
    const oy = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;
    const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
    state.groups.unshift({ id: gid, name: `${String(sourceName || "Imported").slice(0, 24)} ${gid}`, shapeIds: imported.map((s) => Number(s.id)), visible: true, parentId: null, originX: Math.round(ox / gridStep) * gridStep, originY: Math.round(oy / gridStep) * gridStep, rotationDeg: 0 });
    setSelection(imported.map((s) => Number(s.id)));
    state.activeGroupId = gid;
    storeImportMeta(buildImportMeta({
      sourceKind: importMeta?.sourceKind || "",
      sourceName,
      detectedUnit: importMeta?.detectedSourceUnit || "unitless",
      effectiveUnit: resolveImportSourceUnit(String(importMeta?.sourceKind || ""), ""),
      targetUnit: state.pageSetup?.unit || "mm",
      unitConfidence: importMeta?.detectedSourceUnit ? "high" : "low",
      unitScale: importMeta?.baseUnitScale,
      originalUnitScale: importMeta?.baseUnitScale,
      originalBounds: importMeta?.originalBounds || null,
      lastImportMode: mode,
    }));
    beginImportAdjustSession(gid, imported.map((s) => Number(s.id)), importMeta || null);
    if (state.importMeta && typeof state.importMeta === "object") {
      state.importMeta = {
        ...state.importMeta,
        unitScale: Number(importMeta?.baseUnitScale) || 1,
      };
    }
    applyViewerGridPresetFromBounds(getLiveImportBounds());
    draw();
    return true;
  }

  async function importAnyFile(file, modeRaw = "import") {
    const mode = String(modeRaw || "import");
    if (isDxfFile(file)) {
      const text = await file.text();
      const srcUnit = resolveImportSourceUnit("dxf", text);
      const dstUnit = String(state.pageSetup?.unit || "mm").toLowerCase();
      const unitScale = resolveUnitScale(srcUnit, dstUnit);
      const parsed = parseDxfToCadShapes(text, { polylineize: false, sourceUnit: srcUnit });
      if (!parsed.shapes.length) throw new Error(parsed.warnings?.[0] || "DXF import failed");
      importVectorShapes(parsed.shapes, String(file.name || "DXF"), mode, {
        sourceKind: "dxf",
        detectedSourceUnit: srcUnit,
        baseUnitScale: unitScale,
        originalBounds: computeShapesBounds(parsed.shapes),
      });
      return true;
    }
    if (isSvgFile(file)) {
      const text = await file.text();
      const srcUnit = resolveImportSourceUnit("svg", text);
      const dstUnit = String(state.pageSetup?.unit || "mm").toLowerCase();
      const unitScale = resolveUnitScale(srcUnit, dstUnit);
      const parsed = parseSvgToCadShapes(text);
      if (!parsed.shapes.length) throw new Error(parsed.warnings?.[0] || "SVG import failed");
      importVectorShapes(parsed.shapes, String(file.name || "SVG"), mode, {
        sourceKind: "svg",
        detectedSourceUnit: srcUnit,
        baseUnitScale: unitScale,
        originalBounds: computeShapesBounds(parsed.shapes),
      });
      return true;
    }
    throw new Error("Viewer mode supports DXF and SVG only");
  }

  async function importDroppedFiles(files, options = null) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return false;
    if (options?.clearFirst) resetImportedModelState();
    for (let i = 0; i < list.length; i += 1) {
      await importAnyFile(list[i], i === 0 ? "replace" : "import");
    }
    return true;
  }

  return {
    importDroppedFiles,
    setImportAdjustParam,
    applyImportAdjust,
    cancelImportAdjust,
    onImportSourceUnitChanged,
    applySuggestedImportScale,
  };
}
