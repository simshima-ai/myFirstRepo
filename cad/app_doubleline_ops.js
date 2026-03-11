import { segmentIntersectionParamPoint } from "./solvers.js";

export function createDoubleLineOps(config) {
  const {
    state,
    helpers,
    executeDoubleLineGeom,
    buildDoubleLinePreviewGeom,
    trimClickedLineAtNearestIntersection,
    clearDoubleLineTrimPendingState,
    setStatus,
    draw
  } = config || {};

  function expandSelectedBaseLinesForTrim(baseShapes) {
    const out = [];
    for (const s of (baseShapes || [])) {
      if (!s) continue;
      const t = String(s.type || "");
      if (t === "line") {
        const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
        if ([x1, y1, x2, y2].every(Number.isFinite) && Math.hypot(x2 - x1, y2 - y1) > 1e-9) {
          out.push({ x1, y1, x2, y2 });
        }
        continue;
      }
      if (t !== "polyline") continue;
      const pts = Array.isArray(s.points) ? s.points : [];
      if (pts.length < 2) continue;
      const addSeg = (a, b) => {
        const x1 = Number(a?.x), y1 = Number(a?.y), x2 = Number(b?.x), y2 = Number(b?.y);
        if (![x1, y1, x2, y2].every(Number.isFinite)) return;
        if (Math.hypot(x2 - x1, y2 - y1) <= 1e-9) return;
        out.push({ x1, y1, x2, y2 });
      };
      for (let i = 0; i < pts.length - 1; i++) addSeg(pts[i], pts[i + 1]);
      if (s.closed) addSeg(pts[pts.length - 1], pts[0]);
    }
    return out;
  }

  function pointKey(x, y, tol = 1e-3) {
    const nx = Number(x) || 0;
    const ny = Number(y) || 0;
    const qx = Math.round(nx / tol);
    const qy = Math.round(ny / tol);
    return `${qx},${qy}`;
  }

  function mergeCreatedLinesToPolylines(groupId) {
    const gid = Number(groupId);
    if (!Number.isFinite(gid)) return [];
    const g = (state.groups || []).find((x) => Number(x?.id) === gid);
    if (!g) return [];
    const shapeIdSet = new Set((g.shapeIds || []).map(Number).filter(Number.isFinite));
    const lines = (state.shapes || [])
      .filter((s) => shapeIdSet.has(Number(s?.id)) && String(s?.type || "") === "line")
      .map((s) => ({
        id: Number(s.id),
        x1: Number(s.x1), y1: Number(s.y1),
        x2: Number(s.x2), y2: Number(s.y2),
        style: s
      }))
      .filter((l) => [l.x1, l.y1, l.x2, l.y2].every(Number.isFinite) && Math.hypot(l.x2 - l.x1, l.y2 - l.y1) > 1e-9);
    if (!lines.length) return [];

    const tol = 1e-3;
    const nodeMap = new Map();
    const addNodeEdge = (k, edgeIdx) => {
      let set = nodeMap.get(k);
      if (!set) {
        set = new Set();
        nodeMap.set(k, set);
      }
      set.add(edgeIdx);
    };
    const repPointByKey = new Map();
    const addRep = (k, x, y) => {
      const prev = repPointByKey.get(k);
      if (!prev) {
        repPointByKey.set(k, { x: Number(x), y: Number(y), n: 1 });
      } else {
        const n = Number(prev.n) + 1;
        prev.x = (Number(prev.x) * Number(prev.n) + Number(x)) / n;
        prev.y = (Number(prev.y) * Number(prev.n) + Number(y)) / n;
        prev.n = n;
      }
    };
    const edges = [];
    for (const l of lines) {
      const a = pointKey(l.x1, l.y1, tol);
      const b = pointKey(l.x2, l.y2, tol);
      if (a === b) continue;
      const idx = edges.length;
      edges.push({ ...l, a, b });
      addNodeEdge(a, idx);
      addNodeEdge(b, idx);
      addRep(a, l.x1, l.y1);
      addRep(b, l.x2, l.y2);
    }
    if (!edges.length) return [];

    const visited = new Set();
    const components = [];
    for (let i = 0; i < edges.length; i++) {
      if (visited.has(i)) continue;
      const stack = [i];
      const comp = [];
      while (stack.length) {
        const ei = stack.pop();
        if (visited.has(ei)) continue;
        visited.add(ei);
        comp.push(ei);
        const e = edges[ei];
        for (const ni of (nodeMap.get(e.a) || [])) if (!visited.has(ni)) stack.push(ni);
        for (const ni of (nodeMap.get(e.b) || [])) if (!visited.has(ni)) stack.push(ni);
      }
      if (comp.length) components.push(comp);
    }

    const builtChains = [];
    for (const comp of components) {
      const remaining = new Set(comp);
      const remNodeMap = new Map();
      const addRem = (k, ei) => {
        let set = remNodeMap.get(k);
        if (!set) {
          set = new Set();
          remNodeMap.set(k, set);
        }
        set.add(ei);
      };
      for (const ei of comp) {
        const e = edges[ei];
        addRem(e.a, ei);
        addRem(e.b, ei);
      }
      const removeEdge = (ei) => {
        if (!remaining.has(ei)) return;
        remaining.delete(ei);
        const e = edges[ei];
        remNodeMap.get(e.a)?.delete(ei);
        remNodeMap.get(e.b)?.delete(ei);
      };
      const pickStartNode = () => {
        for (const [k, set] of remNodeMap.entries()) {
          if (!set || set.size === 0) continue;
          if (set.size !== 2) return k;
        }
        const firstEdgeIdx = remaining.values().next().value;
        if (firstEdgeIdx == null) return null;
        return edges[firstEdgeIdx].a;
      };
      const pickEdge = (set) => {
        const arr = Array.from(set || []);
        if (!arr.length) return null;
        arr.sort((a, b) => Number(edges[a]?.id || 0) - Number(edges[b]?.id || 0));
        return arr[0];
      };

      while (remaining.size > 0) {
        const startNode = pickStartNode();
        if (!startNode) break;
        const chain = [];
        let currentNode = startNode;
        let prevEdge = null;
        while (true) {
          const nodeEdges = remNodeMap.get(currentNode);
          if (!nodeEdges || nodeEdges.size === 0) break;
          const candidates = new Set(nodeEdges);
          if (prevEdge != null) candidates.delete(prevEdge);
          const nextEdge = pickEdge(candidates.size ? candidates : nodeEdges);
          if (nextEdge == null) break;
          const e = edges[nextEdge];
          const nextNode = (e.a === currentNode) ? e.b : e.a;
          chain.push({ edgeIdx: nextEdge, from: currentNode, to: nextNode });
          removeEdge(nextEdge);
          prevEdge = nextEdge;
          currentNode = nextNode;
          const deg = (remNodeMap.get(currentNode)?.size || 0);
          if (deg !== 1) break;
        }
        if (chain.length) builtChains.push(chain);
      }
    }

    if (!builtChains.length) return [];

    const createdPolylineIds = [];
    const consumedLineIds = new Set();
    for (const chain of builtChains) {
      if (!chain.length) continue;
      const firstItem = chain[0];
      const firstEdge = edges[firstItem.edgeIdx];
      const styleRef = firstEdge.style || null;
      const points = [];
      const startRep = repPointByKey.get(firstItem.from);
      if (startRep) points.push({ x: Number(startRep.x), y: Number(startRep.y) });
      for (const item of chain) {
        const rep = repPointByKey.get(item.to);
        if (!rep) continue;
        const last = points[points.length - 1];
        if (!last || Math.hypot(Number(last.x) - Number(rep.x), Number(last.y) - Number(rep.y)) > 1e-9) {
          points.push({ x: Number(rep.x), y: Number(rep.y) });
        }
      }
      if (points.length < 2) continue;
      const p0 = points[0];
      const pN = points[points.length - 1];
      const closed = Math.hypot(Number(p0.x) - Number(pN.x), Number(p0.y) - Number(pN.y)) <= tol;
      const normalizedPoints = (closed && points.length > 2) ? points.slice(0, -1) : points.slice();
      if (normalizedPoints.length < 2) continue;
      const polyline = {
        id: helpers.nextShapeId?.(),
        type: "polyline",
        points: normalizedPoints.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
        closed: !!closed,
        layerId: Number(styleRef?.layerId ?? state.activeLayerId),
        lineWidthMm: Math.max(0.01, Number(styleRef?.lineWidthMm ?? state.lineWidthMm ?? 0.25) || 0.25),
        lineType: String(styleRef?.lineType || "solid"),
        color: String(styleRef?.color || "#0f172a"),
        groupId: gid
      };
      helpers.addShape?.(polyline);
      createdPolylineIds.push(Number(polyline.id));
      for (const item of chain) {
        const e = edges[item.edgeIdx];
        const sid = Number(e?.id);
        if (Number.isFinite(sid)) consumedLineIds.add(sid);
      }
    }
    if (!createdPolylineIds.length) return [];

    for (const id of consumedLineIds) helpers.removeShapeById?.(id);
    const keepIds = (g.shapeIds || []).map(Number).filter((id) => Number.isFinite(id) && !consumedLineIds.has(id));
    g.shapeIds = keepIds.concat(createdPolylineIds);
    return createdPolylineIds;
  }

  function distancePointToSegment(pt, a1, a2) {
    const x1 = Number(a1.x), y1 = Number(a1.y), x2 = Number(a2.x), y2 = Number(a2.y);
    const px = Number(pt.x), py = Number(pt.y);
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 <= 1e-12) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    const qx = x1 + dx * t, qy = y1 + dy * t;
    return Math.hypot(px - qx, py - qy);
  }

  function bindTargetsToNearestCreatedLine(points, createdIds) {
    const out = [];
    const created = [];
    const createdIdSet = new Set();
    for (const cidRaw of (createdIds || [])) {
      const cid = Number(cidRaw);
      if (!Number.isFinite(cid)) continue;
      const s = (state.shapes || []).find((x) => Number(x?.id) === cid);
      if (!s || String(s.type || "") !== "line") continue;
      createdIdSet.add(cid);
      created.push({ id: cid, x1: Number(s.x1), y1: Number(s.y1), x2: Number(s.x2), y2: Number(s.y2) });
    }
    if (!created.length) return out;
    for (const p of (points || [])) {
      const px = Number(p?.x), py = Number(p?.y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const directShapeId = Number(p?.shapeId);
      if (Number.isFinite(directShapeId) && createdIdSet.has(directShapeId)) {
        out.push({ x: px, y: py, shapeId: directShapeId });
        continue;
      }
      let best = null;
      let bestDist = Infinity;
      for (const c of created) {
        const d = distancePointToSegment({ x: px, y: py }, { x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 });
        if (d < bestDist) {
          bestDist = d;
          best = c.id;
        }
      }
      if (!Number.isFinite(Number(best))) continue;
      out.push({ x: px, y: py, shapeId: Number(best) });
    }
    return out;
  }

  function buildShiftedTrimTargetsForCreatedLines(preview, newShapeIds, selectedBases, offsetDist) {
    const out = [];
    const baseLines = expandSelectedBaseLinesForTrim(selectedBases);
    if (!Array.isArray(preview) || !preview.length || !Array.isArray(newShapeIds) || !newShapeIds.length || !baseLines.length) return out;
    const mode = String(state.dlineSettings?.mode || "both");
    const epsT = 1e-6;
    const half = Math.max(0, Number(offsetDist) * 0.5);
    for (let i = 0; i < preview.length; i++) {
      const p = preview[i];
      const sid = Number(newShapeIds[i]);
      if (!p || !Number.isFinite(sid) || String(p.type || "") !== "line") continue;
      if (mode === "single" && !(Number(p.side) === 1 || Number(p.side) === -1)) continue;
      const s = (state.shapes || []).find((x) => Number(x?.id) === sid);
      if (!s || String(s.type || "") !== "line") continue;
      const a1 = { x: Number(s.x1), y: Number(s.y1) };
      const a2 = { x: Number(s.x2), y: Number(s.y2) };
      if (![a1.x, a1.y, a2.x, a2.y].every(Number.isFinite)) continue;
      const dx = Number(a2.x) - Number(a1.x);
      const dy = Number(a2.y) - Number(a1.y);
      const len = Math.hypot(dx, dy);
      const tx = (len > 1e-9) ? (dx / len) : 1;
      const ty = (len > 1e-9) ? (dy / len) : 0;
      const cuts = [];
      const pushCut = (ip) => {
        if (!ip || !Number.isFinite(Number(ip.t))) return;
        const t = Math.max(0, Math.min(1, Number(ip.t)));
        for (const c of cuts) if (Math.abs(Number(c.t) - t) <= epsT) return;
        cuts.push({ t, x: Number(ip.x), y: Number(ip.y) });
      };
      for (const b of baseLines) {
        const b1 = { x: Number(b.x1), y: Number(b.y1) };
        const b2 = { x: Number(b.x2), y: Number(b.y2) };
        if (![b1.x, b1.y, b2.x, b2.y].every(Number.isFinite)) continue;
        pushCut(segmentIntersectionParamPoint(a1, a2, b1, b2));
      }
      if (!cuts.length) continue;
      cuts.sort((u, v) => Number(u.t) - Number(v.t));
      if (mode === "both") {
        for (const c of cuts) {
          if (Number(c.t) <= epsT || Number(c.t) >= 1 - epsT) continue;
          out.push({ x: Number(c.x) - tx * half, y: Number(c.y) - ty * half, shapeId: sid });
          out.push({ x: Number(c.x) + tx * half, y: Number(c.y) + ty * half, shapeId: sid });
        }
      } else {
        const tStart = cuts.find((c) => Number(c.t) > epsT) || null;
        let tEnd = null;
        for (let k = cuts.length - 1; k >= 0; k--) {
          if (Number(cuts[k].t) < 1 - epsT) { tEnd = cuts[k]; break; }
        }
        if (tStart) out.push({ x: Number(tStart.x) - tx * half, y: Number(tStart.y) - ty * half, shapeId: sid });
        if (tEnd) out.push({ x: Number(tEnd.x) + tx * half, y: Number(tEnd.y) + ty * half, shapeId: sid });
      }
    }
    return out;
  }

  function getStatusText(lang, key, data) {
    if (lang === "en") {
      if (key === "created") return "Double line created";
      if (key === "needSelect") return "Double line: select line(s) first";
      if (key === "step") return `Double line trim step ${Number(data?.done)}/${Number(data?.total)}. Press Enter to continue.`;
      return "";
    }
    if (key === "created") return "二重線を作成しました";
    if (key === "needSelect") return "二重線: 先に対象を選択してください";
    if (key === "step") return `二重線トリム ${Number(data?.done)}/${Number(data?.total)}。Enterで次へ。`;
    return "";
  }

  function collectIntersectionsFromPreview(preview, baseShapes = [], eps = 1e-6) {
    const out = [];
    const lines = (preview || []).filter((o) => o && String(o.type || "") === "line");
    const e = Math.max(1e-9, Number(eps) || 1e-6);
    const lineEnds = (o) => {
      const fx1 = Number(o?.fullX1), fy1 = Number(o?.fullY1), fx2 = Number(o?.fullX2), fy2 = Number(o?.fullY2);
      if ([fx1, fy1, fx2, fy2].every(Number.isFinite)) {
        return { x1: fx1, y1: fy1, x2: fx2, y2: fy2 };
      }
      return { x1: Number(o?.x1), y1: Number(o?.y1), x2: Number(o?.x2), y2: Number(o?.y2) };
    };
    const lineIntersectionInfinite = (a1, a2, b1, b2) => {
      const x1 = Number(a1.x), y1 = Number(a1.y), x2 = Number(a2.x), y2 = Number(a2.y);
      const x3 = Number(b1.x), y3 = Number(b1.y), x4 = Number(b2.x), y4 = Number(b2.y);
      const det = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
      if (Math.abs(det) < 1e-12) return null;
      const x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / det;
      const y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / det;
      if (![x, y].every(Number.isFinite)) return null;
      return { x, y };
    };
    const segmentParam = (p, a1, a2) => {
      const x1 = Number(a1.x), y1 = Number(a1.y), x2 = Number(a2.x), y2 = Number(a2.y);
      const dx = x2 - x1, dy = y2 - y1;
      const len2 = dx * dx + dy * dy;
      if (len2 <= 1e-12) return NaN;
      return ((Number(p.x) - x1) * dx + (Number(p.y) - y1) * dy) / len2;
    };
    const norm = (x, y) => {
      const nx = Number(x), ny = Number(y);
      const len = Math.hypot(nx, ny);
      if (!Number.isFinite(len) || len <= 1e-9) return null;
      return { x: nx / len, y: ny / len };
    };
    const pushPt = (x, y, dirs = [], meta = null) => {
      const px = Number(x), py = Number(y);
      if (!Number.isFinite(px) || !Number.isFinite(py)) return;
      for (const p of out) {
        if (Math.hypot(Number(p.x) - px, Number(p.y) - py) <= e) {
          for (const d of (dirs || [])) {
            const nd = norm(d?.x, d?.y);
            if (!nd) continue;
            const hit = (p.dirs || []).some((v) => Math.abs(Number(v.x) * nd.x + Number(v.y) * nd.y) >= 0.995);
            if (!hit) p.dirs.push(nd);
          }
          if (meta && typeof meta === "object") {
            if (meta.debugCandidate) p.debugCandidate = true;
            if (meta.markerHalfPx != null) p.markerHalfPx = Number(meta.markerHalfPx);
            if (meta.markerColor) p.markerColor = String(meta.markerColor);
            if (meta.nn) p.nn = true;
            if (meta.ff) p.ff = true;
            if (meta.tCandidate) p.tCandidate = true;
            if (Array.isArray(meta.parentSourceIds)) {
              const cur = Array.isArray(p.parentSourceIds) ? p.parentSourceIds.slice() : [];
              for (const sid of meta.parentSourceIds) {
                const n = Number(sid);
                if (!Number.isFinite(n)) continue;
                if (!cur.includes(n)) cur.push(n);
              }
              p.parentSourceIds = cur;
            }
            if (Array.isArray(meta.parentLanes)) {
              const curLanes = Array.isArray(p.parentLanes) ? p.parentLanes.slice() : [];
              for (const lane of meta.parentLanes) {
                const sid = Number(lane?.sid);
                const nd = norm(lane?.dir?.x, lane?.dir?.y);
                if (!Number.isFinite(sid) || !nd) continue;
                const exists = curLanes.some((v) => Number(v?.sid) === sid);
                if (!exists) curLanes.push({ sid, dir: nd });
              }
              p.parentLanes = curLanes;
            }
          }
          return;
        }
      }
      const nds = [];
      for (const d of (dirs || [])) {
        const nd = norm(d?.x, d?.y);
        if (nd) nds.push(nd);
      }
      const item = { x: px, y: py, dirs: nds.slice(0, 2) };
      if (meta && typeof meta === "object") {
        if (meta.debugCandidate) item.debugCandidate = true;
        if (meta.markerHalfPx != null) item.markerHalfPx = Number(meta.markerHalfPx);
        if (meta.markerColor) item.markerColor = String(meta.markerColor);
        if (meta.nn) item.nn = true;
        if (meta.ff) item.ff = true;
        if (meta.tCandidate) item.tCandidate = true;
        if (Array.isArray(meta.parentSourceIds)) {
          item.parentSourceIds = meta.parentSourceIds
            .map((sid) => Number(sid))
            .filter(Number.isFinite)
            .filter((sid, idx, arr) => arr.indexOf(sid) === idx);
        }
        if (Array.isArray(meta.parentLanes)) {
          item.parentLanes = meta.parentLanes
            .map((lane) => {
              const sid = Number(lane?.sid);
              const nd = norm(lane?.dir?.x, lane?.dir?.y);
              if (!Number.isFinite(sid) || !nd) return null;
              return { sid, dir: nd };
            })
            .filter(Boolean)
            .filter((lane, idx, arr) => arr.findIndex((v) => Number(v.sid) === Number(lane.sid)) === idx);
        }
      }
      out.push(item);
    };
    const bySourceSide = new Map();
    for (const l of lines) {
      const src = Number(l?.sourceBaseId ?? l?.baseId);
      const side = Number(l?.side);
      if (!Number.isFinite(src) || !(side === 1 || side === -1)) continue;
      const k = `${src}:${side}`;
      if (!bySourceSide.has(k)) bySourceSide.set(k, []);
      bySourceSide.get(k).push(l);
    }
    const sourceIds = Array.from(new Set(lines
      .map((l) => Number(l?.sourceBaseId ?? l?.baseId))
      .filter(Number.isFinite)));

    const baseSegsBySource = new Map();
    const rawSegsBySource = new Map();
    const rawBaseSegs = [];
    const addRawBaseSeg = (sid, x1, y1, x2, y2) => {
      if (![sid, x1, y1, x2, y2].every(Number.isFinite)) return;
      if (Math.hypot(x2 - x1, y2 - y1) <= 1e-9) return;
      const seg = { sid: Number(sid), x1: Number(x1), y1: Number(y1), x2: Number(x2), y2: Number(y2) };
      rawBaseSegs.push(seg);
      if (!rawSegsBySource.has(Number(sid))) rawSegsBySource.set(Number(sid), []);
      rawSegsBySource.get(Number(sid)).push(seg);
    };
    const addBaseSeg = (sid, x1, y1, x2, y2) => {
      if (![sid, x1, y1, x2, y2].every(Number.isFinite)) return;
      if (Math.hypot(Number(x2) - Number(x1), Number(y2) - Number(y1)) <= 1e-9) return;
      if (!baseSegsBySource.has(Number(sid))) baseSegsBySource.set(Number(sid), []);
      baseSegsBySource.get(Number(sid)).push({ x1: Number(x1), y1: Number(y1), x2: Number(x2), y2: Number(y2) });
    };
    for (const s of (baseShapes || [])) {
      if (!s) continue;
      const sid = Number(s.id);
      const t = String(s.type || "");
      if (!Number.isFinite(sid)) continue;
      if (t === "line") {
        addRawBaseSeg(sid, Number(s.x1), Number(s.y1), Number(s.x2), Number(s.y2));
      } else if (t === "polyline" && Array.isArray(s.points)) {
        const pts = s.points;
        for (let i = 0; i < pts.length - 1; i++) {
          addRawBaseSeg(sid, Number(pts[i]?.x), Number(pts[i]?.y), Number(pts[i + 1]?.x), Number(pts[i + 1]?.y));
        }
        if (s.closed && pts.length >= 2) {
          addRawBaseSeg(sid, Number(pts[pts.length - 1]?.x), Number(pts[pts.length - 1]?.y), Number(pts[0]?.x), Number(pts[0]?.y));
        }
      }
    }

    // Insert virtual vertices at touches/intersections (incl. T-junction).
    if (rawBaseSegs.length > 0) {
      const cutParams = rawBaseSegs.map(() => [0, 1]);
      const tTol = 1e-6;
      const addCut = (idx, t) => {
        const tv = Number(t);
        if (!Number.isFinite(tv)) return;
        if (tv <= tTol || tv >= 1 - tTol) return;
        const arr = cutParams[idx];
        for (const v of arr) {
          if (Math.abs(Number(v) - tv) <= tTol) return;
        }
        arr.push(tv);
      };
      for (let i = 0; i < rawBaseSegs.length; i++) {
        for (let j = i + 1; j < rawBaseSegs.length; j++) {
          const a = rawBaseSegs[i], b = rawBaseSegs[j];
          if (Number(a.sid) === Number(b.sid)) continue;
          const a1 = { x: Number(a.x1), y: Number(a.y1) }, a2 = { x: Number(a.x2), y: Number(a.y2) };
          const b1 = { x: Number(b.x1), y: Number(b.y1) }, b2 = { x: Number(b.x2), y: Number(b.y2) };
          const ip = lineIntersectionInfinite(a1, a2, b1, b2);
          if (!ip) continue;
          const ta = segmentParam(ip, a1, a2);
          const tb = segmentParam(ip, b1, b2);
          const onA = Number.isFinite(ta) && ta >= -tTol && ta <= 1 + tTol;
          const onB = Number.isFinite(tb) && tb >= -tTol && tb <= 1 + tTol;
          if (!onA || !onB) continue;
          addCut(i, ta);
          addCut(j, tb);
        }
      }
      for (let i = 0; i < rawBaseSegs.length; i++) {
        const seg = rawBaseSegs[i];
        const arr = (cutParams[i] || []).slice().sort((u, v) => Number(u) - Number(v));
        for (let k = 0; k < arr.length - 1; k++) {
          const t1 = Number(arr[k]), t2 = Number(arr[k + 1]);
          if (!(t2 - t1 > 1e-9)) continue;
          const x1 = Number(seg.x1) + (Number(seg.x2) - Number(seg.x1)) * t1;
          const y1 = Number(seg.y1) + (Number(seg.y2) - Number(seg.y1)) * t1;
          const x2 = Number(seg.x1) + (Number(seg.x2) - Number(seg.x1)) * t2;
          const y2 = Number(seg.y1) + (Number(seg.y2) - Number(seg.y1)) * t2;
          addBaseSeg(seg.sid, x1, y1, x2, y2);
        }
      }
    }

    const pairJunctions = (sidA, sidB) => {
      const segA = baseSegsBySource.get(Number(sidA)) || [];
      const segB = baseSegsBySource.get(Number(sidB)) || [];
      const classifyRawAtPoint = (sid, ip) => {
        const segs = rawSegsBySource.get(Number(sid)) || [];
        let interior = false;
        let endpoint = false;
        const tol = 0.08;
        for (const s of segs) {
          const p1 = { x: Number(s.x1), y: Number(s.y1) };
          const p2 = { x: Number(s.x2), y: Number(s.y2) };
          const t = segmentParam(ip, p1, p2);
          if (!Number.isFinite(t)) continue;
          if (!(t >= -tol && t <= 1 + tol)) continue;
          if (t > tol && t < 1 - tol) interior = true;
          if (Math.abs(t) <= tol || Math.abs(t - 1) <= tol) endpoint = true;
        }
        return { interior, endpoint };
      };
      const list = [];
      const pushJ = (j) => {
        for (const p of list) {
          if (Math.hypot(Number(p.x) - Number(j.x), Number(p.y) - Number(j.y)) <= e) {
            p.rawAInterior = !!(p.rawAInterior || j.rawAInterior);
            p.rawBInterior = !!(p.rawBInterior || j.rawBInterior);
            p.rawAEndpoint = !!(p.rawAEndpoint || j.rawAEndpoint);
            p.rawBEndpoint = !!(p.rawBEndpoint || j.rawBEndpoint);
            return;
          }
        }
        list.push(j);
      };
      for (const a of segA) {
        for (const b of segB) {
          const a1 = { x: Number(a.x1), y: Number(a.y1) }, a2 = { x: Number(a.x2), y: Number(a.y2) };
          const b1 = { x: Number(b.x1), y: Number(b.y1) }, b2 = { x: Number(b.x2), y: Number(b.y2) };
          const ip = lineIntersectionInfinite(a1, a2, b1, b2);
          if (!ip) continue;
          const ta = segmentParam(ip, a1, a2);
          const tb = segmentParam(ip, b1, b2);
          const tol = 0.08;
          if (!(Number.isFinite(ta) && Number.isFinite(tb) && ta >= -tol && ta <= 1 + tol && tb >= -tol && tb <= 1 + tol)) continue;
          const ca = classifyRawAtPoint(sidA, ip);
          const cb = classifyRawAtPoint(sidB, ip);
          pushJ({
            x: Number(ip.x), y: Number(ip.y), ta: Number(ta), tb: Number(tb),
            dirA: { x: Number(a.x2) - Number(a.x1), y: Number(a.y2) - Number(a.y1) },
            dirB: { x: Number(b.x2) - Number(b.x1), y: Number(b.y2) - Number(b.y1) },
            a1: { x: Number(a.x1), y: Number(a.y1) },
            a2: { x: Number(a.x2), y: Number(a.y2) },
            b1: { x: Number(b.x1), y: Number(b.y1) },
            b2: { x: Number(b.x2), y: Number(b.y2) },
            rawAInterior: !!ca.interior,
            rawBInterior: !!cb.interior,
            rawAEndpoint: !!ca.endpoint,
            rawBEndpoint: !!cb.endpoint,
          });
        }
      }
      return list;
    };

    const bestCandidateForCombo = (sidA, sidB, sa, sb, jx, jy, allowOutside = false) => {
      const la = bySourceSide.get(`${sidA}:${sa}`) || [];
      const lb = bySourceSide.get(`${sidB}:${sb}`) || [];
      let best = null;
      let bestScore = Infinity;
      for (const a of la) {
        for (const b of lb) {
          const ea = lineEnds(a), eb = lineEnds(b);
          const a1 = { x: Number(ea.x1), y: Number(ea.y1) }, a2 = { x: Number(ea.x2), y: Number(ea.y2) };
          const b1 = { x: Number(eb.x1), y: Number(eb.y1) }, b2 = { x: Number(eb.x2), y: Number(eb.y2) };
          if (![a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y].every(Number.isFinite)) continue;
          let ip = segmentIntersectionParamPoint(a1, a2, b1, b2);
          let ta = NaN, tb = NaN;
          if (ip) {
            ta = Number(ip.t);
            tb = Number(ip.u);
          } else {
            const inf = lineIntersectionInfinite(a1, a2, b1, b2);
            if (!inf) continue;
            ta = segmentParam(inf, a1, a2);
            tb = segmentParam(inf, b1, b2);
            if (!allowOutside) {
              const tol = 0.12;
              if (!(Number.isFinite(ta) && Number.isFinite(tb) && ta >= -tol && ta <= 1 + tol && tb >= -tol && tb <= 1 + tol)) continue;
            }
            ip = inf;
          }
          const distJ = Math.hypot(Number(ip.x) - Number(jx), Number(ip.y) - Number(jy));
          const outA = Number.isFinite(ta) ? Math.max(0, -ta, ta - 1) : 1;
          const outB = Number.isFinite(tb) ? Math.max(0, -tb, tb - 1) : 1;
          const score = distJ + (outA + outB) * 1000;
          if (score < bestScore) {
            bestScore = score;
            best = { x: Number(ip.x), y: Number(ip.y), score };
          }
        }
      }
      return best;
    };

    const splitBySideAndNearFar = (cands, B, vec, refPt) => {
      const left = [];
      const right = [];
      const vx = Number(vec?.x), vy = Number(vec?.y);
      const bx = Number(B?.x), by = Number(B?.y);
      const rx = Number(refPt?.x), ry = Number(refPt?.y);
      if (![vx, vy, bx, by, rx, ry].every(Number.isFinite)) {
        return { left, right };
      }
      for (const item of (cands || [])) {
        const px = Number(item?.x), py = Number(item?.y);
        if (![px, py].every(Number.isFinite)) continue;
        const wx = px - bx, wy = py - by;
        const cross = vx * wy - vy * wx;
        const dRef = Math.hypot(px - rx, py - ry);
        const row = { item, dRef };
        if (cross >= 0) left.push(row);
        else right.push(row);
      }
      left.sort((a, b) => Number(a.dRef) - Number(b.dRef));
      right.sort((a, b) => Number(a.dRef) - Number(b.dRef));
      const tag = (arr) => {
        if (!arr.length) return;
        if (arr.length === 1) {
          arr[0].nf = "N";
          return;
        }
        arr[0].nf = "N";
        for (let i = 1; i < arr.length; i++) arr[i].nf = "F";
      };
      tag(left);
      tag(right);
      return { left, right };
    };

    for (let i = 0; i < sourceIds.length; i++) {
      for (let j = i + 1; j < sourceIds.length; j++) {
        const sidA = Number(sourceIds[i]), sidB = Number(sourceIds[j]);
        const junctions = pairJunctions(sidA, sidB);
        if (!junctions.length) continue;
        for (const junction of junctions) {
          const tA = Number(junction.ta), tB = Number(junction.tb);
          const isL = !junction.rawAInterior && !junction.rawBInterior;

          let picked = [];
          const comboAllowOutside = !!isL;
          if (isL) {
            const raw = [
              { sa: 1, sb: 1, c: bestCandidateForCombo(sidA, sidB, 1, 1, junction.x, junction.y, comboAllowOutside) },
              { sa: 1, sb: -1, c: bestCandidateForCombo(sidA, sidB, 1, -1, junction.x, junction.y, comboAllowOutside) },
              { sa: -1, sb: 1, c: bestCandidateForCombo(sidA, sidB, -1, 1, junction.x, junction.y, comboAllowOutside) },
              { sa: -1, sb: -1, c: bestCandidateForCombo(sidA, sidB, -1, -1, junction.x, junction.y, comboAllowOutside) },
            ].filter((v) => !!v.c).map((v) => ({
              sa: Number(v.sa),
              sb: Number(v.sb),
              x: Number(v.c.x),
              y: Number(v.c.y),
              score: Number(v.c.score),
              sigA: null,
              sigB: null,
            }));
            const candidates = raw.slice();
            const B = { x: Number(junction.x), y: Number(junction.y) };
            const A = (Number(tA) <= 0.5)
              ? { x: Number(junction.a2?.x), y: Number(junction.a2?.y) }
              : { x: Number(junction.a1?.x), y: Number(junction.a1?.y) };
            const C = (Number(tB) <= 0.5)
              ? { x: Number(junction.b2?.x), y: Number(junction.b2?.y) }
              : { x: Number(junction.b1?.x), y: Number(junction.b1?.y) };
            const vecAB = { x: Number(B.x) - Number(A.x), y: Number(B.y) - Number(A.y) };
            const vecBC = { x: Number(C.x) - Number(B.x), y: Number(C.y) - Number(B.y) };
            const splitAB = splitBySideAndNearFar(candidates, B, vecAB, A);
            const splitBC = splitBySideAndNearFar(candidates, B, vecBC, C);
            const attachSig = (arr, key) => {
              for (const row of arr) {
                if (!row?.item || !row?.nf) continue;
                if (key === "A") row.item.sigA = String(row.nf);
                if (key === "B") row.item.sigB = String(row.nf);
              }
            };
            attachSig(splitAB.left, "A");
            attachSig(splitAB.right, "A");
            attachSig(splitBC.left, "B");
            attachSig(splitBC.right, "B");
            // Debug: draw all 4 combo candidates as small crosses.
            for (const c of raw) {
              const isNN = c.sigA === "N" && c.sigB === "N";
              const isFF = c.sigA === "F" && c.sigB === "F";
              const jx = Number(junction.x), jy = Number(junction.y);
              const dx = Number(c.x) - jx, dy = Number(c.y) - jy;
              const len = Math.hypot(dx, dy);
              const ux = len > 1e-9 ? (dx / len) : 0;
              const uy = len > 1e-9 ? (dy / len) : 0;
              const comboBias = (Number(c.sa) * 2 + Number(c.sb)) * 0.15;
              pushPt(Number(c.x) + ux * comboBias, Number(c.y) + uy * comboBias, [junction.dirA, junction.dirB], {
                debugCandidate: true,
                markerHalfPx: 2,
                markerColor: "#64748b",
                nn: isNN,
                ff: isFF,
                parentSourceIds: [sidA, sidB],
                parentLanes: [
                  { sid: sidA, dir: junction.dirA },
                  { sid: sidB, dir: junction.dirB },
                ],
              });
            }
            for (const c of candidates) {
              c.dA = Math.hypot(Number(c.x) - Number(A.x), Number(c.y) - Number(A.y));
              c.dC = Math.hypot(Number(c.x) - Number(C.x), Number(c.y) - Number(C.y));
              c.dAC = Number(c.dA) + Number(c.dC);
            }
            const hasFF = candidates.some((c) => c.sigA === "F" && c.sigB === "F");
            if (!hasFF && candidates.length > 0) {
              const ffFallback = candidates.slice().sort((a, b) => Number(b.dAC) - Number(a.dAC))[0];
              if (ffFallback) {
                ffFallback.sigA = "F";
                ffFallback.sigB = "F";
              }
            }
            const nnPool = candidates
              .filter((c) => c.sigA === "N" && c.sigB === "N")
              .sort((a, b) => Number(a.dAC) - Number(b.dAC) || Number(a.score) - Number(b.score));
            const nn = nnPool[0] || candidates.slice().sort((a, b) => Number(a.dAC) - Number(b.dAC) || Number(a.score) - Number(b.score))[0];
            if (nn) picked.push(nn);
            const ffPool = candidates
              .filter((c) => c.sigA === "F" && c.sigB === "F")
              .sort((a, b) => Number(b.dAC) - Number(a.dAC) || Number(a.score) - Number(b.score));
            let ff = ffPool.find((c) => !picked.some((p) => Math.hypot(Number(p.x) - Number(c.x), Number(p.y) - Number(c.y)) <= e * 0.2));
            if (!ff) {
              ff = candidates
                .slice()
                .sort((a, b) => Number(b.dAC) - Number(a.dAC) || Number(a.score) - Number(b.score))
                .find((c) => !picked.some((p) => Math.hypot(Number(p.x) - Number(c.x), Number(p.y) - Number(c.y)) <= e * 0.2));
            }
            if (ff) picked.push(ff);
            if (picked.length < 2) {
              const fallback = candidates.sort((a, b) => Number(a.score) - Number(b.score));
              for (const c of fallback) {
                if (picked.length >= 2) break;
                if (picked.some((p) => Math.hypot(Number(p.x) - Number(c.x), Number(p.y) - Number(c.y)) <= e * 0.2)) continue;
                picked.push(c);
              }
            }
          } else {
            const combos = [
              bestCandidateForCombo(sidA, sidB, 1, 1, junction.x, junction.y, comboAllowOutside),
              bestCandidateForCombo(sidA, sidB, 1, -1, junction.x, junction.y, comboAllowOutside),
              bestCandidateForCombo(sidA, sidB, -1, 1, junction.x, junction.y, comboAllowOutside),
              bestCandidateForCombo(sidA, sidB, -1, -1, junction.x, junction.y, comboAllowOutside),
            ].filter(Boolean);
            combos.sort((a, b) => Number(a.score) - Number(b.score));
            for (const c of combos) {
              if (picked.length >= 2) break;
              if (picked.some((p) => Math.hypot(Number(p.x) - Number(c.x), Number(p.y) - Number(c.y)) <= e)) continue;
              picked.push(c);
            }
            // T-junction debug: show selected candidates as dedicated markers.
            for (const c of picked) {
              pushPt(c.x, c.y, [junction.dirA, junction.dirB], {
                tCandidate: true,
                parentSourceIds: [sidA, sidB],
                parentLanes: [
                  { sid: sidA, dir: junction.dirA },
                  { sid: sidB, dir: junction.dirB },
                ],
              });
            }
          }
          if (picked.length < 2) {
            const allCombos = [
              bestCandidateForCombo(sidA, sidB, 1, 1, junction.x, junction.y, comboAllowOutside),
              bestCandidateForCombo(sidA, sidB, 1, -1, junction.x, junction.y, comboAllowOutside),
              bestCandidateForCombo(sidA, sidB, -1, 1, junction.x, junction.y, comboAllowOutside),
              bestCandidateForCombo(sidA, sidB, -1, -1, junction.x, junction.y, comboAllowOutside),
            ].filter(Boolean).sort((a, b) => Number(a.score) - Number(b.score));
            for (const c of allCombos) {
              if (picked.length >= 2) break;
              if (picked.some((p) => Math.hypot(Number(p.x) - Number(c.x), Number(p.y) - Number(c.y)) <= e * 0.1)) continue;
              picked.push(c);
            }
          }
          const markerDirs = [junction.dirA, junction.dirB].filter(Boolean);
          for (const p of picked) {
            pushPt(p.x, p.y, markerDirs, {
              parentSourceIds: [sidA, sidB],
              parentLanes: [
                { sid: sidA, dir: junction.dirA },
                { sid: sidB, dir: junction.dirB },
              ],
            });
          }
        }
      }
    }

    if (!out.length) {
      // Fallback to direct same-side pair intersections.
      for (let i = 0; i < lines.length; i++) {
        for (let j = i + 1; j < lines.length; j++) {
          const a = lines[i], b = lines[j];
          const sa = Number(a?.side), sb = Number(b?.side);
          if ((sa === 1 || sa === -1) && (sb === 1 || sb === -1) && sa !== sb) continue;
          const srcA = Number(a?.sourceBaseId ?? a?.baseId);
          const srcB = Number(b?.sourceBaseId ?? b?.baseId);
          if (Number.isFinite(srcA) && Number.isFinite(srcB) && srcA === srcB) continue;
          const ea = lineEnds(a), eb = lineEnds(b);
          const a1 = { x: Number(ea.x1), y: Number(ea.y1) }, a2 = { x: Number(ea.x2), y: Number(ea.y2) };
          const b1 = { x: Number(eb.x1), y: Number(eb.y1) }, b2 = { x: Number(eb.x2), y: Number(eb.y2) };
          const ip = segmentIntersectionParamPoint(a1, a2, b1, b2) || lineIntersectionInfinite(a1, a2, b1, b2);
          if (ip) pushPt(ip.x, ip.y);
        }
      }
    }
    return out;
  }

  function createIntersectionMarkerGroup(points, baseShapes = []) {
    if (!Array.isArray(points) || !points.length) return { ok: false, markerIds: [], groupId: null };
    if (typeof helpers?.nextGroupId !== "function" || typeof helpers?.addGroup !== "function") {
      return { ok: false, markerIds: [], groupId: null };
    }
    const gid = Number(helpers.nextGroupId());
    if (!Number.isFinite(gid)) return { ok: false, markerIds: [], groupId: null };
    const normLocal = (x, y) => {
      const nx = Number(x), ny = Number(y);
      const len = Math.hypot(nx, ny);
      if (!Number.isFinite(len) || len <= 1e-9) return null;
      return { x: nx / len, y: ny / len };
    };
    const markerIds = [];
    const ringIds = [];
    const lineIds = [];
    const validPts = [];
    const baseSegs = [];
    const addBaseSeg = (sid, x1, y1, x2, y2) => {
      if (![sid, x1, y1, x2, y2].every(Number.isFinite)) return;
      if (Math.hypot(x2 - x1, y2 - y1) <= 1e-9) return;
      baseSegs.push({ sid: Number(sid), x1, y1, x2, y2 });
    };
    for (const s of (baseShapes || [])) {
      if (!s) continue;
      const sid = Number(s.id);
      if (!Number.isFinite(sid)) continue;
      const t = String(s.type || "");
      if (t === "line") {
        addBaseSeg(sid, Number(s.x1), Number(s.y1), Number(s.x2), Number(s.y2));
      } else if (t === "polyline" && Array.isArray(s.points)) {
        const pts = s.points;
        for (let i = 0; i < pts.length - 1; i++) {
          addBaseSeg(sid, Number(pts[i]?.x), Number(pts[i]?.y), Number(pts[i + 1]?.x), Number(pts[i + 1]?.y));
        }
        if (s.closed && pts.length >= 2) {
          addBaseSeg(sid, Number(pts[pts.length - 1]?.x), Number(pts[pts.length - 1]?.y), Number(pts[0]?.x), Number(pts[0]?.y));
        }
      }
    }
    let sx = 0, sy = 0, n = 0;
    for (const p of points) {
      const x = Number(p?.x), y = Number(p?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (p?.nn || p?.ff) {
        const ring = {
          id: helpers.nextShapeId?.(),
          type: "circle",
          cx: x,
          cy: y,
          r: 6 / Math.max(1e-9, Number(state?.view?.scale) || 1),
          color: p?.ff ? "#22c55e" : "#7c3aed",
          lineType: "solid",
          lineWidthMm: 0.1,
          layerId: state.activeLayerId,
          groupId: gid
        };
        if (Number.isFinite(Number(ring.id))) {
          helpers.addShape?.(ring);
          ringIds.push(Number(ring.id));
        }
      }
      if (p?.tCandidate && !(p?.nn || p?.ff)) {
        const tRing = {
          id: helpers.nextShapeId?.(),
          type: "circle",
          cx: x,
          cy: y,
          r: 5 / Math.max(1e-9, Number(state?.view?.scale) || 1),
          color: "#f59e0b",
          lineType: "solid",
          lineWidthMm: 0.1,
          layerId: state.activeLayerId,
          groupId: gid
        };
        if (Number.isFinite(Number(tRing.id))) {
          helpers.addShape?.(tRing);
          ringIds.push(Number(tRing.id));
        }
      }
      if (p?.nn || p?.ff || p?.tCandidate) {
        validPts.push({
          x,
          y,
          dirs: Array.isArray(p?.dirs) ? p.dirs : [],
          parentSourceIds: Array.isArray(p?.parentSourceIds)
            ? p.parentSourceIds.map((v) => Number(v)).filter(Number.isFinite)
            : [],
          parentLanes: Array.isArray(p?.parentLanes)
            ? p.parentLanes
                .map((lane) => {
                  const sid = Number(lane?.sid);
                  const nd = normLocal(lane?.dir?.x, lane?.dir?.y);
                  if (!Number.isFinite(sid) || !nd) return null;
                  return { sid, dir: nd };
                })
                .filter(Boolean)
            : [],
        });
      }
      sx += x;
      sy += y;
      n++;
    }
    if (!markerIds.length && !ringIds.length) return { ok: false, markerIds: [], ringIds: [], groupId: null };
    const crossesOwnParentLines = (a, b, parentIds) => {
      const a1 = { x: Number(a.x), y: Number(a.y) };
      const a2 = { x: Number(b.x), y: Number(b.y) };
      const parentSet = new Set((parentIds || []).map(Number).filter(Number.isFinite));
      if (!parentSet.size) return false;
      for (const s of baseSegs) {
        if (!parentSet.has(Number(s.sid))) continue;
        const b1 = { x: Number(s.x1), y: Number(s.y1) };
        const b2 = { x: Number(s.x2), y: Number(s.y2) };
        const ip = segmentIntersectionParamPoint(a1, a2, b1, b2);
        if (!ip) continue;
        const t = Number(ip.t);
        const u = Number(ip.u);
        if (!Number.isFinite(t) || !Number.isFinite(u)) continue;
        // Allow touching at endpoints only.
        if (t <= 1e-6 || t >= 1 - 1e-6) continue;
        if (u <= 1e-6 || u >= 1 - 1e-6) continue;
        return true;
      }
      return false;
    };
    const isSameLanePoint = (basePt, testPt, dir, tol = 0.03) => {
      const vx = Number(testPt.x) - Number(basePt.x);
      const vy = Number(testPt.y) - Number(basePt.y);
      const dist = Math.hypot(vx, vy);
      if (!Number.isFinite(dist) || dist <= 1e-9) return false;
      const perp = Math.abs(vx * Number(dir.y) - vy * Number(dir.x)) / Math.max(1e-9, dist);
      return perp <= Number(tol);
    };
    const hasIntermediateMarkerOnLane = (i, j, dir, sid, tol = 0.03) => {
      const a = validPts[Number(i)];
      const b = validPts[Number(j)];
      if (!a || !b) return false;
      const abx = Number(b.x) - Number(a.x);
      const aby = Number(b.y) - Number(a.y);
      const abLen2 = abx * abx + aby * aby;
      if (!(abLen2 > 1e-12)) return false;
      for (let k = 0; k < validPts.length; k++) {
        if (k === Number(i) || k === Number(j)) continue;
        const m = validPts[k];
        const mParents = Array.isArray(m.parentSourceIds) ? m.parentSourceIds : [];
        if (!mParents.includes(Number(sid))) continue;
        if (!isSameLanePoint(a, m, dir, tol)) continue;
        const amx = Number(m.x) - Number(a.x);
        const amy = Number(m.y) - Number(a.y);
        const t = (amx * abx + amy * aby) / abLen2;
        if (t > 1e-6 && t < 1 - 1e-6) return true;
      }
      return false;
    };

    const edgeKeySet = new Set();
    const deg = new Array(validPts.length).fill(0);
    const addEdge = (i, j) => {
      const u = Math.min(Number(i), Number(j));
      const v = Math.max(Number(i), Number(j));
      if (!(u >= 0 && v >= 0) || u === v) return false;
      const ek = `${u}:${v}`;
      if (edgeKeySet.has(ek)) return false;
      edgeKeySet.add(ek);
      deg[u] += 1;
      deg[v] += 1;
      return true;
    };
    const parallelTol = 0.03;
    let failCount = 0;
    for (let i = 0; i < validPts.length; i++) {
      const p = validPts[i];
      const lanes = (Array.isArray(p.parentLanes) && p.parentLanes.length > 0)
        ? p.parentLanes.slice(0, 2)
        : [];
      const chosen = [];
      const laneReport = [];
      for (const lane of lanes) {
        const sid = Number(lane?.sid);
        const d = normLocal(lane?.dir?.x, lane?.dir?.y);
        if (!Number.isFinite(sid) || !d) {
          laneReport.push({ sid, status: "invalid-lane" });
          continue;
        }
        const candidates = [];
        for (let j = 0; j < validPts.length; j++) {
          if (i === j) continue;
          const q = validPts[j];
          const qParents = Array.isArray(q.parentSourceIds) ? q.parentSourceIds : [];
          if (!qParents.includes(sid)) continue;
          const vx = Number(q.x) - Number(p.x);
          const vy = Number(q.y) - Number(p.y);
          const dist = Math.hypot(vx, vy);
          if (!Number.isFinite(dist) || dist <= 1e-9) continue;
          const perp = Math.abs(vx * Number(d.y) - vy * Number(d.x)) / Math.max(1e-9, dist);
          if (perp > parallelTol) continue;
          if (crossesOwnParentLines(p, q, p.parentSourceIds)) continue;
          if (hasIntermediateMarkerOnLane(i, j, d, sid, parallelTol)) continue;
          candidates.push({ j, dist, perp, score: dist + perp * 50, absDot: Math.abs(vx * Number(d.x) + vy * Number(d.y)) });
        }
        candidates.sort((a, b) => Number(a.score) - Number(b.score));
        if (candidates.length === 0) {
          laneReport.push({ sid, status: "no-candidate" });
        } else {
          const pick = candidates[0];
          chosen.push(Number(pick.j));
          laneReport.push({
            sid,
            status: candidates.length > 1 ? "ok-from-ambiguous" : "ok",
            to: Number(pick.j),
            count: candidates.length,
            top: candidates.slice(0, 3).map((v) => Number(v.j))
          });
        }
      }
      const uniqChosen = Array.from(new Set(chosen.map(Number).filter(Number.isFinite)));
      if (uniqChosen.length === 2) {
        addEdge(i, Number(uniqChosen[0]));
        addEdge(i, Number(uniqChosen[1]));
      } else {
        failCount += 1;
        try {
          console.warn("[dline-connect] marker-fail", {
            markerIndex: i,
            marker: { x: Number(p.x), y: Number(p.y) },
            parentSourceIds: p.parentSourceIds,
            lanes: laneReport,
            chosen: uniqChosen,
          });
        } catch (_) {}
      }
    }
    try {
      console.log("[dline-connect] summary", {
        markerCount: validPts.length,
        edgeCount: edgeKeySet.size,
        failCount,
        successCount: Math.max(0, validPts.length - failCount),
      });
    } catch (_) {}

    for (const ek of edgeKeySet) {
      const [us, vs] = String(ek).split(":");
      const u = Number(us), v = Number(vs);
      const p = validPts[u], q = validPts[v];
      if (!p || !q) continue;
      const line = {
        id: helpers.nextShapeId?.(),
        type: "line",
        x1: Number(p.x),
        y1: Number(p.y),
        x2: Number(q.x),
        y2: Number(q.y),
        color: "#ef4444",
        lineType: "dashed",
        lineWidthMm: 0.1,
        layerId: state.activeLayerId,
        groupId: gid
      };
      if (!Number.isFinite(Number(line.id))) continue;
      helpers.addShape?.(line);
      lineIds.push(Number(line.id));
    }

    // Debug: endpoint markers from selected base geometry (not generated connections).
    const baseEndpointNodes = [];
    const endpointTol = 1e-6;
    const keyOf = (x, y) => `${Math.round(Number(x) / endpointTol)}:${Math.round(Number(y) / endpointTol)}`;
    const endpointCount = new Map();
    const endpointRep = new Map();
    const addEndpoint = (x, y) => {
      const nx = Number(x), ny = Number(y);
      if (![nx, ny].every(Number.isFinite)) return;
      const k = keyOf(nx, ny);
      endpointCount.set(k, Number(endpointCount.get(k) || 0) + 1);
      if (!endpointRep.has(k)) endpointRep.set(k, { x: nx, y: ny });
    };
    for (const s of (baseShapes || [])) {
      if (!s) continue;
      const t = String(s.type || "");
      if (t === "line") {
        addEndpoint(Number(s.x1), Number(s.y1));
        addEndpoint(Number(s.x2), Number(s.y2));
      } else if (t === "polyline" && Array.isArray(s.points)) {
        const pts = s.points;
        for (let i = 0; i < pts.length - 1; i++) {
          addEndpoint(Number(pts[i]?.x), Number(pts[i]?.y));
          addEndpoint(Number(pts[i + 1]?.x), Number(pts[i + 1]?.y));
        }
        if (s.closed && pts.length >= 2) {
          addEndpoint(Number(pts[pts.length - 1]?.x), Number(pts[pts.length - 1]?.y));
          addEndpoint(Number(pts[0]?.x), Number(pts[0]?.y));
        }
      }
    }
    for (const [k, cnt] of endpointCount.entries()) {
      if (Number(cnt) !== 1) continue;
      const p = endpointRep.get(k);
      if (!p) continue;
      baseEndpointNodes.push({ x: Number(p.x), y: Number(p.y) });
    }

    const endpointMarkerIds = [];
    for (const p of baseEndpointNodes) {
      const em = {
        id: helpers.nextShapeId?.(),
        type: "position",
        x: Number(p.x),
        y: Number(p.y),
        size: 2,
        color: "#facc15",
        layerId: state.activeLayerId,
        groupId: gid
      };
      if (!Number.isFinite(Number(em.id))) continue;
      helpers.addShape?.(em);
      endpointMarkerIds.push(Number(em.id));
    }

    helpers.addGroup?.({
      id: gid,
      name: `DLineIntersections${gid}`,
      shapeIds: markerIds.concat(ringIds, lineIds, endpointMarkerIds),
      originX: n > 0 ? sx / n : 0,
      originY: n > 0 ? sy / n : 0,
      rotationDeg: 0,
      parentId: state.activeGroupId,
      layerId: state.activeLayerId
    });
    return { ok: true, markerIds, ringIds, lineIds, endpointMarkerIds, groupId: gid };
  }

  function processDoubleLineTrimStep(lang) {
    const queue = Array.isArray(state.dlineTrimStepTargets) ? state.dlineTrimStepTargets : [];
    if (!queue.length) {
      clearDoubleLineTrimPendingState(state);
      if (setStatus) setStatus(getStatusText(lang, "created"));
      draw();
      return true;
    }

    const pt = queue.shift();
    const targetShapeId = Number(pt?.shapeId);
    const targetLineBefore = (state.shapes || []).find((s) => Number(s?.id) === targetShapeId && String(s?.type || "") === "line");
    const targetGroupId = Number(targetLineBefore?.groupId);
    const lineIdsBefore = new Set((state.shapes || [])
      .filter((s) => String(s?.type || "") === "line")
      .map((s) => Number(s?.id))
      .filter(Number.isFinite));

    if (typeof trimClickedLineAtNearestIntersection === "function" && Number.isFinite(Number(pt?.x)) && Number.isFinite(Number(pt?.y))) {
      trimClickedLineAtNearestIntersection(
        state,
        { x: Number(pt.x), y: Number(pt.y) },
        helpers,
        { skipHistory: true, silent: true, allowedTargetTypes: ["line"], forceTargetShapeId: targetShapeId }
      );
      if (typeof helpers?.clearSelection === "function") helpers.clearSelection();
      state.activeGroupId = null;
    }

    // If trim split a line, include newly created sibling lines in the target pool.
    const createdSet = new Set((state.dlineTrimStepCreatedIds || []).map(Number).filter(Number.isFinite));
    for (const s of (state.shapes || [])) {
      if (!s || String(s.type || "") !== "line") continue;
      const sid = Number(s.id);
      if (!Number.isFinite(sid) || lineIdsBefore.has(sid)) continue;
      if (Number.isFinite(targetGroupId) && Number(s.groupId) !== targetGroupId) continue;
      createdSet.add(sid);
    }
    state.dlineTrimStepCreatedIds = Array.from(createdSet);

    // Rebind remaining points to current line ids so stale shapeId does not trim unrelated segments.
    const remainRaw = Array.isArray(state.dlineTrimStepTargets) ? state.dlineTrimStepTargets : [];
    const rebounded = bindTargetsToNearestCreatedLine(
      remainRaw.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
      state.dlineTrimStepCreatedIds
    );
    state.dlineTrimStepTargets = rebounded;
    const remain = rebounded;
    state.dlineTrimIntersections = remain.map((p) => ({ x: Number(p.x), y: Number(p.y) }));
    if (!remain.length) {
      clearDoubleLineTrimPendingState(state);
      if (setStatus) setStatus(getStatusText(lang, "created"));
    } else if (setStatus) {
      const total = Math.max(0, Number(state.dlineTrimStepTotal) || 0);
      const done = Math.max(0, total - remain.length);
      setStatus(getStatusText(lang, "step", { done, total }));
    }
    draw();
    return true;
  }

  function applyAllDoubleLineTrims(targets, createdIds) {
    let queue = Array.isArray(targets) ? targets.map((p) => ({ x: Number(p.x), y: Number(p.y), shapeId: Number(p.shapeId) })) : [];
    const createdSet = new Set((createdIds || []).map(Number).filter(Number.isFinite));
    let guard = 0;
    while (queue.length && guard < 5000) {
      guard++;
      const pt = queue.shift();
      const targetShapeId = Number(pt?.shapeId);
      const targetLineBefore = (state.shapes || []).find((s) => Number(s?.id) === targetShapeId && String(s?.type || "") === "line");
      const targetGroupId = Number(targetLineBefore?.groupId);
      const lineIdsBefore = new Set((state.shapes || [])
        .filter((s) => String(s?.type || "") === "line")
        .map((s) => Number(s?.id))
        .filter(Number.isFinite));
      if (typeof trimClickedLineAtNearestIntersection === "function" && Number.isFinite(Number(pt?.x)) && Number.isFinite(Number(pt?.y))) {
        trimClickedLineAtNearestIntersection(
          state,
          { x: Number(pt.x), y: Number(pt.y) },
          helpers,
          { skipHistory: true, silent: true, allowedTargetTypes: ["line"], forceTargetShapeId: targetShapeId }
        );
        if (typeof helpers?.clearSelection === "function") helpers.clearSelection();
        state.activeGroupId = null;
      }
      for (const s of (state.shapes || [])) {
        if (!s || String(s.type || "") !== "line") continue;
        const sid = Number(s.id);
        if (!Number.isFinite(sid) || lineIdsBefore.has(sid)) continue;
        if (Number.isFinite(targetGroupId) && Number(s.groupId) !== targetGroupId) continue;
        createdSet.add(sid);
      }
      queue = bindTargetsToNearestCreatedLine(
        queue.map((p) => ({ x: Number(p.x), y: Number(p.y) })),
        Array.from(createdSet)
      );
    }
  }

  function executeDoubleLineAction() {
    const lang = String(state.ui?.language || "ja").toLowerCase();
    if (state.tool !== "doubleline") {
      draw();
      return false;
    }

    if (!!state.dlineTrimPending && !state.dlineSettings?.noTrim) {
      return processDoubleLineTrimStep(lang);
    }

    const shapeCountBefore = Array.isArray(state.shapes) ? state.shapes.length : 0;
    const groupCountBefore = Array.isArray(state.groups) ? state.groups.length : 0;
    const snap = helpers.snapshotModel();

    // Temporary debug mode: instead of creating double-lines, place markers and
    // debug connections at computed intersections, then stop.
    const previewForMarkers = Array.isArray(state.dlinePreview) ? state.dlinePreview : [];
    if (!previewForMarkers.length) {
      if (setStatus) setStatus(getStatusText(lang, "needSelect"));
      draw();
      return false;
    }
    const selectedBases = (state.selection?.ids || [])
      .map((id) => (state.shapes || []).find((s) => Number(s?.id) === Number(id)))
      .filter((s) => !!s);
    const intersections = collectIntersectionsFromPreview(previewForMarkers, selectedBases, 1e-6);
    const mk = createIntersectionMarkerGroup(intersections, selectedBases);
    const changedByMarker = (Array.isArray(state.shapes) ? state.shapes.length : 0) !== shapeCountBefore
      || (Array.isArray(state.groups) ? state.groups.length : 0) !== groupCountBefore;
    if (mk.ok || changedByMarker) {
      helpers.pushHistorySnapshot(snap);
      state.dlineSingleSidePickPoint = null;
      clearDoubleLineTrimPendingState(state);
      if (typeof helpers?.setSelection === "function") {
        helpers.setSelection([...(mk.markerIds || []), ...(mk.ringIds || [])]);
      }
      if (setStatus) setStatus(lang === "en"
        ? `DLine debug: ${intersections.length} intersections marked`
        : `二重線デバッグ: 交点 ${intersections.length} 箇所をマーカー表示`);
      draw();
      return true;
    }
    if (setStatus) setStatus(lang === "en" ? "DLine debug: no intersections" : "二重線デバッグ: 交点が見つかりません");
    draw();
    return false;

    if (!!state.dlineSettings?.noTrim) {
      const res = executeDoubleLineGeom(state, null, { returnMeta: true });
      const ok = !!res?.ok;
      if (ok && state.dlineSettings?.asPolyline !== false) mergeCreatedLinesToPolylines(res.groupId);
      const changed = (Array.isArray(state.shapes) ? state.shapes.length : 0) !== shapeCountBefore
        || (Array.isArray(state.groups) ? state.groups.length : 0) !== groupCountBefore;
      if (ok || changed) helpers.pushHistorySnapshot(snap);
      if (ok || changed) state.dlineSingleSidePickPoint = null;
      clearDoubleLineTrimPendingState(state);
      if (setStatus) setStatus(ok ? getStatusText(lang, "created") : getStatusText(lang, "needSelect"));
      draw();
      return ok || changed;
    }

    if (!Array.isArray(state.dlinePreview) || state.dlinePreview.length === 0) {
      if (setStatus) setStatus(getStatusText(lang, "needSelect"));
      draw();
      return false;
    }

    const previewTrimmed = state.dlinePreview.map((o) => ({ ...o }));
    const res = executeDoubleLineGeom(state, previewTrimmed, { returnMeta: true });
    const ok = !!res?.ok;
    if (ok) {
      if (state.dlineSettings?.asPolyline !== false) mergeCreatedLinesToPolylines(res.groupId);
      clearDoubleLineTrimPendingState(state);
    }

    const changed = (Array.isArray(state.shapes) ? state.shapes.length : 0) !== shapeCountBefore
      || (Array.isArray(state.groups) ? state.groups.length : 0) !== groupCountBefore;
    if (ok || changed) helpers.pushHistorySnapshot(snap);
    if (ok || changed) state.dlineSingleSidePickPoint = null;

    if (setStatus) {
      if (!ok) setStatus(getStatusText(lang, "needSelect"));
      else setStatus(getStatusText(lang, "created"));
    }

    draw();
    return ok || changed;
  }

  function cancelDoubleLineTrimPendingAction() {
    if (!state.dlineTrimPending) return;
    clearDoubleLineTrimPendingState(state);
    draw();
  }

  return {
    executeDoubleLineAction,
    cancelDoubleLineTrimPendingAction
  };
}

