import test from 'node:test';
import assert from 'node:assert/strict';
import { experiment } from '../helpers/fixtures.js';

test('saved stressed body reaches food and recovers beyond its former starvation', async () => {
  const { session } = await experiment('starvation-checkpoint');
  const meanEnergy = () => session.state.cells.reduce((sum, cell) => sum + cell.energy, 0) / session.state.cells.length;
  const startingEnergy = meanEnergy();
  let recovered = false;
  let foodConsumed = 0;
  while (session.state.tick < 5200) {
    const result = session.step();
    assert.ok(session.state.cells.length > 0, `starved at tick ${session.state.tick}`);
    assert.equal(result.metrics.largestComponentFraction, 1, `disconnected at tick ${session.state.tick}`);
    foodConsumed += result.events.filter(event => event.type === 'food_consumed').reduce((sum, event) => sum + event.amount, 0);
    if (session.state.tick >= 4490 && meanEnergy() > startingEnergy) recovered = true;
  }
  assert.ok(foodConsumed > 0, 'must actually refuel');
  assert.ok(recovered, 'energy should recover beyond its stressed starting level');
});
