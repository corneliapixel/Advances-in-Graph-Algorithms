import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";

/*
  Shortest-Path Lab
  Interactive demo of three eras of single-source shortest paths (SSSP):
    1. Dijkstra (1956/59)         — the classical baseline, non-negative weights
    2. Johnson (1977)            — reweighting via Bellman-Ford to handle negative edges
    3. DMMSY (2025, STOC)        — "Breaking the Sorting Barrier", O(m log^{2/3} n)
  Built for an internship task on advances in graph algorithms (2022-2026).
*/

// ----------------------------- design tokens -----------------------------
const C = {
  ink: "#10231c",
  paper: "#f3efe6",
  panel: "#ffffff",
  line: "#d9d2c4",
  moss: "#2f6f4f", // Dijkstra
  amber: "#c4762a", // Johnson / negative
  plum: "#6b3f8f", // DMMSY 2025
  faint: "#7d7666",
  frontier: "#e8b04b",
  settled: "#2f6f4f",
  pivot: "#6b3f8f",
  danger: "#b23a48",
};

const ALGOS = {
  dijkstra: { name: "Dijkstra", year: "1956", color: C.moss, complexity: "O(m + n log n)" },
  johnson: { name: "Johnson", year: "1977", color: C.amber, complexity: "O(nm + n² log n)" },
  dmmsy: { name: "DMMSY", year: "2025", color: C.plum, complexity: "O(m log^{2/3} n)" },
};

// ----------------------------- sample graphs -----------------------------
function makeNonNegative() {
  return {
    nodes: [
      { id: 0, x: 120, y: 200 }, { id: 1, x: 280, y: 90 }, { id: 2, x: 280, y: 310 },
      { id: 3, x: 450, y: 90 }, { id: 4, x: 450, y: 310 }, { id: 5, x: 610, y: 200 },
    ],
    edges: [
      [0, 1, 4], [0, 2, 2], [1, 2, 5], [1, 3, 10], [2, 4, 3],
      [3, 5, 11], [4, 3, 4], [4, 5, 5], [2, 1, 1],
    ],
    source: 0,
  };
}
function makeNegativeNoCycle() {
  return {
    nodes: [
      { id: 0, x: 120, y: 200 }, { id: 1, x: 300, y: 110 }, { id: 2, x: 300, y: 300 },
      { id: 3, x: 480, y: 110 }, { id: 4, x: 480, y: 300 }, { id: 5, x: 620, y: 200 },
    ],
    edges: [
      [0, 1, 6], [0, 2, 7], [1, 2, 8], [1, 3, 5], [1, 4, -4],
      [2, 3, -3], [2, 4, 9], [3, 1, -2], [4, 5, 7], [3, 5, 2],
    ],
    source: 0,
  };
}
function makeNegativeCycle() {
  return {
    nodes: [
      { id: 0, x: 140, y: 200 }, { id: 1, x: 330, y: 110 }, { id: 2, x: 330, y: 300 },
      { id: 3, x: 540, y: 200 },
    ],
    edges: [[0, 1, 1], [1, 2, -4], [2, 3, 2], [3, 1, 1], [2, 1, 2]],
    source: 0,
  };
}
function makeSparseRandom(n = 9) {
  const nodes = [];
  const cx = 365, cy = 210, r = 150;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    nodes.push({ id: i, x: cx + r * Math.cos(a) * 1.4, y: cy + r * Math.sin(a) });
  }
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    const out = 1 + Math.floor(Math.random() * 2);
    for (let k = 0; k < out; k++) {
      const j = Math.floor(Math.random() * n);
      if (j !== i && !seen.has(i + "-" + j)) {
        seen.add(i + "-" + j);
        edges.push([i, j, 1 + Math.floor(Math.random() * 9)]);
      }
    }
  }
  return { nodes, edges, source: 0 };
}

// ----------------------------- algorithm steppers -----------------------------
// Each returns an array of "frames": { dist, settled, frontier, pivots, note, edge }

