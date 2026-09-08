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
