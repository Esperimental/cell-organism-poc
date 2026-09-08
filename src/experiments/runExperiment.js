import fs from 'node:fs/promises';
import { GameSession } from '../simulation/session.js';

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function maxMetric(metricsByTick, field) {
  return metricsByTick.reduce((max, metric) => Math.max(max, metric[field] ?? -Infinity), -Infinity);
}

function samplePopulation(metricsByTick, everyTicks = 50) {
  return metricsByTick
    .filter((metric) => metric.tick % everyTicks === 0)
    .map((metric) => ({ tick: metric.tick, cells: metric.cellCount }));
}

export async function loadJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

export function runExperiment({ scenario, rules, world, ticks, seeds }) {
  const runs = seeds.map((seed) => {
    const result = new GameSession({ state: scenario, rules, world, seed }).run(ticks);
    const peakCells = maxMetric(result.metricsByTick, 'cellCount');
    const tickOfPeakCells = result.metricsByTick.find((metric) => metric.cellCount === peakCells)?.tick ?? 0;
    return {
      seed,
      startingCells: result.summary.startingCells,
      endingCells: result.summary.endingCells,
      peakCells,
      tickOfPeakCells,
      survived: result.summary.endingCells > 0,
      largestComponentFraction: result.summary.largestComponentFraction,
      foodConsumed: result.summary.foodConsumed,
      foodRegrown: result.summary.foodRegrown,
      reproductionEvents: result.summary.reproductionEvents,
      starvationDeaths: result.summary.starvationDeaths,
      activityCounts: result.summary.activityCounts,
      reproductionBlockedEnergy: result.summary.reproductionBlockedEnergy,
      reproductionBlockedFood: result.summary.reproductionBlockedFood,
      populationSamples: samplePopulation(result.metricsByTick),
      finalState: result.finalState,
    };
  });

  const finalCells = runs.map((run) => run.endingCells);
  const peakCells = runs.map((run) => run.peakCells);
  const connected = runs.map((run) => run.largestComponentFraction);
  const totals = {
    SEARCHING: runs.reduce((sum, run) => sum + (run.activityCounts.SEARCHING ?? 0), 0),
    SEEKING: runs.reduce((sum, run) => sum + (run.activityCounts.SEEKING ?? 0), 0),
    FEEDING: runs.reduce((sum, run) => sum + (run.activityCounts.FEEDING ?? 0), 0),
    BLOCKED: runs.reduce((sum, run) => sum + (run.activityCounts.BLOCKED ?? 0), 0),
  };
  const totalActivity = Object.values(totals).reduce((sum, count) => sum + count, 0) || 1;

  return {
    ticks,
    seeds,
    runCount: runs.length,
    aggregate: {
      survivalRate: mean(runs.map((run) => run.survived ? 1 : 0)),
      meanFinalCells: mean(finalCells),
      medianFinalCells: median(finalCells),
      minFinalCells: Math.min(...finalCells),
      maxFinalCells: Math.max(...finalCells),
      meanPeakCells: mean(peakCells),
      medianPeakCells: median(peakCells),
      maxPeakCells: Math.max(...peakCells),
      meanLargestComponentFraction: mean(connected),
      meanFoodConsumed: mean(runs.map((run) => run.foodConsumed)),
      meanReproductionEvents: mean(runs.map((run) => run.reproductionEvents)),
      searchingFraction: totals.SEARCHING / totalActivity,
      seekingFraction: totals.SEEKING / totalActivity,
      feedingFraction: totals.FEEDING / totalActivity,
      blockedFraction: totals.BLOCKED / totalActivity,
    },
    runs,
  };
}

export function evaluateExpectations(report, expectations) {
  const failures = [];
  for (const [metric, bounds] of Object.entries(expectations)) {
    const actual = report.aggregate[metric];
    if (actual === undefined) {
      failures.push({ metric, actual: null, message: 'unknown metric' });
      continue;
    }
    if (bounds.min !== undefined && actual < bounds.min) {
      failures.push({ metric, actual, expected: `>= ${bounds.min}` });
    }
    if (bounds.max !== undefined && actual > bounds.max) {
      failures.push({ metric, actual, expected: `<= ${bounds.max}` });
    }
  }
  return { pass: failures.length === 0, failures };
}
