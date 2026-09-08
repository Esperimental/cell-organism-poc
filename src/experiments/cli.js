import { loadJson, runExperiment } from './runExperiment.js';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid arguments near: ${argv.slice(i).join(' ')}`);
    args[key.slice(2)] = value;
  }
  return args;
}

function parseSeeds(value) {
  if (!value) return [42];
  if (value.includes(':')) {
    const [startText, endText] = value.split(':');
    const start = Number(startText);
    const end = Number(endText);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) throw new Error('--seeds range must be start:end');
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  }
  const seeds = value.split(',').map(Number);
  if (!seeds.length || seeds.some((seed) => !Number.isInteger(seed))) throw new Error('--seeds must be comma-separated integers or start:end');
  return seeds;
}

const args = parseArgs(process.argv.slice(2));
const scenarioPath = args.scenario ?? 'scenarios/food-east.json';
const rulesPath = args.rules ?? 'configs/baseline.json';
const worldPath = args.world ?? 'configs/world.json';
const ticks = Number(args.ticks ?? 300);
if (!Number.isInteger(ticks) || ticks < 0) throw new Error('--ticks must be a non-negative integer');
const seeds = parseSeeds(args.seeds ?? '1:10');

const [scenario, rules, world] = await Promise.all([
  loadJson(scenarioPath),
  loadJson(rulesPath),
  loadJson(worldPath),
]);

const report = runExperiment({ scenario, rules, world, ticks, seeds });
const compact = {
  scenario: scenarioPath,
  rules: rulesPath,
  world: worldPath,
  ticks,
  seeds,
  aggregate: report.aggregate,
  runs: report.runs.map((run) => ({
    seed: run.seed,
    endingCells: run.endingCells,
    peakCells: run.peakCells,
    tickOfPeakCells: run.tickOfPeakCells,
    survived: run.survived,
    reproductionEvents: run.reproductionEvents,
    foodConsumed: run.foodConsumed,
    starvationDeaths: run.starvationDeaths,
  })),
};

console.log(JSON.stringify(compact, null, 2));
