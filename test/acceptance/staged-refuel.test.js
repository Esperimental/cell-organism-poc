import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameSession } from '../../src/simulation/session.js';
import { computeMetrics } from '../../src/simulation/sim.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('large organism can survive by chaining several individually insufficient refuel clusters', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/staged-refuel.json', 'utf8'));
  const localRules = structuredClone(rules);
  localRules.grazing.migrationTargetJitterFraction = 0;
  const world = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const session = new GameSession({ state, rules: localRules, world, seed: 1 });

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
