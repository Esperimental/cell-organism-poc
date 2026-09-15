# Cell Organism POC

## Experiment bench

### Body response experiment

Select **Body language — two food patches**, start at tick zero, then Play
at the preset's 2 ticks/second. The world fits the fixed camera. At ticks
3–12, boundary cells reach and gather toward the first patch; the body then
feeds and travels to the second patch. **Body language — original behaviour**
uses the same map, seed and ecology with this response disabled.

The opt-in rule `reshape.responsive: true` connects the previously unused
reshape action to the session loop and permits short preparatory moves toward
nearby food before contact. A move must preserve connectivity, not lose food
contacts, improve the approach/contact/compactness score, and pay its energy
cost. Only one boundary cell moves on the configured cadence; rigid translation
waits during that opportunity. Committed migration takes priority.
Quiet feeding is allowed; the body is not forced to keep moving.

This is an experiment, not a global ecology change or soft-body locomotion.
The normal random run retains its previous behaviour. Acceptance tests cover
the scene, mirrored and rotated versions, feeding on both patches, survival,
connectivity, and a no-food control.

Open `src/gui/?experiment=compact-birth&tick=1` on the local server or
GitHub Pages. The ordinary `src/gui/` entry still starts a random live world.
Expand **Experiment bench**, select a preset, and choose **Load paused**.
Presets start at tick zero; their suggested inspection tick is filled into
**Target tick**. Use **Go to tick**, **Step**, **Step 10**, or **Step 100**.
Seeking backwards resets and replays deterministically. Long jumps yield in
batches and can be cancelled; no unbounded event history is retained.

**Replay current tick** links to the loaded preset, seed and current tick.
Links reproduce results for the same code/configuration revision; retain the
Git commit when reporting a bug. Reset preserves the initial world and pauses
experiment playback. Changing the dropdown only previews the next description;
**Load paused** activates it.

The event filter keeps the latest 300 behaviour events separately from the
latest 300 events of all types, displaying the latest 12 matching entries.
Click a cell or enter its ID to read its position, energy and stored food.

The same presets work headlessly (run commands from the repository root):

```bash
npm run sim -- --experiment compact-birth --ticks 1 --output runs/compact-birth
npm run experiment -- --experiment staged-refuel --ticks 120 --seeds 1
npm run experiment -- --experiment baseline-ecology --ticks 300 --seeds 1:10
npm test
```

The simulation CLI exports states, maps, events, metrics, summary, and resolved
rules/world settings in `experiment.json`. `--ticks` means additional steps in
the CLI; browser **Target tick** is an absolute tick. Existing explicit
`--scenario`, `--rules`, `--world` CLI usage is still supported.

To add an experiment, commit a scenario JSON and an entry in
`experiments/catalog.json`. Each entry has a unique ID, name, description,
scenario path and seed. Optional fields: `rules`, `world`, recursively merged
`rulesOverrides`/`worldOverrides`, and `view: { tick, speed, zoom }`.
`view.speed` is the existing slider index (0–8).
Food is preserved by default; `initialFood: "generated"` explicitly replaces it
with the seeded food generator. Set per-food `growthRate: 0` when fixed food
must not regrow; disabling spawning/spreading alone does not disable regrowth.

Browser and CLI use the shared `loadPreset` initializer. The compact-birth,
grazing-underlay and staged-refuel acceptance tests load their catalogue
entries directly. Replay tests compare every preset with a headless run,
including rewind and saved-state continuation. No simulation rules are changed
by the bench itself.

## Goal
Build a deterministic, headless artificial-life simulation where a small cluster of simple stem cells behaves like one hungry organism through local rules rather than scripted organism-level AI.

The first milestone is not a game UI. It is a simulation that can be run from the command line, inspected by humans or AI, and tuned through configuration files.

## Version 0 Scope

World contents:
- empty tiles
- food
- stem cells only

Stem-cell capabilities:
- store energy
- store food
- consume adjacent food
- digest stored food into energy
- share stored food with adjacent cells
- share energy with adjacent cells
- sense nearby food
- contribute to a collective movement direction
- reproduce into adjacent empty tiles when sufficiently resourced
- die when energy reaches zero