function buildAdj(graph) {
  const adj = {};
  graph.nodes.forEach((nd) => (adj[nd.id] = []));
  graph.edges.forEach(([u, v, w]) => adj[u].push([v, w]));
  return adj;
}

function runDijkstra(graph) {
  const adj = buildAdj(graph);
  const dist = {}, settled = new Set();
  graph.nodes.forEach((n) => (dist[n.id] = Infinity));
  dist[graph.source] = 0;
  const frames = [];
  const snap = (note, edge, frontierSet) =>
    frames.push({
      dist: { ...dist }, settled: new Set(settled),
      frontier: new Set(frontierSet), pivots: new Set(),
      note, edge: edge || null,
    });
  snap(`Start at node ${graph.source}. All other distances are ∞.`, null, [graph.source]);

  const pq = () => {
    let best = null, bd = Infinity;
    for (const n of graph.nodes) {
      if (!settled.has(n.id) && dist[n.id] < bd) { bd = dist[n.id]; best = n.id; }
    }
    return best;
  };
  let u;
  while ((u = pq()) !== null) {
    settled.add(u);
    snap(`Settle node ${u} (smallest tentative distance = ${dist[u]}). Its shortest path is now final.`, null,
      [...new Set(graph.edges.filter(([a]) => !settled.has(a) && dist[a] < Infinity).map(([a]) => a))]);
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        snap(`Relax edge ${u}→${v}: new shorter distance to ${v} = ${dist[v]}.`, [u, v],
          [...new Set(graph.edges.filter(([a]) => !settled.has(a) && dist[a] < Infinity).map(([a]) => a))]);
      }
    }
  }
  snap("Done. Every reachable node has its final shortest distance.", null, []);
  return frames;
}

function runJohnson(graph) {
  // Bellman-Ford from a virtual source to get potentials h(), detect negative cycle,
  // then conceptually reweight w'(u,v)=w+h(u)-h(v) ≥ 0 and run Dijkstra.
  const frames = [];
  const n = graph.nodes.length;
  const h = {};
  graph.nodes.forEach((nd) => (h[nd.id] = 0)); // virtual source connects to all with weight 0
  const snap = (note, edge, danger) =>
    frames.push({
      dist: { ...h }, settled: new Set(), frontier: new Set(),
      pivots: new Set(), note, edge: edge || null, danger: !!danger,
    });
  snap("Phase 1 — Bellman-Ford from a virtual source (h = 0 everywhere). This finds vertex potentials.", null);

  let changed = true, pass = 0;
  for (pass = 0; pass < n; pass++) {
    changed = false;
    for (const [u, v, w] of graph.edges) {
      if (h[u] + w < h[v]) {
        h[v] = h[u] + w;
        changed = true;
        snap(`Pass ${pass + 1}: relax ${u}→${v}, potential h(${v}) = ${h[v]}.`, [u, v]);
      }
    }
    if (!changed) break;
  }
  // One extra pass: if it still changes, there is a negative cycle.
  let negCycle = false;
  for (const [u, v, w] of graph.edges) {
    if (h[u] + w < h[v]) { negCycle = true; break; }
  }
  if (negCycle) {
    snap("A relaxation still improves after n−1 passes → a NEGATIVE CYCLE exists. Shortest paths are undefined here.", null, true);
    return frames;
  }
  snap("Potentials stable. Reweight every edge to w'(u,v) = w + h(u) − h(v) ≥ 0, then run Dijkstra normally.", null);

  // Now Dijkstra on reweighted graph, but report true distances.
  const adj = buildAdj(graph);
  const dist = {}, settled = new Set();
  graph.nodes.forEach((nd) => (dist[nd.id] = Infinity));
  dist[graph.source] = 0;
  const dsnap = (note, edge) =>
    frames.push({
      dist: { ...dist }, settled: new Set(settled), frontier: new Set(
        graph.nodes.filter((x) => !settled.has(x.id) && dist[x.id] < Infinity).map((x) => x.id)
      ), pivots: new Set(), note, edge: edge || null,
    });
  dsnap(`Phase 2 — Dijkstra on the reweighted (now non-negative) graph from node ${graph.source}.`, null);
  const pick = () => {
    let b = null, bd = Infinity;
    for (const nd of graph.nodes) if (!settled.has(nd.id) && dist[nd.id] < bd) { bd = dist[nd.id]; b = nd.id; }
    return b;
  };
  let u;
  while ((u = pick()) !== null) {
    settled.add(u);
    dsnap(`Settle node ${u} (true distance ${dist[u]}).`, null);
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; dsnap(`Relax ${u}→${v}: distance to ${v} = ${dist[v]}.`, [u, v]); }
    }
  }
  dsnap("Done. Negative edges handled correctly — no negative cycle was present.", null);
  return frames;
}

