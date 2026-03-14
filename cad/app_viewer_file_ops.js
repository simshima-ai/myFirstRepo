import { parseSvgToCadShapes, parseDxfToCadShapes } from "./app_vector_import.js";

function unitMm(unitRaw) {
  const u = String(unitRaw || "").toLowerCase();
  if (u === "mm") return 1;
  if (u === "cm") return 10;
  if (u === "m") return 1000;
  if (u === "inch" || u === "in") return 25.4;
  if (u === "px") return 25.4 / 96;
  if (u === "pt") return 25.4 / 72;
  return NaN;
}

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

function detectDxfInsunits(text) {
  const pairs = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  for (let i = 0; i + 3 < pairs.length; i += 1) {
    const c0 = String(pairs[i] || "").trim();
    const v0 = String(pairs[i + 1] || "").trim();
    const c1 = String(pairs[i + 2] || "").trim();
    const v1 = String(pairs[i + 3] || "").trim();
    if (c0 === "9" && v0.toUpperCase() === "$INSUNITS" && c1 === "70") {
      const n = Number(v1);
      if (n === 4) return "mm";
      if (n === 5) return "cm";
      if (n === 6) return "m";
      if (n === 1) return "inch";
      return "unitless";
    }
  }
  return null;
}

function detectSvgUnit(text) {
  const m = String(text || "").match(/<svg\b[^>]*\b(?:width|height)\s*=\s*["']\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*([a-z%]+)?\s*["']/i);
  const u = String(m?.[1] || "").toLowerCase();
  if (u === "mm" || u === "cm" || u === "m" || u === "in" || u === "inch" || u === "px" || u === "pt") {
    return u === "in" ? "inch" : u;
  }
  if (!u) return "px";
  return null;
}

export function createViewerFileOpsRuntime(config) {
  const { state, nextShapeId, setSelection, setStatus, draw } = config || {};

  function resolveImportSourceUnit(kind, text) {
    const manual = String(state.ui?.importSourceUnit || "auto").toLowerCase();
    if (manual && manual !== "auto") return manual;
    if (kind === "dxf") return detectDxfInsunits(text) || "unitless";
    if (kind === "svg") return detectSvgUnit(text) || "px";
    return "unitless";
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

  function computeShapesBounds(shapes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const addPt = (x, y) => {
      const nx = Number(x), ny = Number(y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
      minX = Math.min(minX, nx); minY = Math.min(minY, ny);
      maxX = Math.max(maxX, nx); maxY = Math.max(maxY, ny);
    };
    for (const s of (shapes || [])) {
      const t = String(s?.type || "").toLowerCase();
      if (t === "line" || t === "rect") {
        addPt(s.x1, s.y1); addPt(s.x2, s.y2);
      } else if (t === "polyline") {
        for (const pt of (Array.isArray(s.points) ? s.points : [])) addPt(pt?.x, pt?.y);
      } else if (t === "circle" || t === "arc") {
        const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
        addPt(cx - r, cy - r); addPt(cx + r, cy + r);
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    return { minX, minY, maxX, maxY };
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
    const srcMm = unitMm(srcUnit);
    const dstMm = unitMm(dstUnit);
    const nextBase = (Number.isFinite(srcMm) && Number.isFinite(dstMm) && dstMm > 0) ? (srcMm / dstMm) : 1;
    if (!(Number.isFinite(prevBase) && prevBase > 0 && Number.isFinite(nextBase) && nextBase > 0)) return false;
    const manualScale = Number(ia.params.scale);
    ia.params.scale = (Number.isFinite(manualScale) ? manualScale : 1) * (nextBase / prevBase);
    ia.baseUnitScale = nextBase;
    const ok = applyImportAdjustPreview();
    if (ok) draw();
    return ok;
  }

  function importVectorShapes(shapes, sourceName, mode = "import", importMeta = null) {
    const src = Array.isArray(shapes) ? shapes : [];
    if (!src.length) return false;
    const isSvgSource = String(sourceName || "").toLowerCase().endsWith(".svg") || String(sourceName || "").toLowerCase().includes("svg");
    const computeBounds = (items) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const addPt = (x, y) => {
        const nx = Number(x), ny = Number(y);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
        minX = Math.min(minX, nx); minY = Math.min(minY, ny); maxX = Math.max(maxX, nx); maxY = Math.max(maxY, ny);
      };
      for (const s of (items || [])) {
        const t = String(s?.type || "").toLowerCase();
        if (t === "line" || t === "rect") { addPt(s.x1, s.y1); addPt(s.x2, s.y2); }
        else if (t === "polyline") { for (const p of (Array.isArray(s.points) ? s.points : [])) addPt(p?.x, p?.y); }
        else if (t === "circle" || t === "arc") { const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0); addPt(cx - r, cy - r); addPt(cx + r, cy + r); }
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
      return { minX, minY, maxX, maxY };
    };
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
    };
    let importSource = src.map((shape) => JSON.parse(JSON.stringify(shape || {})));
    if (isSvgSource) {
      const b = computeBounds(importSource);
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
      state.selection.ids = [];
      state.selection.groupIds = [];
      state.selection.box.active = false;
      state.selection.drag.active = false;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const imported = [];
    const gid = Number(state.nextGroupId) || 1;
    state.nextGroupId = gid + 1;
    for (const raw of importSource) {
      const t = String(raw?.type || "").toLowerCase();
      if (!["line", "polyline", "rect", "circle", "arc"].includes(t)) continue;
      const s = { ...raw, id: nextShapeId(state), type: t, layerId: state.activeLayerId, groupId: gid, lineWidthMm: Math.max(0.01, Number(state.lineWidthMm ?? 0.25) || 0.25), lineType: "solid" };
      imported.push(s);
      if (t === "line" || t === "rect") { minX = Math.min(minX, Number(s.x1), Number(s.x2)); minY = Math.min(minY, Number(s.y1), Number(s.y2)); maxX = Math.max(maxX, Number(s.x1), Number(s.x2)); maxY = Math.max(maxY, Number(s.y1), Number(s.y2)); }
      else if (t === "polyline") { for (const p of (Array.isArray(s.points) ? s.points : [])) { minX = Math.min(minX, Number(p?.x)); minY = Math.min(minY, Number(p?.y)); maxX = Math.max(maxX, Number(p?.x)); maxY = Math.max(maxY, Number(p?.y)); } }
      else if (t === "circle" || t === "arc") { minX = Math.min(minX, Number(s.cx) - Number(s.r)); minY = Math.min(minY, Number(s.cy) - Number(s.r)); maxX = Math.max(maxX, Number(s.cx) + Number(s.r)); maxY = Math.max(maxY, Number(s.cy) + Number(s.r)); }
    }
    if (!imported.length) return false;
    for (const s of imported) state.shapes.push(s);
    const ox = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
    const oy = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;
    const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
    state.groups.unshift({ id: gid, name: `${String(sourceName || "Imported").slice(0, 24)} ${gid}`, shapeIds: imported.map((s) => Number(s.id)), visible: true, parentId: null, originX: Math.round(ox / gridStep) * gridStep, originY: Math.round(oy / gridStep) * gridStep, rotationDeg: 0 });
    setSelection(state, imported.map((s) => Number(s.id)));
    state.activeGroupId = gid;
    beginImportAdjustSession(gid, imported.map((s) => Number(s.id)), importMeta || null);
    draw();
    return true;
  }

  async function importAnyFile(file, modeRaw = "import") {
    const mode = String(modeRaw || "import");
    if (isDxfFile(file)) {
      const text = await file.text();
      const srcUnit = resolveImportSourceUnit("dxf", text);
      const dstUnit = String(state.pageSetup?.unit || "mm").toLowerCase();
      const srcMm = unitMm(srcUnit);
      const dstMm = unitMm(dstUnit);
      const unitScale = (Number.isFinite(srcMm) && Number.isFinite(dstMm) && dstMm > 0) ? (srcMm / dstMm) : 1;
      const parsed = parseDxfToCadShapes(text, { polylineize: false });
      if (!parsed.shapes.length) throw new Error(parsed.warnings?.[0] || "DXF import failed");
      importVectorShapes(parsed.shapes, String(file.name || "DXF"), mode, { sourceKind: "dxf", detectedSourceUnit: srcUnit, baseUnitScale: unitScale });
      return true;
    }
    if (isSvgFile(file)) {
      const text = await file.text();
      const srcUnit = resolveImportSourceUnit("svg", text);
      const dstUnit = String(state.pageSetup?.unit || "mm").toLowerCase();
      const srcMm = unitMm(srcUnit);
      const dstMm = unitMm(dstUnit);
      const unitScale = (Number.isFinite(srcMm) && Number.isFinite(dstMm) && dstMm > 0) ? (srcMm / dstMm) : 1;
      const parsed = parseSvgToCadShapes(text);
      if (!parsed.shapes.length) throw new Error(parsed.warnings?.[0] || "SVG import failed");
      importVectorShapes(parsed.shapes, String(file.name || "SVG"), mode, { sourceKind: "svg", detectedSourceUnit: srcUnit, baseUnitScale: unitScale });
      return true;
    }
    throw new Error("Viewer mode supports DXF and SVG only");
  }

  async function importDroppedFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return false;
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
  };
}
