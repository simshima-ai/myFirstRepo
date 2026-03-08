export function createDrawRuntime(config) {
  const {
    state,
    dom,
    ctx,
    render,
    refreshUi,
    hasAnyVertexSnapBinding,
    resolveVertexTangentAttribs,
    resolveDimensionSnapAttribs,
    getGroup,
    syncAimCandidateFromSelection,
    resolveGroupAimConstraints,
    aimRuntimeDeps
  } = config || {};

  let drawRafId = null;
  let pendingDrawOpts = null;

  function drawNow(opts = null) {
    const skipUi = !!(opts && opts.skipUi);
    const perfNow = (typeof performance !== "undefined" && typeof performance.now === "function")
      ? performance.now.bind(performance)
      : Date.now;
    const t0 = perfNow();
    // Resolve tangent constraints only when needed; running this every frame is expensive on huge models.
    const hasVertexSnap = hasAnyVertexSnapBinding(state);
    const needResolveTangent =
      !!state.vertexEdit?.drag?.active ||
      !!state.ui?._needsTangentResolve ||
      String(state.tool || "") === "vertex" ||
      hasVertexSnap;
    if (state.vertexEdit?.drag?.active) {
      // During vertex drag, exclude shapes being directly edited to avoid fighting user input
      const excludeIds = new Set((state.vertexEdit.drag.baseShapeSnapshots || []).map(it => Number(it.id)));
      resolveVertexTangentAttribs(state, excludeIds);
    } else if (needResolveTangent) {
      resolveVertexTangentAttribs(state);
    }
    if (needResolveTangent) {
      resolveDimensionSnapAttribs(state);
    }
    if (state.input?.groupAimPick?.active) {
      const ownerGroupId = Number(state.input.groupAimPick.groupId);
      if (Number.isFinite(ownerGroupId) && getGroup(state, ownerGroupId)) {
        state.activeGroupId = ownerGroupId;
      }
      syncAimCandidateFromSelection(state, getGroup);
    }
    if (state.ui) state.ui._needsTangentResolve = false;
    resolveGroupAimConstraints(state, aimRuntimeDeps);
    render(ctx, dom.canvas, state);
    if (!state.ui) state.ui = {};
    const now = perfNow();
    const minUiRefreshMs = 90;
    const lastUiRefreshTs = Number(state.ui._lastUiRefreshTs || 0);
    const needUiRefresh = !skipUi || !Number.isFinite(lastUiRefreshTs) || ((now - lastUiRefreshTs) >= minUiRefreshMs);
    if (needUiRefresh) {
      refreshUi(state, dom);
      state.ui._lastUiRefreshTs = now;
    }
    const t1 = perfNow();
    if (!state.ui.perfStats) {
      state.ui.perfStats = {
        lastTs: t1,
        accumMs: 0,
        frameCount: 0,
        fps: 0,
        drawMs: 0,
      };
    }
    const ps = state.ui.perfStats;
    const dt = Math.max(0, Number(t1) - Number(ps.lastTs || t1));
    ps.lastTs = t1;
    ps.accumMs += dt;
    ps.frameCount += 1;
    ps.drawMs = Math.max(0, Number(t1) - Number(t0));
    if (ps.accumMs >= 500) {
      ps.fps = (ps.frameCount * 1000) / Math.max(1e-9, ps.accumMs);
      ps.accumMs = 0;
      ps.frameCount = 0;
    }
    if (dom.fpsBadge) {
      const show = !!state.ui?.showFps;
      dom.fpsBadge.style.display = show ? "" : "none";
      if (show) {
        dom.fpsBadge.textContent = `FPS ${Number(ps.fps || 0).toFixed(1)} | Draw ${Number(ps.drawMs || 0).toFixed(1)}ms`;
      }
    }
    if (dom.objectCountBadge) {
      const show = !!state.ui?.showObjectCount;
      dom.objectCountBadge.style.display = show ? "" : "none";
      if (show) {
        const count = Array.isArray(state.shapes) ? state.shapes.length : 0;
        const lang = String(state.ui?.language || "ja").toLowerCase();
        dom.objectCountBadge.textContent = (lang === "en")
          ? `Objects ${count}`
          : `オブジェクト数 ${count}`;
      }
    }
  }

  function mergeDrawOpts(base, incoming) {
    if (!base && !incoming) return null;
    const bSkip = !!(base && base.skipUi);
    const iSkip = !!(incoming && incoming.skipUi);
    // If either request needs full UI refresh, full refresh wins.
    return { skipUi: bSkip && iSkip };
  }

  function draw(opts = null) {
    if (typeof requestAnimationFrame !== "function") {
      drawNow(opts);
      return;
    }
    pendingDrawOpts = mergeDrawOpts(pendingDrawOpts, opts);
    if (drawRafId != null) return;
    drawRafId = requestAnimationFrame(() => {
      drawRafId = null;
      const nextOpts = pendingDrawOpts;
      pendingDrawOpts = null;
      drawNow(nextOpts);
    });
  }

  return { draw, drawNow };
}