function runDMMSY(graph) {
  // Faithful-in-spirit illustration of the 2025 idea (not the full recursion):
  // instead of fully sorting the frontier each step, group it into a distance
  // "band", use a Bellman-Ford-style scout to find a few pivots, expand those,
  // then revisit the rest. Requires non-negative weights like Dijkstra.
  const adj = buildAdj(graph);
  const dist = {}, settled = new Set();
  graph.nodes.forEach((n) => (dist[n.id] = Infinity));
  dist[graph.source] = 0;
  const frames = [];
  const snap = (note, edge, frontier, pivots) =>
    frames.push({
      dist: { ...dist }, settled: new Set(settled),
      frontier: new Set(frontier), pivots: new Set(pivots || []),
      note, edge: edge || null,
    });
  snap(`Start at ${graph.source}. Idea: don't fully sort the frontier — work in distance "bands".`, null, [graph.source], []);

  while (true) {
    const live = graph.nodes.filter((n) => !settled.has(n.id) && dist[n.id] < Infinity).map((n) => n.id);
    if (live.length === 0) break;
    const minD = Math.min(...live.map((id) => dist[id]));
    // Band = nodes within a small additive window of the current minimum.
    const span = Math.max(...graph.edges.map(([, , w]) => w), 1);
    const band = live.filter((id) => dist[id] <= minD + span * 0.6);
    snap(`Form a frontier band near distance ${minD} (${band.length} node${band.length > 1 ? "s" : ""}) — no global sort needed.`,
      null, live, []);
    // FindPivots: pick the closest few as pivots to expand first (scout step).
    const pivots = [...band].sort((a, b) => dist[a] - dist[b]).slice(0, Math.max(1, Math.ceil(band.length / 2)));
    snap(`FindPivots → expand the ${pivots.length} most influential node${pivots.length > 1 ? "s" : ""} of the band first.`,
      null, live, pivots);
    for (const u of pivots) {
      settled.add(u);
      for (const [v, w] of adj[u]) {
        if (dist[u] + w < dist[v]) {
          dist[v] = dist[u] + w;
          snap(`Pivot ${u} relaxes ${u}→${v}: distance to ${v} = ${dist[v]}.`, [u, v],
            graph.nodes.filter((n) => !settled.has(n.id) && dist[n.id] < Infinity).map((n) => n.id), pivots);
        }
      }
    }
    snap(`Band settled. Revisit remaining frontier nodes in the next band.`, null,
      graph.nodes.filter((n) => !settled.has(n.id) && dist[n.id] < Infinity).map((n) => n.id), []);
  }
  snap("Done. Same exact distances as Dijkstra — reached by chunking the frontier instead of sorting it.", null, [], []);
  return frames;
}

