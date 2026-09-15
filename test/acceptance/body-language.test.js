import test from 'node:test';
import assert from 'node:assert/strict';
import { experiment } from '../helpers/fixtures.js';
import { GameSession } from '../../src/simulation/session.js';
import { connectedComponents } from '../../src/simulation/sim.js';

for (const variant of ['original', 'mirrored', 'rotated']) {
  test(`body response reaches, feeds and travels as a connected body (${variant})`, async () => {
    const loaded = await experiment('body-language');
    const state = loaded.session.snapshot();
    const world = structuredClone(loaded.session.world);
    const transform = variant === 'mirrored' ? (x, y) => [-x, y]
      : variant === 'rotated' ? (x, y) => [-y, x] : (x, y) => [x, y];
    for (const point of [...state.cells, ...state.food]) [point.x, point.y] = transform(point.x, point.y);
    const corners = [transform(world.minX, world.minY), transform(world.maxX, world.maxY)];
    world.minX = Math.min(...corners.map(p => p[0]));
    world.maxX = Math.max(...corners.map(p => p[0]));
    world.minY = Math.min(...corners.map(p => p[1]));
    world.maxY = Math.max(...corners.map(p => p[1]));
    const secondPatch = new Set(state.food.slice(3).map(p => `${p.x},${p.y}`));
    const session = new GameSession({ state, rules: loaded.session.rules, world, seed: 1 });
    let firstReach = null;
    let firstTranslation = null;
    let fedFirst = false;
    let fedSecond = false;
    let settledTicks = 0;
    for (let tick = 1; tick <= 100; tick += 1) {
      const before = session.snapshot();
      const result = session.step();
      assert.equal(connectedComponents(session.state).length, 1);
      assert.equal(session.state.cells.length, 5, 'short journey should preserve every initial cell');
      for (const event of result.events) {
        if (event.type === 'reshape') {
          firstReach ??= tick;
          assert.equal(Math.abs(event.to.x - event.from.x) + Math.abs(event.to.y - event.from.y), 1);
          assert.ok(event.foodContactsAfter >= event.foodContactsBefore);
          assert.ok(!result.events.some(e => e.type === 'movement'), 'body adjustment gets its own tick');
          assert.equal(before.cells.filter(c => {
            const after = session.state.cells.find(a => a.id === c.id);
            return after.x !== c.x || after.y !== c.y;
          }).length, 1);
        }
        if (event.type === 'movement') firstTranslation ??= tick;
        if (event.type === 'food_consumed') {
          if (secondPatch.has(`${event.x},${event.y}`)) fedSecond = true;
          else fedFirst = true;
        }
      }
      if (result.events.some(e => e.type === 'food_consumed')
        && !result.events.some(e => ['movement', 'reshape'].includes(e.type))) settledTicks++;
    }
    assert.ok(firstReach > 0 && firstReach < firstTranslation, 'reach before rigid travel');
    assert.ok(fedFirst && fedSecond, 'feed on both patches');
    assert.ok(settledTicks >= 5, 'feeding should include quiet, settled ticks');
  });
}

test('control scene retains rigid movement and response has no attraction to absent food', async () => {
  const { session: control } = await experiment('body-language-control');
  const result = control.run(100);
  assert.ok(result.events.some(e => e.type === 'movement'));
  assert.ok(!result.events.some(e => e.type === 'reshape'));
  const { session: responsive } = await experiment('body-language');
  responsive.state.food = [];
  assert.ok(!responsive.run(20).events.some(e => e.type === 'reshape'));
});
