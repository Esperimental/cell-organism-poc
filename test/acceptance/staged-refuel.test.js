import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../../src/simulation/sim.js';
import { experiment } from '../helpers/fixtures.js';

test('large organism can survive by chaining several individually insufficient refuel clusters', async () => {
  const { session } = await experiment('staged-refuel');

  const refuelBands = new Set();
  let migrationTicks = 0;
  let sacrifices = 0;

  for (let tick = 1; tick <= 120; tick += 1) {
    const result = session.step();
    if (session.state.activity.mode === 'MIGRATING') migrationTicks += 1;
    sacrifices += result.events.filter((event) => event.type === 'sacrifice').length;
    for (const event of result.events.filter((event) => event.type === 'food_consumed')) {
      if (event.x >= 8) refuelBands.add(Math.round(event.x / 10));
    }
    if (!session.state.cells.length) break;
  }

  const metrics = computeMetrics(session.state, session.initialState);
  assert.ok(migrationTicks > 0, 'expected committed migration between refuel stops');
  assert.ok(refuelBands.size >= 2, `expected at least two distinct refuel clusters, got ${refuelBands.size}`);
  assert.ok(session.state.cells.length >= 3, `expected a surviving core larger than minimum, got ${session.state.cells.length}`);
  assert.ok(metrics.meanEnergy >= 15, `expected staged refueling to preserve energy, got mean ${metrics.meanEnergy.toFixed(2)}`);
  assert.ok(sacrifices > 0, 'expected travel stress to shed some cells rather than catastrophic collapse');
});
