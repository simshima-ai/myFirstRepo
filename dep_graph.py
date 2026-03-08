#!/usr/bin/env python3
"""Generate a self-contained HTML dependency graph for s-cad/cad/*.js
   Features: cluster layout, convex hull backgrounds, arrow links, file-size nodes
"""

import os
import re
import json

CAD_DIR = os.path.join(os.path.dirname(__file__), "cad")

# ─── Cluster definitions ────────────────────────────────────────────────────
# cx/cy are fractions of canvas (0–1). color = hull background.
CLUSTERS = {
    "core":      {"label": "Core / Geometry",     "color": "#1a4a2e", "border": "#2ecc71", "cx": 0.50, "cy": 0.82},
    "app_core":  {"label": "App Core",             "color": "#4a1a1a", "border": "#e74c3c", "cx": 0.50, "cy": 0.58},
    "input":     {"label": "Input",                "color": "#3a1a10", "border": "#e07b54", "cx": 0.15, "cy": 0.52},
    "selection": {"label": "Selection",            "color": "#3a300a", "border": "#e0b554", "cx": 0.78, "cy": 0.50},
    "tools":     {"label": "Tools",                "color": "#0a2a3a", "border": "#54c8e0", "cx": 0.82, "cy": 0.22},
    "app_ops":   {"label": "App Ops / Runtime",    "color": "#2a1a4a", "border": "#9b59b6", "cx": 0.45, "cy": 0.35},
    "ui":        {"label": "UI",                   "color": "#1a1a4a", "border": "#3498db", "cx": 0.18, "cy": 0.20},
    "render":    {"label": "Render",               "color": "#0a2a2a", "border": "#1abc9c", "cx": 0.78, "cy": 0.78},
}

def assign_cluster(fname):
    """Assign a file to a cluster by filename pattern."""
    if fname in ("state.js", "geom.js", "solvers.js", "modify.js",
                 "dim_geom.js", "dline_geom.js", "hatch_geom.js", "bspline_utils.js"):
        return "core"
    if fname in ("app.js", "app_persistence.js", "app_file_ops.js",
                 "app_document_ops.js", "app_clipboard_ops.js", "app_unit_page.js"):
        return "app_core"
    if fname.startswith("app_input"):
        return "input"
    if fname.startswith("app_selection"):
        return "selection"
    if fname.startswith("app_tools"):
        return "tools"
    if fname.startswith("render"):
        return "render"
    if fname.startswith("ui"):
        return "ui"
    if fname.startswith("app_"):
        return "app_ops"
    return "core"

def collect_files():
    files = {}
    for fname in sorted(os.listdir(CAD_DIR)):
        if not fname.endswith(".js"):
            continue
        path = os.path.join(CAD_DIR, fname)
        size = os.path.getsize(path)
        files[fname] = {"size": size, "imports": [], "cluster": assign_cluster(fname)}
    return files

def parse_imports(files):
    for fname in files:
        path = os.path.join(CAD_DIR, fname)
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
        for m in re.finditer(r'from\s+["\']\./([\w_\.]+\.js)["\']', text):
            dep = m.group(1)
            if dep in files and dep != fname:
                if dep not in files[fname]["imports"]:
                    files[fname]["imports"].append(dep)
    return files

def build_graph(files):
    nodes, links = [], []
    name_to_idx = {}
    for i, (fname, info) in enumerate(files.items()):
        name_to_idx[fname] = i
        nodes.append({"id": i, "name": fname, "size": info["size"], "cluster": info["cluster"]})
    for fname, info in files.items():
        src = name_to_idx[fname]
        for dep in info["imports"]:
            links.append({"source": src, "target": name_to_idx[dep]})
    return nodes, links

