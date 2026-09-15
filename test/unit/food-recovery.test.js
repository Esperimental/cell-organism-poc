import test from 'node:test';
import assert from 'node:assert/strict';
import { foodGrowthForTick } from '../../src/simulation/session.js';
import { world } from '../helpers/fixtures.js';

test('nearly bare pasture regrows much more slowly than established pasture', () => {
  const bare = { amount: 0, capacity: 24, growthRate: 0.27 };
  const established = { amount: 12, capacity: 24, growthRate: 0.27 };

  const bareGrowth = foodGrowthForTick(bare, world);
  const establishedGrowth = foodGrowthForTick(established, world);

  assert.ok(bareGrowth > 0, 'depleted pasture should retain a tiny dormant recovery rate');
  assert.ok(establishedGrowth > bareGrowth * 100, `expected established growth to dominate, got ${bareGrowth} vs ${establishedGrowth}`);
  assert.equal(establishedGrowth, 0.27, 'healthy pasture should retain its full configured growth rate');
});

test('fully stripped pasture has a long dormant phase before recovery accelerates', () => {
  const food = { amount: 0, capacity: 24, growthRate: 0.27 };
  let tickAt10Percent = null;
  let tickAt50Percent = null;

  for (let tick = 1; tick <= 10000; tick += 1) {
    food.amount += foodGrowthForTick(food, world);
    if (tickAt10Percent === null && food.amount >= food.capacity * 0.1) tickAt10Percent = tick;
    if (tickAt50Percent === null && food.amount >= food.capacity * 0.5) {
      tickAt50Percent = tick;
      break;
    }
  }

  assert.ok(tickAt10Percent >= 500, `expected long depleted recovery, reached 10% at tick ${tickAt10Percent}`);
  assert.ok(tickAt50Percent - tickAt10Percent <= 100, `expected recovery to accelerate, 10%→50% took ${tickAt50Percent - tickAt10Percent} ticks`);
});

test('nonlinear pasture recovery never exceeds capacity', () => {
  const food = { amount: 23.99, capacity: 24, growthRate: 0.27 };
  food.amount += foodGrowthForTick(food, world);
  assert.equal(food.amount, 24);
  assert.equal(foodGrowthForTick(food, world), 0);
});

test('food spread root limit scales with world area', async () => {
  const { foodRootLimit } = await import('../../src/simulation/session.js');
  const small = { minX: 0, maxX: 9, minY: 0, maxY: 9, foodSpread: { maxRootFraction: 0.08 } };
  const large = { minX: 0, maxX: 99, minY: 0, maxY: 99, foodSpread: { maxRootFraction: 0.08 } };
  assert.equal(foodRootLimit(small), 8);
  assert.equal(foodRootLimit(large), 800);
});
