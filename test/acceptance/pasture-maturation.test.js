import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession } from '../../src/simulation/session.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('untouched pasture keeps expanding beyond the old fixed root ceiling', () => {
  const world = mergeWorld({ foodSpawn: { enabled: false } });
  const state = {
    tick: 0,
    cells: [],
    food: [{ x: 0, y: 0, amount: 8, capacity: 24, growthRate: world.foodPatches.defaultGrowthRate }],
  };
  const session = new GameSession({ state, rules, world, seed: 42 });

  session.run(2000);
  const rootsAt2000 = session.state.food.length;
  const biomassAt2000 = session.state.food.reduce((sum, food) => sum + food.amount, 0);
  session.run(1000);
  const rootsAt3000 = session.state.food.length;
  const biomassAt3000 = session.state.food.reduce((sum, food) => sum + food.amount, 0);

  assert.ok(rootsAt2000 > 140, `expected pasture to exceed old 140-root ceiling, got ${rootsAt2000}`);
  assert.ok(rootsAt3000 > rootsAt2000, `expected continued spatial growth, got ${rootsAt2000} → ${rootsAt3000}`);
  assert.ok(biomassAt3000 > biomassAt2000, `expected continued biomass growth, got ${biomassAt2000} → ${biomassAt3000}`);
});
