#!/usr/bin/env python3
"""Generate a 3D HTML dependency graph for s-cad/cad/*.js using 3d-force-graph"""

import os
import re
import json

CAD_DIR = os.path.join(os.path.dirname(__file__), "cad")

# ─── Cluster definitions (3D positions) ──────────────────────────────────────
# x/y/z = initial cluster center in 3D space
# Dependency flow: Core (bottom/back) → App Core → mid layers → UI/Render (top/front)
CLUSTERS = {
    "core":      {"label": "Core / Geometry",   "color": "#2ecc71", "x":    0, "y": -320, "z":    0},
    "app_core":  {"label": "App Core",           "color": "#e74c3c", "x":    0, "y": -160, "z":    0},
    "input":     {"label": "Input",              "color": "#e07b54", "x": -300, "y":    0, "z":   60},
    "selection": {"label": "Selection",          "color": "#f1c40f", "x":  300, "y":    0, "z":   60},
    "tools":     {"label": "Tools",              "color": "#00d4ff", "x":  280, "y":  200, "z":  -80},
    "app_ops":   {"label": "App Ops / Runtime",  "color": "#9b59b6", "x":    0, "y":   80, "z":    0},
    "ui":        {"label": "UI",                 "color": "#3498db", "x": -280, "y":  260, "z":  -80},
    "render":    {"label": "Render",             "color": "#1abc9c", "x":  160, "y":  120, "z": -200},
}

def assign_cluster(fname):
    if fname in ("state.js", "geom.js", "solvers.js", "modify.js",
                 "dim_geom.js", "dline_geom.js", "hatch_geom.js", "bspline_utils.js"):
        return "core"
    if fname in ("app.js", "app_persistence.js", "app_file_ops.js",
                 "app_document_ops.js", "app_clipboard_ops.js", "app_unit_page.js"):
        return "app_core"
    if fname.startswith("app_input"):      return "input"
    if fname.startswith("app_selection"):  return "selection"
    if fname.startswith("app_tools"):      return "tools"
    if fname.startswith("render"):         return "render"
    if fname.startswith("ui"):             return "ui"
    if fname.startswith("app_"):           return "app_ops"
    return "core"

def collect_files():
    files = {}
    for fname in sorted(os.listdir(CAD_DIR)):
        if not fname.endswith(".js"):
            continue
        path = os.path.join(CAD_DIR, fname)
        files[fname] = {"size": os.path.getsize(path), "imports": [], "cluster": assign_cluster(fname)}
    return files

def parse_imports(files):
    for fname in files:
        path = os.path.join(CAD_DIR, fname)
        with open(path, encoding="utf-8", errors="replace") as f:
            text = f.read()
        for m in re.finditer(r'from\s+["\']\./([\w_\.]+\.js)["\']', text):
            dep = m.group(1)
            if dep in files and dep != fname and dep not in files[fname]["imports"]:
                files[fname]["imports"].append(dep)
    return files

def build_graph(files):
    nodes, links = [], []
    idx = {}
    for i, (fname, info) in enumerate(files.items()):
        idx[fname] = i
        nodes.append({"id": i, "name": fname, "size": info["size"], "cluster": info["cluster"]})
    for fname, info in files.items():
        for dep in info["imports"]:
            links.append({"source": idx[fname], "target": idx[dep]})
    return nodes, links

# ─── HTML ─────────────────────────────────────────────────────────────────────
HTML = r"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>s-cad 3D dependency graph</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #050510; overflow: hidden; font-family: monospace; color: #e0e0e0; }
#graph { width: 100vw; height: 100vh; }

#tooltip {
  position: fixed; pointer-events: none; display: none;
  background: #080d20ee; border: 1px solid #3a6aaa;
  border-radius: 8px; padding: 10px 14px; font-size: 12px;
  line-height: 1.65; z-index: 20; max-width: 340px;
  box-shadow: 0 4px 24px #000a;
}

