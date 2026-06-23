import React, { useState, useEffect, useRef } from "react";

/*
  Shortest-Path Lab — Advances in SSSP (2022–2026)
  Modes: Lab (interactive demo) · Story (narrative) · Slides (deck).
  Research via Gemini Deep Research, verified against primary sources
  (arXiv / STOC / FOCS / SODA; Johnson 1977 = JACM 24(1):1–13). Demo built with Claude.
*/

// ----------------------------- design tokens -----------------------------
const C = {
  ink: "#1b2430", canvas: "#eceef2", surface: "#ffffff", surfaceAlt: "#f4f6f9",
  line: "#d4d9e0", faint: "#6b7480",
  green: "#2f7d5d",  // non-negative weights
  amber: "#c07a1e",  // integer-negative
  violet: "#7a4fa3", // real-negative
  live: "#0e93a4",   // active relaxation / accent
  danger: "#c0473f",
  pick: "#fff3d6",   // selected-edge highlight
};
const D = { bg: "#161d27", panel: "#1f2833", line: "#33404e", text: "#eef1f5", faint: "#9aa6b2", green: "#5cc795", violet: "#b58be0", live: "#36cdda" };
const AMBER_D = "#e6a44d";

const serif = "'Iowan Old Style','Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";
const sans = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
const mono = "ui-monospace,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

const TRACK = {
  nonneg: { c: C.green, label: "Non-negative weights" },
  intneg: { c: C.amber, label: "Integer negative weights" },
  realneg: { c: C.violet, label: "Real negative weights" },
};

function K({ children, color }) {
  return <span style={{ fontFamily: mono, fontSize: "0.92em", color: color || C.ink, whiteSpace: "nowrap" }}>{children}</span>;
}
function Eyebrow({ children, color }) {
  return <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: 2.5, textTransform: "uppercase", color: color || C.faint, fontWeight: 700 }}>{children}</div>;
}
function TrackTag({ track }) {
  const tk = TRACK[track];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 11.5, fontWeight: 600, color: tk.c }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: tk.c }} />{tk.label}
    </span>
  );
}

// ============================================================================
//  GRAPHS
// ============================================================================
function gNonNeg() {
  return { nodes: [{ id: 0, x: 120, y: 200 }, { id: 1, x: 280, y: 90 }, { id: 2, x: 280, y: 310 }, { id: 3, x: 450, y: 90 }, { id: 4, x: 450, y: 310 }, { id: 5, x: 610, y: 200 }],
    edges: [[0,1,4],[0,2,2],[1,2,5],[1,3,10],[2,4,3],[3,5,11],[4,3,4],[4,5,5],[2,1,1]], source: 0 };
}
function gNegNoCycle() {
  return { nodes: [{ id: 0, x: 120, y: 200 }, { id: 1, x: 300, y: 110 }, { id: 2, x: 300, y: 300 }, { id: 3, x: 480, y: 110 }, { id: 4, x: 480, y: 300 }, { id: 5, x: 620, y: 200 }],
    edges: [[0,1,6],[0,2,7],[1,2,8],[1,3,5],[1,4,-4],[2,3,-3],[2,4,9],[3,1,-2],[4,5,7],[3,5,2]], source: 0 };
}
function gNegCycle() {
  return { nodes: [{ id: 0, x: 140, y: 200 }, { id: 1, x: 330, y: 110 }, { id: 2, x: 330, y: 300 }, { id: 3, x: 540, y: 200 }],
    edges: [[0,1,1],[1,2,-4],[2,3,2],[3,1,1],[2,1,2]], source: 0 };
}
function gLayered() {
  // wider layered graph so the DMMSY band/batch behaviour is visible
  return { nodes: [
      { id: 0, x: 90, y: 205 },
      { id: 1, x: 235, y: 110 }, { id: 2, x: 235, y: 205 }, { id: 3, x: 235, y: 300 },
      { id: 4, x: 400, y: 110 }, { id: 5, x: 400, y: 205 }, { id: 6, x: 400, y: 300 },
      { id: 7, x: 565, y: 150 }, { id: 8, x: 565, y: 260 }, { id: 9, x: 660, y: 205 }],
    edges: [[0,1,3],[0,2,2],[0,3,4],[1,4,3],[2,4,4],[2,5,3],[3,5,2],[3,6,5],[4,7,4],[5,7,3],[5,8,4],[6,8,2],[7,9,3],[8,9,3],[2,1,1],[6,5,1]], source: 0 };
}

const adjOf = (g) => { const a = {}; g.nodes.forEach((n) => (a[n.id] = [])); g.edges.forEach(([u, v, w]) => a[u].push([v, w])); return a; };

// ----------------------------- steppers -----------------------------
function runDijkstra(g) {
  const adj = adjOf(g), dist = {}, settled = new Set(), frames = [];
  g.nodes.forEach((n) => (dist[n.id] = Infinity)); dist[g.source] = 0;
  const live = () => [...new Set(g.edges.filter(([a]) => !settled.has(a) && dist[a] < Infinity).map(([a]) => a))];
  const snap = (note, edge, fr, picked) => frames.push({ dist: { ...dist }, settled: new Set(settled), frontier: new Set(fr), pivots: new Set(), note, edge: edge || null, picked: picked ?? null });
  snap(`Start at node ${g.source}; every other distance is ∞.`, null, [g.source]);
  const pick = () => { let b = null, bd = Infinity; for (const n of g.nodes) if (!settled.has(n.id) && dist[n.id] < bd) { bd = dist[n.id]; b = n.id; } return b; };
  let u;
  while ((u = pick()) !== null) {
    settled.add(u);
    snap(`Settle node ${u} (smallest tentative distance = ${dist[u]}). Its shortest path is now final.`, null, live(), u);
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; snap(`Relax ${u}→${v}: distance to ${v} = ${dist[v]}.`, [u, v], live(), u); }
  }
  snap("Done — every reachable node has its final shortest distance.", null, []);
  return frames;
}

function runJohnson(g) {
  const frames = [], n = g.nodes.length, h = {};
  g.nodes.forEach((nd) => (h[nd.id] = 0));
  const snap = (note, edge, danger) => frames.push({ dist: { ...h }, settled: new Set(), frontier: new Set(), pivots: new Set(), note, edge: edge || null, danger: !!danger, phase: 1 });
  snap("Phase 1 — Bellman-Ford from a virtual source (h = 0 everywhere) to find vertex potentials.", null);
  for (let pass = 0; pass < n; pass++) {
    let changed = false;
    for (const [u, v, w] of g.edges) if (h[u] + w < h[v]) { h[v] = h[u] + w; changed = true; snap(`Pass ${pass + 1}: relax ${u}→${v}, potential h(${v}) = ${h[v]}.`, [u, v]); }
    if (!changed) break;
  }
  let neg = false;
  for (const [u, v, w] of g.edges) if (h[u] + w < h[v]) { neg = true; break; }
  if (neg) { snap("A relaxation still improves after n−1 passes → a NEGATIVE CYCLE exists. Shortest paths are undefined.", null, true); return frames; }
  snap("Potentials stable. Reweight every edge to w′(u,v) = w + h(u) − h(v) ≥ 0, then run Dijkstra.", null);
  const adj = adjOf(g), dist = {}, settled = new Set();
  g.nodes.forEach((nd) => (dist[nd.id] = Infinity)); dist[g.source] = 0;
  const live = () => g.nodes.filter((x) => !settled.has(x.id) && dist[x.id] < Infinity).map((x) => x.id);
  const ds = (note, edge, picked) => frames.push({ dist: { ...dist }, settled: new Set(settled), frontier: new Set(live()), pivots: new Set(), note, edge: edge || null, phase: 2, picked: picked ?? null });
  ds(`Phase 2 — Dijkstra on the reweighted (now non-negative) graph from node ${g.source}.`, null);
  const pick = () => { let b = null, bd = Infinity; for (const nd of g.nodes) if (!settled.has(nd.id) && dist[nd.id] < bd) { bd = dist[nd.id]; b = nd.id; } return b; };
  let u;
  while ((u = pick()) !== null) {
    settled.add(u); ds(`Settle node ${u} (true distance ${dist[u]}).`, null, u);
    for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; ds(`Relax ${u}→${v}: distance to ${v} = ${dist[v]}.`, [u, v], u); }
  }
  ds("Done — negative edges handled correctly; no negative cycle present.", null);
  return frames;
}

