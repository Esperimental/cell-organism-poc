import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameSession } from '../../src/simulation/session.js';
import { computeMetrics } from '../../src/simulation/sim.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('compact birth one-tick morphology matches reviewed snapshot', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/compact-birth.json', 'utf8'));
  const expected = JSON.parse(fs.readFileSync('test/acceptance/snapshots/compact-birth-1.json', 'utf8'));
  const localRules = structuredClone(rules);
  localRules.search.enabled = false;
  localRules.maintenanceEnergy = 0;
  localRules.exposedEdgeEnergyCost = 0;
  localRules.stem.energyTransferRate = 0;
  localRules.stem.foodTransferRate = 0;
  const world = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const before = computeMetrics(state);
  const session = new GameSession({ state, rules: localRules, world, seed: 1 });
  const result = session.step();
  const birth = result.events.find((event) => event.type === 'reproduction');
  const after = computeMetrics(session.state);

  const actual = {
    birth: {
      tick: birth.tick,
      parentId: birth.parentId,
      childId: birth.childId,
      x: birth.x,
      y: birth.y,
      touchingCells: birth.touchingCells,
    },
    cellCountBefore: before.cellCount,
    cellCountAfter: after.cellCount,
    exposedEdgesBefore: before.exposedEdges,
    exposedEdgesAfter: after.exposedEdges,
    compactnessBefore: Number(before.compactness.toFixed(3)),
    compactnessAfter: Number(after.compactness.toFixed(3)),
  };

  assert.deepEqual(actual, expected);
});
