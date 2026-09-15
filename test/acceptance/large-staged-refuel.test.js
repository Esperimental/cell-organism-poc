import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameSession } from '../../src/simulation/session.js';
import { computeMetrics } from '../../src/simulation/sim.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('large organism can chain several small refuel clusters without premature collapse', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/large-staged-refuel.json', 'utf8'));
  const localRules = structuredClone(rules);
  localRules.grazing.migrationTargetJitterFraction = 0;
  const world = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const session = new GameSession({ state, rules: localRules, world, seed: 1 });

  const refuelBands = new Set();
  let sacrifices = 0;
  let migrationTicks = 0;

  for (let tick = 1; tick <= 100; tick += 1) {
    const result = session.step();
    if (session.state.activity.mode === 'MIGRATING') migrationTicks += 1;
    sacrifices += result.events.filter((event) => event.type === 'sacrifice').length;
    for (const event of result.events.filter((event) => event.type === 'food_consumed')) {
      if (event.x >= 10) refuelBands.add(Math.floor(event.x / 10));
    }
  }

  const metrics = computeMetrics(session.state, session.initialState);
  assert.equal(refuelBands.size, 4, `expected all 4 refuel clusters to be used, got ${refuelBands.size}`);
  assert.ok(migrationTicks > 0, 'expected committed migration between refuel stops');
  assert.ok(session.state.cells.length >= 30, `expected large core to survive staged refueling, got ${session.state.cells.length}`);
  assert.ok(metrics.meanEnergy >= 25, `expected useful energy top-ups, got mean ${metrics.meanEnergy.toFixed(2)}`);
  assert.equal(sacrifices, 0, `expected no premature sacrifice while refuel stops remain, got ${sacrifices}`);
});
