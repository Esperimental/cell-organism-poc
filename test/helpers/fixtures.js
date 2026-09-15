import fs from 'node:fs';
import { loadPreset } from '../../src/experiments/presets.js';

export const experiment = (id) => loadPreset(id, async (path) => JSON.parse(fs.readFileSync(path, 'utf8')));

export const scenario = JSON.parse(fs.readFileSync('scenarios/food-east.json', 'utf8'));
export const rules = JSON.parse(fs.readFileSync('configs/baseline.json', 'utf8'));
export const world = JSON.parse(fs.readFileSync('configs/world.json', 'utf8'));

export function mergeWorld(worldOverride = {}) {
  return {
    ...world,
    ...worldOverride,
    foodPatches: {
      ...world.foodPatches,
      ...(worldOverride.foodPatches ?? {}),
    },
    foodSpawn: {
      ...world.foodSpawn,
      ...(worldOverride.foodSpawn ?? {}),
    },
  };
}
