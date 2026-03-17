export function fitViewToBounds(state, bounds, options = {}) {
  const target = computeViewFitToBoundsTarget(state, bounds, options);
  if (!target) return false;
  applyViewTarget(state, target);
  return true;
}

export function fitViewToPage(state, pageSize, options = {}) {
  const target = computeViewFitToPageTarget(state, pageSize, options);
  if (!target) return false;
  applyViewTarget(state, target);
  return true;
}

export function computeViewFitToBoundsTarget(state, bounds, options = {}) {
  const viewportWidth = Math.max(1, Number(options.viewportWidth) || 1);
  const viewportHeight = Math.max(1, Number(options.viewportHeight) || 1);
  const leftInset = Math.max(0, Number(options.leftInset) || 0);
  const rightInset = Math.max(0, Number(options.rightInset) || 0);
  const paddingPx = Math.max(0, Number(options.paddingPx) || 0);
  const minScale = Math.max(1e-9, Number(options.minScale ?? state.view?.minScale ?? 0.0001) || 0.0001);
  const maxScale = Math.max(minScale, Number(options.maxScale ?? state.view?.maxScale ?? 192) || 192);

  if (!isFiniteBounds(bounds)) return null;

  const fitWidth = Math.max(1, viewportWidth - leftInset - rightInset);
  const availWidth = Math.max(1, fitWidth - paddingPx * 2);
  const availHeight = Math.max(1, viewportHeight - paddingPx * 2);
  const boundsWidth = Math.max(1e-9, Number(bounds.maxX) - Number(bounds.minX));
  const boundsHeight = Math.max(1e-9, Number(bounds.maxY) - Number(bounds.minY));
  const fitScaleRaw = Math.min(availWidth / boundsWidth, availHeight / boundsHeight);
  const fitScale = clamp(Number.isFinite(fitScaleRaw) ? fitScaleRaw : 1, minScale, maxScale);

  const cx = (Number(bounds.minX) + Number(bounds.maxX)) * 0.5;
  const cy = (Number(bounds.minY) + Number(bounds.maxY)) * 0.5;
  return {
    scale: fitScale,
    offsetX: Number.isFinite(cx) ? (leftInset + fitWidth * 0.5 - cx * fitScale) : (leftInset + fitWidth * 0.5),
    offsetY: Number.isFinite(cy) ? (viewportHeight * 0.5 - cy * fitScale) : (viewportHeight * 0.5),
  };
}

export function computeViewFitToPageTarget(state, pageSize, options = {}) {
  const viewportWidth = Math.max(1, Number(options.viewportWidth) || 1);
  const viewportHeight = Math.max(1, Number(options.viewportHeight) || 1);
  const leftInset = Math.max(0, Number(options.leftInset) || 0);
  const rightInset = Math.max(0, Number(options.rightInset) || 0);
  const minScale = Math.max(1e-9, Number(options.minScale ?? state.view?.minScale ?? 0.0001) || 0.0001);
  const maxScale = Math.max(minScale, Number(options.maxScale ?? state.view?.maxScale ?? 192) || 192);
  const pageWidth = Math.max(1e-9, Number(pageSize?.cadW) || 1);
  const pageHeight = Math.max(1e-9, Number(pageSize?.cadH) || 1);
  const fitWidth = Math.max(1, viewportWidth - leftInset - rightInset);
  const fitScaleRaw = Math.min(fitWidth / pageWidth, viewportHeight / pageHeight);
  const fitScale = clamp(Number.isFinite(fitScaleRaw) ? fitScaleRaw : 1, minScale, maxScale);
  return {
    scale: fitScale,
    offsetX: leftInset + fitWidth * 0.5,
    offsetY: viewportHeight * 0.5,
  };
}

export function resetGridAutoScale(state) {
  state.grid.autoBasePxAtReset = Math.max(1e-9, (Number(state.grid?.size) || 100) * Number(state.view?.scale || 1));
  state.grid.autoLevel = 100;
}

export function updateAdaptiveViewScaleBounds(state, bounds, options = {}) {
  if (!isFiniteBounds(bounds)) return false;
  const viewportWidth = Math.max(1, Number(options.viewportWidth) || 1);
  const viewportHeight = Math.max(1, Number(options.viewportHeight) || 1);
  const leftInset = Math.max(0, Number(options.leftInset) || 0);
  const rightInset = Math.max(0, Number(options.rightInset) || 0);
  const paddingPx = Math.max(0, Number(options.paddingPx) || 0);
  const fitWidth = Math.max(1, viewportWidth - leftInset - rightInset);
  const availWidth = Math.max(1, fitWidth - paddingPx * 2);
  const availHeight = Math.max(1, viewportHeight - paddingPx * 2);
  const boundsWidth = Math.max(1e-9, Number(bounds.maxX) - Number(bounds.minX));
  const boundsHeight = Math.max(1e-9, Number(bounds.maxY) - Number(bounds.minY));
  const fitScale = Math.max(1e-9, Math.min(availWidth / boundsWidth, availHeight / boundsHeight) || 1);
  const minScale = Math.max(1e-7, fitScale / Math.max(1, Number(options.minFactor) || 200));
  const maxScale = Math.max(192, fitScale * Math.max(1, Number(options.maxFactor) || 2000));
  state.view.minScale = minScale;
  state.view.maxScale = Math.max(minScale, maxScale);
  return true;
}

export function applyViewTarget(state, target) {
  if (!target) return false;
  state.view.scale = Number(target.scale);
  state.view.offsetX = Number(target.offsetX);
  state.view.offsetY = Number(target.offsetY);
  return true;
}

function isFiniteBounds(bounds) {
  return !!bounds && [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every((value) => Number.isFinite(Number(value)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