function runDMMSY(g) {
  const adj = adjOf(g), dist = {}, settled = new Set(), frames = [];
  g.nodes.forEach((n) => (dist[n.id] = Infinity)); dist[g.source] = 0;
  const snap = (note, edge, fr, pv, band) => frames.push({ dist: { ...dist }, settled: new Set(settled), frontier: new Set(fr), pivots: new Set(pv || []), note, edge: edge || null, band: band || null });
  snap(`Start at ${g.source}. Idea: don't fully sort the frontier — work in distance "bands".`, null, [g.source], [], null);
  const span = Math.max(...g.edges.map(([,,w]) => w), 1);
  while (true) {
    const liveNodes = g.nodes.filter((n) => !settled.has(n.id) && dist[n.id] < Infinity).map((n) => n.id);
    if (liveNodes.length === 0) break;
    const minD = Math.min(...liveNodes.map((id) => dist[id]));
    const hi = minD + span * 0.6;
    const band = { lo: minD, hi };
    const inBand = liveNodes.filter((id) => dist[id] <= hi);
    snap(`Form a frontier band for distances ${minD}–${Math.round(hi)} (${inBand.length} node${inBand.length > 1 ? "s" : ""}) — no global sort needed.`, null, liveNodes, [], band);
    const pivots = [...inBand].sort((a, b) => dist[a] - dist[b]).slice(0, Math.max(1, Math.ceil(inBand.length / 2)));
    snap(`FindPivots → settle the ${pivots.length} pivot${pivots.length > 1 ? "s" : ""} of this band as a batch.`, null, liveNodes, pivots, band);
    for (const u of pivots) {
      settled.add(u);
      for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; snap(`Pivot ${u} relaxes ${u}→${v}: distance to ${v} = ${dist[v]}.`, [u, v], g.nodes.filter((n) => !settled.has(n.id) && dist[n.id] < Infinity).map((n) => n.id), pivots, band); }
    }
    snap("Band settled as a batch. Move to the next band.", null, g.nodes.filter((n) => !settled.has(n.id) && dist[n.id] < Infinity).map((n) => n.id), [], null);
  }
  snap("Done — same distances as Dijkstra, reached by settling bands instead of sorting.", null, [], [], null);
  return frames;
}

const ALGOS = {
  dijkstra: { name: "Dijkstra", year: "1959", color: C.green, bound: "O(m + n log n)", needsNonNeg: true, fn: runDijkstra,
    diff: "Settles one node at a time — always the global nearest. The price is keeping the whole frontier sorted." },
  johnson: { name: "Johnson", year: "1977", color: C.amber, bound: "O(mn)", needsNonNeg: false, fn: runJohnson,
    diff: "Two phases: Bellman-Ford potentials neutralize negative edges, then Dijkstra runs safely." },
  dmmsy: { name: "DMMSY-style", year: "2025", color: C.violet, bound: "O(m log^(2/3) n)", needsNonNeg: true, fn: runDMMSY,
    diff: "Skips the global sort — finds pivots and settles whole distance bands as a batch." },
};

// ============================================================================
//  GRAPH VIEW (interactive: click node = set source, click weight = edit)
// ============================================================================
function GraphView({ graph, frame, onPickSource, onPickEdge, selEdge }) {
  const dist = frame?.dist || {}, settled = frame?.settled || new Set(),
    frontier = frame?.frontier || new Set(), pivots = frame?.pivots || new Set(), active = frame?.edge;
  const src = graph.nodes.find((n) => n.id === graph.source);
  const fill = (id) => id === graph.source ? C.ink : pivots.has(id) ? C.violet : settled.has(id) ? C.green : frontier.has(id) ? C.live : "#fff";
  const txt = (id) => (id === graph.source || settled.has(id) || pivots.has(id)) ? "#fff" : C.ink;

  return (
    <svg viewBox="0 0 730 410" style={{ width: "100%", height: "auto", display: "block" }}>
      <defs>
        <marker id="ar" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3 L0,6 Z" fill={C.faint} /></marker>
        <marker id="arA" markerWidth="9" markerHeight="9" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3 L0,6 Z" fill={C.live} /></marker>
        <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><path d="M26 0 L0 0 0 26" fill="none" stroke="#e3e7ec" strokeWidth="1" /></pattern>
      </defs>
      <rect x="0" y="0" width="730" height="410" fill="url(#grid)" rx="10" />
      {src && [70, 130, 190, 250].map((r, i) => (
        <circle key={i} cx={src.x} cy={src.y} r={r} fill="none" stroke={C.live} strokeWidth="1" strokeDasharray="2 6" opacity={0.18} />
      ))}
      {graph.edges.map(([u, v, w], i) => {
        const a = graph.nodes.find((n) => n.id === u), b = graph.nodes.find((n) => n.id === v);
        if (!a || !b) return null;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, r = 20;
        const x1 = a.x + ux * r, y1 = a.y + uy * r, x2 = b.x - ux * (r + 4), y2 = b.y - uy * (r + 4);
        const isA = active && active[0] === u && active[1] === v;
        const sel = i === selEdge;
        const rev = graph.edges.some(([p, q]) => p === v && q === u), off = rev ? 9 : 0;
        const mx = (x1 + x2) / 2 - uy * off, my = (y1 + y2) / 2 + ux * off;
        return (
          <g key={i}>
            <path d={off ? `M${x1},${y1} Q${mx},${my} ${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`} fill="none"
              stroke={isA ? C.live : sel ? C.amber : w < 0 ? C.danger : "#c2c9d2"} strokeWidth={isA || sel ? 3.2 : 1.7} markerEnd={isA ? "url(#arA)" : "url(#ar)"} />
            {sel && <circle cx={mx} cy={my - 2} r="11" fill={C.pick} stroke={C.amber} strokeWidth="1.4" />}
            <text x={mx} y={my - 4} fontSize="12.5" fontFamily={mono} fontWeight="700" fill={w < 0 ? C.danger : sel ? C.amber : C.faint}
              textAnchor="middle" style={{ paintOrder: "stroke", stroke: sel ? C.pick : "#eceef2", strokeWidth: 4 }}>{w}</text>
            <circle cx={mx} cy={my - 2} r="13" fill="transparent" style={{ cursor: "pointer" }} onClick={() => onPickEdge && onPickEdge(i)}>
              <title>Click to edit weight of edge {u}→{v}</title>
            </circle>
          </g>
        );
      })}
      {graph.nodes.map((nd) => {
        const d = dist[nd.id], label = d === undefined || d === Infinity ? "∞" : d;
        return (
          <g key={nd.id} style={{ cursor: "pointer" }} onClick={() => onPickSource && onPickSource(nd.id)}>
            <circle cx={nd.x} cy={nd.y} r="20" fill={fill(nd.id)} stroke={C.ink} strokeWidth="1.7" />
            <text x={nd.x} y={nd.y + 5} fontSize="15" fontFamily={sans} fontWeight="700" fill={txt(nd.id)} textAnchor="middle">{nd.id}</text>
            <text x={nd.x} y={nd.y - 28} fontSize="13" fontFamily={mono} fontWeight="700" fill={C.ink} textAnchor="middle"
              style={{ paintOrder: "stroke", stroke: "#eceef2", strokeWidth: 4.5 }}>{label}</text>
            <title>Click to set node {nd.id} as the source</title>
          </g>
        );
      })}
    </svg>
  );
}

