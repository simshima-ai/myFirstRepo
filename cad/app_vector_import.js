function num(v, d = NaN) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function degToRad(d) {
  return (Number(d) || 0) * Math.PI / 180;
}

function normalizeRad(a) {
  let r = Number(a) || 0;
  const two = Math.PI * 2;
  while (r < 0) r += two;
  while (r >= two) r -= two;
  return r;
}

function parseSvgNumbers(str) {
  const out = [];
  const re = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  let m;
  while ((m = re.exec(String(str || ""))) !== null) out.push(Number(m[0]));
  return out;
}

function parsePathTokens(d) {
  const out = [];
  const re = /([AaCcHhLlMmQqSsTtVvZz])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let m;
  while ((m = re.exec(String(d || ""))) !== null) {
    if (m[1]) out.push({ t: "cmd", v: m[1] });
    else out.push({ t: "num", v: Number(m[2]) });
  }
  return out;
}

function arcFromBulge(x1, y1, x2, y2, bulge) {
  const b = Number(bulge) || 0;
  if (Math.abs(b) < 1e-12) return null;
  const dx = Number(x2) - Number(x1);
  const dy = Number(y2) - Number(y1);
  const c = Math.hypot(dx, dy);
  if (c <= 1e-12) return null;
  const theta = 4 * Math.atan(b);
  const half = Math.abs(theta) * 0.5;
  const s = Math.sin(half);
  if (Math.abs(s) <= 1e-12) return null;
  const r = c / (2 * s);
  const mx = (Number(x1) + Number(x2)) * 0.5;
  const my = (Number(y1) + Number(y2)) * 0.5;
  const ux = dx / c;
  const uy = dy / c;
  const nx = -uy;
  const ny = ux;
  const h2 = Math.max(0, r * r - (c * 0.5) * (c * 0.5));
  const h = Math.sqrt(h2);
  const sign = b > 0 ? 1 : -1;
  const cx = mx + nx * h * sign;
  const cy = my + ny * h * sign;
  const a1 = Math.atan2(Number(y1) - cy, Number(x1) - cx);
  const a2 = Math.atan2(Number(y2) - cy, Number(x2) - cx);
  return { type: "arc", cx, cy, r, a1, a2, ccw: b > 0 };
}

function svgArcEndpointToCenter(x1, y1, rx, ry, phiDeg, largeArcFlag, sweepFlag, x2, y2) {
  const phi = degToRad(phiDeg);
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) * 0.5;
  const dy2 = (y1 - y2) * 0.5;
  let x1p = cosPhi * dx2 + sinPhi * dy2;
  let y1p = -sinPhi * dx2 + cosPhi * dy2;
  let arx = Math.abs(Number(rx) || 0);
  let ary = Math.abs(Number(ry) || 0);
  if (!(arx > 1e-12) || !(ary > 1e-12)) return null;
  const lam = (x1p * x1p) / (arx * arx) + (y1p * y1p) / (ary * ary);
  if (lam > 1) {
    const s = Math.sqrt(lam);
    arx *= s;
    ary *= s;
  }
  const rx2 = arx * arx;
  const ry2 = ary * ary;
  const nume = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const deno = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let coef = 0;
  if (deno > 1e-18) coef = Math.sqrt(Math.max(0, nume / deno));
  if (Boolean(largeArcFlag) === Boolean(sweepFlag)) coef = -coef;
  const cxp = coef * (arx * y1p) / Math.max(1e-12, ary);
  const cyp = coef * (-ary * x1p) / Math.max(1e-12, arx);
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) * 0.5;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) * 0.5;

  const ux = (x1p - cxp) / Math.max(1e-12, arx);
  const uy = (y1p - cyp) / Math.max(1e-12, ary);
  const vx = (-x1p - cxp) / Math.max(1e-12, arx);
  const vy = (-y1p - cyp) / Math.max(1e-12, ary);
  const start = Math.atan2(uy, ux);
  let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  if (!sweepFlag && delta > 0) delta -= Math.PI * 2;
  if (sweepFlag && delta < 0) delta += Math.PI * 2;
  return { cx, cy, rx: arx, ry: ary, phi, start, delta };
}

