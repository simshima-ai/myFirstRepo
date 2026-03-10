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
    const baseLines = (selectedBases || []).filter((s) => s && String(s.type || "") === "line");
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

    if (!!state.dlineSettings?.noTrim) {
      const ok = !!executeDoubleLineGeom(state);
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

    const selectedBases = (state.selection?.ids || [])
      .map((id) => state.shapes.find((s) => Number(s.id) === Number(id)))
      .filter((s) => !!s);
    const previewTrimmed = state.dlinePreview.map((o) => ({ ...o }));
    let previewNoTrim = previewTrimmed.map((o) => {
      if (!o || String(o.type || "") !== "line") return o;
      const fx1 = Number(o.fullX1), fy1 = Number(o.fullY1), fx2 = Number(o.fullX2), fy2 = Number(o.fullY2);
      if ([fx1, fy1, fx2, fy2].every(Number.isFinite)) {
        return { ...o, x1: fx1, y1: fy1, x2: fx2, y2: fy2 };
      }
      return { ...o };
    });

    // First stage must be exactly the same path as "no trim".
    const prevNoTrimFlag = !!state.dlineSettings?.noTrim;
    const prevPreview = Array.isArray(state.dlinePreview) ? state.dlinePreview : null;
    let res = null;
    try {
      if (!state.dlineSettings) state.dlineSettings = {};
      state.dlineSettings.noTrim = true;
      if (typeof buildDoubleLinePreviewGeom === "function") {
        const sidePt = state.dlineSingleSidePickPoint || state.input?.hoverWorld || state.input?.hover?.world || null;
        const rebuilt = buildDoubleLinePreviewGeom(state, sidePt);
        if (Array.isArray(rebuilt) && rebuilt.length) {
          previewNoTrim = rebuilt.map((o) => ({ ...o }));
          state.dlinePreview = previewNoTrim.map((o) => ({ ...o }));
        }
      }
      // Use exact no-trim execution path (same as user pressing Execute in no-trim mode).
      res = executeDoubleLineGeom(state, null, { returnMeta: true });
    } finally {
      state.dlineSettings.noTrim = prevNoTrimFlag;
      if (state.dlinePreview == null && Array.isArray(prevPreview)) {
        state.dlinePreview = prevPreview;
      }
    }
    const ok = !!res?.ok;
    if (ok) {
      const regeneratedTargets = buildShiftedTrimTargetsForCreatedLines(
        previewNoTrim,
        res.newShapeIds || [],
        selectedBases,
        Number(state.dlineSettings?.offset) || 0
      ).map((t) => ({ x: Number(t.x), y: Number(t.y) }));

      const shiftedTargets = bindTargetsToNearestCreatedLine(
        regeneratedTargets,
        res.newShapeIds || []
      );

      if (shiftedTargets.length) {
        applyAllDoubleLineTrims(
          shiftedTargets,
          (res.newShapeIds || []).map(Number).filter(Number.isFinite)
        );
      }
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