function Legend() {
  const item = (c, l) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: sans, fontSize: 11.5, color: C.faint }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: c, border: `1px solid ${C.ink}` }} />{l}</span>
  );
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {item(C.ink, "source")}{item(C.green, "settled")}{item(C.live, "frontier")}{item(C.violet, "pivot / band")}{item(C.danger, "negative edge")}
    </div>
  );
}

// ----------------------------- per-algorithm inspector -----------------------------
function Inspector({ algo, frame, graph }) {
  const card = { background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 10, padding: "10px 12px" };
  const cap = { fontFamily: sans, fontSize: 11.5, color: C.faint, margin: "6px 0 0", lineHeight: 1.45 };
  const chip = (label, bg, fg, ring) => (
    <span style={{ fontFamily: mono, fontSize: 12, padding: "3px 7px", borderRadius: 6, background: bg, color: fg || C.ink, border: `1px solid ${ring || C.line}` }}>{label}</span>
  );
  const settled = frame?.settled || new Set();
  const dist = frame?.dist || {};
  const queue = graph.nodes.filter((n) => !settled.has(n.id) && (dist[n.id] ?? Infinity) < Infinity)
    .map((n) => ({ id: n.id, d: dist[n.id] })).sort((a, b) => a.d - b.d);

  if (!frame) return <div style={card}><Eyebrow>Inspector</Eyebrow><p style={cap}>Press Run to see how this algorithm differs.</p></div>;

  if (algo === "dijkstra") {
    return (
      <div style={card}>
        <Eyebrow color={C.green}>Priority queue · sorted by distance</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {queue.length === 0 ? <span style={cap}>Queue empty — all reachable nodes settled.</span> :
            queue.map((q, idx) => chip(`${q.id}:${q.d}`, idx === 0 ? "#e3f3ec" : "#fff", idx === 0 ? C.green : C.ink, idx === 0 ? C.green : C.line))}
        </div>
        <p style={cap}>Dijkstra pops the smallest (highlighted) each step — keeping this list ordered is exactly the sorting cost the 2025 result removes.</p>
      </div>
    );
  }
  if (algo === "johnson") {
    if (frame.phase === 1) {
      return (
        <div style={card}>
          <Eyebrow color={C.amber}>Phase 1 · vertex potentials h(v)</Eyebrow>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {graph.nodes.map((n) => chip(`h(${n.id})=${dist[n.id] === Infinity ? "∞" : dist[n.id]}`, "#fff", C.ink))}
          </div>
          <p style={cap}>Bellman-Ford from a virtual source. These potentials reweight every edge to be ≥ 0 without changing which path is shortest.</p>
        </div>
      );
    }
    return (
      <div style={card}>
        <Eyebrow color={C.amber}>Phase 2 · Dijkstra on the reweighted graph</Eyebrow>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {queue.length === 0 ? <span style={cap}>Queue empty — done.</span> :
            queue.map((q, idx) => chip(`${q.id}:${q.d}`, idx === 0 ? "#fbeedd" : "#fff", idx === 0 ? C.amber : C.ink, idx === 0 ? C.amber : C.line))}
        </div>
        <p style={cap}>All edges are now non-negative, so plain Dijkstra is safe — the negatives were handled in Phase 1.</p>
      </div>
    );
  }
  // dmmsy
  const band = frame.band;
  const pivots = frame.pivots || new Set();
  const allD = graph.nodes.map((n) => dist[n.id]).filter((d) => d != null && d !== Infinity);
  const maxD = Math.max(1, ...allD);
  return (
    <div style={card}>
      <Eyebrow color={C.violet}>Distance band</Eyebrow>
      <div style={{ position: "relative", height: 16, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 5, marginTop: 8, overflow: "hidden" }}>
        {band && <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(band.lo / maxD) * 100}%`, width: `${Math.max(4, ((band.hi - band.lo) / maxD) * 100)}%`, background: "#efe6f6", borderLeft: `2px solid ${C.violet}`, borderRight: `2px solid ${C.violet}` }} />}
        {graph.nodes.map((n) => { const d = dist[n.id]; if (d == null || d === Infinity) return null;
          return <span key={n.id} style={{ position: "absolute", top: 3, left: `calc(${(d / maxD) * 100}% - 4px)`, width: 8, height: 8, borderRadius: 99, background: pivots.has(n.id) ? C.violet : settled.has(n.id) ? C.green : C.faint }} />; })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {band ? <span style={{ fontFamily: mono, fontSize: 12, color: C.violet }}>band [{band.lo}–{Math.round(band.hi)}]</span> : <span style={cap}>between bands…</span>}
        {[...pivots].length > 0 && <span style={{ fontFamily: mono, fontSize: 12, color: C.ink }}>pivots: {[...pivots].join(", ")}</span>}
      </div>
      <p style={cap}>Nodes in the violet band are settled together as a batch — never sorted against each other.</p>
    </div>
  );
}

// ============================================================================
//  LAB
// ============================================================================
function Lab() {
  const [graph, setGraph] = useState(gNonNeg);
  const [algo, setAlgo] = useState("dijkstra");
  const [frames, setFrames] = useState([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selEdge, setSelEdge] = useState(null);
  const timer = useRef(null);

  const compute = (g, a) => { const fr = ALGOS[a].fn(g); setFrames(fr); setStep(0); setPlaying(false); };
  useEffect(() => { compute(graph, algo); /* eslint-disable-next-line */ }, []);
  useEffect(() => {
    if (!playing) return;
    if (step >= frames.length - 1) { setPlaying(false); return; }
    timer.current = setTimeout(() => setStep((s) => Math.min(s + 1, frames.length - 1)), 850);
    return () => clearTimeout(timer.current);
  }, [playing, step, frames.length]);

  const frame = frames[step] || null;
  const negPresent = graph.edges.some(([,,w]) => w < 0);
  const a = ALGOS[algo];

  const load = (gf) => { const ng = gf(); setSelEdge(null); setGraph(ng); compute(ng, algo); };
  const run = () => { compute(graph, algo); setTimeout(() => setPlaying(true), 40); };
  const setSource = (id) => { const ng = { ...graph, source: id }; setGraph(ng); compute(ng, algo); };
  const editWeight = (mut) => {
    if (selEdge == null) return;
    const e = graph.edges[selEdge]; const nw = mut(e[2]);
    const edges = graph.edges.map((x, i) => i === selEdge ? [x[0], x[1], nw] : x);
    const ng = { ...graph, edges }; setGraph(ng); compute(ng, algo);
  };

  const tab = (active, color) => ({ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${active ? C.ink : C.line}`, background: active ? color : "#fff", color: active ? "#fff" : C.ink, fontWeight: 600, fontSize: 13, fontFamily: sans, cursor: "pointer", transition: "all .15s" });
  const sbtn = { padding: "7px 11px", borderRadius: 8, border: `1px solid ${C.line}`, background: "#fff", color: C.ink, fontWeight: 600, fontSize: 12.5, fontFamily: sans, cursor: "pointer" };
  const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: 14 };
  const selData = selEdge != null ? graph.edges[selEdge] : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", gap: 16 }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <Eyebrow>Interactive graph</Eyebrow>
          <span style={{ fontFamily: sans, fontSize: 11.5, color: C.faint }}>click a node = source · click a weight = edit</span>
        </div>
        <GraphView graph={graph} frame={frame} onPickSource={setSource} onPickEdge={setSelEdge} selEdge={selEdge} />
        <div style={{ marginTop: 8 }}><Legend /></div>

        {/* edit strip */}
        <div style={{ marginTop: 10, minHeight: 36, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: selData ? C.pick : C.surfaceAlt, border: `1px solid ${selData ? C.amber : C.line}`, borderRadius: 8, padding: "7px 10px" }}>
          {selData ? (
            <>
              <span style={{ fontFamily: sans, fontSize: 12.5, fontWeight: 600, color: C.ink }}>Edge {selData[0]}→{selData[1]}, weight</span>
              <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 700, color: selData[2] < 0 ? C.danger : C.ink, minWidth: 26, textAlign: "center" }}>{selData[2]}</span>
              <button style={sbtn} onClick={() => editWeight((w) => w - 1)}>−1</button>
              <button style={sbtn} onClick={() => editWeight((w) => w + 1)}>+1</button>
              <button style={sbtn} onClick={() => editWeight((w) => -w)}>flip sign</button>
              <button style={{ ...sbtn, marginLeft: "auto" }} onClick={() => setSelEdge(null)}>done</button>
            </>
          ) : (
            <span style={{ fontFamily: sans, fontSize: 12, color: C.faint }}>Tip: click any edge weight to change it — make one negative and watch Dijkstra go wrong, then try Johnson.</span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button style={sbtn} onClick={() => load(gNonNeg)}>Non-negative</button>
          <button style={sbtn} onClick={() => load(gNegNoCycle)}>Negative (no cycle)</button>
          <button style={sbtn} onClick={() => load(gNegCycle)}>Negative cycle</button>
          <button style={sbtn} onClick={() => load(gLayered)}>Layered (10 nodes)</button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={card}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {Object.entries(ALGOS).map(([k, al]) => (
              <button key={k} onClick={() => { setAlgo(k); compute(graph, k); }} style={tab(algo === k, al.color)}>{al.name}</button>
            ))}
          </div>
          <div style={{ fontFamily: sans, fontSize: 12.5, color: C.faint, marginBottom: 8 }}>
            <strong style={{ color: a.color }}>{a.name} · {a.year}</strong>{"  "}<K color={C.faint}>{a.bound}</K>
          </div>
          <p style={{ fontFamily: serif, fontSize: 13.5, lineHeight: 1.5, color: "#2a323c", margin: "0 0 10px" }}>{a.diff}</p>
          {a.needsNonNeg && negPresent && (
            <div style={{ background: "#fbeee6", border: `1px solid ${C.amber}`, color: "#8a4f12", padding: "8px 10px", borderRadius: 8, fontSize: 12.5, fontFamily: sans, marginBottom: 10 }}>
              This graph has negative edges. {a.name} assumes weights ≥ 0, so its result may be wrong — switch to Johnson to handle them correctly.
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={{ ...sbtn, background: C.live, color: "#fff", border: `1px solid ${C.ink}` }} onClick={run}>▶ Run</button>
            <button style={sbtn} onClick={() => setPlaying((p) => !p)} disabled={!frames.length}>{playing ? "⏸ Pause" : "⏵ Play"}</button>
            <button style={sbtn} onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }}>‹ Prev</button>
            <button style={sbtn} onClick={() => { setPlaying(false); setStep((s) => Math.min(frames.length - 1, s + 1)); }}>Next ›</button>
            <button style={sbtn} onClick={() => { setStep(0); setPlaying(false); }}>↺ Reset</button>
          </div>
          <input type="range" min={0} max={Math.max(0, frames.length - 1)} value={step}
            onChange={(e) => { setPlaying(false); setStep(+e.target.value); }} style={{ width: "100%", marginTop: 12, accentColor: a.color }} />
          <div style={{ fontFamily: sans, fontSize: 12, color: C.faint }}>Step {frames.length ? step + 1 : 0} / {frames.length}</div>
        </div>

        <div style={{ ...card, minHeight: 88 }}>
          <Eyebrow>What's happening</Eyebrow>
          <p style={{ margin: "8px 0 0", fontFamily: serif, fontSize: 15, lineHeight: 1.5, color: frame?.danger ? C.danger : C.ink, fontWeight: frame?.danger ? 700 : 400 }}>
            {frame ? frame.note : "Press Run to step through the algorithm."}
          </p>
        </div>

        <Inspector algo={algo} frame={frame} graph={graph} />
      </div>
    </div>
  );
}