Organism behavior:
- adjacent cells form one connected organism
- the organism moves as a rigid connected shape in Version 0
- movement occurs only when every cell can pay the movement cost
- cells locally share resources so weak cells can be supported by stronger neighbors
- exposed cell edges cost additional maintenance energy, making compact clusters metabolically advantageous

Explicitly out of scope for Version 0:
- skin, mouth, stomach, muscle, attack, or transport specializations
- combat or multiple competing organisms as a designed feature
- genetics or mutation
- soft-body / per-cell crawling movement
- player input
- mobile packaging
- polished rendering

## Determinism
Given identical:
- initial state
- rules configuration
- random seed
- tick count

the simulator must produce identical final state and metrics.

Simulation logic must be independent from any renderer.

## Proposed CLI Contract

```bash
npm run sim -- \
  --scenario scenarios/food-east.json \
  --rules configs/baseline.json \
  --ticks 100 \
  --seed 42 \
  --output runs/food-east-001
```

A run should emit:
- `initial-state.json`
- `final-state.json`
- `summary.json`
- `events.ndjson`
- `final-map.txt`

## Tick Phases

Version 0 should use explicit phases so iteration order does not silently change behavior:

1. Sense food
2. Identify connected organisms
3. Calculate organism movement intent
4. Apply valid movement
5. Consume adjacent food
6. Share stored food
7. Digest stored food into energy
8. Share energy
9. Apply maintenance and exposed-edge costs
10. Reproduce
11. Remove dead cells
12. Calculate metrics

Actions within a phase should be calculated from a consistent pre-phase state where practical, then applied together.

## Initial Metrics

Each run should report at least:
- starting cell count
- ending cell count
- deaths by starvation
- reproduction events
- food consumed
- total stored food
- mean / min / max cell energy
- energy standard deviation
- connected component count
- largest connected component fraction
- organism centroid start/end
- distance travelled
- movement energy spent
- exposed-edge count
- compactness metric
- nearest-food distance start/end when food exists

## Invariants

The simulator should fail loudly if any of these are violated:
- no negative energy
- no negative stored food
- no duplicate cell IDs
- no two cells occupy the same tile
- dead cells do not act
- food cannot spontaneously increase unless the scenario explicitly adds it
- energy cannot exceed configured storage limits
- identical state + rules + seed + ticks produces identical output

## First Acceptance Scenarios

### 1. `food-east`
A healthy connected cluster begins with food to the east.

Expected:
- cluster remains connected
- centroid moves east
- at least some food is consumed

### 2. `no-food`
A healthy cluster begins with no food.

Expected:
- total energy trends downward
- cells eventually begin dying if run long enough

### 3. `hungry-edge-cell`
One edge cell starts near starvation while adjacent cells are healthy.

Expected:
- energy flows toward the weak cell
- its survival time is longer than the equivalent isolated-cell scenario

### 4. `abundant-food`
A healthy cluster has easy access to substantial food.

Expected:
- food is consumed
- energy increases
- reproduction eventually occurs
- growth is not immediately explosive

### 5. `compact-vs-string`
Two organisms contain the same number of cells and energy, but one is compact and one is long/thin.

Expected:
- the compact organism pays a lower exposed-edge maintenance cost

## Implementation Direction

Preferred first stack:
- TypeScript
- Node.js CLI
- JSON scenario and rules files
- ASCII map output for quick human inspection
- automated tests around deterministic simulation rules

A renderer can be added later without changing the simulation core. Phaser is a likely visual layer and Capacitor is a possible mobile packaging path, but neither is needed for this POC.

## Version 0 Success Criterion

The POC succeeds when a small group of stem cells can, under deterministic rules:

1. stay connected,
2. move toward nearby food,
3. consume and digest it,
4. share resources with weaker neighbors,
5. survive better together than alone,
6. reproduce when prosperous,
7. starve when resources disappear,
8. produce enough structured output that an AI can compare runs and tune rule values without watching an interactive game.
