import test from 'node:test';
import assert from 'node:assert/strict';
import { experiment } from '../helpers/fixtures.js';
import { forageScore, step } from '../../src/simulation/sim.js';

test('feeding scent is bounded, fades without feeding, and affects preference only', async () => {
  const { session } = await experiment('fold-rich');
  let state = session.snapshot();
  for (let i = 0; i < 15; i++) state = step(state, session.rules, session.world, null, { skipTranslation: true }).state;
  assert.equal(state.food.find(f => f.x === 0 && f.y === 0).recentlyGrazed, 1);
  const nutrition = forageScore(state.cells, state, session.rules);
  assert.ok(forageScore(state.cells, state, session.rules, 0, 0, true) < nutrition);
  const withoutScent = structuredClone(state);
  withoutScent.food.forEach(f => delete f.recentlyGrazed);
  assert.equal(forageScore(withoutScent.cells, withoutScent, session.rules), nutrition);
  for (let i = 0; i < 51; i++) state = step(state, session.rules, session.world, null, { skipTranslation: true, skipConsumption: true }).state;
  assert.ok(state.food.every(f => f.recentlyGrazed === 0));
});

test('two-patch journey no longer reverses repeatedly during later feeding', async () => {
  const { session } = await experiment('body-language');
  const events = session.run(150).events;
  assert.ok(events.some(e => e.type === 'food_consumed' && e.x >= 5));
  const movements = events.filter(e => e.type === 'movement' && e.tick >= 80);
  assert.ok(movements.length <= 2, 'late feeding should settle instead of cycling');
  assert.equal(session.state.bodyResponse?.movement, undefined, 'no movement timer memory');
});
