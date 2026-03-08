export function createFileOpsRuntime(config) {
  const {
    state,
    dom,
    getPageFrameWorldSize,
    nextShapeId,
    pushHistory,
    addShape,
    setSelection,
    setStatus,
    draw,
    importJsonObject,
    importJsonObjectAppend,
    helpers
  } = config || {};

  function isImageLikeFile(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    if (type.startsWith("image/")) return true;
    const name = String(file.name || "").toLowerCase();
    return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result || ""));
      fr.onerror = () => reject(fr.error || new Error("Failed to read file"));
      fr.readAsDataURL(file);
    });
  }

  function loadImageMeta(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = Number(img.naturalWidth || img.width || 0);
        const h = Number(img.naturalHeight || img.height || 0);
        if (!(w > 0 && h > 0)) {
          reject(new Error("Invalid image size"));
          return;
        }
        resolve({ width: w, height: h });
      };
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = dataUrl;
    });
  }

  async function importImageFile(file) {
    if (!file) return false;
    const dataUrl = await readFileAsDataUrl(file);
    const meta = await loadImageMeta(dataUrl);
    const frame = getPageFrameWorldSize(state.pageSetup);
    const maxW = Math.max(10, Number(frame.cadW) * 0.5);
    const maxH = Math.max(10, Number(frame.cadH) * 0.5);
    const fitScale = Math.min(1, maxW / Math.max(1, meta.width), maxH / Math.max(1, meta.height));
    const w = Math.max(1, meta.width * fitScale);
    const h = Math.max(1, meta.height * fitScale);
    const viewW = Math.max(1, Number(state.view?.viewportWidth || 1));
    const viewH = Math.max(1, Number(state.view?.viewportHeight || 1));
    const centerWorldX = (viewW * 0.5 - Number(state.view.offsetX || 0)) / Math.max(1e-9, Number(state.view.scale || 1));
    const centerWorldY = (viewH * 0.5 - Number(state.view.offsetY || 0)) / Math.max(1e-9, Number(state.view.scale || 1));
    const shape = {
      id: nextShapeId(state),
      type: "image",
      x: centerWorldX - w * 0.5,
      y: centerWorldY - h * 0.5,
      width: w,
      height: h,
      rotationDeg: 0,
      lockAspect: true,
      lockTransform: false,
      naturalWidth: meta.width,
      naturalHeight: meta.height,
      imageName: String(file.name || "image"),
      src: dataUrl,
      layerId: state.activeLayerId,
    };
    pushHistory(state);
    addShape(state, shape);
    setSelection(state, [shape.id]);
    state.activeGroupId = null;
    setStatus(`画像を読み込みました: ${shape.imageName}`);
    draw();
    return true;
  }

  function bindJsonFileInputChange() {
    if (!dom.jsonFileInput) return;
    dom.jsonFileInput.addEventListener("change", async () => {
      const file = dom.jsonFileInput.files && dom.jsonFileInput.files[0];
      if (!file) return;
      try {
        const mode = String(state.ui?.jsonFileMode || "replace");
        if (isImageLikeFile(file)) {
          if (mode !== "import" && mode !== "append") {
            setStatus("画像の読み込みはインポートを使ってください");
            draw();
          } else {
            await importImageFile(file);
          }
        } else {
          const text = await file.text();
          const data = JSON.parse(text);
          if (mode === "append" || mode === "import") importJsonObjectAppend(state, data, helpers);
          else importJsonObject(state, data, helpers);
        }
        if (!state.ui) state.ui = {};
        state.ui._needsTangentResolve = true;
      } catch (err) {
        setStatus(`Load failed: ${err?.message || err}`);
        draw();
      } finally {
        if (state.ui) state.ui.jsonFileMode = "replace";
        dom.jsonFileInput.value = "";
      }
    });
  }

  return {
    importImageFile,
    bindJsonFileInputChange
  };
}
