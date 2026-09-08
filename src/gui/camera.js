export function clampZoom(value, minZoom = 1, maxZoom = 8) {
  return Math.max(minZoom, Math.min(maxZoom, value));
}

export function organismCenter(cells, world) {
  if (!cells.length) {
    return { x: (world.minX + world.maxX) / 2, y: (world.minY + world.maxY) / 2 };
  }
  return {
    x: cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length,
    y: cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length,
  };
}

export function computeCameraLayout({ canvasWidth, canvasHeight, world, cells, zoom, padding = 44 }) {
  const cols = world.maxX - world.minX + 1;
  const rows = world.maxY - world.minY + 1;
  const fitSize = Math.min((canvasWidth - padding * 2) / cols, (canvasHeight - padding * 2) / rows);
  const size = fitSize * zoom;
  const center = zoom <= 1.001
    ? { x: (world.minX + world.maxX) / 2, y: (world.minY + world.maxY) / 2 }
    : organismCenter(cells, world);

  return {
    minX: world.minX,
    maxX: world.maxX,
    minY: world.minY,
    maxY: world.maxY,
    size,
    ox: canvasWidth / 2 - (center.x - world.minX + 0.5) * size,
    oy: canvasHeight / 2 - (center.y - world.minY + 0.5) * size,
    center,
  };
}
