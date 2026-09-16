# Cell Organism POC

## Experiment bench

### Body response experiment

Select **Body language — two food patches**, start at tick zero, then Play
at the preset's 2 ticks/second. The world fits the fixed camera. At ticks
3–12, boundary cells reach and gather toward the first patch; the body then
feeds and travels to the second patch. All presets and the normal random game
use the same baseline rules and simulation engine.

The shared reshape action permits short preparatory moves toward
nearby food before contact. A move must preserve connectivity, not lose food
contacts, improve the approach/contact/compactness score, and pay its energy
cost. Only one boundary cell moves on the configured cadence; rigid translation
waits during that opportunity. Committed migration takes priority.
Quiet feeding is allowed; the body is not forced to keep moving.

The response now permits connected diagonal folds around a neighbour and a
single preparatory move when one further adjustment would increase food contact.
Immediate feeding value weights the score. Recent reshapes cannot immediately
undo themselves. Food carries a fading scent: feeding adds 0.12 (capped at 1),
each tick removes 0.02, and preference subtracts 0.35 times the scent from
the tile's feeding value (floored at zero). A feeding body stays put unless
another position improves the total preference by more than 0.25. This replaces
the movement pause/reversal timers. Nutrition and pasture support still use
actual intake; low-energy escape and committed migration remain available.
Scent lives in the snapshot, so replay and resumed runs agree.

Three focused presets isolate these behaviours: `fold-rich` covers the fourth
food tile by tick 6, `balanced-feeding` checks similar feeding positions, and
`leave-depleted` checks departure to fresh food. Playing the game or a preset eases
cell positions and their connections over at most 280 ms. Pausing, stepping and
seeking show exact simulation positions. Food below the sensing threshold is
dimmed, and completely empty tiles are hidden.

Presets specify starting environments, not alternative gameplay rules.
Acceptance tests cover
the scene, mirrored and rotated versions, feeding on both patches, survival,
connectivity, and a no-food control.

Open `src/gui/?experiment=compact-birth&tick=1` on the local server or
GitHub Pages. The ordinary `src/gui/` entry still starts a random live world.
Expand **Experiment bench**, select a preset, and choose **Load paused**.
Presets start at their saved tick (usually zero); their suggested inspection tick is filled into
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
scenario path and seed. Optional fields: `world`, recursively merged
`worldOverrides`, and `view: { tick, speed, zoom }`. Rule-file and rule-override
fields are rejected: every playable preset loads `configs/baseline.json`.
`view.speed` is the existing slider index (0–8).
Food is preserved by default; `initialFood: "generated"` explicitly replaces it
with the seeded food generator. Set per-food `growthRate: 0` when fixed food
must not regrow; disabling spawning/spreading alone does not disable regrowth.

Browser and CLI use the shared `loadPreset` initializer. Automated tests may
isolate a mechanism by changing their own session rules; playable presets do not.
Replay tests compare every preset with a headless run,
including rewind and saved-state continuation. No simulation rules are changed
by the bench itself.

### Starvation checkpoint

`starvation-checkpoint` restores seed 42 at tick 4200, captured from the authored
`food-east` long-run scenario at commit `756ecbe`. It includes food, organism,
RNG and behavioural state; it does not regenerate the world or change rules.
The former nearest-food emergency rule starved at tick 4490 despite richer
food elsewhere. Emergency targeting now scores usable food energy divided by
`1 + distance`, balancing meal size against the journey with one expression.
The checkpoint acceptance test requires survival, connectivity and energy
recovery through tick 5200; the original 5000-tick run is checked separately.

Open `src/gui/?experiment=starvation-checkpoint` to start paused at 4200,
or append `&tick=4500` to inspect recovery. Reset returns to 4200; earlier ticks
are unavailable in this snapshot. The saved RNG state takes precedence over
the seed, so this checkpoint is one reproducible case, not a seed sweep.

```bash
npm run sim -- --experiment starvation-checkpoint --ticks 1000 --output runs/starvation
```

The growth acceptance gate requires growth beyond the starting body size,
90% survival and 95% connectivity across ten seeds. The old median-30-cell
target is retired: a smaller feeding body is valid, and growth alone is not
evidence of organism-like behaviour. The existing population upper bound stays.

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