function approxEllipticArcToLines(arc, x1, y1, x2, y2) {
  const out = [];
  if (!arc) return out;
  const segs = Math.max(4, Math.min(48, Math.ceil(Math.abs(arc.delta) / (Math.PI / 12))));
  const cosPhi = Math.cos(arc.phi);
  const sinPhi = Math.sin(arc.phi);
  const pointAt = (t) => {
    const a = arc.start + arc.delta * t;
    const xr = arc.rx * Math.cos(a);
    const yr = arc.ry * Math.sin(a);
    return {
      x: arc.cx + cosPhi * xr - sinPhi * yr,
      y: arc.cy + sinPhi * xr + cosPhi * yr,
    };
  };
  let prev = { x: Number(x1), y: Number(y1) };
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const cur = (i === segs) ? { x: Number(x2), y: Number(y2) } : pointAt(t);
    out.push({ type: "line", x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y });
    prev = cur;
  }
  return out;
}

export function parseSvgToCadShapes(text) {
  const out = [];
  const warnings = [];
  let doc = null;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(String(text || ""), "image/svg+xml");
  } catch (err) {
    return { shapes: [], warnings: [`SVG parse error: ${err?.message || err}`] };
  }
  const root = doc?.documentElement;
  if (!root || String(root.nodeName || "").toLowerCase() !== "svg") {
    return { shapes: [], warnings: ["Not an SVG file"] };
  }

  const pushLine = (x1, y1, x2, y2) => {
    const a = [x1, y1, x2, y2].map(Number);
    if (!a.every(Number.isFinite)) return;
    if (Math.hypot(a[2] - a[0], a[3] - a[1]) <= 1e-12) return;
    out.push({ type: "line", x1: a[0], y1: a[1], x2: a[2], y2: a[3] });
  };

  for (const el of Array.from(root.querySelectorAll("*"))) {
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "line") {
      pushLine(el.getAttribute("x1"), el.getAttribute("y1"), el.getAttribute("x2"), el.getAttribute("y2"));
      continue;
    }
    if (tag === "rect") {
      const x = num(el.getAttribute("x"), 0);
      const y = num(el.getAttribute("y"), 0);
      const w = num(el.getAttribute("width"));
      const h = num(el.getAttribute("height"));
      if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
        out.push({ type: "rect", x1: x, y1: y, x2: x + w, y2: y + h });
      }
      continue;
    }
    if (tag === "circle") {
      const cx = num(el.getAttribute("cx"));
      const cy = num(el.getAttribute("cy"));
      const r = Math.abs(num(el.getAttribute("r")));
      if ([cx, cy, r].every(Number.isFinite) && r > 1e-12) out.push({ type: "circle", cx, cy, r });
      continue;
    }
    if (tag === "polyline" || tag === "polygon") {
      const nums = parseSvgNumbers(el.getAttribute("points"));
      const pts = [];
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: Number(nums[i]), y: Number(nums[i + 1]) });
      for (let i = 0; i + 1 < pts.length; i++) pushLine(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (tag === "polygon" && pts.length > 2) pushLine(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[0].x, pts[0].y);
      continue;
    }
    if (tag === "path") {
      const tokens = parsePathTokens(el.getAttribute("d"));
      if (!tokens.length) continue;
      let i = 0;
      let cmd = "";
      let cx = 0, cy = 0, sx = 0, sy = 0;
      const take = () => (i < tokens.length && tokens[i].t === "num") ? Number(tokens[i++].v) : NaN;
      while (i < tokens.length) {
        if (tokens[i].t === "cmd") cmd = String(tokens[i++].v);
        if (!cmd) break;
        const rel = (cmd === cmd.toLowerCase());
        const c = cmd.toLowerCase();
        if (c === "m") {
          const x = take(), y = take();
          if (!Number.isFinite(x) || !Number.isFinite(y)) break;
          cx = rel ? (cx + x) : x;
          cy = rel ? (cy + y) : y;
          sx = cx; sy = cy;
          cmd = rel ? "l" : "L";
          continue;
        }
        if (c === "z") {
          pushLine(cx, cy, sx, sy);
          cx = sx; cy = sy;
          continue;
        }
        if (c === "l") {
          const x = take(), y = take();
          if (!Number.isFinite(x) || !Number.isFinite(y)) break;
          const nx = rel ? (cx + x) : x;
          const ny = rel ? (cy + y) : y;
          pushLine(cx, cy, nx, ny);
          cx = nx; cy = ny;
          continue;
        }
        if (c === "h") {
          const x = take();
          if (!Number.isFinite(x)) break;
          const nx = rel ? (cx + x) : x;
          pushLine(cx, cy, nx, cy);
          cx = nx;
          continue;
        }
        if (c === "v") {
          const y = take();
          if (!Number.isFinite(y)) break;
          const ny = rel ? (cy + y) : y;
          pushLine(cx, cy, cx, ny);
          cy = ny;
          continue;
        }
        if (c === "a") {
          const rx = take(), ry = take(), rot = take(), laf = take(), sf = take(), x = take(), y = take();
          if (![rx, ry, rot, laf, sf, x, y].every(Number.isFinite)) break;
          const nx = rel ? (cx + x) : x;
          const ny = rel ? (cy + y) : y;
          const arc = svgArcEndpointToCenter(cx, cy, rx, ry, rot, Math.round(laf) !== 0, Math.round(sf) !== 0, nx, ny);
          if (!arc) {
            pushLine(cx, cy, nx, ny);
          } else if (Math.abs(arc.rx - arc.ry) <= 1e-6 && Math.abs(arc.phi) <= 1e-6) {
            const a1 = normalizeRad(arc.start);
            const a2 = normalizeRad(arc.start + arc.delta);
            out.push({ type: "arc", cx: arc.cx, cy: arc.cy, r: Math.abs(arc.rx), a1, a2, ccw: arc.delta >= 0 });
          } else {
            const segs = approxEllipticArcToLines(arc, cx, cy, nx, ny);
            for (const s of segs) out.push(s);
          }
          cx = nx; cy = ny;
          continue;
        }
        if (c === "c" || c === "s" || c === "q" || c === "t") {
          warnings.push("Curves were approximated/ignored in SVG path");
          // Consume params and skip: convert to straight to end point.
          if (c === "c") {
            const x1 = take(), y1 = take(), x2 = take(), y2 = take(), x = take(), y = take();
            if (![x1, y1, x2, y2, x, y].every(Number.isFinite)) break;
            const nx = rel ? (cx + x) : x;
            const ny = rel ? (cy + y) : y;
            pushLine(cx, cy, nx, ny); cx = nx; cy = ny;
            continue;
          }
          if (c === "s" || c === "q") {
            const x1 = take(), y1 = take(), x = take(), y = take();
            if (![x1, y1, x, y].every(Number.isFinite)) break;
            const nx = rel ? (cx + x) : x;
            const ny = rel ? (cy + y) : y;
            pushLine(cx, cy, nx, ny); cx = nx; cy = ny;
            continue;
          }
          if (c === "t") {
            const x = take(), y = take();
            if (![x, y].every(Number.isFinite)) break;
            const nx = rel ? (cx + x) : x;
            const ny = rel ? (cy + y) : y;
            pushLine(cx, cy, nx, ny); cx = nx; cy = ny;
            continue;
          }
        }
        break;
      }
      continue;
    }
  }
  return { shapes: out, warnings };
}

