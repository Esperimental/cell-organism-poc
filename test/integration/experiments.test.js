import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { loadPreset, mergeSettings } from '../../src/experiments/presets.js';
import { seekToTick } from '../../src/experiments/seek.js';
import { GameSession } from '../../src/simulation/session.js';
import { generateInitialFood } from '../../src/simulation/initialWorld.js';
const read = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));
const catalog = await read('experiments/catalog.json');

test('every playable preset uses the unmodified game rules', async () => {
  const baseline = await read('configs/baseline.json');
  for (const preset of catalog) {
    assert.equal(preset.rules, undefined);
    assert.equal(preset.rulesOverrides, undefined);
    const { session } = await loadPreset(preset.id, read);
    assert.deepEqual(session.rules, baseline);
  }
});

for (const preset of catalog) {
  test(preset.id + ': batched seek, replay and headless run agree', async () => {
    const { session: headless } = await loadPreset(preset.id, read);
    // A transport returning fresh JSON mimics the browser fetch boundary.
    const { session: browser } = await loadPreset(preset.id, async (path) => JSON.parse(JSON.stringify(await read(path))));
    const target = preset.view.tick;
    headless.run(target - headless.state.tick);
    await seekToTick(browser, target, { batchSize: 3, yieldBatch: async () => {} });
    assert.deepEqual(browser.snapshot(), headless.snapshot());
    await seekToTick(browser, browser.initialState.tick);
    await seekToTick(browser, target, { yieldBatch: async () => {} });
    assert.deepEqual(browser.snapshot(), headless.snapshot());
    // Checkpoint contains all behavioural state needed to resume.
    const restored = new GameSession({ state: browser.snapshot(), rules: browser.rules, world: browser.world });
    browser.run(10);
    restored.run(10);
    assert.deepEqual(restored.snapshot(), browser.snapshot());
  });
}
test('authored food survives loading; generated ecology matches longevity initialization', async () => {
  const authored = await loadPreset('feeding-reshape', read);
  assert.deepEqual(authored.session.state.food, (await read(authored.preset.scenario)).food);
  const generated = await loadPreset('baseline-ecology', read);
  const expected = new GameSession({
    state: generateInitialFood(await read(generated.preset.scenario), generated.session.world, generated.seed),
    rules: generated.session.rules, world: generated.session.world, seed: generated.seed,
  });
  assert.deepEqual(generated.session.snapshot(), expected.snapshot());
});
test('seek cancellation leaves a valid resumable checkpoint', async () => {
  const { session } = await loadPreset('baseline-ecology', read);
  let cancelled = false;
  assert.equal(await seekToTick(session, 1000, {
    batchSize: 7, cancelled: () => cancelled,
    yieldBatch: async () => { cancelled = true; },
  }), false);
  assert.equal(session.state.tick, 7);
  await seekToTick(session, 20, { yieldBatch: async () => {} });
  const { session: reference } = await loadPreset('baseline-ecology', read);
  reference.run(20);
  assert.deepEqual(session.snapshot(), reference.snapshot());
  await assert.rejects(seekToTick(session, -1));
  assert.equal(session.state.tick, 20);
});
test('nested overrides preserve sibling settings and leave defaults untouched', () => {
  const base = { patch: { recovery: { enabled: true, rate: 2 }, capacity: 5 } };
  const merged = mergeSettings(base, { patch: { recovery: { enabled: false } } });
  assert.deepEqual(merged, { patch: { recovery: { enabled: false, rate: 2 }, capacity: 5 } });
  assert.equal(base.patch.recovery.enabled, true);
});
test('bad preset or seed fails explicitly', async () => {
  await assert.rejects(loadPreset('missing', read), /Unknown experiment/);
  await assert.rejects(loadPreset('baseline-ecology', read, { seed: NaN }), /Seed/);
});
