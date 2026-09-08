import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameSession } from '../../src/simulation/session.js';
import { computeMetrics } from '../../src/simulation/sim.js';
import { foodContactCount } from '../../src/simulation/morphology.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('grazing underlay five-tick behavior matches reviewed snapshot', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/grazing-underlay.json', 'utf8'));
  const world = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const expected = JSON.parse(fs.readFileSync('test/acceptance/snapshots/grazing-underlay-5.json', 'utf8'));
  const session = new GameSession({ state, rules, world, seed: 1 });
  const actual = [];

  for (let i = 0; i < 5; i += 1) {
    const result = session.step();
    actual.push({
      tick: session.state.tick,
      activity: session.state.activity.mode,
      grazingCells: foodContactCount(session.state, rules),
      movementEvents: result.events.filter((event) => event.type === 'movement').length,
      foodConsumed: Number(result.events.filter((event) => event.type === 'food_consumed').reduce((sum, event) => sum + event.amount, 0).toFixed(3)),
      meanEnergy: Number(computeMetrics(session.state).meanEnergy.toFixed(3)),
      foodBiomass: Number(session.state.food.reduce((sum, food) => sum + food.amount, 0).toFixed(3)),
    });
  }

  assert.deepEqual(actual, expected);
});
