import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameSession } from '../../src/simulation/session.js';
import { computeMetrics } from '../../src/simulation/sim.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('survival journey sheds cells, reaches pasture, then recovers', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/survival-journey.json', 'utf8'));
  const expected = JSON.parse(fs.readFileSync('test/acceptance/snapshots/survival-journey-12.json', 'utf8'));
  const world = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const session = new GameSession({ state, rules, world, seed: 1 });
  const actual = [];

  for (let i = 0; i < 12; i += 1) {
    const result = session.step();
    actual.push({
      tick: session.state.tick,
      cells: session.state.cells.length,
      meanEnergy: Number(computeMetrics(session.state).meanEnergy.toFixed(2)),
      activity: session.state.activity.mode,
      sacrifices: result.events.filter((event) => event.type === 'sacrifice').length,
      moved: result.events.some((event) => event.type === 'movement'),
    });
  }

  assert.deepEqual(actual, expected);
});
