import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeMetrics } from '../../src/simulation/sim.js';
import { experiment } from '../helpers/fixtures.js';

test('compact birth one-tick morphology matches reviewed snapshot', async () => {
  const { session } = await experiment('compact-birth');
  const expected = JSON.parse(fs.readFileSync('test/acceptance/snapshots/compact-birth-1.json', 'utf8'));
  const before = computeMetrics(session.state);
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
