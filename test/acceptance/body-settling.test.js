import test from 'node:test';
import assert from 'node:assert/strict';
import { experiment } from '../helpers/fixtures.js';
import { connectedComponents } from '../../src/simulation/sim.js';

test('cross prepares a fold and covers all four rich food tiles', async () => {
  const { session } = await experiment('fold-rich');
  const events = [];
  for (let i = 0; i < 6; i++) {
    events.push(...session.step().events);
    assert.equal(connectedComponents(session.state).length, 1);
  }
  assert.ok(events.some(e => e.reason === 'preparing_fold'));
  assert.ok(session.state.food.every(f => session.state.cells.some(c => c.x === f.x && c.y === f.y)));
});

for (const id of ['body-language', 'balanced-feeding']) {
  test(`${id}: healthy feeding does not shudder between consecutive ticks`, async () => {
    const { session } = await experiment(id);
    let last = null;
    for (let i = 0; i < 150; i++) {
      const result = session.step();
      assert.equal(connectedComponents(session.state).length, 1);
      for (const e of result.events.filter(e => e.type === 'movement')) {
        assert.ok(!(last && e.tick - last.tick === 1 && e.dx === -last.dx && e.dy === -last.dy), `reversed at ${e.tick}`);
        last = e;
      }
    }
  });
}

test('settling still lets the body leave depleted food and feed on a new patch', async () => {
  const { session } = await experiment('leave-depleted');
  let arrived = false;
  for (let i = 0; i < 60; i++) {
    const result = session.step();
    assert.ok(session.state.cells.length > 0);
    assert.equal(connectedComponents(session.state).length, 1);
    arrived ||= result.events.some(e => e.type === 'food_consumed' && e.x >= 5);
  }
  assert.ok(arrived);
});
