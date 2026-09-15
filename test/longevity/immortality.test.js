import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runLongevity } from '../../src/experiments/runLongevity.js';
import { generateInitialFood } from '../../src/simulation/initialWorld.js';

const state = JSON.parse(fs.readFileSync('scenarios/food-east.json', 'utf8'));
const rules = JSON.parse(fs.readFileSync('configs/baseline.json', 'utf8'));
const world = JSON.parse(fs.readFileSync('configs/world.json', 'utf8'));

const longevityTicks = Number.parseInt(process.env.LONGEVITY_TICKS ?? '100000', 10);
const longevitySeeds = (process.env.LONGEVITY_SEEDS ?? process.env.LONGEVITY_SEED ?? '42')
  .split(',')
  .map((value) => Number.parseInt(value.trim(), 10))
  .filter(Number.isInteger);

for (const longevitySeed of longevitySeeds) {
  test(`baseline ecology seed ${longevitySeed} remains alive for ${longevityTicks.toLocaleString()} ticks`, () => {
    const randomizedState = generateInitialFood(state, world, longevitySeed);
    const result = runLongevity({
      state: randomizedState,
      rules,
      world,
      seed: longevitySeed,
      ticks: longevityTicks,
      checkpointEvery: Math.max(10000, Math.floor(longevityTicks / 10)),
    });
    assert.ok(result.alive, `seed ${longevitySeed} went extinct at tick ${result.finalTick}`);
    assert.equal(result.finalTick, longevityTicks);
    assert.ok(result.finalCells >= 2, `expected surviving organism for seed ${longevitySeed}, got ${result.finalCells} cells`);
  });
}
