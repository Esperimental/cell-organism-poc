import fs from 'node:fs/promises';
import path from 'node:path';
import { renderAscii } from '../simulation/sim.js';
import { GameSession } from '../simulation/session.js';
import { loadPreset } from '../experiments/presets.js';

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

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

const args = parseArgs(process.argv.slice(2));
for (const required of args.experiment ? ['ticks', 'output'] : ['scenario', 'rules', 'world', 'ticks', 'output']) {
  if (!(required in args)) throw new Error(`Missing --${required}`);
}

const ticks = Number(args.ticks);
if (!Number.isInteger(ticks) || ticks < 0) throw new Error('--ticks must be a non-negative integer');
let seed = args.seed === undefined ? undefined : Number(args.seed);
if (seed !== undefined && !Number.isInteger(seed)) throw new Error('--seed must be an integer');

if (args.experiment && ['scenario', 'rules', 'world'].some((key) => key in args)) {
  throw new Error('--experiment cannot be combined with --scenario, --rules or --world');
}
let session;
if (args.experiment) {
  const loaded = await loadPreset(args.experiment, readJson, { seed });
  session = loaded.session;
  seed = loaded.seed;
} else {
  const [scenario, rules, world] = await Promise.all([
    readJson(args.scenario),
    readJson(args.rules),
    readJson(args.world),
  ]);
  seed ??= 0;
  session = new GameSession({ state: scenario, rules, world, seed });
}
const result = session.run(ticks);

await fs.mkdir(args.output, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(args.output, 'experiment.json'), JSON.stringify({
    experiment: args.experiment ?? null, seed, ticks,
    rules: session.rules, world: session.world,
  }, null, 2) + '\n'),
  fs.writeFile(path.join(args.output, 'initial-state.json'), JSON.stringify(result.initialState, null, 2) + '\n'),
  fs.writeFile(path.join(args.output, 'final-state.json'), JSON.stringify(result.finalState, null, 2) + '\n'),
  fs.writeFile(path.join(args.output, 'summary.json'), JSON.stringify({ seed, ...result.summary }, null, 2) + '\n'),
  fs.writeFile(path.join(args.output, 'events.ndjson'), result.events.map((e) => JSON.stringify(e)).join('\n') + (result.events.length ? '\n' : '')),
  fs.writeFile(path.join(args.output, 'metrics.ndjson'), result.metricsByTick.map((m) => JSON.stringify(m)).join('\n') + '\n'),
  fs.writeFile(path.join(args.output, 'initial-map.txt'), renderAscii(result.initialState)),
  fs.writeFile(path.join(args.output, 'final-map.txt'), renderAscii(result.finalState)),
]);

console.log(JSON.stringify({ output: args.output, seed, ...result.summary }, null, 2));