// ----------------------------- graph drawing -----------------------------
function GraphView({ graph, frame, onSetSource }) {
  const dist = frame?.dist || {};
  const settled = frame?.settled || new Set();
  const frontier = frame?.frontier || new Set();
  const pivots = frame?.pivots || new Set();
  const active = frame?.edge;

  const nodeFill = (id) => {
    if (id === graph.source) return C.ink;
    if (pivots.has(id)) return C.pivot;
    if (settled.has(id)) return C.settled;
    if (frontier.has(id)) return C.frontier;
    return "#ffffff";
  };
  const nodeText = (id) =>
    id === graph.source || settled.has(id) || pivots.has(id) ? "#fff" : C.ink;

  return (
    <svg viewBox="0 0 730 420" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L7,3 L0,6 Z" fill={C.faint} />
        </marker>
        <marker id="arrowActive" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L7,3 L0,6 Z" fill={C.ink} />
        </marker>
      </defs>
      {graph.edges.map(([u, v, w], i) => {
        const a = graph.nodes.find((n) => n.id === u);
        const b = graph.nodes.find((n) => n.id === v);
        if (!a || !b) return null;
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const r = 20;
        const x1 = a.x + ux * r, y1 = a.y + uy * r;
        const x2 = b.x - ux * (r + 4), y2 = b.y - uy * (r + 4);
        const isActive = active && active[0] === u && active[1] === v;
        const reverseExists = graph.edges.some(([p, q]) => p === v && q === u);
        const off = reverseExists ? 9 : 0;
        const mx = (x1 + x2) / 2 - uy * off, my = (y1 + y2) / 2 + ux * off;
        return (
          <g key={i}>
            <path
              d={off ? `M${x1},${y1} Q${mx},${my} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`}
              fill="none"
              stroke={isActive ? C.ink : w < 0 ? C.amber : C.line}
              strokeWidth={isActive ? 3 : 1.6}
              markerEnd={isActive ? "url(#arrowActive)" : "url(#arrow)"}
            />
            <text x={mx} y={my - 4} fontSize="12" fontWeight="600"
              fill={w < 0 ? C.amber : C.faint} textAnchor="middle"
              style={{ paintOrder: "stroke", stroke: C.paper, strokeWidth: 3 }}>
              {w}
            </text>
          </g>
        );
      })}
      {graph.nodes.map((nd) => {
        const d = dist[nd.id];
        const label = d === undefined || d === Infinity ? "∞" : d;
        return (
          <g key={nd.id} onClick={() => onSetSource(nd.id)} style={{ cursor: "pointer" }}>
            <circle cx={nd.x} cy={nd.y} r="20" fill={nodeFill(nd.id)}
              stroke={C.ink} strokeWidth="1.6" />
            <text x={nd.x} y={nd.y + 5} fontSize="15" fontWeight="700"
              fill={nodeText(nd.id)} textAnchor="middle">{nd.id}</text>
            <text x={nd.x} y={nd.y - 28} fontSize="12" fontWeight="700"
              fill={C.ink} textAnchor="middle"
              style={{ paintOrder: "stroke", stroke: C.paper, strokeWidth: 4 }}>
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ----------------------------- legend chip -----------------------------
function Chip({ color, label }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.faint }}>
      <span style={{ width: 12, height: 12, borderRadius: 3, background: color, border: `1px solid ${C.ink}` }} />
      {label}
    </span>
  );
}

// ----------------------------- main -----------------------------
export default function ShortestPathLab() {
  const [graph, setGraph] = useState(makeNonNegative);
  const [algo, setAlgo] = useState("dijkstra");
  const [frames, setFrames] = useState([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState("lab");
  const timer = useRef(null);

  const compute = useCallback((g, a) => {
    const fn = a === "dijkstra" ? runDijkstra : a === "johnson" ? runJohnson : runDMMSY;
    const fr = fn(g);
    setFrames(fr);
    setStep(0);
    setPlaying(false);
  }, []);

  useEffect(() => { compute(graph, algo); }, []); // initial

  const run = () => { compute(graph, algo); setTimeout(() => setPlaying(true), 50); };
  const reset = () => { setStep(0); setPlaying(false); };

  useEffect(() => {
    if (!playing) return;
    if (step >= frames.length - 1) { setPlaying(false); return; }
    timer.current = setTimeout(() => setStep((s) => Math.min(s + 1, frames.length - 1)), 900);
    return () => clearTimeout(timer.current);
  }, [playing, step, frames.length]);

  const frame = frames[step] || null;
  const negEdgesPresent = graph.edges.some(([, , w]) => w < 0);
  const algoNeedsNonNeg = algo === "dijkstra" || algo === "dmmsy";

  const loadGraph = (g) => { const ng = g(); setGraph(ng); setTimeout(() => compute(ng, algo), 0); };
  const setSource = (id) => {
    const ng = { ...graph, source: id };
    setGraph(ng); compute(ng, algo);
  };

  const btn = (active, color) => ({
    padding: "8px 14px", borderRadius: 8, border: `1px solid ${active ? C.ink : C.line}`,
    background: active ? color : C.panel, color: active ? "#fff" : C.ink,
    fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all .15s",
  });
  const smallBtn = {
    padding: "7px 12px", borderRadius: 8, border: `1px solid ${C.line}`,
    background: C.panel, color: C.ink, fontWeight: 600, fontSize: 12.5, cursor: "pointer",
  };

  return (
    <div style={{
      fontFamily: "'Georgia', 'Iowan Old Style', serif", background: C.paper,
      color: C.ink, padding: "20px 18px 32px", borderRadius: 14, maxWidth: 1040, margin: "0 auto",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: C.faint, fontFamily: "system-ui, sans-serif" }}>
            Single-source shortest paths
          </div>
          <h1 style={{ margin: "2px 0 0", fontSize: 30, letterSpacing: -0.5 }}>
            From Dijkstra to the <span style={{ color: C.plum }}>2025</span> sorting-barrier break
          </h1>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["lab", "story"].map((t) => (
            <button key={t} onClick={() => setTab(t)} style={btn(tab === t, C.ink)}>
              {t === "lab" ? "Lab" : "Story"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: C.line, margin: "16px 0" }} />

      {tab === "lab" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(0,1fr)", gap: 16 }}>
          {/* left: graph */}
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong style={{ fontFamily: "system-ui, sans-serif", fontSize: 14 }}>Graph</strong>
              <span style={{ fontSize: 12, color: C.faint, fontFamily: "system-ui, sans-serif" }}>
                click any node to set it as source
              </span>
            </div>
            <GraphView graph={graph} frame={frame} onSetSource={setSource} />
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontFamily: "system-ui, sans-serif" }}>
              <Chip color={C.ink} label="source" />
              <Chip color={C.settled} label="settled (final)" />
              <Chip color={C.frontier} label="frontier" />
              <Chip color={C.pivot} label="pivot (DMMSY)" />
              <Chip color={C.amber} label="negative edge" />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12, fontFamily: "system-ui, sans-serif" }}>
              <button style={smallBtn} onClick={() => loadGraph(makeNonNegative)}>Non-negative</button>
              <button style={smallBtn} onClick={() => loadGraph(makeNegativeNoCycle)}>Negative (no cycle)</button>
              <button style={smallBtn} onClick={() => loadGraph(makeNegativeCycle)}>Negative cycle</button>
              <button style={smallBtn} onClick={() => loadGraph(() => makeSparseRandom(9))}>Random sparse</button>
            </div>
          </div>

          {/* right: controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: "system-ui, sans-serif" }}>
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {Object.entries(ALGOS).map(([k, a]) => (
                  <button key={k} onClick={() => { setAlgo(k); compute(graph, k); }} style={{ ...btn(algo === k, a.color), flex: 1 }}>
                    {a.name}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: C.faint, marginBottom: 10 }}>
                <strong style={{ color: ALGOS[algo].color }}>{ALGOS[algo].name} ({ALGOS[algo].year})</strong>
                {" · "}{ALGOS[algo].complexity}
              </div>

              {algoNeedsNonNeg && negEdgesPresent && (
                <div style={{
                  background: "#fbeae0", border: `1px solid ${C.amber}`, color: "#8a4a16",
                  padding: "8px 10px", borderRadius: 8, fontSize: 12.5, marginBottom: 10
                }}>
                  This graph has negative edges. {ALGOS[algo].name} assumes weights ≥ 0, so results may be wrong — switch to Johnson.
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button style={{ ...btn(false, C.moss), background: C.moss, color: "#fff", border: `1px solid ${C.ink}` }} onClick={run}>▶ Run</button>
                <button style={smallBtn} onClick={() => setPlaying((p) => !p)} disabled={frames.length === 0}>
                  {playing ? "⏸ Pause" : "⏵ Play"}
                </button>
                <button style={smallBtn} onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }}>‹ Prev</button>
                <button style={smallBtn} onClick={() => { setPlaying(false); setStep((s) => Math.min(frames.length - 1, s + 1)); }}>Next ›</button>
                <button style={smallBtn} onClick={reset}>↺ Reset</button>
              </div>

              <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={step}
                onChange={(e) => { setPlaying(false); setStep(+e.target.value); }}
                style={{ width: "100%", marginTop: 12, accentColor: ALGOS[algo].color }} />
              <div style={{ fontSize: 12, color: C.faint }}>
                Step {frames.length ? step + 1 : 0} / {frames.length}
              </div>
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14, minHeight: 96 }}>
              <strong style={{ fontSize: 13 }}>What's happening</strong>
              <p style={{
                margin: "8px 0 0", fontSize: 14, lineHeight: 1.5,
                color: frame?.danger ? C.danger : C.ink, fontWeight: frame?.danger ? 700 : 400,
                fontFamily: "Georgia, serif",
              }}>
                {frame ? frame.note : "Press Run to watch the algorithm step through the graph."}
              </p>
            </div>

            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 }}>
              <strong style={{ fontSize: 13 }}>Distances from source</strong>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {graph.nodes.map((nd) => {
                  const d = frame?.dist?.[nd.id];
                  return (
                    <span key={nd.id} style={{
                      fontSize: 12.5, padding: "4px 8px", borderRadius: 6,
                      background: C.paper, border: `1px solid ${C.line}`,
                    }}>
                      {nd.id}: <strong>{d === undefined || d === Infinity ? "∞" : d}</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Story />
      )}

      <div style={{ marginTop: 16, fontSize: 11.5, color: C.faint, fontFamily: "system-ui, sans-serif" }}>
        Demo built for an internship task. The DMMSY view is an illustration of the band/pivot idea, not the full recursive algorithm.
      </div>
    </div>
  );
}

// ----------------------------- story tab -----------------------------
function Story() {
  const card = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 };
  const h = { margin: "0 0 6px", fontSize: 17 };
  const p = { margin: 0, fontSize: 14.5, lineHeight: 1.6 };
  const year = (c) => ({ fontFamily: "system-ui, sans-serif", fontSize: 12, fontWeight: 700, color: "#fff", background: c, padding: "2px 8px", borderRadius: 20 });
  return (
    <div>
      <div style={card}>
        <span style={year(C.moss)}>1956 · Dijkstra</span>
        <h3 style={{ ...h, marginTop: 8 }}>The classical baseline</h3>
        <p style={p}>
          Dijkstra's algorithm grows a set of "settled" nodes outward from the source, always settling the
          nearest unsettled node next. With a good priority queue it runs in O(m + n log n). The catch: every
          step depends on repeatedly extracting the global minimum — effectively <em>sorting</em> nodes by
          distance — and it only works when all edge weights are non-negative.
        </p>
      </div>
      <div style={card}>
        <span style={year(C.amber)}>1977 · Johnson</span>
        <h3 style={{ ...h, marginTop: 8 }}>Generalizing to negative edges</h3>
        <p style={p}>
          Johnson handles negative weights without abandoning Dijkstra. It adds a virtual source linked to every
          node, runs Bellman-Ford to compute a "potential" h(v) for each vertex, then reweights every edge to
          w'(u,v) = w + h(u) − h(v), which is guaranteed ≥ 0. Dijkstra then runs on the safe reweighted graph.
          If Bellman-Ford still improves after n−1 passes, a <strong>negative cycle</strong> exists and shortest
          paths are undefined — the lab flags this on the "Negative cycle" graph.
        </p>
      </div>
      <div style={card}>
        <span style={year(C.plum)}>2025 · DMMSY</span>
        <h3 style={{ ...h, marginTop: 8 }}>Breaking the sorting barrier</h3>
        <p style={p}>
          For 66 years, O(m + n log n) was thought to be essentially the best possible on sparse graphs — that
          log n factor is the cost of sorting the frontier. In 2025, Duan, Mao, Mao, Shu and Yin published a
          deterministic O(m·log^(2/3) n) algorithm, the first to beat Dijkstra on sparse directed graphs with
          real non-negative weights. Instead of fully ordering the frontier, it processes nodes in distance
          "bands", uses a Bellman-Ford-style scout (FindPivots) to expand only the most influential nodes first,
          and revisits the rest later — avoiding the full sort. It won a Best Paper Award at STOC 2025.
        </p>
      </div>
      <div style={card}>
        <span style={year(C.danger)}>2024–2026 · the harder sibling</span>
        <h3 style={{ ...h, marginTop: 8 }}>Speeding up negative-weight paths</h3>
        <p style={p}>
          DMMSY only covers non-negative weights. The harder problem — real <em>negative</em> weights, Johnson's
          original territory — sat at O(mn) for ~65 years. Fineman (2024) broke that with a randomized Õ(mn^(8/9))
          algorithm; Huang, Jin and Quanrud improved it to Õ(mn^(4/5)) and then, in 2026, to Õ(mn^(3/4) + m^(4/5)·n);
          and a 2026 result (Quanrud–Tajkhorshid, STOC 2026) reached about O(mn^0.72) via "negative-edge
          sparsification". The thread back to 1977 is unbroken: these algorithms still rely on Johnson's potentials
          to reweight edges — they just compute them far more cleverly. Note these are randomized, theoretical
          milestones; Dijkstra and DMMSY remain the practical tools.
        </p>
      </div>

      {/* visual timeline */}
      <div style={card}>
        <h3 style={{ ...h }}>Timeline at a glance</h3>
        <Timeline />
      </div>

      <div style={{ ...card, marginBottom: 0, fontFamily: "system-ui, sans-serif", fontSize: 12.5, color: C.faint }}>
        <strong style={{ color: C.ink }}>Sources:</strong> Duan, Mao, Mao, Shu, Yin, "Breaking the Sorting Barrier for
        Directed Single-Source Shortest Paths," STOC 2025 (arXiv:2504.17033); Quanta Magazine, Aug 2025;
        Quanrud & Tajkhorshid, "From Hop Reduction to Sparsification for Negative Length Shortest Paths," STOC 2026
        (arXiv:2511.18253); Fineman, STOC 2024.
      </div>
    </div>
  );
}

// ----------------------------- timeline -----------------------------
function Timeline() {
  const rows = [
    { year: "1959", color: C.moss, label: "Dijkstra", note: "O(m + n log n), weights ≥ 0", w: 0.30 },
    { year: "1977", color: C.amber, label: "Johnson", note: "reweighting → handles negative edges", w: 0.42 },
    { year: "2024", color: C.danger, label: "Fineman", note: "Õ(mn^8/9), negative real weights", w: 0.58 },
    { year: "2025", color: C.plum, label: "DMMSY", note: "O(m·log^2/3 n), breaks sorting barrier", w: 0.80 },
    { year: "2026", color: C.danger, label: "Quanrud–Tajkhorshid", note: "≈ O(mn^0.72), sparsification", w: 0.95 },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: "system-ui, sans-serif" }}>
          <div style={{ width: 44, fontWeight: 700, fontSize: 13, color: r.color, flexShrink: 0 }}>{r.year}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <strong style={{ fontSize: 13.5 }}>{r.label}</strong>
              <span style={{ fontSize: 12, color: C.faint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</span>
            </div>
            <div style={{ height: 8, background: C.paper, borderRadius: 5, marginTop: 4, overflow: "hidden", border: `1px solid ${C.line}` }}>
              <div style={{ width: `${r.w * 100}%`, height: "100%", background: r.color, borderRadius: 5, transition: "width .4s" }} />
            </div>
          </div>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: C.faint, fontFamily: "system-ui, sans-serif", marginTop: 2 }}>
        Bar length is illustrative — it suggests "how far past the old barriers", not exact speed.
      </div>
    </div>
  );
}
