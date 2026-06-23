# Task 02 - Advances in Graph Algorithms

## Overview
This project presents an interactive demonstration, narrative, and slide deck exploring the evolution of Single-Source Shortest Path (SSSP) algorithms. It highlights the journey from the classical baseline (Dijkstra and Johnson) to modern breakthroughs (2022-2026) that broke the 66-year-old sorting barrier and pushed negative-weight limits to near-linear times.

## The Interactive Demo (`ShortestPathLab_1.jsx`)
The core of this project is a sophisticated React-based artifact that serves three distinct modes:

### 1. Lab Mode (Interactive)
- **Visual Graph Editor:** Users can dynamically click nodes to set the source vertex, or click any edge weight to increment/decrement it or flip its sign to manually create negative cycles.
- **Algorithm Inspector:** A side-panel that actively reveals the inner state of the algorithms as they run:
  - **Dijkstra (1959):** Visualizes the sorted priority queue to emphasize the $O(n \log n)$ sorting cost.
  - **Johnson (1977):** Shows the two-phase process: computing the Bellman-Ford $h(v)$ potentials, followed by the reweighted Dijkstra execution.
  - **DMMSY (2025):** Illustrates the STOC 2025 breakthrough by visually rendering distance "bands" and highlighting "pivot" nodes, demonstrating how vertices can be settled in batches without global sorting to achieve $O(m \log^{2/3} n)$.

### 2. Story Mode (Narrative)
A detailed, academic narrative dividing the 2022–2026 algorithmic cascade into three distinct tracks:
- **Non-negative weights:** Breaking the sorting barrier (DMMSY).
- **Integer negative weights:** Near-linear scaling using padded decompositions (Bernstein et al., Bringmann et al., Jason Li).
- **Real negative weights:** The cascade of structural hop-reduction and sparsification (Fineman, Huang et al., Khanna & Song) reaching $n^{2+o(1)}$ bounds.
- Features a **Comprehensive Comparison Table** detailing the time complexities, deterministic/randomized nature, and practical viability of all major SSSP algorithms from 1958 to 2026.

### 3. Slides Mode (Presentation Deck)
A fully integrated, keyboard-navigable slide deck built specifically for the video presentation. It uses responsive container queries to flawlessly scale text and graphics to the video frame, featuring dark-mode aesthetics and algorithmic bullet points.

## How the Generated Code Works
The interactive demo is built as a self-contained React component utilizing scalable vector graphics (SVG).

- **Decoupled Simulation (The "Frame" Architecture)**: The algorithms (`runDijkstra`, `runJohnson`, `runDMMSY`) do not update the UI in real-time. Instead, they act as pure functions that run instantly and generate an array of "frames." Each frame represents a snapshot of the algorithm's state at a specific step (distances, settled nodes, frontier, pivots).
- **Time-Travel Playback**: The React component simply steps through these pre-computed frames using a timer (`useEffect` hook) and a slider. This makes the animation smooth and allows the user to pause, step backward, or jump to any point in the algorithm's execution.
- **Dynamic SVG Rendering**: The `GraphView` component dynamically renders the graph based on the active frame. It includes interactive SVG overlays allowing direct manipulation of the graph state (source selection and weight mutation) without requiring complex state management libraries.

## GenAI Workflow
This project demonstrates GenAI literacy by actively incorporating AI tools into the research and development pipeline:
- **Research Phase**: AI tools (such as Gemini Deep Research) were used to digest dense academic papers across the 2022–2026 period. The extracted timelines, authors, and complexity bounds were then meticulously verified against primary sources (STOC, FOCS, SODA, arXiv) to catch hallucinated references and ensure 100% academic accuracy.
- **Code Generation Phase**: Tools like Claude and Lovable were leveraged to generate the React boilerplate, craft the premium multi-mode design system, and write the complex SVG rendering math. This allowed the focus to remain on correctly implementing and explaining the algorithm logic rather than debugging CSS.
