export function createGroupAimOps(config) {
  const {
    state,
    getGroup,
    normalizeAimConstraint,
    pushHistory,
    setStatus,
    draw
  } = config || {};

  function setActiveGroupAimEnabled(on) {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const nextEnabled = !!on;
    const prevAim = normalizeAimConstraint(g.aimConstraint);
    if (prevAim.enabled === nextEnabled) return;
    pushHistory(state);
    g.aimConstraint = { ...prevAim, enabled: nextEnabled };
    if (!nextEnabled && state.input?.groupAimPick?.active && Number(state.input.groupAimPick.groupId) === gid) {
      state.input.groupAimPick.active = false;
      state.input.groupAimPick.groupId = null;
      state.input.groupAimPick.candidateType = null;
      state.input.groupAimPick.candidateId = null;
    }
    setStatus(nextEnabled ? "Aim Constraint: ON" : "Aim Constraint: OFF");
    draw();
  }

  function beginPickActiveGroupAimTarget() {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    if (!state.input.groupAimPick) state.input.groupAimPick = { active: false, groupId: null, candidateType: null, candidateId: null };
    state.input.groupAimPick.active = true;
    state.input.groupAimPick.groupId = gid;
    state.input.groupAimPick.candidateType = null;
    state.input.groupAimPick.candidateId = null;
    if (state.input.groupOriginPick) {
      state.input.groupOriginPick.active = false;
      state.input.groupOriginPick.dragging = false;
    }
    setStatus("Aim target: 位置マーカー or オブジェクトをクリック");
    draw();
  }

  function confirmActiveGroupAimTarget() {
    const gid = Number(state.input?.groupAimPick?.active ? state.input?.groupAimPick?.groupId : state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const pick = state.input?.groupAimPick;
    if (!pick?.active || Number(pick.groupId) !== gid) return;
    const candidateType = String(pick.candidateType || "");
    const candidateId = Number(pick.candidateId);
    if (!(candidateType === "group" || candidateType === "position") || !Number.isFinite(candidateId)) {
      setStatus("Aim target: 先に候補をクリックしてください");
      draw();
      return;
    }
    pushHistory(state);
    g.aimConstraint = { enabled: true, targetType: candidateType, targetId: candidateId };
    pick.active = false;
    pick.groupId = null;
    pick.candidateType = null;
    pick.candidateId = null;
    setStatus(candidateType === "position"
      ? `Aim target set: Position #${candidateId}`
      : `Aim target set: Group #${candidateId}`);
    draw();
  }

  function pickOrConfirmActiveGroupAimTarget() {
    const gid = Number(state.input?.groupAimPick?.active ? state.input?.groupAimPick?.groupId : state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const pick = state.input?.groupAimPick;
    if (pick?.active && Number(pick.groupId) === gid) {
      confirmActiveGroupAimTarget();
      return;
    }
    beginPickActiveGroupAimTarget();
  }

  function clearActiveGroupAimTarget() {
    const gid = Number(state.activeGroupId);
    if (!Number.isFinite(gid)) return;
    const g = getGroup(state, gid);
    if (!g) return;
    const prevAim = normalizeAimConstraint(g.aimConstraint);
    if (!prevAim.enabled && !prevAim.targetType && !Number.isFinite(prevAim.targetId)) return;
    pushHistory(state);
    g.aimConstraint = { enabled: false, targetType: null, targetId: null };
    if (state.input?.groupAimPick?.active && Number(state.input.groupAimPick.groupId) === gid) {
      state.input.groupAimPick.active = false;
      state.input.groupAimPick.groupId = null;
      state.input.groupAimPick.candidateType = null;
      state.input.groupAimPick.candidateId = null;
    }
    setStatus("Aim target cleared");
    draw();
  }

  return {
    setActiveGroupAimEnabled,
    beginPickActiveGroupAimTarget,
    confirmActiveGroupAimTarget,
    pickOrConfirmActiveGroupAimTarget,
    clearActiveGroupAimTarget
  };
}