// ============================================================================
//  STORY
// ============================================================================
function Story() {
  const card = { background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px", marginBottom: 12 };
  const led = (track, year, title) => {
    const tk = TRACK[track];
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 700, color: "#fff", background: tk.c, padding: "2px 8px", borderRadius: 5 }}>{year}</span>
        <strong style={{ fontFamily: serif, fontSize: 17, color: C.ink }}>{title}</strong>
      </div>
    );
  };
  const p = { margin: 0, fontFamily: serif, fontSize: 14.8, lineHeight: 1.62, color: "#2a323c" };

  return (
    <div>
      <p style={{ ...p, marginBottom: 14, fontSize: 15.5 }}>
        For 66 years, the running time of Dijkstra's algorithm — <K>O(m + n log n)</K> — was treated as the natural speed limit for shortest paths on sparse graphs.
        That <K>log n</K> factor is the price of keeping the frontier <em>sorted</em>: the "sorting barrier." Between 2022 and 2026 a wave of results broke that barrier and the
        related barriers for negative weights. The work splits cleanly into three tracks, by what edge weights are allowed.
      </p>

      <div style={{ ...card, borderLeft: `4px solid ${C.green}` }}>
        <TrackTag track="nonneg" />
        <h3 style={{ fontFamily: serif, fontSize: 19, margin: "8px 0 12px" }}>Beating Dijkstra on non-negative graphs</h3>
        {led("nonneg", "1959", "Dijkstra — the baseline")}
        <p style={p}>Grows a set of "settled" nodes outward from the source, always settling the nearest unsettled node next. With a Fibonacci heap it runs in <K>O(m + n log n)</K>. Every step extracts the global minimum — effectively sorting nodes by distance — and it requires all weights ≥ 0.</p>
        <div style={{ height: 10 }} />
        {led("nonneg", "2025", "DMMSY — breaking the sorting barrier")}
        <p style={p}>Duan, Mao, Mao, Shu and Yin gave a deterministic <K>O(m log^(2/3) n)</K> algorithm (STOC 2025), the first to beat Dijkstra on sparse directed graphs. Instead of fully ordering the frontier, their BMSSP procedure works in distance "bands": a short Bellman-Ford-style scout (FindPivots) finds a few influential "pivot" nodes, the graph is split into distance-bounded sub-problems, and batches of vertices are settled at once — no global sort. (This is the idea the Lab's third algorithm illustrates.)</p>
        <div style={{ height: 10 }} />
        {led("nonneg", "2026", "Even faster")}
        <p style={p}>Duan, Mao, Shu and Yin followed up with <K>O(m √(log n) + √(mn log n log log n))</K>, simplifying to <K>O(m √(log n log log n))</K> on sparse graphs — tightening the 2025 bound further.</p>
      </div>

      <div style={{ ...card, borderLeft: `4px solid ${C.amber}` }}>
        <TrackTag track="intneg" />
        <h3 style={{ fontFamily: serif, fontSize: 19, margin: "8px 0 12px" }}>Negative integer weights</h3>
        {led("intneg", "1977", "Johnson — the bridge")}
        <p style={p}>Negative weights break Dijkstra's greedy assumption; the classic fallback, Bellman-Ford, costs <K>O(mn)</K>. Johnson's trick computes a vertex "potential" h(v), reweights every edge to w′(u,v) = w + h(u) − h(v) ≥ 0, and then runs Dijkstra. Computing those potentials faster than <K>O(mn)</K> is what every modern result below is really about.</p>
        <div style={{ height: 10 }} />
        {led("intneg", "2022", "Near-linear for integers")}
        <p style={p}>Bernstein, Nanongkai and Wulff-Nilsen reached randomized <K>O(m log⁸(n) log W)</K> (FOCS 2022) by combining bit-scaling with low-diameter decomposition (LDD) — the first near-linear, purely combinatorial algorithm for negative integer weights.</p>
        <div style={{ height: 10 }} />
        {led("intneg", "2023", "Now faster")}
        <p style={p}>Bringmann, Cassis and Fischer optimised the framework to <K>O(m log²(n) log(nW) log log n)</K> (FOCS 2023) — about six log-factors shaved — using a "noisy binary search" with drift analysis to detect when a scaling shift creates a negative cycle.</p>
        <div style={{ height: 10 }} />
        {led("intneg", "2026", "First deterministic near-linear")}
        <p style={p}>Jason Li removed the randomness entirely (STOC 2026): a deterministic padded decomposition replaces the probabilistic LDD, giving the first deterministic near-linear algorithm for negative integer weights.</p>
      </div>

      <div style={{ ...card, borderLeft: `4px solid ${C.violet}` }}>
        <TrackTag track="realneg" />
        <h3 style={{ fontFamily: serif, fontSize: 19, margin: "8px 0 12px" }}>Negative real weights — the hardest case</h3>
        <p style={{ ...p, marginBottom: 10 }}>Bit-scaling needs integers, so real weights stayed at Bellman-Ford's <K>O(mn)</K> for 66 years — until a structural idea broke it, then a rapid cascade of refinements.</p>
        {led("realneg", "2024", "Fineman — hop reduction")}
        <p style={p}>Fineman reached randomized <K>Õ(mn^(8/9))</K> (STOC 2024) — the first improvement on <K>O(mn)</K>. He samples "negative sandwiches" of negative vertices, uses betweenness reduction to make them "r-remote," and inserts shortcut edges to compress long negative paths.</p>
        <div style={{ height: 10 }} />
        {led("realneg", "2025–26", "The cascade")}
        <p style={p}>Huang, Jin and Quanrud improved it to <K>Õ(mn^(4/5))</K> (SODA 2025, "proper" hop walks) and then <K>Õ(mn^(3/4) + m^(4/5)n)</K> (SODA 2026, bootstrapping hop reducers). Quanrud and Tajkhorshid recast hop reducers as sparsifiers, reaching <K>O(mn^0.7193)</K> for denser graphs (m ≥ n^1.03456).</p>
        <div style={{ height: 10 }} />
        {led("realneg", "2026", "Toward optimal for dense graphs")}
        <p style={p}>Li, Li, Rao and Zhang's shortcutting reached <K>Õ(n^2.5)</K>; then two independent groups hit <K>n^(2+o(1))</K> — Li, Li and Zhang by refining the shortcutting, and Khanna and Song via a compression technique using auxiliary Steiner vertices. That is essentially optimal for dense graphs, where m = Θ(n²). (These remain randomized, theoretical milestones.)</p>
      </div>

      <div style={{ ...card, background: C.surfaceAlt }}>
        <Eyebrow color={C.ink}>The thread that ties it together</Eyebrow>
        <p style={{ ...p, marginTop: 8 }}>Every negative-weight result above — from 1977 to 2026 — still relies on Johnson's price functions to make edges non-negative. The breakthroughs don't replace Johnson; they compute his potentials far more cleverly. And a practical caveat worth stating in any talk: only Dijkstra and Johnson are used in production. The 2022–2026 results carry large constant factors and are, for now, theoretical milestones — classical binary-heap Dijkstra is still faster on real graphs.</p>
      </div>

      <ComparisonTable />

      <div style={{ ...card, marginBottom: 0, marginTop: 12 }}>
        <Eyebrow color={C.ink}>Sources</Eyebrow>
        <p style={{ fontFamily: sans, fontSize: 12, color: C.faint, lineHeight: 1.6, margin: "8px 0 0" }}>
          Johnson (JACM 1977, 24(1):1–13, doi:10.1145/321992.321993); Duan–Mao–Mao–Shu–Yin (STOC 2025, arXiv:2504.17033); Duan–Mao–Shu–Yin (2026, arXiv:2602.07868);
          Bernstein–Nanongkai–Wulff-Nilsen (FOCS 2022, arXiv:2203.03456); Bringmann–Cassis–Fischer (FOCS 2023, arXiv:2304.05279); J. Li (STOC 2026, arXiv:2511.07859);
          Fineman (STOC 2024, arXiv:2311.02520); Huang–Jin–Quanrud (SODA 2025, arXiv:2407.04872; SODA 2026, arXiv:2506.00428); Quanrud–Tajkhorshid (arXiv:2511.18253);
          Li–Li–Rao–Zhang (arXiv:2511.12714); Li–Li–Zhang (arXiv:2602.16153); Khanna–Song (arXiv:2602.16638).
        </p>
      </div>
    </div>
  );
}

