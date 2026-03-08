export function createAttributeOps(config) {
  const {
    state,
    getPrimarySelectedShape,
    pushHistory,
    draw
  } = config || {};

  function addSelectedAttribute(name, value, target = "object") {
    const s = getPrimarySelectedShape();
    if (!s) return;
    pushHistory(state);
    if (!Array.isArray(s.attributes)) s.attributes = [];
    s.attributes.push({
      id: `attr_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      name: String(name || "").trim(),
      value: String(value ?? ""),
      target: String(target || "object")
    });
    draw();
  }

  function removeSelectedAttribute(attrId) {
    const s = getPrimarySelectedShape();
    if (!s || !Array.isArray(s.attributes)) return;
    const removed = s.attributes.find(a => String(a?.id) === String(attrId));
    if (!removed) return;
    pushHistory(state);
    s.attributes = s.attributes.filter(a => String(a?.id) !== String(attrId));
    const name = String(removed?.name || "");
    const target = String(removed?.target || "");
    const m = /^vertex:(p1|p2)$/.exec(target);
    if (m && (name.startsWith("keep_") || name === "keep_snap")) {
      if (s.type === "line" || s.type === "dim") {
        if (m[1] === "p1") s.p1Attrib = null;
        if (m[1] === "p2") s.p2Attrib = null;
      }
      // Keep UI/state coherent: remove other keep_* rows for the same vertex target.
      s.attributes = s.attributes.filter(a => {
        if (String(a?.target || "") !== target) return true;
        const an = String(a?.name || "");
        return !(an.startsWith("keep_") || an === "keep_snap");
      });
    }
    draw();
  }

  function updateSelectedAttribute(attrId, patch) {
    const s = getPrimarySelectedShape();
    if (!s || !Array.isArray(s.attributes)) return;
    const a = s.attributes.find(it => String(it?.id) === String(attrId));
    if (!a) return;
    pushHistory(state);
    Object.assign(a, patch || {});
    draw();
  }

  return {
    addSelectedAttribute,
    removeSelectedAttribute,
    updateSelectedAttribute
  };
}
