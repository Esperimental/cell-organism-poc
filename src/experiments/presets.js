import { generateInitialFood } from '../simulation/initialWorld.js';
import { GameSession } from '../simulation/session.js?v=shared-behaviour-1';

// Keep transport (fetch vs filesystem) outside this browser-safe module.
export function mergeSettings(base, overrides = {}) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(overrides)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Invalid setting key');
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeSettings(result[key] ?? {}, value)
      : structuredClone(value);
  }
  return result;
}

export async function loadPreset(id, readJson, { seed } = {}) {
  const catalog = await readJson('experiments/catalog.json');
  if (new Set(catalog.map((entry) => entry.id)).size !== catalog.length) throw new Error('Duplicate experiment ID');
  const preset = catalog.find((entry) => entry.id === id);
  if (!preset) throw new Error(`Unknown experiment: ${id}`);
  if (preset.rules || preset.rulesOverrides) throw new Error('Presets describe environments; simulation rules are shared with the game');
  const resolvedSeed = seed ?? preset.seed;
  if (!Number.isSafeInteger(resolvedSeed) || resolvedSeed < 0 || resolvedSeed > 0xffffffff) {
    throw new Error('Seed must be an unsigned 32-bit integer');
  }
  if (preset.initialFood && !['authored', 'generated'].includes(preset.initialFood)) {
    throw new Error('initialFood must be authored or generated');
  }
  const [scenario, baseRules, baseWorld] = await Promise.all([
    readJson(preset.scenario),
    readJson('configs/baseline.json'),
    readJson(preset.world ?? 'configs/world.json'),
  ]);
  const rules = baseRules;
  const world = mergeSettings(baseWorld, preset.worldOverrides);
  const state = preset.initialFood === 'generated'
    ? generateInitialFood(scenario, world, resolvedSeed)
    : structuredClone(scenario);
  const session = new GameSession({ state, rules, world, seed: resolvedSeed });
  return { preset, seed: resolvedSeed, session };
}
