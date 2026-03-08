export function createDoubleLineOps(config) {
  const {
    state,
    helpers,
    executeDoubleLineGeom,
    buildDoubleLineTargetLineIntersections,
    trimClickedLineAtNearestIntersection,
    clearDoubleLineTrimPendingState,
    setStatus,
    draw
  } = config || {};

  function executeDoubleLineAction() {
    const lang = String(state.ui?.language || "ja").toLowerCase();
    if (state.tool !== "doubleline") {
      draw();
      return false;
    }
    if (!!state.dlineSettings?.noTrim) {
      const snap = helpers.snapshotModel();
      const ok = !!executeDoubleLineGeom(state);
      if (ok) helpers.pushHistorySnapshot(snap);
      if (setStatus) setStatus(ok ? (lang === "en" ? "Double line created" : "二重線を作成しました") : (lang === "en" ? "Double line: select line(s) first" : "二重線: 先に対象を選択してください"));
      draw();
      return ok;
    }
    if (!Array.isArray(state.dlinePreview) || state.dlinePreview.length === 0) {
      if (setStatus) setStatus(lang === "en" ? "Double line: select line(s) first" : "二重線: 先に対象を選択してください");
      draw();
      return false;
    }
    const previewTrimmed = state.dlinePreview.map(o => ({ ...o }));
    const previewNoTrim = previewTrimmed.map(o => {
      if (!o || o.type !== "line") return o;
      const fx1 = Number(o.fullX1), fy1 = Number(o.fullY1), fx2 = Number(o.fullX2), fy2 = Number(o.fullY2);
      if ([fx1, fy1, fx2, fy2].every(Number.isFinite)) {
        return { ...o, x1: fx1, y1: fy1, x2: fx2, y2: fy2 };
      }
      return { ...o };
    });
    const selectedBases = (state.selection?.ids || [])
      .map(id => state.shapes.find(s => Number(s.id) === Number(id)))
      .filter(s => !!s);
    const intersections = buildDoubleLineTargetLineIntersections(previewTrimmed, selectedBases);
    const snap = helpers.snapshotModel();
    const res = executeDoubleLineGeom(state, previewNoTrim, { returnMeta: true });
    const ok = !!res?.ok;
    if (ok && intersections.length) {
      const createdIds = new Set((res.newShapeIds || []).map(Number).filter(Number.isFinite));
      const excludedIds = [];
      for (const s of (state.shapes || [])) {
        const sid = Number(s?.id);
        if (!Number.isFinite(sid)) continue;
        if (createdIds.has(sid)) continue;
        excludedIds.push(sid);
      }
      for (const p of intersections) {
        trimClickedLineAtNearestIntersection(
          state,
          { x: Number(p.x), y: Number(p.y) },
          helpers,
          { excludedShapeIds: excludedIds, skipHistory: true, silent: true, allowedTargetTypes: ["line"] }
        );
      }
    }
    if (ok) helpers.pushHistorySnapshot(snap);
    clearDoubleLineTrimPendingState(state);
    if (setStatus) setStatus(ok ? (lang === "en" ? "Double line created" : "二重線を作成しました") : (lang === "en" ? "Double line: select line(s) first" : "二重線: 先に対象を選択してください"));
    draw();
    return ok;
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