function parseDxfPairs(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(String(lines[i] || "").trim());
    if (!Number.isFinite(code)) continue;
    out.push({ code, value: String(lines[i + 1] || "").trim() });
  }
  return out;
}

function entityCodeFirst(ent, code, d = NaN) {
  for (const p of ent) {
    if (Number(p.code) === Number(code)) {
      const n = Number(p.value);
      return Number.isFinite(n) ? n : d;
    }
  }
  return d;
}

function parseLwPolyline(ent, asPolyline = false) {
  const verts = [];
  let flags = 0;
  let cur = null;
  for (const p of ent) {
    if (p.code === 70) flags = Math.round(num(p.value, flags));
    if (p.code === 10) {
      if (cur) verts.push(cur);
      cur = { x: num(p.value), y: NaN, bulge: 0 };
      continue;
    }
    if (p.code === 20 && cur) { cur.y = num(p.value); continue; }
    if (p.code === 42 && cur) { cur.bulge = num(p.value, 0); continue; }
  }
  if (cur) verts.push(cur);
  const out = [];
  if (verts.length < 2) return out;
  const closed = (flags & 1) !== 0;
  const allLinear = verts.every((v) => Math.abs(Number(v?.bulge) || 0) <= 1e-12);
  if (asPolyline && allLinear) {
    const pts = verts
      .map((v) => ({ x: Number(v.x), y: Number(v.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length >= 2) {
      out.push({ type: "polyline", points: pts, closed });
      return out;
    }
  }
  const segCount = closed ? verts.length : (verts.length - 1);
  for (let i = 0; i < segCount; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
    const arc = arcFromBulge(a.x, a.y, b.x, b.y, a.bulge);
    if (arc) out.push(arc);
    else out.push({ type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return out;
}

function parsePolylineOld(pairs, startIdx, asPolyline = false) {
  const out = [];
  let i = startIdx + 1;
  let flags = 0;
  while (i < pairs.length && pairs[i].code !== 0) {
    if (pairs[i].code === 70) flags = Math.round(num(pairs[i].value, flags));
    i++;
  }
  const verts = [];
  while (i < pairs.length) {
    if (pairs[i].code === 0 && String(pairs[i].value).toUpperCase() === "SEQEND") return { nextIdx: i + 1, shapes: out };
    if (pairs[i].code === 0 && String(pairs[i].value).toUpperCase() === "VERTEX") {
      i++;
      let x = NaN, y = NaN, bulge = 0;
      while (i < pairs.length && pairs[i].code !== 0) {
        if (pairs[i].code === 10) x = num(pairs[i].value);
        else if (pairs[i].code === 20) y = num(pairs[i].value);
        else if (pairs[i].code === 42) bulge = num(pairs[i].value, 0);
        i++;
      }
      if ([x, y].every(Number.isFinite)) verts.push({ x, y, bulge });
      continue;
    }
    i++;
  }
  const closed = (flags & 1) !== 0;
  const allLinear = verts.every((v) => Math.abs(Number(v?.bulge) || 0) <= 1e-12);
  if (asPolyline && allLinear && verts.length >= 2) {
    const pts = verts
      .map((v) => ({ x: Number(v.x), y: Number(v.y) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length >= 2) {
      out.push({ type: "polyline", points: pts, closed });
      return { nextIdx: i, shapes: out };
    }
  }
  if (verts.length >= 2) {
    for (let k = 0; k + 1 < verts.length; k++) {
      const a = verts[k], b = verts[k + 1];
      const arc = arcFromBulge(a.x, a.y, b.x, b.y, a.bulge);
      if (arc) out.push(arc); else out.push({ type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    if (closed) {
      const a = verts[verts.length - 1], b = verts[0];
      const arc = arcFromBulge(a.x, a.y, b.x, b.y, a.bulge);
      if (arc) out.push(arc); else out.push({ type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return { nextIdx: i, shapes: out };
}

function parseDxfToCadShapesBase(text, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const asPolyline = !!opts.polylineize;
  const pairs = parseDxfPairs(text);
  const out = [];
  const warnings = [];
  let i = 0;
  let inEntities = false;
  while (i < pairs.length) {
    const p = pairs[i];
    if (p.code === 0 && String(p.value).toUpperCase() === "SECTION") {
      const p2 = pairs[i + 1];
      if (p2 && p2.code === 2 && String(p2.value).toUpperCase() === "ENTITIES") {
        inEntities = true;
        i += 2;
        continue;
      }
    }
    if (inEntities && p.code === 0 && String(p.value).toUpperCase() === "ENDSEC") break;
    if (!inEntities || p.code !== 0) { i++; continue; }

    const type = String(p.value || "").toUpperCase();
    if (type === "POLYLINE") {
      const res = parsePolylineOld(pairs, i, asPolyline);
      for (const s of res.shapes) out.push(s);
      i = res.nextIdx;
      continue;
    }

    let j = i + 1;
    while (j < pairs.length && pairs[j].code !== 0) j++;
    const ent = pairs.slice(i + 1, j);
    i = j;

    if (type === "LINE") {
      const x1 = entityCodeFirst(ent, 10), y1 = entityCodeFirst(ent, 20);
      const x2 = entityCodeFirst(ent, 11), y2 = entityCodeFirst(ent, 21);
      if ([x1, y1, x2, y2].every(Number.isFinite)) out.push({ type: "line", x1, y1, x2, y2 });
      continue;
    }
    if (type === "CIRCLE") {
      const cx = entityCodeFirst(ent, 10), cy = entityCodeFirst(ent, 20), r = Math.abs(entityCodeFirst(ent, 40));
      if ([cx, cy, r].every(Number.isFinite) && r > 1e-12) out.push({ type: "circle", cx, cy, r });
      continue;
    }
    if (type === "ARC") {
      const cx = entityCodeFirst(ent, 10), cy = entityCodeFirst(ent, 20), r = Math.abs(entityCodeFirst(ent, 40));
      const a1 = degToRad(entityCodeFirst(ent, 50));
      const a2 = degToRad(entityCodeFirst(ent, 51));
      if ([cx, cy, r, a1, a2].every(Number.isFinite) && r > 1e-12) out.push({ type: "arc", cx, cy, r, a1, a2, ccw: true });
      continue;
    }
    if (type === "LWPOLYLINE") {
      const parts = parseLwPolyline(ent, asPolyline);
      for (const s of parts) out.push(s);
      continue;
    }
  }
  if (!out.length) warnings.push("No supported DXF entities found (LINE/CIRCLE/ARC/LWPOLYLINE/POLYLINE).");
  return { shapes: out, warnings };
}

function pointKey(x, y, eps = 1e-6) {
  const ex = Math.round(Number(x) / eps);
  const ey = Math.round(Number(y) / eps);
  return `${ex},${ey}`;
}

function convertDxfLinesToPolylines(shapes) {
  const src = Array.isArray(shapes) ? shapes : [];
  const lines = [];
  const others = [];
  for (const s of src) {
    if (s && s.type === "line") {
      const x1 = Number(s.x1), y1 = Number(s.y1), x2 = Number(s.x2), y2 = Number(s.y2);
      if ([x1, y1, x2, y2].every(Number.isFinite) && Math.hypot(x2 - x1, y2 - y1) > 1e-12) {
        lines.push({ x1, y1, x2, y2 });
      }
    } else if (s) {
      others.push(s);
    }
  }
  if (!lines.length) return { shapes: others.slice(), mergedChains: 0 };

  const endpointMap = new Map();
  const addAt = (k, idx) => {
    if (!endpointMap.has(k)) endpointMap.set(k, []);
    endpointMap.get(k).push(idx);
  };
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    addAt(pointKey(ln.x1, ln.y1), i);
    addAt(pointKey(ln.x2, ln.y2), i);
  }
  const used = new Array(lines.length).fill(false);

  const buildChainFrom = (startIdx) => {
    const chain = [startIdx];
    used[startIdx] = true;
    const start = lines[startIdx];
    const points = [{ x: start.x1, y: start.y1 }, { x: start.x2, y: start.y2 }];

    const extendTail = () => {
      for (;;) {
        const last = points[points.length - 1];
        const k = pointKey(last.x, last.y);
        const cand = (endpointMap.get(k) || []).filter((idx) => !used[idx]);
        if (cand.length !== 1) break;
        const nidx = cand[0];
        const ln = lines[nidx];
        const d1 = Math.hypot(ln.x1 - last.x, ln.y1 - last.y);
        const d2 = Math.hypot(ln.x2 - last.x, ln.y2 - last.y);
        let nextPt = null;
        if (d1 <= 1e-6) nextPt = { x: ln.x2, y: ln.y2 };
        else if (d2 <= 1e-6) nextPt = { x: ln.x1, y: ln.y1 };
        else break;
        chain.push(nidx);
        used[nidx] = true;
        points.push(nextPt);
      }
    };
    const extendHead = () => {
      for (;;) {
        const first = points[0];
        const k = pointKey(first.x, first.y);
        const cand = (endpointMap.get(k) || []).filter((idx) => !used[idx]);
        if (cand.length !== 1) break;
        const nidx = cand[0];
        const ln = lines[nidx];
        const d1 = Math.hypot(ln.x1 - first.x, ln.y1 - first.y);
        const d2 = Math.hypot(ln.x2 - first.x, ln.y2 - first.y);
        let nextPt = null;
        if (d1 <= 1e-6) nextPt = { x: ln.x2, y: ln.y2 };
        else if (d2 <= 1e-6) nextPt = { x: ln.x1, y: ln.y1 };
        else break;
        chain.unshift(nidx);
        used[nidx] = true;
        points.unshift(nextPt);
      }
    };

    extendTail();
    extendHead();
    return { chain, points };
  };

  const out = others.slice();
  let mergedChains = 0;
  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    const built = buildChainFrom(i);
    if (built.points.length >= 3) {
      out.push({ type: "polyline", points: built.points, closed: false });
      mergedChains += 1;
    } else {
      const a = built.points[0];
      const b = built.points[built.points.length - 1];
      out.push({ type: "line", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return { shapes: out, mergedChains };
}

export function parseDxfToCadShapes(text, options = null) {
  const opts = (options && typeof options === "object") ? options : {};
  const base = parseDxfToCadShapesBase(text, opts);
  if (!opts.polylineize) return base;
  const converted = convertDxfLinesToPolylines(base.shapes);
  const warnings = Array.isArray(base.warnings) ? base.warnings.slice() : [];
  if (converted.mergedChains > 0) warnings.push(`DXF polylineize: merged ${converted.mergedChains} line chains`);
  return { shapes: converted.shapes, warnings };
}