#legend {
  position: fixed; bottom: 18px; left: 18px;
  background: #080d20dd; border: 1px solid #3a6aaa;
  border-radius: 8px; padding: 11px 15px; font-size: 11px;
}
#legend h4 { color: #9ecaed; margin-bottom: 8px; font-size: 11px; letter-spacing: .5px; }
.crow { display: flex; align-items: center; gap: 9px; margin-bottom: 5px; }
.cdot { width: 11px; height: 11px; border-radius: 50%; flex-shrink: 0; }

#size-legend {
  position: fixed; bottom: 18px; right: 18px;
  background: #080d20dd; border: 1px solid #3a6aaa;
  border-radius: 8px; padding: 11px 15px; font-size: 11px;
}
#size-legend h4 { color: #9ecaed; margin-bottom: 8px; font-size: 11px; }
.srow { display: flex; align-items: center; gap: 9px; margin-bottom: 5px; }
.scirc { border-radius: 50%; background: #888; flex-shrink: 0; }

#info {
  position: fixed; top: 14px; left: 50%; transform: translateX(-50%);
  background: #080d20cc; border: 1px solid #3a6aaa; border-radius: 7px;
  padding: 5px 18px; font-size: 11.5px; color: #9ecaed; white-space: nowrap;
}
#controls {
  position: fixed; top: 14px; right: 14px;
  display: flex; flex-direction: column; gap: 5px;
}
#controls button {
  background: #080d20; border: 1px solid #3a6aaa; color: #9ecaed;
  padding: 5px 12px; border-radius: 5px; cursor: pointer; font-size: 11px;
}
#controls button:hover { background: #1a2a4a; }
#controls button.active { background: #1a3a6a; border-color: #5a9adf; }
</style>
</head>
<body>
<div id="graph"></div>
<div id="tooltip"></div>
<div id="info">
  左ドラッグ: 回転 &nbsp;|&nbsp; 右ドラッグ: パン &nbsp;|&nbsp; スクロール: ズーム &nbsp;|&nbsp; クリック: 依存ハイライト
</div>

<div id="legend">
  <h4>Cluster groups</h4>
  CLUSTER_LEGEND
</div>
<div id="size-legend">
  <h4>Node size = file size</h4>
  <div class="srow"><div class="scirc" style="width:8px;height:8px"></div>&lt; 5 KB</div>
  <div class="srow"><div class="scirc" style="width:13px;height:13px"></div>5–15 KB</div>
  <div class="srow"><div class="scirc" style="width:18px;height:18px"></div>15–35 KB</div>
  <div class="srow"><div class="scirc" style="width:24px;height:24px"></div>35–70 KB</div>
  <div class="srow"><div class="scirc" style="width:30px;height:30px"></div>&gt; 70 KB</div>
</div>
<div id="controls">
  <button id="btnAutoRotate" onclick="toggleAutoRotate()">Auto rotate</button>
  <button onclick="resetCamera()">Reset camera</button>
  <button id="btnParticles" onclick="toggleParticles()" class="active">Particles ON</button>
  <button onclick="resetHighlight()">Clear highlight</button>
</div>