// ----------------------------- comparison table -----------------------------
const TABLE = [
  ["Dijkstra", "1959", "nonneg", "O(m + n log n)", "Det.", "Practical"],
  ["Johnson", "1977", "realneg", "O(mn)", "Det.", "Practical"],
  ["Duan–Mao–Mao–Shu–Yin", "STOC 2025", "nonneg", "O(m log^(2/3) n)", "Det.", "Theory"],
  ["Duan–Mao–Shu–Yin", "2026", "nonneg", "O(m√(log n)+√(mn log n log log n))", "Det.", "Theory"],
  ["Bernstein–Nanongkai–W-N", "FOCS 2022", "intneg", "O(m log⁸ n log W)", "Rand.", "Theory"],
  ["Bringmann–Cassis–Fischer", "FOCS 2023", "intneg", "O(m log² n log(nW) log log n)", "Rand.", "Theory"],
  ["Jason Li", "STOC 2026", "intneg", "near-linear time", "Det.", "Theory"],
  ["Fineman", "STOC 2024", "realneg", "Õ(mn^(8/9))", "Rand.", "Theory"],
  ["Huang–Jin–Quanrud", "SODA 2025", "realneg", "Õ(mn^(4/5))", "Rand.", "Theory"],
  ["Huang–Jin–Quanrud", "SODA 2026", "realneg", "Õ(mn^(3/4)+m^(4/5)n)", "Rand.", "Theory"],
  ["Quanrud–Tajkhorshid", "2025", "realneg", "O(mn^0.7193) / O((mn)^0.8620)", "Rand.", "Theory"],
  ["Li–Li–Rao–Zhang", "STOC 2026", "realneg", "Õ(n^2.5)", "Rand.", "Theory"],
  ["Li–Li–Zhang", "2026", "realneg", "n^(2+o(1))", "Rand.", "Theory"],
  ["Khanna–Song", "2026", "realneg", "n^(2+o(1))", "Rand.", "Theory"],
];
function ComparisonTable({ dark }) {
  const bg = dark ? D.panel : C.surface, line = dark ? D.line : C.line, ink = dark ? D.text : C.ink, faint = dark ? D.faint : C.faint;
  const th = { textAlign: "left", padding: "7px 9px", fontFamily: sans, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: faint, fontWeight: 700, borderBottom: `2px solid ${line}` };
  const td = { padding: "6px 9px", fontFamily: sans, fontSize: 12.5, color: ink, borderBottom: `1px solid ${line}`, verticalAlign: "top" };
  return (
    <div style={{ background: bg, border: `1px solid ${line}`, borderRadius: 12, padding: 14, overflowX: "auto", marginTop: 12 }}>
      <Eyebrow color={dark ? D.text : C.ink}>The landscape at a glance</Eyebrow>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 620, marginTop: 10 }}>
        <thead><tr><th style={th}>Authors</th><th style={th}>Venue</th><th style={th}>Weights</th><th style={th}>Time</th><th style={th}>D/R</th><th style={th}>Use</th></tr></thead>
        <tbody>
          {TABLE.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, fontWeight: 600 }}>{r[0]}</td>
              <td style={{ ...td, color: faint }}>{r[1]}</td>
              <td style={td}><span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: TRACK[r[2]].c, marginRight: 5, verticalAlign: "middle" }} /></td>
              <td style={{ ...td, fontFamily: mono, fontSize: 11.5 }}>{r[3]}</td>
              <td style={{ ...td, color: faint }}>{r[4]}</td>
              <td style={{ ...td, color: r[5] === "Practical" ? C.green : faint, fontWeight: r[5] === "Practical" ? 700 : 400 }}>{r[5]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
        <TrackTag track="nonneg" /><TrackTag track="intneg" /><TrackTag track="realneg" />
      </div>
    </div>
  );
}

