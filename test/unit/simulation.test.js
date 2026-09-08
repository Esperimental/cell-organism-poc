import test from 'node:test';
import assert from 'node:assert/strict';
import { connectedComponents, nearestFoodVector, step } from '../../src/simulation/sim.js';
import { applyReshape } from '../../src/simulation/morphology.js';
import { rules, mergeWorld } from '../helpers/fixtures.js';

test('connectedComponents separates disconnected cell groups', () => {
  const state = {
    cells: [
      { id: 1, x: 0, y: 0, energy: 50, storedFood: 0 },
      { id: 2, x: 1, y: 0, energy: 50, storedFood: 0 },
      { id: 3, x: 5, y: 5, energy: 50, storedFood: 0 },
    ],
    food: [],
  };
  assert.equal(connectedComponents(state).length, 2);
});

test('nearestFoodVector points toward sensed food', () => {
  const state = {
    cells: [{ id: 1, x: 0, y: 0, energy: 50, storedFood: 0 }],
    food: [{ x: 4, y: 0, amount: 10 }],
  };
  assert.deepEqual(nearestFoodVector(state.cells, state, rules), { dx: 1, dy: 0 });
});

test('movement respects world bounds', () => {
  const world = mergeWorld({ minX: 0, maxX: 2, minY: 0, maxY: 2, foodSpawn: { enabled: false } });
  const state = {
    tick: 0,
    cells: [
      { id: 1, x: 2, y: 1, energy: 80, storedFood: 0 },
      { id: 2, x: 2, y: 2, energy: 80, storedFood: 0 },
    ],
    food: [{ x: 2, y: 0, amount: 10 }],
  };
  const result = step(state, rules, world, { dx: 1, dy: 0 });
  for (const cell of result.state.cells) assert.ok(cell.x <= 2);
});

test('energy sharing conserves total energy before maintenance/digestion effects', () => {
  const localRules = structuredClone(rules);
  localRules.maintenanceEnergy = 0;
  localRules.exposedEdgeEnergyCost = 0;
  localRules.movementEnergy = 0;
  localRules.stem.digestionRate = 0;
  localRules.reproduction.energyThreshold = 101;
  const state = {
    tick: 0,
    cells: [
      { id: 1, x: 0, y: 0, energy: 100, storedFood: 0 },
      { id: 2, x: 1, y: 0, energy: 0.1, storedFood: 0 },
      { id: 3, x: 0, y: 1, energy: 0.1, storedFood: 0 },
    ],
    food: [],
  };
  const before = state.cells.reduce((sum, cell) => sum + cell.energy, 0);
  const result = step(state, localRules, mergeWorld({ foodSpawn: { enabled: false } }));
  const after = result.state.cells.reduce((sum, cell) => sum + cell.energy, 0);
  assert.ok(Math.abs(before - after) < 1e-9, `expected energy conservation, got ${before} -> ${after}`);
});

test('applying a reshape charges the moving cell exact reshape energy', () => {
  const state = {
    cells: [
      { id: 1, x: 0, y: 0, energy: 10, storedFood: 0 },
      { id: 2, x: 1, y: 0, energy: 10, storedFood: 0 },
    ],
    food: [],
  };
  const reshape = {
    cellId: 1,
    from: { x: 0, y: 0 },
    to: { x: 0, y: 1 },
    energyCost: 0.4,
  };

  assert.equal(applyReshape(state, reshape), true);
  assert.equal(state.cells[0].energy, 9.6);
  assert.deepEqual({ x: state.cells[0].x, y: state.cells[0].y }, { x: 0, y: 1 });
});