<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
<script src="https://unpkg.com/3d-force-graph@1"></script>
<script>
// ── Text sprite factory ──────────────────────────────────────────────────────
function makeTextSprite(text, color) {
  const canvas = document.createElement('canvas');
  const fontSize = 28;
  const padding  = 8;
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px monospace`;
  const tw = ctx.measureText(text).width;
  canvas.width  = tw + padding * 2;
  canvas.height = fontSize + padding * 2;
  ctx.font = `${fontSize}px monospace`;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.92;
  ctx.fillText(text, padding, fontSize + padding * 0.5);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  // world units: scale so font looks ~right relative to node size
  const scale = canvas.width / 18;
  sprite.scale.set(scale, canvas.height / 18, 1);
  return sprite;
}
const nodes   = NODES_JSON;
const links   = LINKS_JSON;
const cluster = CLUSTER_JSON;

const clusterColor = Object.fromEntries(Object.entries(cluster).map(([k,v]) => [k, v.color]));
const nodeById = new Map(nodes.map(n => [n.id, n]));

// ── Node radius by size ────────────────────────────────────────────────────
function nodeRadius(size) {
  const kb = size / 1024;
  if (kb < 3)   return 3;
  if (kb < 5)   return 4;
  if (kb < 10)  return 5.5;
  if (kb < 20)  return 7;
  if (kb < 35)  return 9;
  if (kb < 70)  return 12;
  return 16;
}

// ── 3D Graph setup ──────────────────────────────────────────────────────────
let particlesOn = true;

const Graph = ForceGraph3D()
  (document.getElementById('graph'))
  .backgroundColor('#050510')
  .showNavInfo(false)
  .graphData({ nodes, links })
  .nodeId('id')
  .nodeLabel(() => '')                       // use custom tooltip instead
  .nodeVal(d => Math.pow(nodeRadius(d.size), 2))
  .nodeColor(d => clusterColor[d.cluster] ?? '#888')
  .nodeOpacity(0.88)
  .nodeResolution(16)
  .nodeThreeObjectExtend(true)
  .nodeThreeObject(node => {
    const label = node.name.replace('.js', '');
    const color = clusterColor[node.cluster] ?? '#ffffff';
    const sprite = makeTextSprite(label, color);
    const r = Math.sqrt(nodeRadius(node.size) ** 2); // approx nodeVal radius
    sprite.position.set(0, Math.sqrt(nodeRadius(node.size)) * 2.5 + 4, 0);
    return sprite;
  })
  // Links
  .linkColor(l => {
    const sc = clusterColor[nodeById.get(l.source.id ?? l.source)?.cluster] ?? '#4a7ac0';
    return sc + '88';
  })
  .linkOpacity(0.4)
  .linkWidth(0.5)
  .linkDirectionalArrowLength(4)
  .linkDirectionalArrowRelPos(1)
  .linkDirectionalArrowColor(() => '#ffffff55')
  .linkDirectionalParticles(particlesOn ? 1 : 0)
  .linkDirectionalParticleWidth(1.2)
  .linkDirectionalParticleColor(l => {
    return clusterColor[nodeById.get(l.source.id ?? l.source)?.cluster] ?? '#ffd700';
  })
  .linkDirectionalParticleSpeed(0.006);

// ── Custom cluster force ─────────────────────────────────────────────────────
Graph.d3Force('cluster', alpha => {
  const strength = 0.12;
  nodes.forEach(d => {
    const cp = cluster[d.cluster];
    if (!cp) return;
    d.vx += (cp.x - d.x) * strength * alpha;
    d.vy += (cp.y - d.y) * strength * alpha;
    d.vz += (cp.z - d.z) * strength * alpha;
  });
});

// Adjust default forces
Graph.d3Force('charge').strength(-120);
Graph.d3Force('link').distance(70).strength(0.3);

// ── Initial camera position ──────────────────────────────────────────────────
Graph.cameraPosition({ x: 0, y: 0, z: 800 });

// ── Tooltip ──────────────────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');
Graph.onNodeHover(node => {
  document.body.style.cursor = node ? 'pointer' : 'default';
  if (!node) { tooltip.style.display = 'none'; return; }
  const outs = links.filter(l => (l.source.id ?? l.source) === node.id)
    .map(l => nodeById.get(l.target.id ?? l.target)?.name ?? '?');
  const ins  = links.filter(l => (l.target.id ?? l.target) === node.id)
    .map(l => nodeById.get(l.source.id ?? l.source)?.name ?? '?');
  tooltip.style.display = 'block';
  tooltip.innerHTML = `
    <b style="color:#9ecaed">${node.name}</b>
    &nbsp;<span style="color:#888">[${cluster[node.cluster]?.label}]</span><br>
    Size: <b>${(node.size/1024).toFixed(1)} KB</b><br>
    Imports (${outs.length}): ${outs.length ? outs.map(n=>n.replace('.js','')).join(', ') : '<i style="color:#666">none</i>'}<br>
    Used by (${ins.length}): ${ins.length ? ins.map(n=>n.replace('.js','')).join(', ') : '<i style="color:#666">none</i>'}
  `;
});
document.addEventListener('mousemove', e => {
  tooltip.style.left = (e.clientX + 16) + 'px';
  tooltip.style.top  = (e.clientY - 12) + 'px';
});

// ── Click: highlight deps ────────────────────────────────────────────────────
let highlighted = null;

function resetHighlight() {
  highlighted = null;
  Graph
    .nodeColor(d => clusterColor[d.cluster] ?? '#888')
    .nodeOpacity(0.88)
    .linkColor(l => {
      const sc = clusterColor[nodeById.get(l.source.id ?? l.source)?.cluster] ?? '#4a7ac0';
      return sc + '88';
    })
    .linkOpacity(0.4)
    .linkWidth(0.5);
}

Graph.onNodeClick(node => {
  if (highlighted === node.id) { resetHighlight(); return; }
  highlighted = node.id;

  const relNodes = new Set([node.id]);
  const relLinks = new Set();
  links.forEach(l => {
    const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
    if (s === node.id || t === node.id) { relLinks.add(l); relNodes.add(s); relNodes.add(t); }
  });

  Graph
    .nodeColor(d  => relNodes.has(d.id)  ? (clusterColor[d.cluster] ?? '#888') : '#333')
    .nodeOpacity(d => relNodes.has(d.id) ? 1.0 : 0.08)
    .linkColor(l  => relLinks.has(l) ? '#ffd700' : '#1a1a2a')
    .linkOpacity(l => relLinks.has(l) ? 1.0 : 0.05)
    .linkWidth(l  => relLinks.has(l) ? 1.5 : 0.3);

  // Fly camera toward clicked node
  const { x, y, z } = node;
  const dist = 180;
  Graph.cameraPosition({ x: x, y: y, z: z + dist }, node, 800);
});

// ── Cluster label sprites ─────────────────────────────────────────────────────
// Add after sim settles
setTimeout(() => {
  const THREE = Graph.renderer().domElement.__three_scene ? THREE : window.THREE;
  if (!window.THREE) return; // not available
  const scene = Graph.scene();

  Object.entries(cluster).forEach(([id, c]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = c.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.label, 128, 32);
    const tex = new window.THREE.CanvasTexture(canvas);
    const mat = new window.THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85 });
    const sprite = new window.THREE.Sprite(mat);
    sprite.scale.set(120, 30, 1);
    sprite.position.set(c.x, c.y - 80, c.z);
    scene.add(sprite);
  });
}, 4000);

// ── Auto rotate ──────────────────────────────────────────────────────────────
let autoRotate = false;
function toggleAutoRotate() {
  autoRotate = !autoRotate;
  document.getElementById('btnAutoRotate').classList.toggle('active', autoRotate);
  Graph.controls().autoRotate = autoRotate;
  Graph.controls().autoRotateSpeed = 0.5;
}

function resetCamera() {
  resetHighlight();
  Graph.cameraPosition({ x: 0, y: 0, z: 800 }, { x: 0, y: 0, z: 0 }, 800);
}

function toggleParticles() {
  particlesOn = !particlesOn;
  Graph.linkDirectionalParticles(particlesOn ? 1 : 0);
  const btn = document.getElementById('btnParticles');
  btn.textContent = particlesOn ? 'Particles ON' : 'Particles OFF';
  btn.classList.toggle('active', particlesOn);
}
</script>
</body>
</html>
"""

def make_legend(clusters):
    rows = []
    for c in clusters.values():
        rows.append(
            f'<div class="crow"><div class="cdot" style="background:{c["color"]}"></div>'
            f'<span>{c["label"]}</span></div>'
        )
    return "\n  ".join(rows)

def main():
    files = collect_files()
    files = parse_imports(files)
    nodes, links = build_graph(files)

    html = (HTML
            .replace("NODES_JSON",     json.dumps(nodes,    ensure_ascii=False))
            .replace("LINKS_JSON",     json.dumps(links,    ensure_ascii=False))
            .replace("CLUSTER_JSON",   json.dumps(CLUSTERS, ensure_ascii=False))
            .replace("CLUSTER_LEGEND", make_legend(CLUSTERS)))

    out = os.path.join(os.path.dirname(__file__), "dep_graph_3d.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Generated: {out}")
    print(f"  {len(nodes)} nodes, {len(links)} edges, {len(CLUSTERS)} clusters")

if __name__ == "__main__":
    main()