# ─── HTML template ────────────────────────────────────────────────────────────
HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>s-cad dependency graph</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #0e0e1a; color: #e0e0e0; font-family: monospace; overflow: hidden; }
svg { width: 100vw; height: 100vh; display: block; }
.hull { fill-opacity: 0.18; stroke-width: 2; stroke-opacity: 0.7; stroke-dasharray: 6 3; }
.cluster-label { font-size: 13px; font-weight: bold; fill-opacity: 0.85; pointer-events: none; letter-spacing: 0.5px; }
.link { stroke-opacity: 0.45; fill: none; }
.node circle { stroke-width: 1.2; cursor: pointer; transition: stroke-width 0.1s; }
.node text {
  font-size: 9px; fill: #ddd; pointer-events: none;
  paint-order: stroke; stroke: #0a0a18; stroke-width: 3.5px; stroke-linejoin: round;
}
.node:hover circle { stroke-width: 3; }
#tooltip {
  position: fixed; background: #0a0f1e; border: 1px solid #3a5a8a;
  padding: 9px 13px; border-radius: 7px; font-size: 12px; pointer-events: none;
  display: none; z-index: 20; max-width: 340px; line-height: 1.6;
  box-shadow: 0 4px 16px #0008;
}
#legend-size {
  position: fixed; bottom: 16px; left: 16px; background: #0a0f1ecc;
  border: 1px solid #3a5a8a; border-radius: 7px; padding: 10px 14px; font-size: 11px;
}
#legend-size h4 { margin-bottom: 7px; color: #9ecaed; font-size: 11px; }
.lrow { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.lcirc { border-radius: 50%; background: #888; border: 1px solid #fff9; flex-shrink: 0; }
#legend-cluster {
  position: fixed; bottom: 16px; right: 16px; background: #0a0f1ecc;
  border: 1px solid #3a5a8a; border-radius: 7px; padding: 10px 14px; font-size: 11px;
  max-width: 200px;
}
#legend-cluster h4 { margin-bottom: 7px; color: #9ecaed; font-size: 11px; }
.crow { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.cswatch { width: 12px; height: 12px; border-radius: 3px; flex-shrink: 0; }
#info {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  background: #0a0f1ecc; border: 1px solid #3a5a8a; border-radius: 7px;
  padding: 5px 18px; font-size: 11.5px; color: #9ecaed; white-space: nowrap;
}
#controls {
  position: fixed; top: 14px; right: 14px;
  display: flex; flex-direction: column; gap: 5px;
}
#controls button {
  background: #0a0f1e; border: 1px solid #3a5a8a; color: #9ecaed;
  padding: 5px 11px; border-radius: 5px; cursor: pointer; font-size: 11px;
}
#controls button:hover { background: #1a2a4a; }
</style>
</head>
<body>
<svg id="svg"></svg>
<div id="tooltip"></div>
<div id="info">Scroll: zoom &nbsp;|&nbsp; Drag: pan / move node &nbsp;|&nbsp; Click node: highlight deps</div>
<div id="legend-size">
  <h4>Node size = file size</h4>
  <div class="lrow"><div class="lcirc" style="width:8px;height:8px"></div>&lt; 5 KB</div>
  <div class="lrow"><div class="lcirc" style="width:12px;height:12px"></div>5–15 KB</div>
  <div class="lrow"><div class="lcirc" style="width:18px;height:18px"></div>15–35 KB</div>
  <div class="lrow"><div class="lcirc" style="width:24px;height:24px"></div>35–70 KB</div>
  <div class="lrow"><div class="lcirc" style="width:30px;height:30px"></div>&gt; 70 KB</div>
</div>
<div id="legend-cluster">
  <h4>Cluster groups</h4>
  CLUSTER_LEGEND
</div>
<div id="controls">
  <button onclick="resetZoom()">Reset view</button>
  <button onclick="toggleLabels()">Toggle labels</button>
  <button onclick="toggleHulls()">Toggle groups</button>
  <button onclick="reheat()">Reheat sim</button>
</div>

<script src="https://d3js.org/d3.v7.min.js"></script>
<script>
const nodes   = NODES_JSON;
const links   = LINKS_JSON;
const cluster = CLUSTER_JSON;

const W = window.innerWidth, H = window.innerHeight;
const svg = d3.select("#svg");

// ── Arrow marker ────────────────────────────────────────────────────────────
svg.append("defs").append("marker")
  .attr("id", "arrow")
  .attr("viewBox", "0 -4 8 8")
  .attr("refX", 8).attr("refY", 0)
  .attr("markerWidth", 6).attr("markerHeight", 6)
  .attr("orient", "auto")
  .append("path")
    .attr("d", "M0,-4L8,0L0,4")
    .attr("fill", "#5a8ac0")
    .attr("fill-opacity", 0.7);

