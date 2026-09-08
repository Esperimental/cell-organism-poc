import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../../src/simulation/session.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

const noFoodWorld = mergeWorld({ foodSpawn: { enabled: false } });

test('snapshot: starving organism eventually dies without food', () => {
  const state = {
    tick: 0,
    cells: [
      { id: 1, x: 0, y: 0, type: 'stem', energy: 20, storedFood: 0 },
      { id: 2, x: 1, y: 0, type: 'stem', energy: 20, storedFood: 0 },
    ],
    food: [],
  };

  const result = new GameSession({ state, rules, world: noFoodWorld, seed: 7 }).run(100);
  assert.deepEqual(
    {
      endingCells: result.summary.endingCells,
      starvationDeaths: result.summary.starvationDeaths,
      searchingTicks: result.summary.activityCounts.SEARCHING ?? 0,
      deadTicks: result.summary.activityCounts.DEAD ?? 0,
    },
    {
      endingCells: 0,
      starvationDeaths: 2,
      searchingTicks: 46,
      deadTicks: 54,
    },
  );
});

test('snapshot: attached weak cell survives through energy sharing while isolated weak cell dies', () => {
  const attached = {
    tick: 0,
    cells: [
      { id: 1, x: 0, y: 0, type: 'stem', energy: 5, storedFood: 0 },
      { id: 2, x: 1, y: 0, type: 'stem', energy: 90, storedFood: 0 },
    ],
    food: [],
  };
  const isolated = {
    tick: 0,
    cells: [{ id: 1, x: 0, y: 0, type: 'stem', energy: 5, storedFood: 0 }],
    food: [],
  };

  const attachedResult = new GameSession({ state: attached, rules, world: noFoodWorld, seed: 3 }).run(20);
  const isolatedResult = new GameSession({ state: isolated, rules, world: noFoodWorld, seed: 3 }).run(20);

  assert.equal(attachedResult.summary.endingCells, 2);
  assert.equal(attachedResult.summary.starvationDeaths, 0);
  assert.equal(isolatedResult.summary.endingCells, 0);
  assert.equal(isolatedResult.summary.starvationDeaths, 1);
  assert.ok(attachedResult.summary.minEnergy > 0);
});
