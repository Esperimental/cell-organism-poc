import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runExperiment } from '../../src/experiments/runExperiment.js';
import { scenario, rules, mergeWorld } from '../helpers/fixtures.js';

function round(value, digits = 3) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function compactAggregate(aggregate) {
  return {
    survivalRate: round(aggregate.survivalRate),
    meanFinalCells: round(aggregate.meanFinalCells),
    medianFinalCells: round(aggregate.medianFinalCells),
    meanPeakCells: round(aggregate.meanPeakCells),
    medianPeakCells: round(aggregate.medianPeakCells),
    maxPeakCells: round(aggregate.maxPeakCells),
    meanLargestComponentFraction: round(aggregate.meanLargestComponentFraction),
    meanFoodConsumed: round(aggregate.meanFoodConsumed),
    meanReproductionEvents: round(aggregate.meanReproductionEvents),
    searchingFraction: round(aggregate.searchingFraction),
    seekingFraction: round(aggregate.seekingFraction),
    feedingFraction: round(aggregate.feedingFraction),
    blockedFraction: round(aggregate.blockedFraction),
  };
}

const seeds = [11, 22, 33, 44, 55, 66, 77, 88, 99, 111];

const baselineExperiment = {
  scenario,
  rules,
  world: mergeWorld(),
  ticks: 300,
  seeds,
};

test('baseline ecology aggregate matches reviewed snapshot', () => {
  const report = runExperiment(baselineExperiment);
  const expected = JSON.parse(fs.readFileSync('test/acceptance/snapshots/baseline-ecology-300.json', 'utf8'));
  assert.deepEqual(compactAggregate(report.aggregate), expected);
});

test('organisms survive, grow and remain connected over 3000 ticks across baseline seeds', () => {
  const report = runExperiment({ ...baselineExperiment, ticks: 3000 });
  const aggregate = report.aggregate;

  assert.ok(aggregate.survivalRate >= 0.9, `survival rate ${aggregate.survivalRate} < 0.9`);
  assert.ok(aggregate.medianPeakCells > scenario.cells.length, `median peak cells ${aggregate.medianPeakCells} must exceed starting size ${scenario.cells.length}`);
  assert.ok(aggregate.maxPeakCells <= 100, `max peak cells ${aggregate.maxPeakCells} > 100`);
  assert.ok(aggregate.meanLargestComponentFraction >= 0.95, `connectivity ${aggregate.meanLargestComponentFraction} < 0.95`);
});