const g = svg.append("g");
svg.call(d3.zoom().scaleExtent([0.08, 5]).on("zoom", e => g.attr("transform", e.transform)));

// ── Cluster positions (absolute px) ─────────────────────────────────────────
const clusterPx = {};
Object.entries(cluster).forEach(([id, c]) => {
  clusterPx[id] = { x: c.cx * W, y: c.cy * H, color: c.color, border: c.border, label: c.label };
});

// ── Initial node positions near cluster centers ──────────────────────────────
const rng = (min, max) => min + Math.random() * (max - min);
nodes.forEach(d => {
  const cp = clusterPx[d.cluster] ?? { x: W/2, y: H/2 };
  d.x = cp.x + rng(-60, 60);
  d.y = cp.y + rng(-60, 60);
});

// ── Node radius by file size ─────────────────────────────────────────────────
function radius(size) {
  const kb = size / 1024;
  if (kb < 3)  return 5;
  if (kb < 5)  return 7;
  if (kb < 10) return 9;
  if (kb < 20) return 12;
  if (kb < 35) return 15;
  if (kb < 70) return 20;
  return 26;
}

// ── Custom cluster force ─────────────────────────────────────────────────────
function forceCluster(strength) {
  return function(alpha) {
    nodes.forEach(d => {
      const cp = clusterPx[d.cluster];
      if (!cp) return;
      d.vx += (cp.x - d.x) * strength * alpha;
      d.vy += (cp.y - d.y) * strength * alpha;
    });
  };
}

// ── Convex hull layer ────────────────────────────────────────────────────────
const hullLayer = g.append("g").attr("class", "hulls");
const hullPaths = {};
Object.entries(clusterPx).forEach(([id, cp]) => {
  hullPaths[id] = hullLayer.append("path")
    .attr("class", "hull")
    .attr("fill", cp.color)
    .attr("stroke", cp.border);
});

// Cluster labels layer (on top of hulls, below nodes)
const labelLayer = g.append("g").attr("class", "clabels");
const clusterLabels = {};
Object.entries(clusterPx).forEach(([id, cp]) => {
  clusterLabels[id] = labelLayer.append("text")
    .attr("class", "cluster-label")
    .attr("fill", cp.border)
    .attr("text-anchor", "middle")
    .text(cp.label);
});

// ── Link layer ───────────────────────────────────────────────────────────────
const linkLayer = g.append("g");
const link = linkLayer.selectAll("path")
  .data(links).join("path")
  .attr("class", "link")
  .attr("stroke", "#4a7ac0")
  .attr("stroke-width", 1.2)
  .attr("marker-end", "url(#arrow)");

// ── Node layer ───────────────────────────────────────────────────────────────
const nodeGroup = g.append("g").selectAll("g")
  .data(nodes).join("g").attr("class", "node");

nodeGroup.append("circle")
  .attr("r", d => radius(d.size))
  .attr("fill", d => clusterPx[d.cluster]?.border ?? "#888")
  .attr("fill-opacity", 0.8)
  .attr("stroke", d => clusterPx[d.cluster]?.border ?? "#888")
  .attr("stroke-opacity", 1);

// ── Short label (strip common prefix) ────────────────────────────────────────
function shortName(name) {
  const n = name.replace(".js", "");
  if (n.startsWith("app_input_"))     return "in_"  + n.slice("app_input_".length);
  if (n.startsWith("app_selection_")) return "sel_" + n.slice("app_selection_".length);
  if (n.startsWith("app_tools_"))     return "tl_"  + n.slice("app_tools_".length);
  if (n.startsWith("ui_refresh_"))    return "rf_"  + n.slice("ui_refresh_".length);
  if (n.startsWith("ui_init_"))       return "ui_"  + n.slice("ui_init_".length);
  if (n.startsWith("render_"))        return "rn_"  + n.slice("render_".length);
  if (n.startsWith("app_"))           return "a_"   + n.slice("app_".length);
  if (n.startsWith("ui_"))            return "ui_"  + n.slice("ui_".length);
  return n;
}

let labelsVisible = true;
const labels = nodeGroup.append("text")
  .attr("dy", d => radius(d.size) + 10)
  .attr("text-anchor", "middle")
  .text(d => shortName(d.name))
  .append("title").text(d => d.name); // フルネームをtitleで保持

