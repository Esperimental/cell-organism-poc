import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEED_RATES, accumulatedSteps, speedRateForIndex } from '../../src/gui/speed.js';

test('speed slider exposes slow, medium, and fast-forward rates', () => {
  assert.deepEqual(SPEED_RATES, [1, 2, 4, 8, 16, 32, 64, 128, 256]);
  assert.equal(speedRateForIndex(0), 1);
  assert.equal(speedRateForIndex(4), 16);
  assert.equal(speedRateForIndex(8), 256);
});

test('speed mapping clamps out-of-range slider values', () => {
  assert.equal(speedRateForIndex(-5), 1);
  assert.equal(speedRateForIndex(99), 256);
});

test('accumulated stepping supports multiple simulation ticks per rendered frame', () => {
  const first = accumulatedSteps(16, 256, 0);
  assert.equal(first.steps, 4);
  assert.ok(first.carry > 0 && first.carry < 1);

  const second = accumulatedSteps(16, 256, first.carry);
  assert.ok(second.steps >= 4);
});
