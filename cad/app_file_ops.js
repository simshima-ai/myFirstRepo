import { parseSvgToCadShapes, parseDxfToCadShapes } from "./app_vector_import.js";

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

  const TRACE_DEFAULTS = Object.freeze({
    maxDim: 420,
    edgePercent: 66,      // larger => fewer lines
    simplify: 0.65,
    minSeg: 0.4,
    maxSegments: 12000,
    invert: 0,            // 0|1
    lineWidthMm: 0.1,
    lineType: "solid",
    offsetX: 0,
    offsetY: 0,
  });

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

  function isJsonFile(file) {
    const ext = fileExt(file);
    if (ext === ".json") return true;
    const type = String(file?.type || "").toLowerCase();
    return type.includes("json");
  }

  function isImageLikeFile(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    if (type.startsWith("image/")) return true;
    const name = String(file.name || "").toLowerCase();
    return /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
  }

  function unitMm(unitRaw) {
    const u = String(unitRaw || "").toLowerCase();
    if (u === "mm") return 1;
    if (u === "cm") return 10;
    if (u === "m") return 1000;
    if (u === "inch" || u === "in") return 25.4;
    if (u === "px") return 25.4 / 96; // CSS px
    if (u === "pt") return 25.4 / 72;
    return NaN;
  }

  function detectDxfInsunits(text) {
    const pairs = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
    for (let i = 0; i + 3 < pairs.length; i++) {
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
      return (u === "in") ? "inch" : u;
    }
    if (!u) return "px";
    return null;
  }

  function resolveImportSourceUnit(kind, text) {
    const manual = String(state.ui?.importSourceUnit || "auto").toLowerCase();
    if (manual && manual !== "auto") return manual;
    if (kind === "dxf") return detectDxfInsunits(text) || "unitless";
    if (kind === "svg") return detectSvgUnit(text) || "px";
    return "unitless";
  }

  function scaleImportedShapes(shapes, factor) {
    const f = Number(factor);
    if (!Number.isFinite(f) || Math.abs(f - 1) <= 1e-12) return shapes;
    const out = [];
    for (const raw of (Array.isArray(shapes) ? shapes : [])) {
      const s = JSON.parse(JSON.stringify(raw || {}));
      const t = String(s.type || "").toLowerCase();
      if (t === "line" || t === "rect") {
        s.x1 = Number(s.x1) * f; s.y1 = Number(s.y1) * f;
        s.x2 = Number(s.x2) * f; s.y2 = Number(s.y2) * f;
      } else if (t === "polyline" && Array.isArray(s.points)) {
        s.points = s.points.map((p) => ({ x: Number(p?.x) * f, y: Number(p?.y) * f }));
      } else if (t === "circle" || t === "arc") {
        s.cx = Number(s.cx) * f; s.cy = Number(s.cy) * f; s.r = Math.abs(Number(s.r) * f);
      }
      out.push(s);
    }
    return out;
  }

  function polylineizeImportedLineShapes(shapes, eps = 1e-3) {
    const src = Array.isArray(shapes) ? shapes : [];
    const lines = [];
    const others = [];
    for (const s of src) {
      if (s && String(s.type || "").toLowerCase() === "line") {
        const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
        if ([x1, y1, x2, y2].every(Number.isFinite) && Math.hypot(x2 - x1, y2 - y1) > 1e-12) {
          lines.push({ x1, y1, x2, y2 });
        }
      } else if (s) {
        others.push(s);
      }
    }
    if (!lines.length) return { shapes: src.slice(), mergedChains: 0 };

    const keyOf = (x, y) => `${Math.round(Number(x) / eps)},${Math.round(Number(y) / eps)}`;
    const adj = new Map();
    const addAdj = (k, idx) => {
      if (!adj.has(k)) adj.set(k, []);
      adj.get(k).push(idx);
    };
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      addAdj(keyOf(ln.x1, ln.y1), i);
      addAdj(keyOf(ln.x2, ln.y2), i);
    }

    const used = new Array(lines.length).fill(false);
    const out = others.slice();
    let mergedChains = 0;
    const endpointCandidates = [];
    for (const [k, idxs] of adj.entries()) {
      if ((idxs || []).length !== 2) endpointCandidates.push(k);
    }

    const chooseConnected = (pt, preferDir = null) => {
      const k = keyOf(pt.x, pt.y);
      const cands = (adj.get(k) || []).filter((idx) => !used[idx]);
      if (!cands.length) return null;
      if (cands.length === 1 || !preferDir) return cands[0];
      let best = cands[0];
      let bestScore = Infinity;
      for (const idx of cands) {
        const ln = lines[idx];
        const d1 = Math.hypot(ln.x1 - pt.x, ln.y1 - pt.y);
        const next = (d1 <= eps) ? { x: ln.x2, y: ln.y2 } : { x: ln.x1, y: ln.y1 };
        const vx = next.x - pt.x;
        const vy = next.y - pt.y;
        const vlen = Math.hypot(vx, vy) || 1;
        const dot = (vx * preferDir.x + vy * preferDir.y) / vlen;
        const score = -dot;
        if (score < bestScore) {
          bestScore = score;
          best = idx;
        }
      }
      return best;
    };

    const buildFromLine = (startIdx) => {
      if (used[startIdx]) return null;
      const seed = lines[startIdx];
      used[startIdx] = true;
      const points = [{ x: seed.x1, y: seed.y1 }, { x: seed.x2, y: seed.y2 }];

      while (true) {
        const n = points.length;
        const tail = points[n - 1];
        const prev = points[n - 2];
        const dir = prev ? { x: tail.x - prev.x, y: tail.y - prev.y } : null;
        const idx = chooseConnected(tail, dir);
        if (idx == null) break;
        const ln = lines[idx];
        const d1 = Math.hypot(ln.x1 - tail.x, ln.y1 - tail.y);
        const next = (d1 <= eps) ? { x: ln.x2, y: ln.y2 } : { x: ln.x1, y: ln.y1 };
        used[idx] = true;
        points.push(next);
      }

      while (true) {
        const head = points[0];
        const nextRef = points[1];
        const dir = nextRef ? { x: head.x - nextRef.x, y: head.y - nextRef.y } : null;
        const idx = chooseConnected(head, dir);
        if (idx == null) break;
        const ln = lines[idx];
        const d1 = Math.hypot(ln.x1 - head.x, ln.y1 - head.y);
        const next = (d1 <= eps) ? { x: ln.x2, y: ln.y2 } : { x: ln.x1, y: ln.y1 };
        used[idx] = true;
        points.unshift(next);
      }
      return points;
    };

    const lineIndexesFromEndpointOrder = [];
    for (const k of endpointCandidates) {
      const ids = adj.get(k) || [];
      for (const idx of ids) {
        if (!lineIndexesFromEndpointOrder.includes(idx)) lineIndexesFromEndpointOrder.push(idx);
      }
    }
    for (let i = 0; i < lines.length; i++) {
      if (!lineIndexesFromEndpointOrder.includes(i)) lineIndexesFromEndpointOrder.push(i);
    }

    for (const idx of lineIndexesFromEndpointOrder) {
      if (used[idx]) continue;
      const pts = buildFromLine(idx);
      if (!pts || pts.length < 2) continue;
      const first = pts[0];
      const last = pts[pts.length - 1];
      const closed = Math.hypot(last.x - first.x, last.y - first.y) <= eps;
      let polyPts = pts;
      if (closed && pts.length >= 3) polyPts = pts.slice(0, -1);
      if (polyPts.length >= 3) {
        out.push({ type: "polyline", points: polyPts, closed });
        mergedChains += 1;
      } else {
        out.push({ type: "line", x1: first.x, y1: first.y, x2: last.x, y2: last.y });
      }
    }
    return { shapes: out, mergedChains };
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

  function loadImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image decode failed"));
      img.src = dataUrl;
    });
  }

  function computeCenteredPlacement(metaWidth, metaHeight) {
    const frame = getPageFrameWorldSize(state.pageSetup);
    const maxW = Math.max(10, Number(frame.cadW) * 0.5);
    const maxH = Math.max(10, Number(frame.cadH) * 0.5);
    const fitScale = Math.min(1, maxW / Math.max(1, metaWidth), maxH / Math.max(1, metaHeight));
    const w = Math.max(1, metaWidth * fitScale);
    const h = Math.max(1, metaHeight * fitScale);
    const viewW = Math.max(1, Number(state.view?.viewportWidth || 1));
    const viewH = Math.max(1, Number(state.view?.viewportHeight || 1));
    const centerWorldX = (viewW * 0.5 - Number(state.view.offsetX || 0)) / Math.max(1e-9, Number(state.view.scale || 1));
    const centerWorldY = (viewH * 0.5 - Number(state.view.offsetY || 0)) / Math.max(1e-9, Number(state.view.scale || 1));
    return {
      x: centerWorldX - w * 0.5,
      y: centerWorldY - h * 0.5,
      width: w,
      height: h,
    };
  }

  function normalizeTraceParams(raw) {
    const src = (raw && typeof raw === "object") ? raw : {};
    const n = (v, d) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : d;
    };
    return {
      maxDim: Math.max(64, Math.min(2048, Math.round(n(src.maxDim, TRACE_DEFAULTS.maxDim)))),
      edgePercent: Math.max(1, Math.min(99, n(src.edgePercent, TRACE_DEFAULTS.edgePercent))),
      simplify: Math.max(0, Math.min(12, n(src.simplify, TRACE_DEFAULTS.simplify))),
      minSeg: Math.max(0, Math.min(40, n(src.minSeg, TRACE_DEFAULTS.minSeg))),
      maxSegments: Math.max(100, Math.min(50000, Math.round(n(src.maxSegments, TRACE_DEFAULTS.maxSegments)))),
      invert: n(src.invert, TRACE_DEFAULTS.invert) >= 0.5 ? 1 : 0,
      lineWidthMm: Math.max(0.01, Math.min(10, n(src.lineWidthMm, TRACE_DEFAULTS.lineWidthMm))),
      lineType: (String(src.lineType || TRACE_DEFAULTS.lineType).toLowerCase() || "solid"),
      offsetX: Math.max(-1000000, Math.min(1000000, n(src.offsetX, TRACE_DEFAULTS.offsetX))),
      offsetY: Math.max(-1000000, Math.min(1000000, n(src.offsetY, TRACE_DEFAULTS.offsetY))),
    };
  }

  function getSelectedImageShape() {
    const sel = new Set((state.selection?.ids || []).map(Number));
    if (!sel.size) return null;
    for (const s of (state.shapes || [])) {
      if (!sel.has(Number(s.id))) continue;
      if (String(s.type || "") === "image") return s;
    }
    return null;
  }

  function getSelectedImageTraceShape() {
    const sel = new Set((state.selection?.ids || []).map(Number));
    if (!sel.size) return null;
    for (const s of (state.shapes || [])) {
      if (!sel.has(Number(s.id))) continue;
      if (String(s.type || "") === "imagetrace") return s;
    }
    return null;
  }

  function resolveTraceTargetImageShape() {
    const imageShape = getSelectedImageShape();
    if (imageShape) return imageShape;
    const traceShape = getSelectedImageTraceShape();
    if (!traceShape) return null;
    const srcId = Number(traceShape.traceSourceImageId);
    if (!Number.isFinite(srcId)) return null;
    for (const s of (state.shapes || [])) {
      if (Number(s.id) !== srcId) continue;
      if (String(s.type || "") === "image") return s;
    }
    return null;
  }

  function traceImageToPolylines(img, params) {
    const srcW = Math.max(1, Number(img.naturalWidth || img.width || 0));
    const srcH = Math.max(1, Number(img.naturalHeight || img.height || 0));
    const fit = Math.min(1, Number(params.maxDim) / Math.max(srcW, srcH));
    const w = Math.max(8, Math.round(srcW * fit));
    const h = Math.max(8, Math.round(srcH * fit));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cx = canvas.getContext("2d", { willReadFrequently: true });
    if (!cx) return { width: w, height: h, chains: [] };
    cx.drawImage(img, 0, 0, w, h);
    const raw = cx.getImageData(0, 0, w, h).data;

    const n = w * h;
    const gray = new Uint8Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const a = Number(raw[p + 3]) / 255;
      const r = Number(raw[p]);
      const g = Number(raw[p + 1]);
      const b = Number(raw[p + 2]);
      let lum = (0.299 * r + 0.587 * g + 0.114 * b);
      lum = (params.invert ? (255 - lum) : lum);
      gray[i] = Math.max(0, Math.min(255, Math.round(lum * a + 255 * (1 - a))));
    }

    const blur = new Uint8Array(n);
    const atGray = (x, y) => gray[y * w + x];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(w - 1, x + 1);
        const y0 = Math.max(0, y - 1);
        const y1 = Math.min(h - 1, y + 1);
        let sum = 0;
        sum += atGray(x0, y0) + 2 * atGray(x, y0) + atGray(x1, y0);
        sum += 2 * atGray(x0, y) + 4 * atGray(x, y) + 2 * atGray(x1, y);
        sum += atGray(x0, y1) + 2 * atGray(x, y1) + atGray(x1, y1);
        blur[y * w + x] = Math.max(0, Math.min(255, Math.round(sum / 16)));
      }
    }

    const mag = new Float32Array(n);
    const mags = [];
    const at = (x, y) => blur[y * w + x];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const gx =
          -at(x - 1, y - 1) + at(x + 1, y - 1) +
          -2 * at(x - 1, y) + 2 * at(x + 1, y) +
          -at(x - 1, y + 1) + at(x + 1, y + 1);
        const gy =
          at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) +
          -at(x - 1, y + 1) - 2 * at(x, y + 1) - at(x + 1, y + 1);
        const m = Math.hypot(gx, gy);
        const idx = y * w + x;
        mag[idx] = m;
        if (m > 1e-9) mags.push(m);
      }
    }
    if (!mags.length) return { width: w, height: h, chains: [] };

    mags.sort((a, b) => a - b);
    const q = Math.max(0, Math.min(mags.length - 1, Math.floor(mags.length * (Number(params.edgePercent) / 100))));
    const hi = Math.max(1e-9, Number(mags[q]));
    const lo = Math.max(1e-9, hi * 0.55);
    const edge = new Uint8Array(n);
    const strong = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const m = Number(mag[i] || 0);
      if (m >= hi) {
        edge[i] = 1;
        strong[i] = 1;
      } else if (m >= lo) {
        edge[i] = 1;
      }
    }

    const queue = [];
    for (let i = 0; i < n; i++) if (strong[i]) queue.push(i);
    while (queue.length > 0) {
      const idx = Number(queue.pop());
      const x = idx % w;
      const y = (idx / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!edge[ni] || strong[ni]) continue;
          strong[ni] = 1;
          queue.push(ni);
        }
      }
    }
    for (let i = 0; i < n; i++) edge[i] = strong[i] ? 1 : 0;

    const dirs = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ];
    const neighbors = (idx) => {
      const x = idx % w;
      const y = (idx / w) | 0;
      const out = [];
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (edge[ni]) out.push(ni);
      }
      return out;
    };
    for (let i = 0; i < n; i++) {
      if (!edge[i]) continue;
      if (neighbors(i).length === 0) edge[i] = 0;
    }

    const visited = new Uint8Array(n);
    const degree = (idx) => neighbors(idx).length;
    const idxToPoint = (idx) => ({ x: idx % w, y: (idx / w) | 0 });

    const distPointToSeg = (p, a, b) => {
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const wx = p.x - a.x;
      const wy = p.y - a.y;
      const vv = vx * vx + vy * vy;
      if (vv <= 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / vv));
      const px = a.x + vx * t;
      const py = a.y + vy * t;
      return Math.hypot(p.x - px, p.y - py);
    };
    const simplifyRdp = (pts, eps) => {
      if (!Array.isArray(pts) || pts.length <= 2) return pts || [];
      let maxD = -1;
      let maxI = -1;
      const a = pts[0];
      const b = pts[pts.length - 1];
      for (let i = 1; i < pts.length - 1; i++) {
        const d = distPointToSeg(pts[i], a, b);
        if (d > maxD) {
          maxD = d;
          maxI = i;
        }
      }
      if (maxD <= eps || maxI < 0) return [a, b];
      const left = simplifyRdp(pts.slice(0, maxI + 1), eps);
      const right = simplifyRdp(pts.slice(maxI), eps);
      return left.slice(0, -1).concat(right);
    };

    const chooseNext = (cur, prev) => {
      const cand = neighbors(cur).filter((ni) => !visited[ni] && ni !== prev);
      if (!cand.length) return -1;
      if (cand.length === 1 || prev < 0) return cand[0];
      const cx0 = cur % w;
      const cy0 = (cur / w) | 0;
      const px0 = prev % w;
      const py0 = (prev / w) | 0;
      const vx = cx0 - px0;
      const vy = cy0 - py0;
      let best = cand[0];
      let bestScore = Number.POSITIVE_INFINITY;
      for (const ni of cand) {
        const nx = ni % w;
        const ny = (ni / w) | 0;
        const wx = nx - cx0;
        const wy = ny - cy0;
        const score = Math.abs(vx * wy - vy * wx);
        if (score < bestScore) {
          bestScore = score;
          best = ni;
        }
      }
      return best;
    };

    const walkChain = (start) => {
      const chainIdx = [];
      let cur = start;
      let prev = -1;
      while (cur >= 0 && !visited[cur]) {
        visited[cur] = 1;
        chainIdx.push(cur);
        const next = chooseNext(cur, prev);
        if (next < 0) break;
        prev = cur;
        cur = next;
      }
      return chainIdx.map(idxToPoint);
    };

    const chains = [];
    for (let i = 0; i < n; i++) {
      if (!edge[i] || visited[i]) continue;
      if (degree(i) === 2) continue;
      const pts = walkChain(i);
      if (pts.length >= 4) chains.push(simplifyRdp(pts, Number(params.simplify)));
    }
    for (let i = 0; i < n; i++) {
      if (!edge[i] || visited[i]) continue;
      const pts = walkChain(i);
      if (pts.length >= 4) chains.push(simplifyRdp(pts, Number(params.simplify)));
    }

    return { width: w, height: h, chains };
  }

  async function traceFromImageShape(imageShape, params) {
    if (!imageShape || String(imageShape.type || "") !== "image") return false;
    if (!String(imageShape.src || "").startsWith("data:")) {
      setStatus("Trace target image source is unavailable");
      draw();
      return false;
    }
    const traceParams = normalizeTraceParams(params);
    const img = await loadImageElement(String(imageShape.src));
    const trace = traceImageToPolylines(img, traceParams);
    if (!trace.chains.length) {
      setStatus("Image trace: no edges detected");
      draw();
      return false;
    }

    const oldTraceShapeIds = Array.isArray(imageShape.traceShapeIds)
      ? imageShape.traceShapeIds.map(Number).filter(Number.isFinite)
      : (Array.isArray(imageShape.traceLineIds)
        ? imageShape.traceLineIds.map(Number).filter(Number.isFinite)
        : []);

    const sx = Number(imageShape.width || 1) / Math.max(1, trace.width - 1);
    const sy = Number(imageShape.height || 1) / Math.max(1, trace.height - 1);
    const ox = Number(imageShape.x || 0) + Number(traceParams.offsetX || 0);
    const oy = Number(imageShape.y || 0) + Number(traceParams.offsetY || 0);
    const minSeg = Number(traceParams.minSeg);
    const maxSegments = Number(traceParams.maxSegments);
    const segments = [];
    for (const chain of trace.chains) {
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1];
        const b = chain[i];
        if (Math.hypot(b.x - a.x, b.y - a.y) < minSeg) continue;
        segments.push({
          x1: ox + a.x * sx,
          y1: oy + a.y * sy,
          x2: ox + b.x * sx,
          y2: oy + b.y * sy,
        });
        if (segments.length >= maxSegments) break;
      }
      if (segments.length >= maxSegments) break;
    }
    if (!segments.length) {
      setStatus("Image trace: no segments generated");
      draw();
      return false;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const seg of segments) {
      minX = Math.min(minX, Number(seg.x1), Number(seg.x2));
      minY = Math.min(minY, Number(seg.y1), Number(seg.y2));
      maxX = Math.max(maxX, Number(seg.x1), Number(seg.x2));
      maxY = Math.max(maxY, Number(seg.y1), Number(seg.y2));
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
      setStatus("Image trace: failed to build trace bounds");
      draw();
      return false;
    }

    const traceShape = {
      id: nextShapeId(state),
      type: "imagetrace",
      segments,
      x: minX,
      y: minY,
      width: Math.max(1e-9, maxX - minX),
      height: Math.max(1e-9, maxY - minY),
      lineWidthMm: Number(traceParams.lineWidthMm),
      lineType: String(traceParams.lineType || "solid"),
      layerId: imageShape.layerId ?? state.activeLayerId,
      traceSourceImageId: Number(imageShape.id),
    };

    pushHistory(state);
    for (const sid of oldTraceShapeIds) helpers.removeShapeById?.(sid);

    const gidBefore = Number(state.nextGroupId);
    if (typeof helpers.addShapesAsGroup === "function") {
      helpers.addShapesAsGroup([traceShape]);
    } else {
      addShape(state, traceShape);
    }
    const groupId = gidBefore;
    const group = (state.groups || []).find((g) => Number(g.id) === groupId) || null;
    if (group) {
      group.name = `Trace ${Number(imageShape.id)}`;
      state.selection.groupIds = [Number(groupId)];
      state.selection.ids = [];
      state.activeGroupId = Number(groupId);
      if (!state.ui) state.ui = {};
      state.ui.selectPickMode = "group";
    } else {
      setSelection(state, [Number(traceShape.id)]);
      state.activeGroupId = null;
    }

    imageShape.traceShapeIds = [Number(traceShape.id)];
    imageShape.traceLineIds = [];
    imageShape.traceGroupId = Number(groupId);
    imageShape.traceParams = { ...traceParams };
    if (!state.ui) state.ui = {};
    state.ui.imageTraceParams = { ...traceParams };
    state.ui.tracePanelOpen = true;

    setStatus(`Image trace (experimental): ${segments.length} segments`);
    draw();
    return true;
  }

  function ensureTraceParamsFromSelection() {
    const imgShape = resolveTraceTargetImageShape();
    if (!state.ui) state.ui = {};
    const defaultOffsetX = imgShape ? Math.max(0, Number(imgShape.width || 0) + 20) : 0;
    const base = normalizeTraceParams({
      ...TRACE_DEFAULTS,
      offsetX: defaultOffsetX,
      offsetY: 0,
      ...(state.ui?.imageTraceParams || {}),
      ...(imgShape?.traceParams || {}),
    });
    state.ui.imageTraceParams = { ...base };
    return imgShape;
  }

  function setTraceParam(patch) {
    if (!state.ui) state.ui = {};
    const cur = normalizeTraceParams(state.ui.imageTraceParams || {});
    state.ui.imageTraceParams = normalizeTraceParams({ ...cur, ...(patch || {}) });
  }

  function openTracePanel() {
    if (!state.ui) state.ui = {};
    state.ui.tracePanelOpen = true;
    const imgShape = ensureTraceParamsFromSelection();
    if (!imgShape) {
      setStatus("Select an imported image or image trace object first");
    } else {
      setStatus(`Trace target: image #${Number(imgShape.id)}`);
    }
    draw();
  }

  function closeTracePanel() {
    if (!state.ui) state.ui = {};
    state.ui.tracePanelOpen = false;
    draw();
  }

  function traceSelectedImageUsingStateParams() {
    const imgShape = resolveTraceTargetImageShape();
    if (!imgShape) {
      setStatus("Select an imported image or image trace object first");
      draw();
      return;
    }
    const params = normalizeTraceParams(state.ui?.imageTraceParams || imgShape.traceParams || TRACE_DEFAULTS);
    traceFromImageShape(imgShape, params).catch((err) => {
      setStatus(`Trace failed: ${err?.message || err}`);
      draw();
    });
  }

  async function importImageFile(file) {
    if (!file) return false;
    const dataUrl = await readFileAsDataUrl(file);
    const meta = await loadImageMeta(dataUrl);
    const place = computeCenteredPlacement(meta.width, meta.height);
    const shape = {
      id: nextShapeId(state),
      type: "image",
      x: place.x,
      y: place.y,
      width: place.width,
      height: place.height,
      rotationDeg: 0,
      lockAspect: true,
      lockTransform: false,
      naturalWidth: meta.width,
      naturalHeight: meta.height,
      imageName: String(file.name || "image"),
      src: dataUrl,
      layerId: state.activeLayerId,
      traceShapeIds: [],
      traceLineIds: [],
      traceGroupId: null,
      traceParams: null,
    };
    pushHistory(state);
    addShape(state, shape);
    setSelection(state, [shape.id]);
    state.activeGroupId = null;
    setStatus(`Image imported: ${shape.imageName}`);
    draw();
    return true;
  }

  function importVectorShapes(shapes, sourceName, mode = "import", importMeta = null) {
    const src = Array.isArray(shapes) ? shapes : [];
    if (!src.length) return false;
    const isSvgSource = String(sourceName || "").toLowerCase().endsWith(".svg") || String(sourceName || "").toLowerCase().includes("svg");
    const normalizeImported = (shape) => {
      if (!shape || typeof shape !== "object") return shape;
      return JSON.parse(JSON.stringify(shape));
    };
    const computeBounds = (items) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const addPt = (x, y) => {
        const nx = Number(x), ny = Number(y);
        if (!Number.isFinite(nx) || !Number.isFinite(ny)) return;
        minX = Math.min(minX, nx);
        minY = Math.min(minY, ny);
        maxX = Math.max(maxX, nx);
        maxY = Math.max(maxY, ny);
      };
      for (const s of (items || [])) {
        const t = String(s?.type || "").toLowerCase();
        if (t === "line" || t === "rect") {
          addPt(s.x1, s.y1); addPt(s.x2, s.y2);
        } else if (t === "polyline") {
          for (const p of (Array.isArray(s.points) ? s.points : [])) addPt(p?.x, p?.y);
        } else if (t === "circle" || t === "arc") {
          const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
          addPt(cx - r, cy - r); addPt(cx + r, cy + r);
        }
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
      if (t === "line" || t === "rect") {
        s.x1 = Number(s.x1) + dx; s.y1 = Number(s.y1) + dy;
        s.x2 = Number(s.x2) + dx; s.y2 = Number(s.y2) + dy;
      } else if (t === "polyline") {
        if (Array.isArray(s.points)) {
          s.points = s.points.map((p) => ({ x: Number(p?.x) + dx, y: Number(p?.y) + dy }));
        }
      } else if (t === "circle" || t === "arc") {
        s.cx = Number(s.cx) + dx; s.cy = Number(s.cy) + dy;
      }
    };
    let importSource = src.map(normalizeImported);
    if (isSvgSource) {
      const b = computeBounds(importSource);
      if (b) {
        const c = viewCenterWorld();
        const cx = (b.minX + b.maxX) * 0.5;
        const cy = (b.minY + b.maxY) * 0.5;
        const dx = c.x - cx;
        const dy = c.y - cy;
        for (const s of importSource) translateShape(s, dx, dy);
      }
    }
    pushHistory(state);
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
    const trackBounds = (s) => {
      if (!s) return;
      if (s.type === "line" || s.type === "rect") {
        minX = Math.min(minX, Number(s.x1), Number(s.x2));
        minY = Math.min(minY, Number(s.y1), Number(s.y2));
        maxX = Math.max(maxX, Number(s.x1), Number(s.x2));
        maxY = Math.max(maxY, Number(s.y1), Number(s.y2));
      } else if (s.type === "polyline") {
        const pts = Array.isArray(s.points) ? s.points : [];
        for (const p of pts) {
          minX = Math.min(minX, Number(p?.x));
          minY = Math.min(minY, Number(p?.y));
          maxX = Math.max(maxX, Number(p?.x));
          maxY = Math.max(maxY, Number(p?.y));
        }
      } else if (s.type === "circle" || s.type === "arc") {
        minX = Math.min(minX, Number(s.cx) - Number(s.r));
        minY = Math.min(minY, Number(s.cy) - Number(s.r));
        maxX = Math.max(maxX, Number(s.cx) + Number(s.r));
        maxY = Math.max(maxY, Number(s.cy) + Number(s.r));
      }
    };

    const gid = Number(state.nextGroupId) || 1;
    state.nextGroupId = gid + 1;
    const imported = [];
    for (const raw of importSource) {
      const t = String(raw?.type || "").toLowerCase();
      if (!["line", "polyline", "rect", "circle", "arc"].includes(t)) continue;
      const s = { ...raw };
      s.id = nextShapeId(state);
      s.type = t;
      s.layerId = state.activeLayerId;
      s.groupId = gid;
      s.lineWidthMm = Math.max(0.01, Number(state.lineWidthMm ?? 0.25) || 0.25);
      s.lineType = "solid";
      imported.push(s);
      trackBounds(s);
    }
    if (!imported.length) return false;
    for (const s of imported) state.shapes.push(s);

    const ox = Number.isFinite(minX) ? (minX + maxX) * 0.5 : 0;
    const oy = Number.isFinite(minY) ? (minY + maxY) * 0.5 : 0;
    const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
    state.groups.unshift({
      id: gid,
      name: `${String(sourceName || "Imported").slice(0, 24)} ${gid}`,
      shapeIds: imported.map((s) => Number(s.id)),
      visible: true,
      parentId: null,
      originX: Math.round(ox / gridStep) * gridStep,
      originY: Math.round(oy / gridStep) * gridStep,
      rotationDeg: 0,
    });
    setSelection(state, imported.map((s) => Number(s.id)));
    state.activeGroupId = gid;
    setStatus(`Imported ${imported.length} objects from ${sourceName}`);
    beginImportAdjustSession(gid, imported.map((s) => Number(s.id)), importMeta || null);
    draw();
    return true;
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
      params: {
        scale: 1,
        dx: 0,
        dy: 0,
        flipX: false,
        flipY: false,
      },
    };
    state.ui.importAdjust = created;
    return created;
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
      if (!s) continue;
      const t = String(s.type || "");
      if (t === "line" || t === "rect") {
        addPt(s.x1, s.y1); addPt(s.x2, s.y2);
      } else if (t === "polyline") {
        const pts = Array.isArray(s.points) ? s.points : [];
        for (const pt of pts) addPt(pt?.x, pt?.y);
      } else if (t === "circle" || t === "arc") {
        const cx = Number(s.cx), cy = Number(s.cy), r = Math.abs(Number(s.r) || 0);
        addPt(cx - r, cy - r); addPt(cx + r, cy + r);
      }
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    return { minX, minY, maxX, maxY };
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
    // Keep preview unit-scaled from the start; manual Scale works as additional multiplier.
    ia.params.scale = ia.baseUnitScale;
    applyImportAdjustPreview();
    if (state.tool === "settings") state.tool = "select";
  }

  function getEffectiveSourceUnitForImport(sourceKind, detectedSourceUnit) {
    const pref = String(state.ui?.importSourceUnit || "auto").toLowerCase();
    if (pref && pref !== "auto") return pref;
    const detected = String(detectedSourceUnit || "").toLowerCase();
    if (detected) return detected;
    return sourceKind === "svg" ? "px" : "unitless";
  }

  function resolveUnitScaleForImport(sourceKind, detectedSourceUnit) {
    const srcUnit = getEffectiveSourceUnitForImport(sourceKind, detectedSourceUnit);
    const dstUnit = String(state.pageSetup?.unit || "mm").toLowerCase();
    const srcMm = unitMm(srcUnit);
    const dstMm = unitMm(dstUnit);
    if (!(Number.isFinite(srcMm) && Number.isFinite(dstMm) && dstMm > 0)) return 1;
    return srcMm / dstMm;
  }

  function onImportSourceUnitChanged() {
    const ia = getImportAdjustState();
    if (!ia.active) return false;
    const prevBase = Number(ia.baseUnitScale);
    const nextBase = resolveUnitScaleForImport(String(ia.sourceKind || ""), String(ia.detectedSourceUnit || ""));
    if (!(Number.isFinite(prevBase) && prevBase > 0 && Number.isFinite(nextBase) && nextBase > 0)) return false;
    if (!ia.params || typeof ia.params !== "object") ia.params = { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };
    const manualScale = Number(ia.params.scale);
    ia.params.scale = (Number.isFinite(manualScale) ? manualScale : 1) * (nextBase / prevBase);
    ia.baseUnitScale = nextBase;
    const ok = applyImportAdjustPreview();
    if (ok) draw();
    return ok;
  }

  function transformPointImportAdjust(x, y, origin, params) {
    const ox = Number(origin?.x) || 0;
    const oy = Number(origin?.y) || 0;
    const s = Math.max(1e-6, Number(params?.scale) || 1);
    const flipSignX = params?.flipX ? -1 : 1;
    const flipSign = params?.flipY ? -1 : 1;
    const dx = Number(params?.dx) || 0;
    const dy = Number(params?.dy) || 0;
    const rx = Number(x) - ox;
    const ry = Number(y) - oy;
    return {
      x: ox + rx * s * flipSignX + dx,
      y: oy + ry * s * flipSign + dy,
    };
  }

  function applyImportAdjustPreview() {
    const ia = getImportAdjustState();
    if (!ia.active) return false;
    const originals = Array.isArray(ia.originalShapes) ? ia.originalShapes : [];
    if (!originals.length) return false;
    const bounds = computeShapesBounds(originals);
    if (!bounds) return false;
    const origin = { x: (bounds.minX + bounds.maxX) * 0.5, y: (bounds.minY + bounds.maxY) * 0.5 };
    const byId = new Map((state.shapes || []).map((s) => [Number(s.id), s]));
    const p = ia.params || { scale: 1, dx: 0, dy: 0, flipX: false, flipY: false };

    for (const base of originals) {
      const sid = Number(base?.id);
      const target = byId.get(sid);
      if (!target) continue;
      const t = String(base.type || "");
      if (t === "line" || t === "rect") {
        const p1 = transformPointImportAdjust(base.x1, base.y1, origin, p);
        const p2 = transformPointImportAdjust(base.x2, base.y2, origin, p);
        target.x1 = p1.x; target.y1 = p1.y; target.x2 = p2.x; target.y2 = p2.y;
      } else if (t === "polyline") {
        const srcPts = Array.isArray(base.points) ? base.points : [];
        const dstPts = [];
        for (const pt of srcPts) {
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
        const flipsOdd = (!!p.flipX) !== (!!p.flipY);
        target.ccw = flipsOdd ? !baseCcw : baseCcw;
      }
    }

    const g = (state.groups || []).find((x) => Number(x?.id) === Number(ia.groupId));
    if (g) {
      const nowShapes = originals
        .map((s) => byId.get(Number(s.id)))
        .filter(Boolean);
      const b2 = computeShapesBounds(nowShapes);
      if (b2) {
        const gridStep = Math.max(1e-9, Number(state.grid?.size) || 10);
        g.originX = Math.round(((b2.minX + b2.maxX) * 0.5) / gridStep) * gridStep;
        g.originY = Math.round(((b2.minY + b2.maxY) * 0.5) / gridStep) * gridStep;
      }
    }
    return true;
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
    // Finalize optional polylineization at Apply timing (not at import timing).
    if (!!state.ui?.importAsPolyline && (ia.sourceKind === "dxf" || ia.sourceKind === "svg")) {
      const idSet = new Set((ia.shapeIds || []).map(Number).filter(Number.isFinite));
      const importedNow = (state.shapes || []).filter((s) => idSet.has(Number(s?.id))).map((s) => JSON.parse(JSON.stringify(s)));
      if (importedNow.length) {
        const converted = polylineizeImportedLineShapes(importedNow, 1e-3);
        const conv = Array.isArray(converted?.shapes) ? converted.shapes : importedNow;
        const gid = Number(ia.groupId);
        const oldIds = (ia.shapeIds || []).map(Number).filter(Number.isFinite);
        const oldIdSet = new Set(oldIds);
        state.shapes = (state.shapes || []).filter((s) => !oldIdSet.has(Number(s?.id)));
        const baseLayerId = Number(importedNow[0]?.layerId ?? state.activeLayerId);
        const createdIds = [];
        for (const raw of conv) {
          const t = String(raw?.type || "").toLowerCase();
          if (!["line", "polyline", "rect", "circle", "arc"].includes(t)) continue;
          const s = { ...raw };
          s.id = nextShapeId(state);
          s.type = t;
          s.groupId = gid;
          s.layerId = Number.isFinite(baseLayerId) ? baseLayerId : state.activeLayerId;
          if (!Number.isFinite(Number(s.lineWidthMm))) s.lineWidthMm = Math.max(0.01, Number(state.lineWidthMm ?? 0.25) || 0.25);
          if (typeof s.lineType !== "string") s.lineType = "solid";
          state.shapes.push(s);
          createdIds.push(Number(s.id));
        }
        const g = (state.groups || []).find((x) => Number(x?.id) === gid);
        if (g) g.shapeIds = createdIds.slice();
        ia.shapeIds = createdIds.slice();
        setSelection(state, createdIds.slice());
      }
    }
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
      const sid = Number(base?.id);
      const target = byId.get(sid);
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

  function bindJsonFileInputChange() {
    if (!dom.jsonFileInput) return;
    dom.jsonFileInput.addEventListener("change", async () => {
      const file = dom.jsonFileInput.files && dom.jsonFileInput.files[0];
      if (!file) return;
      try {
        const mode = String(state.ui?.jsonFileMode || "replace");
        await importAnyFile(file, mode);
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

  async function importAnyFile(file, modeRaw = "import") {
    const mode = String(modeRaw || "import");
    if (isDxfFile(file)) {
      const text = await file.text();
      const srcUnit = resolveImportSourceUnit("dxf", text);
      const dstUnit = String(state.pageSetup?.unit || "mm").toLowerCase();
      const srcMm = unitMm(srcUnit);
      const dstMm = unitMm(dstUnit);
      const unitScale = (Number.isFinite(srcMm) && Number.isFinite(dstMm) && dstMm > 0) ? (srcMm / dstMm) : 1;
      const parsed = parseDxfToCadShapes(text, {
        polylineize: false
      });
      const shapes = parsed.shapes;
      const polyCount = shapes.filter((s) => String(s?.type || "").toLowerCase() === "polyline").length;
      if (!shapes.length) throw new Error(parsed.warnings?.[0] || "DXF import failed");
      importVectorShapes(shapes, String(file.name || "DXF"), mode, {
        sourceKind: "dxf",
        detectedSourceUnit: srcUnit,
        baseUnitScale: unitScale,
      });
      const unitNote = (srcUnit && srcUnit !== "unitless")
        ? `unit=${srcUnit}->${dstUnit} (x${unitScale.toFixed(6)})`
        : `unit=${srcUnit || "unitless"} (x1)`;
      if (parsed.warnings?.length) {
        setStatus(`Imported with notes: ${parsed.warnings[0]}`);
      } else {
        setStatus(`Imported (preview): polylines=${polyCount}, ${unitNote}`);
      }
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
      if (parsed.shapes.length) {
        const shapes = parsed.shapes;
        importVectorShapes(shapes, String(file.name || "SVG"), mode, {
          sourceKind: "svg",
          detectedSourceUnit: srcUnit,
          baseUnitScale: unitScale,
        });
        const unitNote = (srcUnit && srcUnit !== "unitless")
          ? `unit=${srcUnit}->${dstUnit} (x${unitScale.toFixed(6)})`
          : `unit=${srcUnit || "unitless"} (x1)`;
        if (parsed.warnings?.length) setStatus(`Imported with notes: ${parsed.warnings[0]} / ${unitNote}`);
        else setStatus(`Imported with notes: ${unitNote}`);
        return true;
      }
      if (isImageLikeFile(file) && (mode === "import" || mode === "append")) {
        await importImageFile(file);
        return true;
      }
      throw new Error(parsed.warnings?.[0] || "SVG import failed");
    }
    if (isImageLikeFile(file)) {
      if (mode === "import" || mode === "append") {
        await importImageFile(file);
        return true;
      }
      setStatus("Use Import to place images");
      draw();
      return false;
    }
    if (isJsonFile(file)) {
      const text = await file.text();
      const data = JSON.parse(text);
      if (mode === "append" || mode === "import") importJsonObjectAppend(state, data, helpers);
      else importJsonObject(state, data, helpers);
      return true;
    }
    throw new Error("Unsupported file type");
  }

  function bindDropImport() {
    const target = document;
    const canHandle = (e) => {
      const dt = e?.dataTransfer;
      if (!dt) return false;
      if (dt.files && dt.files.length > 0) return true;
      const types = dt.types ? Array.from(dt.types) : [];
      if (types.includes("Files")) return true;
      const items = dt.items ? Array.from(dt.items) : [];
      return items.some((it) => String(it?.kind || "").toLowerCase() === "file");
    };
    const extractFiles = (dt) => {
      const out = [];
      if (!dt) return out;
      if (dt.files && dt.files.length) {
        for (const f of Array.from(dt.files)) if (f) out.push(f);
      }
      if (!out.length && dt.items && dt.items.length) {
        for (const it of Array.from(dt.items)) {
          if (String(it?.kind || "").toLowerCase() !== "file") continue;
          const f = it.getAsFile?.();
          if (f) out.push(f);
        }
      }
      return out;
    };
    const stopNative = (e, stopProp = true) => {
      if (!canHandle(e)) return;
      if (e.cancelable) e.preventDefault();
      if (stopProp && typeof e.stopPropagation === "function") e.stopPropagation();
    };
    const onDragOver = (e) => {
      stopNative(e);
      if (!canHandle(e)) return;
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = async (e) => {
      stopNative(e);
      if (!canHandle(e)) return;
      const files = extractFiles(e.dataTransfer);
      if (!files.length) return;
      try {
        // DnD is additive by default to avoid accidental overwrite.
        for (const file of files) {
          await importAnyFile(file, "import");
        }
        if (!state.ui) state.ui = {};
        state.ui._needsTangentResolve = true;
      } catch (err) {
        setStatus(`Drop import failed: ${err?.message || err}`);
        draw();
      }
    };
    const onWindowDragOver = (e) => {
      stopNative(e, false);
    };
    const onWindowDrop = (e) => {
      stopNative(e, false);
    };
    const onWindowDragEnter = (e) => {
      stopNative(e, false);
    };
    target.addEventListener("dragenter", onWindowDragEnter, true);
    target.addEventListener("dragover", onDragOver, true);
    target.addEventListener("drop", onDrop, true);
    window.addEventListener("dragenter", onWindowDragEnter, true);
    window.addEventListener("dragover", onWindowDragOver, true);
    window.addEventListener("drop", onWindowDrop, true);
  }

  return {
    normalizeTraceParams,
    ensureTraceParamsFromSelection,
    setTraceParam,
    openTracePanel,
    closeTracePanel,
    traceFromImageShape,
    traceSelectedImageUsingStateParams,
    importImageFile,
    bindJsonFileInputChange,
    bindDropImport,
    onImportSourceUnitChanged,
    setImportAdjustParam,
    applyImportAdjust,
    cancelImportAdjust
  };
}