// ── Drag ─────────────────────────────────────────────────────────────────────
nodeGroup.call(d3.drag()
  .on("start", (e, d) => { if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
  .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
  .on("end",   (e, d) => { if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
);

// ── Tooltip ───────────────────────────────────────────────────────────────────
const tooltip = document.getElementById("tooltip");
const nodeById = new Map(nodes.map(n => [n.id, n]));

nodeGroup
  .on("mousemove", (e, d) => {
    const outs = links.filter(l => (l.source.id ?? l.source) === d.id)
      .map(l => nodeById.get(l.target.id ?? l.target)?.name ?? "?");
    const ins  = links.filter(l => (l.target.id ?? l.target) === d.id)
      .map(l => nodeById.get(l.source.id ?? l.source)?.name ?? "?");
    tooltip.style.display = "block";
    tooltip.style.left = (e.clientX + 16) + "px";
    tooltip.style.top  = (e.clientY - 12) + "px";
    tooltip.innerHTML = `
      <b style="color:#9ecaed">${d.name}</b> &nbsp;<span style="color:#aaa">[${cluster[d.cluster]?.label}]</span><br>
      Size: <b>${(d.size/1024).toFixed(1)} KB</b><br>
      Imports (${outs.length}): ${outs.length ? outs.map(n=>n.replace(".js","")).join(", ") : "<i>none</i>"}<br>
      Used by (${ins.length}): ${ins.length ? ins.map(n=>n.replace(".js","")).join(", ") : "<i>none</i>"}
    `;
  })
  .on("mouseleave", () => { tooltip.style.display = "none"; });

// ── Click highlight ───────────────────────────────────────────────────────────
let highlighted = null;
function resetHighlight() {
  highlighted = null;
  link.attr("stroke", "#4a7ac0").attr("stroke-opacity", 0.45).attr("stroke-width", 1.2)
      .attr("marker-end", "url(#arrow)");
  nodeGroup.select("circle").attr("fill-opacity", 0.8);
}
nodeGroup.on("click", (e, d) => {
  e.stopPropagation();
  if (highlighted === d.id) { resetHighlight(); return; }
  highlighted = d.id;
  const relLinks = new Set(), relNodes = new Set([d.id]);
  links.forEach(l => {
    const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
    if (s === d.id || t === d.id) { relLinks.add(l); relNodes.add(s); relNodes.add(t); }
  });
  link
    .attr("stroke", l => relLinks.has(l) ? "#ffd700" : "#4a7ac0")
    .attr("stroke-opacity", l => relLinks.has(l) ? 1 : 0.1)
    .attr("stroke-width", l => relLinks.has(l) ? 2.5 : 1.2)
    .attr("marker-end", "url(#arrow)");
  nodeGroup.select("circle")
    .attr("fill-opacity", d2 => relNodes.has(d2.id) ? 1 : 0.12);
});
svg.on("click", resetHighlight);

// ── Curved path for links ─────────────────────────────────────────────────────
function linkPath(d) {
  const sx = d.source.x, sy = d.source.y;
  const tx = d.target.x, ty = d.target.y;
  const r  = radius(d.target.size ?? 8) + 7; // stop before node edge
  const dx = tx - sx, dy = ty - sy;
  const dist = Math.sqrt(dx*dx + dy*dy) || 1;
  const ex = tx - dx/dist * r, ey = ty - dy/dist * r;
  // gentle curve
  const mx = (sx+tx)/2 - dy*0.1, my = (sy+ty)/2 + dx*0.1;
  return `M${sx},${sy} Q${mx},${my} ${ex},${ey}`;
}

// ── Force simulation ──────────────────────────────────────────────────────────
const sim = d3.forceSimulation(nodes)
  .force("link",      d3.forceLink(links).id(d => d.id).distance(75).strength(0.35))
  .force("charge",    d3.forceManyBody().strength(-220))
  .force("collision", d3.forceCollide(d => radius(d.size) + 5))
  .force("cluster",   forceCluster(0.18))
  .alphaDecay(0.02);

// ── Tick ──────────────────────────────────────────────────────────────────────
const HULL_PAD = 28;
function paddedHull(pts) {
  if (pts.length < 3) {
    // degenerate: circle or line — just pad each point outward from centroid
    const cx = d3.mean(pts, p => p[0]), cy = d3.mean(pts, p => p[1]);
    const extra = pts.flatMap(([x, y]) => {
      const dx = x-cx || 1, dy = y-cy || 0, d = Math.sqrt(dx*dx+dy*dy)||1;
      return [[x + dx/d*HULL_PAD*2, y + dy/d*HULL_PAD*2]];
    });
    pts = pts.concat(extra);
  }
  const hull = d3.polygonHull(pts);
  if (!hull) return null;
  // expand hull outward from centroid
  const cx = d3.mean(hull, p => p[0]), cy = d3.mean(hull, p => p[1]);
  return hull.map(([x, y]) => {
    const dx = x-cx, dy = y-cy, d = Math.sqrt(dx*dx+dy*dy)||1;
    return [x + dx/d*HULL_PAD, y + dy/d*HULL_PAD];
  });
}

sim.on("tick", () => {
  // Update hulls
  const byCluster = d3.group(nodes, d => d.cluster);
  Object.entries(hullPaths).forEach(([id, path]) => {
    const pts = (byCluster.get(id) ?? []).map(n => [n.x, n.y]);
    if (pts.length === 0) { path.attr("d", ""); return; }
    if (pts.length === 1) {
      const [x, y] = pts[0];
      path.attr("d", `M${x},${y} m-${HULL_PAD*2},0 a${HULL_PAD*2},${HULL_PAD*2} 0 1,0 ${HULL_PAD*4},0 a${HULL_PAD*2},${HULL_PAD*2} 0 1,0 -${HULL_PAD*4},0`);
      return;
    }
    const expanded = paddedHull(pts);
    if (!expanded) { path.attr("d", ""); return; }
    path.attr("d", "M" + expanded.join("L") + "Z");
  });

  // Update cluster labels (centroid of hull)
  Object.entries(clusterLabels).forEach(([id, lbl]) => {
    const ns = (byCluster.get(id) ?? []);
    if (!ns.length) return;
    const cx = d3.mean(ns, n => n.x);
    const minY = d3.min(ns, n => n.y);
    lbl.attr("x", cx).attr("y", minY - HULL_PAD - 6);
  });

  // Update links
  link.attr("d", linkPath);

  // Update nodes
  nodeGroup.attr("transform", d => `translate(${d.x},${d.y})`);
});

// ── Utility buttons ───────────────────────────────────────────────────────────
function resetZoom() {
  svg.transition().duration(500).call(
    d3.zoom().scaleExtent([0.08, 5]).on("zoom", e => g.attr("transform", e.transform)),
    d3.zoomIdentity
  );
}
function toggleLabels() {
  labelsVisible = !labelsVisible;
  labels.style("display", labelsVisible ? null : "none");
}
let hullsVisible = true;
function toggleHulls() {
  hullsVisible = !hullsVisible;
  hullLayer.style("display", hullsVisible ? null : "none");
  labelLayer.style("display", hullsVisible ? null : "none");
}
function reheat() { sim.alpha(0.5).restart(); }
</script>
</body>
</html>
"""

def make_cluster_legend(clusters):
    rows = []
    for cid, c in clusters.items():
        rows.append(
            f'<div class="crow"><div class="cswatch" style="background:{c["border"]}"></div>'
            f'<span>{c["label"]}</span></div>'
        )
    return "\n  ".join(rows)

def main():
    files = collect_files()
    files = parse_imports(files)
    nodes, links = build_graph(files)

    nodes_json   = json.dumps(nodes,    ensure_ascii=False)
    links_json   = json.dumps(links,    ensure_ascii=False)
    cluster_json = json.dumps(CLUSTERS, ensure_ascii=False)
    legend_html  = make_cluster_legend(CLUSTERS)

    html = (HTML_TEMPLATE
            .replace("NODES_JSON",   nodes_json)
            .replace("LINKS_JSON",   links_json)
            .replace("CLUSTER_JSON", cluster_json)
            .replace("CLUSTER_LEGEND", legend_html))

    out_path = os.path.join(os.path.dirname(__file__), "dep_graph.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Generated: {out_path}")
    print(f"  {len(nodes)} nodes, {len(links)} edges, {len(CLUSTERS)} clusters")

if __name__ == "__main__":
    main()