// ============================================================================
//  SLIDES  (container-query units so text scales to the slide, not the window)
// ============================================================================
function Slides() {
  const slides = buildSlides();
  const [i, setI] = useState(0);
  const go = (d) => setI((x) => Math.max(0, Math.min(slides.length - 1, x + d)));
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slides.length]);

  return (
    <div>
      <div style={{ position: "relative", background: D.bg, borderRadius: 14, border: `1px solid ${D.line}`, aspectRatio: "16 / 9", overflow: "hidden", color: D.text, containerType: "inline-size" }}>
        {slides[i]}
        <div style={{ position: "absolute", bottom: "2.6cqw", left: "3.4cqw", fontFamily: mono, fontSize: "clamp(10px,1.4cqw,13px)", color: D.faint }}>
          {String(i + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, gap: 12 }}>
        <button onClick={() => go(-1)} disabled={i === 0} style={navBtn(i === 0)}>‹ Back</button>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {slides.map((_, k) => (
            <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} style={{ width: 8, height: 8, borderRadius: 99, border: "none", cursor: "pointer", padding: 0, background: k === i ? C.live : C.line }} />
          ))}
        </div>
        <button onClick={() => go(1)} disabled={i === slides.length - 1} style={navBtn(i === slides.length - 1)}>Next ›</button>
      </div>
      <p style={{ fontFamily: sans, fontSize: 12, color: C.faint, textAlign: "center", marginTop: 8 }}>Use ← → arrow keys to navigate.</p>
    </div>
  );
}
const navBtn = (disabled) => ({ padding: "9px 16px", borderRadius: 9, border: `1px solid ${C.line}`, background: disabled ? C.surfaceAlt : "#fff", color: disabled ? C.faint : C.ink, fontFamily: sans, fontWeight: 600, fontSize: 13, cursor: disabled ? "default" : "pointer" });

function SlideFrame({ children, accent }) {
  return (
    <div style={{ position: "absolute", inset: 0, padding: "clamp(20px,4.5%,52px)", display: "flex", flexDirection: "column" }}>
      {accent && <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: 4, background: accent }} />}
      {children}
    </div>
  );
}
const sEye = (color) => ({ fontFamily: sans, fontSize: "clamp(9px,1.45cqw,13px)", letterSpacing: 3, textTransform: "uppercase", color: color || D.faint, fontWeight: 700, marginBottom: "1.6cqw" });
const sH = { fontFamily: serif, fontSize: "clamp(18px,4.2cqw,38px)", lineHeight: 1.12, margin: 0, color: D.text, fontWeight: 700 };
const sBody = { fontFamily: serif, fontSize: "clamp(11px,2.15cqw,19px)", lineHeight: 1.5, color: "#d6deea", margin: 0 };
const sK = (color) => ({ fontFamily: mono, fontSize: "0.92em", color: color || D.live, whiteSpace: "nowrap" });

