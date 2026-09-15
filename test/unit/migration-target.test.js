import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chooseMigrationTarget } from '../../src/simulation/session.js';
import { rules } from '../helpers/fixtures.js';

test('migration target balances pasture value against travel cost instead of choosing nearest qualifying tile', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/three-pasture-migration.json', 'utf8'));
  const target = chooseMigrationTarget(state, rules);

  assert.ok(target);
  assert.ok(target.x >= 18 && target.x <= 20, `expected richer distant pasture, got ${target.x},${target.y}`);
  assert.ok(target.y >= 8 && target.y <= 9, `expected richer distant pasture, got ${target.x},${target.y}`);
});


test('recent pasture memory temporarily discounts a just-visited rich field', () => {
  const base = JSON.parse(fs.readFileSync('scenarios/three-pasture-migration.json', 'utf8'));
  const localRules = structuredClone(rules);
  localRules.grazing.migrationTargetJitterFraction = 0;
  localRules.grazing.migrationRevisitCooldownTicks = 1800;
  localRules.grazing.migrationRecentPastureMinValueFraction = 0.12;

  const fresh = structuredClone(base);
  const freshTarget = chooseMigrationTarget(fresh, localRules);
  assert.ok(freshTarget.x >= 18 && freshTarget.x <= 20);

  const remembered = structuredClone(base);
  remembered.tick = 1000;
  remembered.pastureHistory = [{ x: freshTarget.x, y: freshTarget.y, visitedTick: 1000 }];
  const discountedTarget = chooseMigrationTarget(remembered, localRules);
  assert.ok(discountedTarget.x >= 10 && discountedTarget.x <= 11, `expected nearer alternate pasture, got ${discountedTarget.x},${discountedTarget.y}`);

  remembered.tick = 3001;
  const recoveredTarget = chooseMigrationTarget(remembered, localRules);
  assert.ok(recoveredTarget.x >= 18 && recoveredTarget.x <= 20, `expected old rich pasture to become attractive again, got ${recoveredTarget.x},${recoveredTarget.y}`);
});

test('migration target jitter is deterministic for the same RNG state', () => {
  const stateA = JSON.parse(fs.readFileSync('scenarios/three-pasture-migration.json', 'utf8'));
  const stateB = structuredClone(stateA);
  stateA.rngState = 12345;
  stateB.rngState = 12345;
  const localRules = structuredClone(rules);
  localRules.grazing.migrationTargetJitterFraction = 0.04;

  const a = chooseMigrationTarget(stateA, localRules);
  const b = chooseMigrationTarget(stateB, localRules);

  assert.deepEqual(a, b);
  assert.equal(stateA.rngState, stateB.rngState);
});

test('migration target can use a useful cluster even when no individual food tile is above the per-tile richness threshold', () => {
  const state = JSON.parse(fs.readFileSync('scenarios/staged-refuel.json', 'utf8'));
  state.food = state.food.filter((food) => food.x >= 10);
  const localRules = structuredClone(rules);
  localRules.grazing.migrationTargetJitterFraction = 0;

  const target = chooseMigrationTarget(state, localRules);

  assert.ok(target, 'expected a modest multi-tile cluster to be considered a valid migration target');
  assert.ok(target.x >= 10, `expected a staged refuel cluster, got ${target.x},${target.y}`);
  assert.ok(target.localBiomass >= 15, `expected aggregate pasture biomass >= 15, got ${target.localBiomass}`);
});

test('stressed organism prioritizes nearest viable refuel stop over richer distant pasture', () => {
  const state = {
    tick: 100,
    rngState: 42,
    cells: [
      { id: 1, x: 0, y: 0, energy: 20, storedFood: 0 },
      { id: 2, x: 1, y: 0, energy: 20, storedFood: 0 },
      { id: 3, x: 0, y: 1, energy: 20, storedFood: 0 },
    ],
    food: [
      { x: 3, y: 0, amount: 5, capacity: 10 },
      { x: 3, y: 1, amount: 5, capacity: 10 },
      { x: 30, y: 20, amount: 24, capacity: 24 },
      { x: 31, y: 20, amount: 24, capacity: 24 },
      { x: 30, y: 21, amount: 24, capacity: 24 },
    ],
  };
  const localRules = structuredClone(rules);
  localRules.grazing.migrationTargetJitterFraction = 0;
  const target = chooseMigrationTarget(state, localRules);

  assert.ok(target);
  assert.equal(target.emergency, true);
  assert.ok(target.x <= 3, `expected nearby emergency refuel target, got ${target.x},${target.y}`);
  assert.ok(target.distance <= 3, `expected short emergency journey, got distance ${target.distance}`);
});
