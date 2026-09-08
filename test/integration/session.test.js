import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GameSession } from '../../src/simulation/session.js';
import { foodContactCount } from '../../src/simulation/morphology.js';
import { scenario, rules, mergeWorld } from '../helpers/fixtures.js';

test('same seed produces identical world evolution', () => {
  const world = mergeWorld({ foodSpawn: { enabled: true, chancePerTick: 1, maxTotalFood: 1000 } });
  const a = new GameSession({ state: scenario, rules, world, seed: 123 }).run(30);
  const b = new GameSession({ state: scenario, rules, world, seed: 123 }).run(30);
  assert.deepEqual(a.finalState, b.finalState);
  assert.deepEqual(a.events, b.events);
});

test('snapshot resume preserves deterministic continuation', () => {
  const world = mergeWorld({ foodSpawn: { enabled: true, chancePerTick: 1, maxTotalFood: 1000 } });
  const session = new GameSession({ state: scenario, rules, world, seed: 77 });
  session.run(15);
  const snapshot = session.snapshot();
  const expected = session.run(20).finalState;
  const resumed = new GameSession({ state: snapshot, rules, world, seed: 999 });
  assert.deepEqual(resumed.run(20).finalState, expected);
});

test('organism wanders when no food is sensed', () => {
  const wanderingScenario = {
    tick: 0,
    cells: [
      { id: 1, x: 0, y: 0, type: 'stem', energy: 80, storedFood: 0 },
      { id: 2, x: 1, y: 0, type: 'stem', energy: 80, storedFood: 0 },
    ],
    food: [],
  };
  const result = new GameSession({
    state: wanderingScenario,
    rules,
    world: mergeWorld({ foodSpawn: { enabled: false } }),
    seed: 51,
  }).run(20);
  assert.ok(result.summary.movementEvents > 0);
  assert.ok((result.summary.activityCounts.SEARCHING ?? 0) > 0);
});

test('food patch regrows but never exceeds capacity', () => {
  const regrowthScenario = {
    tick: 0,
    cells: [{ id: 1, x: 0, y: 0, type: 'stem', energy: 80, storedFood: 0 }],
    food: [{ x: 10, y: 8, amount: 5, capacity: 10, growthRate: 1 }],
  };
  const localRules = structuredClone(rules);
  localRules.search.enabled = false;
  const result = new GameSession({
    state: regrowthScenario,
    rules: localRules,
    world: mergeWorld({ foodSpawn: { enabled: false } }),
    seed: 2,
  }).run(10);
  assert.equal(result.finalState.food[0].amount, 10);
  assert.equal(result.summary.foodRegrown, 5);
});

test('cells graze food directly beneath them and recover energy', () => {
  const grazingScenario = JSON.parse(fs.readFileSync('scenarios/grazing-underlay.json', 'utf8'));
  const localWorld = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const session = new GameSession({ state: grazingScenario, rules, world: localWorld, seed: 1 });
  const initialMeanEnergy = grazingScenario.cells.reduce((sum, cell) => sum + cell.energy, 0) / grazingScenario.cells.length;
  const result = session.run(5);

  assert.equal(result.summary.movementEvents, 0);
  assert.equal(foodContactCount(result.finalState, rules), 4);
  assert.ok(result.summary.foodConsumed > 0);
  assert.ok(result.summary.meanEnergy > initialMeanEnergy);
  assert.ok(result.events.some((event) => event.type === 'food_consumed' && event.x === 0 && event.y === 0));
});

test('sparse grass delivers a smaller bite than rich grass', () => {
  const localWorld = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const rich = {
    tick: 0,
    cells: [{ id: 1, x: 0, y: 0, type: 'stem', energy: 50, storedFood: 0 }],
    food: [{ x: 0, y: 0, amount: 10, capacity: 10, growthRate: 0 }],
  };
  const sparse = {
    tick: 0,
    cells: [{ id: 1, x: 0, y: 0, type: 'stem', energy: 50, storedFood: 0 }],
    food: [{ x: 0, y: 0, amount: 2, capacity: 10, growthRate: 0 }],
  };
  const richResult = new GameSession({ state: rich, rules, world: localWorld, seed: 1 }).run(1);
  const sparseResult = new GameSession({ state: sparse, rules, world: localWorld, seed: 1 }).run(1);
  assert.ok(richResult.summary.foodConsumed > sparseResult.summary.foodConsumed);
});

test('organism shifts within pasture when nearby forage is substantially richer', () => {
  const localWorld = mergeWorld({ foodSpawn: { enabled: false }, foodSpread: { enabled: false } });
  const grazingScenario = {
    tick: 0,
    cells: [
      { id: 1, x: 0, y: 0, type: 'stem', energy: 70, storedFood: 0 },
      { id: 2, x: 0, y: 1, type: 'stem', energy: 70, storedFood: 0 },
      { id: 3, x: 0, y: 2, type: 'stem', energy: 70, storedFood: 0 },
    ],
    food: [
      { x: 0, y: 1, amount: 2, capacity: 10, growthRate: 0 },
      { x: 1, y: 0, amount: 10, capacity: 10, growthRate: 0 },
      { x: 1, y: 1, amount: 10, capacity: 10, growthRate: 0 },
      { x: 1, y: 2, amount: 10, capacity: 10, growthRate: 0 },
    ],
  };
  const session = new GameSession({ state: grazingScenario, rules, world: localWorld, seed: 2 });
  const result = session.step();
  const movement = result.events.find((event) => event.type === 'movement');

  assert.ok(movement);
  assert.equal(movement.dx, 1);
  assert.equal(movement.dy, 0);
  assert.equal(movement.forageBefore, 0.2);
  assert.equal(movement.forageAfter, 3);
  assert.equal(foodContactCount(session.state, rules), 3);
  assert.equal(session.state.activity.mode, 'FEEDING');
});
