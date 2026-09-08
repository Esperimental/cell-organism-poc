import test from 'node:test';
import assert from 'node:assert/strict';
import { clampZoom, computeCameraLayout, organismCenter } from '../../src/gui/camera.js';

const world = { minX: -50, maxX: 50, minY: -35, maxY: 35 };

test('camera zoom clamps to configured range', () => {
  assert.equal(clampZoom(0.2, 1, 8), 1);
  assert.equal(clampZoom(3.5, 1, 8), 3.5);
  assert.equal(clampZoom(20, 1, 8), 8);
});

test('Fit layout centers the whole world instead of following the organism', () => {
  const layout = computeCameraLayout({
    canvasWidth: 1100,
    canvasHeight: 720,
    world,
    cells: [{ x: 30, y: 20 }],
    zoom: 1,
  });
  assert.deepEqual(layout.center, { x: 0, y: 0 });
});

test('zoomed layout follows organism centroid', () => {
  const cells = [{ x: 10, y: 6 }, { x: 14, y: 10 }];
  assert.deepEqual(organismCenter(cells, world), { x: 12, y: 8 });
  const layout = computeCameraLayout({
    canvasWidth: 1100,
    canvasHeight: 720,
    world,
    cells,
    zoom: 3,
  });
  assert.deepEqual(layout.center, { x: 12, y: 8 });
});