function buildSlides() {
  const map = { nonneg: D.green, intneg: AMBER_D, realneg: D.violet };
  const dTag = (track) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: sans, fontSize: "clamp(11px,1.5cqw,15px)", fontWeight: 600, color: map[track] }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: map[track] }} />{TRACK[track].label}
    </span>
  );
  const Bul = ({ items, color }) => (
    <ul style={{ margin: "2.4cqw 0 0", paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "1.8cqw" }}>
      {items.map((it, k) => (
        <li key={k} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
          <span style={{ flexShrink: 0, width: 7, height: 7, borderRadius: 99, background: color || C.live, transform: "translateY(-2px)" }} />
          <span style={sBody}>{it}</span>
        </li>
      ))}
    </ul>
  );

  return [
    // 1 — Title
    <SlideFrame key="t">
      <svg viewBox="0 0 400 225" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5 }}>
        {[30, 60, 92, 126, 162, 200].map((r, k) => (
          <circle key={k} cx={66} cy={150} r={r} fill="none" stroke={D.live} strokeWidth="0.6" strokeDasharray="1 5" opacity={0.5 - k * 0.05} />
        ))}
      </svg>
      <div style={{ position: "relative", margin: "auto 0" }}>
        <div style={sEye(D.live)}>Single-source shortest paths · 2022–2026</div>
        <h1 style={{ ...sH, fontSize: "clamp(22px,5.4cqw,54px)", maxWidth: "16em" }}>From Dijkstra to the<br />sorting-barrier break</h1>
        <p style={{ ...sBody, marginTop: "2.6cqw", maxWidth: "30em", color: D.faint }}>
          How a 66-year-old speed limit fell — and the cascade of results that followed for negative-weight graphs.
        </p>
        <div style={{ display: "flex", gap: 18, marginTop: "3.2cqw", flexWrap: "wrap" }}>{dTag("nonneg")}{dTag("intneg")}{dTag("realneg")}</div>
        <div style={{ marginTop: "3.4cqw", fontFamily: sans, fontSize: "clamp(11px,1.6cqw,16px)", color: D.text }}>
          <strong>Cornelia Ärlerud</strong> <span style={{ color: D.faint }}>· National Enterprises AB — internship · GenAI literacy task</span>
        </div>
      </div>
    </SlideFrame>,

    // 2 — The problem
    <SlideFrame key="prob" accent={D.live}>
      <div style={sEye()}>The problem</div>
      <h2 style={sH}>Shortest paths, and the "sorting barrier"</h2>
      <div style={{ marginTop: "3.2cqw", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4%", alignItems: "start" }}>
        <p style={sBody}>Given a directed graph and a source <K>s</K>, find the shortest distance from <K>s</K> to every vertex. Dijkstra solves it in <span style={sK()}>O(m + n log n)</span>.</p>
        <p style={sBody}>That <span style={sK()}>log n</span> is the cost of keeping the frontier sorted. Sorting <K>n</K> items needs <span style={sK()}>Ω(n log n)</span> — so this looked like a natural floor for sparse graphs.</p>
      </div>
      <p style={{ ...sBody, marginTop: "3.2cqw", color: D.faint, fontStyle: "italic" }}>The question for 60+ years: do we really have to sort?</p>
    </SlideFrame>,

    // 3 — classical baseline
    <SlideFrame key="base" accent={D.green}>
      <div style={sEye()}>The classical baseline</div>
      <h2 style={sH}>Three ideas that held for decades</h2>
      <div style={{ marginTop: "3.2cqw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3%" }}>
        {[
          ["Dijkstra · 1959", "O(m + n log n)", "Greedy: settle the nearest node, relax its edges. Needs weights ≥ 0.", D.green],
          ["Bellman-Ford · 1958", "O(mn)", "Relax all edges n−1 times. Handles negatives, but quadratic.", AMBER_D],
          ["Johnson · 1977", "O(mn)", "Reweight w′ = w + h(u) − h(v) ≥ 0, then Dijkstra. The bridge.", AMBER_D],
        ].map((c, k) => (
          <div key={k} style={{ background: D.panel, border: `1px solid ${D.line}`, borderRadius: 12, padding: "2.6cqw 1.6cqw" }}>
            <div style={{ fontFamily: sans, fontWeight: 700, fontSize: "clamp(12px,1.8cqw,16px)", color: c[3] }}>{c[0]}</div>
            <div style={{ ...sK(c[3]), display: "block", margin: "1.1cqw 0 1.5cqw", fontSize: "clamp(11px,1.7cqw,16px)" }}>{c[1]}</div>
            <div style={{ ...sBody, fontSize: "clamp(11px,1.75cqw,16px)" }}>{c[2]}</div>
          </div>
        ))}
      </div>
    </SlideFrame>,

    // 4 — 2025 breakthrough
    <SlideFrame key="dmmsy" accent={D.green}>
      <div style={{ marginBottom: "1.6cqw" }}>{dTag("nonneg")}</div>
      <h2 style={sH}>2025: the barrier breaks</h2>
      <p style={{ ...sBody, marginTop: "2.2cqw" }}>
        Duan, Mao, Mao, Shu and Yin — <strong style={{ color: D.text }}>"Breaking the Sorting Barrier"</strong> (STOC 2025) — give a deterministic
        <span style={sK(D.green)}>  O(m log^(2/3) n)</span> algorithm. The first proof that Dijkstra is <em>not</em> optimal for shortest paths on sparse graphs.
      </p>
      <Bul color={D.green} items={[
        <>Key realisation: most uses only need the distances, not the exact <em>order</em> vertices are visited in.</>,
        <>So skip the global sort — process the frontier in distance "bands" instead of one perfectly ordered queue.</>,
        <>Best Paper at STOC 2025; the Lab's third algorithm shows this band/pivot idea in action.</>,
      ]} />
    </SlideFrame>,

    // 5 — how BMSSP works
    <SlideFrame key="bmssp" accent={D.green}>
      <div style={sEye()}>How it works · BMSSP</div>
      <h2 style={sH}>Pivots instead of sorting</h2>
      <div style={{ marginTop: "2.8cqw", display: "flex", flexDirection: "column", gap: "2cqw" }}>
        {[
          ["Band the frontier", "Look only at vertices within a distance window of the current minimum — no total order required."],
          ["Find pivots", "A few shallow Bellman-Ford rounds reveal a small set of \"pivot\" nodes that every long path must pass through."],
          ["Settle in batches", "Split into distance-bounded sub-problems and settle whole groups at once, then recurse."],
        ].map((s, k) => (
          <div key={k} style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
            <span style={{ fontFamily: mono, fontSize: "clamp(14px,2.4cqw,22px)", color: D.green, fontWeight: 700, flexShrink: 0 }}>{k + 1}</span>
            <div><strong style={{ fontFamily: sans, color: D.text, fontSize: "clamp(13px,2cqw,18px)" }}>{s[0]}</strong>
              <div style={{ ...sBody, marginTop: "0.6cqw", fontSize: "clamp(11px,1.8cqw,16px)" }}>{s[1]}</div></div>
          </div>
        ))}
      </div>
      <p style={{ ...sBody, marginTop: "2.6cqw", color: D.faint, fontStyle: "italic" }}>Same distances as Dijkstra — reached without ever sorting the frontier.</p>
    </SlideFrame>,

    // 6 — 2026 faster
    <SlideFrame key="2026" accent={D.green}>
      <div style={{ marginBottom: "1.6cqw" }}>{dTag("nonneg")}</div>
      <h2 style={sH}>2026: faster still</h2>
      <p style={{ ...sBody, marginTop: "2.6cqw", maxWidth: "26em" }}>Duan, Mao, Shu and Yin push the bound to</p>
      <div style={{ fontFamily: mono, fontSize: "clamp(15px,3cqw,30px)", color: D.green, margin: "2.6cqw 0", fontWeight: 600 }}>
        O(m √(log n) + √(mn log n log log n))
      </div>
      <p style={sBody}>which simplifies to <span style={sK(D.green)}>O(m √(log n log log n))</span> on sparse graphs — a clean improvement on the 2025 result, still deterministic.</p>
    </SlideFrame>,

    // 7 — three tracks
    <SlideFrame key="tracks" accent={D.live}>
      <div style={sEye()}>The shape of the field</div>
      <h2 style={sH}>One problem, three tracks</h2>
      <p style={{ ...sBody, marginTop: "2.2cqw" }}>What's hard depends entirely on which edge weights you allow:</p>
      <div style={{ marginTop: "2.8cqw", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3%" }}>
        {[
          ["nonneg", "Non-negative", "Dijkstra's turf. The 2025/26 sorting-barrier results live here."],
          ["intneg", "Integer negative", "Johnson + bit-scaling. Near-linear since 2022; deterministic in 2026."],
          ["realneg", "Real negative", "The hardest. Stuck at O(mn) for 66 years, then broken in 2024."],
        ].map((c, k) => (
          <div key={k} style={{ background: D.panel, border: `1px solid ${map[c[0]]}55`, borderRadius: 12, padding: "2.6cqw 1.6cqw", borderTop: `3px solid ${map[c[0]]}` }}>
            <div style={{ fontFamily: sans, fontWeight: 700, color: map[c[0]], fontSize: "clamp(13px,2cqw,18px)" }}>{c[1]}</div>
            <div style={{ ...sBody, marginTop: "1.4cqw", fontSize: "clamp(11px,1.75cqw,16px)" }}>{c[2]}</div>
          </div>
        ))}
      </div>
    </SlideFrame>,

    // 8 — Track A integer
    <SlideFrame key="trackA" accent={AMBER_D}>
      <div style={{ marginBottom: "1.6cqw" }}>{dTag("intneg")}</div>
      <h2 style={sH}>Negative integer weights</h2>
      <Bul color={AMBER_D} items={[
        <><strong style={{ color: D.text }}>BNW 2022</strong> — randomized <span style={sK(AMBER_D)}>O(m log⁸ n log W)</span>: first near-linear, via bit-scaling + low-diameter decomposition.</>,
        <><strong style={{ color: D.text }}>Bringmann–Cassis–Fischer 2023</strong> — <span style={sK(AMBER_D)}>O(m log² n log(nW) log log n)</span>: ~6 log-factors shaved.</>,
        <><strong style={{ color: D.text }}>Jason Li 2026</strong> — first <em>deterministic</em> near-linear algorithm; a padded decomposition replaces the random one.</>,
      ]} />
    </SlideFrame>,

    // 9 — Track B real
    <SlideFrame key="trackB" accent={D.violet}>
      <div style={{ marginBottom: "1.6cqw" }}>{dTag("realneg")}</div>
      <h2 style={sH}>Negative real weights: the cascade</h2>
      <Bul color={D.violet} items={[
        <><strong style={{ color: D.text }}>Fineman 2024</strong> — <span style={sK(D.violet)}>Õ(mn^(8/9))</span>: first crack in the 66-year <span style={sK(D.violet)}>O(mn)</span> wall, via hop reduction.</>,
        <><strong style={{ color: D.text }}>Huang–Jin–Quanrud</strong> — <span style={sK(D.violet)}>Õ(mn^(4/5))</span> (2025) → <span style={sK(D.violet)}>Õ(mn^(3/4)+m^(4/5)n)</span> (2026).</>,
        <><strong style={{ color: D.text }}>Quanrud–Tajkhorshid</strong> — <span style={sK(D.violet)}>O(mn^0.7193)</span> for denser graphs, via sparsification.</>,
        <><strong style={{ color: D.text }}>Li–Li–Zhang</strong> and <strong style={{ color: D.text }}>Khanna–Song</strong> — both reach <span style={sK(D.violet)}>n^(2+o(1))</span>, essentially optimal for dense graphs.</>,
      ]} />
    </SlideFrame>,

    // 10 — the thread
    <SlideFrame key="thread" accent={D.live}>
      <div style={sEye()}>The connecting idea</div>
      <h2 style={sH}>Johnson, 1977, is still inside all of it</h2>
      <p style={{ ...sBody, marginTop: "2.8cqw", maxWidth: "30em" }}>Every negative-weight result — from 2022 to 2026 — still uses Johnson's price functions to make edges non-negative:</p>
      <div style={{ fontFamily: mono, fontSize: "clamp(16px,3.2cqw,32px)", color: D.live, margin: "3.2cqw 0", fontWeight: 600 }}>
        w′(u,v) = w(u,v) + φ(u) − φ(v)
      </div>
      <p style={sBody}>The breakthroughs don't replace Johnson — they compute his potentials <em>faster</em>. A 49-year-old idea, still load-bearing.</p>
    </SlideFrame>,

    // 11 — table
    <SlideFrame key="table" accent={D.live}>
      <div style={sEye()}>The whole landscape</div>
      <h2 style={{ ...sH, fontSize: "clamp(16px,3cqw,28px)", marginBottom: "1.4cqw" }}>The results, three tracks</h2>
      <div style={{ flex: 1, overflow: "auto" }}><ComparisonTable dark /></div>
    </SlideFrame>,

    // 12 — theory vs practice
    <SlideFrame key="tvp" accent={AMBER_D}>
      <div style={sEye()}>A caveat worth saying out loud</div>
      <h2 style={sH}>Theory ≠ practice (yet)</h2>
      <div style={{ marginTop: "3.2cqw", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5%" }}>
        <div>
          <div style={{ fontFamily: sans, fontWeight: 700, color: D.green, marginBottom: "1.4cqw", fontSize: "clamp(13px,2cqw,18px)" }}>Used in production</div>
          <p style={sBody}>Dijkstra and Johnson. Simple, low constants, fast on real graphs.</p>
        </div>
        <div>
          <div style={{ fontFamily: sans, fontWeight: 700, color: D.violet, marginBottom: "1.4cqw", fontSize: "clamp(13px,2cqw,18px)" }}>Theoretical milestones</div>
          <p style={sBody}>The 2022–2026 results. Large constants and heavy machinery (recursion, spanning forests, padding) make them slower in practice — for now.</p>
        </div>
      </div>
      <p style={{ ...sBody, marginTop: "3.2cqw", color: D.faint, fontStyle: "italic" }}>Their value is showing what's possible — and the techniques may yet become practical.</p>
    </SlideFrame>,

    // 13 — takeaways
    <SlideFrame key="take" accent={D.live}>
      <div style={sEye()}>Key takeaways</div>
      <h2 style={sH}>What to remember</h2>
      <Bul items={[
        <><strong style={{ color: D.text }}>The sorting barrier fell.</strong> Total ordering was a luxury, not a necessity — pivots + bands beat it (DMMSY 2025).</>,
        <><strong style={{ color: D.text }}>Integers enable scaling.</strong> Bit-scaling + decomposition gives near-linear, now even deterministic, negative-weight SSSP.</>,
        <><strong style={{ color: D.text }}>Real weights needed structure.</strong> Shortcutting and hop reduction broke the 66-year <span style={sK()}>O(mn)</span> wall, down to <span style={sK()}>n^(2+o(1))</span> for dense graphs.</>,
        <><strong style={{ color: D.text }}>Johnson endures.</strong> Every modern negative-weight result still rests on his 1977 potentials.</>,
      ]} />
    </SlideFrame>,

    // 14 — GenAI literacy
    <SlideFrame key="genai" accent={D.live}>
      <div style={sEye()}>How this was built · GenAI literacy</div>
      <h2 style={sH}>Tools used — and checked</h2>
      <Bul items={[
        <><strong style={{ color: D.text }}>Research:</strong> Gemini Deep Research gathered the papers, bounds and timeline across 2022–2026.</>,
        <><strong style={{ color: D.text }}>Demo & deck:</strong> built with Claude — the interactive Lab, this slide deck, and the written story.</>,
        <><strong style={{ color: D.text }}>Verification:</strong> every citation checked against the primary source (arXiv / STOC / FOCS / SODA; Johnson 1977 in JACM). This caught real errors — two distinct papers merged into one, and a wrong author list.</>,
        <><strong style={{ color: D.text }}>Lesson:</strong> generative tools are excellent drafters but unreliable on exact citations — author lists and complexity bounds must be verified by hand.</>,
      ]} />
    </SlideFrame>,
  ];
}

// ============================================================================
//  APP SHELL
// ============================================================================
export default function App() {
  const [mode, setMode] = useState("lab");
  const modes = [["lab", "Lab"], ["story", "Story"], ["slides", "Slides"]];
  const tab = (active) => ({ padding: "8px 16px", borderRadius: 9, border: `1px solid ${active ? C.ink : C.line}`, background: active ? C.ink : "#fff", color: active ? "#fff" : C.ink, fontFamily: sans, fontWeight: 600, fontSize: 13.5, cursor: "pointer", transition: "all .15s" });

  return (
    <div style={{ background: C.canvas, color: C.ink, padding: "22px 18px 36px", borderRadius: 14, maxWidth: 1060, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Eyebrow color={C.live}>Single-source shortest paths · 2022–2026</Eyebrow>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(24px,4vw,34px)", margin: "3px 0 0", letterSpacing: -0.4 }}>From Dijkstra to the sorting-barrier break</h1>
        </div>
        <div style={{ display: "flex", gap: 7 }}>{modes.map(([k, l]) => <button key={k} onClick={() => setMode(k)} style={tab(mode === k)}>{l}</button>)}</div>
      </div>
      <div style={{ height: 1, background: C.line, margin: "16px 0 18px" }} />

      {mode === "lab" && <Lab />}
      {mode === "story" && <Story />}
      {mode === "slides" && <Slides />}

      <div style={{ marginTop: 18, fontFamily: sans, fontSize: 11.5, color: C.faint }}>
        Research via Gemini Deep Research, verified against primary sources; demo built with Claude. The Lab's third algorithm illustrates the DMMSY band/pivot idea, not the full recursive BMSSP.
      </div>
    </div>
  );
}
