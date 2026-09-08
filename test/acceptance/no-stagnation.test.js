import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameSession } from '../../src/simulation/session.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('long-run organism does not stagnate on its first pasture', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/food-east.json', 'utf8'));
  const world = mergeWorld();
  const session = new GameSession({ state, rules, world, seed: 42 });
  const interestingTypes = new Set(['reproduction', 'movement', 'sacrifice', 'death']);

  let lastInterestingTick = 0;
  let maxStagnationTicks = 0;
  let maxCentroidDisplacement = 0;
  let births = 0;
  let sacrifices = 0;
  let migrationTicks = 0;
  let lastTargetKey = null;
  const targetClusters = [];

  for (let tick = 1; tick <= 5000; tick += 1) {
    const result = session.step();
    maxCentroidDisplacement = Math.max(maxCentroidDisplacement, result.metrics.centroidDisplacement);
    births += result.events.filter((event) => event.type === 'reproduction').length;
    sacrifices += result.events.filter((event) => event.type === 'sacrifice').length;
    if (session.state.activity.mode === 'MIGRATING') migrationTicks += 1;

    const target = session.state.migration?.target;
    const targetKey = target ? `${target.x},${target.y}` : null;
    if (target && targetKey !== lastTargetKey) {
      let cluster = targetClusters.find((candidate) =>
        Math.abs(candidate.x - target.x) + Math.abs(candidate.y - target.y) <= 8);
      if (!cluster) {
        cluster = { x: target.x, y: target.y, visits: 0 };
        targetClusters.push(cluster);
      }
      cluster.visits += 1;
      lastTargetKey = targetKey;
    } else if (!target) {
      lastTargetKey = null;
    }

    if (result.events.some((event) => interestingTypes.has(event.type))) {
      maxStagnationTicks = Math.max(maxStagnationTicks, tick - lastInterestingTick - 1);
      lastInterestingTick = tick;
    }
  }

  maxStagnationTicks = Math.max(maxStagnationTicks, 5000 - lastInterestingTick);

  assert.ok(session.state.cells.length > 0, 'organism should survive the long-run scenario');
  assert.ok(births > 0, 'rich pasture should produce growth');
  assert.ok(migrationTicks > 0, 'organism should enter committed migration');
  assert.ok(targetClusters.length >= 3, `expected roaming across at least 3 pasture regions, got ${targetClusters.length}`);
  assert.ok(maxCentroidDisplacement >= 20, `expected meaningful travel, got ${maxCentroidDisplacement.toFixed(2)} tiles`);
  assert.ok(maxStagnationTicks <= 750, `organism stagnated for ${maxStagnationTicks} ticks`);
});
