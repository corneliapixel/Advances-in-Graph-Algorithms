# Task 02 - Advances in Graph Algorithms

## Overview
This project presents an interactive demonstration and narrative exploring the evolution of Single-Source Shortest Path (SSSP) algorithms. It highlights the journey from classical Dijkstra to modern breakthroughs (2022-2025), specifically focusing on generalizations to negative edges and the recent algorithmic milestone that finally broke the sorting barrier.

## The Interactive Demo
The core of this project is a React-based interactive demo (`ShortestPathLab_1.jsx`) that allows users to visually step through three eras of SSSP algorithms:

1. **Dijkstra (1956/59)**: The classical baseline algorithm `O(m + n log n)`. We demonstrate how it grows a set of settled nodes outward by constantly finding the global minimum distance.
2. **Johnson (1977)**: Generalization to negative weights `O(nm + n² log n)`. The demo shows Phase 1 (using Bellman-Ford to compute potentials and detect negative cycles) and Phase 2 (reweighting edges so Dijkstra can run safely on a non-negative graph).
3. **DMMSY (2025)**: The recent STOC 2025 breakthrough ("Breaking the Sorting Barrier"). We intuitively illustrate the core innovation: processing the frontier in distance "bands" and using a scout step to find "pivots" instead of strictly sorting the entire frontier, achieving a deterministic `O(m log^{2/3} n)` time.

## How the Generated Code Works
The interactive demo is built as a self-contained React component utilizing scalable vector graphics (SVG) for the visualizer.

- **Decoupled Simulation (The "Frame" Architecture)**: The algorithms (`runDijkstra`, `runJohnson`, `runDMMSY`) do not update the UI in real-time. Instead, they act as pure functions that run instantly and generate an array of "frames." Each frame represents a snapshot of the algorithm's state at a specific step (distances, settled nodes, frontier, pivots).
- **Time-Travel Playback**: The React component simply steps through these pre-computed frames using a timer (`useEffect` hook) and a slider. This makes the animation smooth and allows the user to pause, step backward, or jump to any point in the algorithm's execution.
- **Dynamic SVG Rendering**: The `GraphView` component dynamically renders the graph based on the active frame. It includes smart math to calculate curved paths for bidirectional edges (preventing visual overlap) and dynamically updates node and edge colors to reflect the algorithm's current focus.

## GenAI Workflow
This project demonstrates GenAI literacy by actively incorporating AI tools into the research and development pipeline:
- **Research Phase**: AI tools (such as Gemini Deep Research) were used to digest dense academic papers (like the 2025 DMMSY paper) and extract intuitive, explainable concepts (like "bands" and "pivots") that could be visually represented.
- **Code Generation Phase**: Tools like v0, Lovable, and ChatGPT were leveraged to generate the React boilerplate, craft the premium design system, and write the complex SVG rendering math. This allowed the focus to remain on correctly implementing and explaining the algorithm logic rather than debugging CSS.
