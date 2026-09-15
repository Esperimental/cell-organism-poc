import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateInitialFood } from '../../src/simulation/initialWorld.js';

const scenario = JSON.parse(fs.readFileSync('scenarios/food-east.json', 'utf8'));
const world = JSON.parse(fs.readFileSync('configs/world.json', 'utf8'));

test('initial food generation is deterministic for the same seed', () => {
  const a = generateInitialFood(scenario, world, 12345);
  const b = generateInitialFood(scenario, world, 12345);
  assert.deepEqual(a.food, b.food);
  assert.equal(a.rngState, b.rngState);
});

test('different initial-food seeds produce different layouts', () => {
  const a = generateInitialFood(scenario, world, 111);
  const b = generateInitialFood(scenario, world, 222);
  assert.notDeepEqual(a.food, b.food);
});

test('generated initial food stays in bounds and avoids starting cells', () => {
  const generated = generateInitialFood(scenario, world, 98765);
  const cells = new Set(generated.cells.map((cell) => `${cell.x},${cell.y}`));
  assert.ok(generated.food.length >= 20, `expected several starting clusters, got ${generated.food.length} roots`);
  for (const food of generated.food) {
    assert.ok(food.x >= world.minX && food.x <= world.maxX);
    assert.ok(food.y >= world.minY && food.y <= world.maxY);
    assert.ok(!cells.has(`${food.x},${food.y}`), `food overlapped starting cell at ${food.x},${food.y}`);
  }
});


test('generated world guarantees a starter pasture within short search range', () => {
  const generated = generateInitialFood(scenario, world, 24680);
  const nearest = Math.min(...generated.food.flatMap((food) =>
    generated.cells.map((cell) => Math.abs(food.x - cell.x) + Math.abs(food.y - cell.y))));
  assert.ok(nearest <= 8, `expected starter pasture within 8 tiles, got ${nearest}`);
});
