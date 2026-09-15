import { clone } from './sim.js';
import { normalizeSeed, randomInt } from './rng.js';

function key(x, y) {
  return `${x},${y}`;
}

export function generateInitialFood(stateInput, world, seed, options = {}) {
  const state = clone(stateInput);
  const clusterCount = options.clusterCount ?? world.initialFood?.clusterCount ?? 7;
  const minClusterRoots = options.minClusterRoots ?? world.initialFood?.minClusterRoots ?? 3;
  const maxClusterRoots = options.maxClusterRoots ?? world.initialFood?.maxClusterRoots ?? 8;
  const clusterRadius = options.clusterRadius ?? world.initialFood?.clusterRadius ?? 3;
  const minAmount = options.minAmount ?? world.initialFood?.minAmount ?? 8;
  const maxAmount = options.maxAmount ?? world.initialFood?.maxAmount ?? 18;
  const avoidCellRadius = options.avoidCellRadius ?? world.initialFood?.avoidCellRadius ?? 5;
  const margin = Math.max(clusterRadius + 1, options.margin ?? world.initialFood?.margin ?? 3);
  const capacity = world.foodPatches?.defaultCapacity ?? 24;
  const growthRate = world.foodPatches?.defaultGrowthRate ?? 0;
  const occupiedCells = new Set(state.cells.map((cell) => key(cell.x, cell.y)));
  const roots = new Map();
  let rngState = normalizeSeed(seed);

  function nextInt(min, max) {
    const roll = randomInt(rngState, min, max);
    rngState = roll.state;
    return roll.value;
  }

  function farEnoughFromCells(x, y) {
    return state.cells.every((cell) => Math.abs(cell.x - x) + Math.abs(cell.y - y) >= avoidCellRadius);
  }

  const centers = [];
  if (state.cells.length && clusterCount > 0) {
    const centerX = state.cells.reduce((sum, cell) => sum + cell.x, 0) / state.cells.length;
    const centerY = state.cells.reduce((sum, cell) => sum + cell.y, 0) / state.cells.length;
    const starterMinDistance = options.starterMinDistance ?? world.initialFood?.starterMinDistance ?? 6;
    const starterMaxDistance = options.starterMaxDistance ?? world.initialFood?.starterMaxDistance ?? 8;
    for (let attempt = 0; attempt < 20 && !centers.length; attempt += 1) {
      const distance = nextInt(starterMinDistance, starterMaxDistance);
      const direction = nextInt(0, 3);
      const x = Math.round(centerX) + (direction === 0 ? distance : direction === 1 ? -distance : 0);
      const y = Math.round(centerY) + (direction === 2 ? distance : direction === 3 ? -distance : 0);
      if (x < world.minX + margin || x > world.maxX - margin || y < world.minY + margin || y > world.maxY - margin) continue;
      if (!farEnoughFromCells(x, y)) continue;
      centers.push({ x, y });
    }
  }

  const maxCenterAttempts = Math.max(100, clusterCount * 50);
  for (let attempt = 0; centers.length < clusterCount && attempt < maxCenterAttempts; attempt += 1) {
    const x = nextInt(world.minX + margin, world.maxX - margin);
    const y = nextInt(world.minY + margin, world.maxY - margin);
    if (!farEnoughFromCells(x, y)) continue;
    if (centers.some((center) => Math.abs(center.x - x) + Math.abs(center.y - y) < clusterRadius * 3 + 4)) continue;
    centers.push({ x, y });
  }

  for (const center of centers) {
    const rootTarget = nextInt(minClusterRoots, maxClusterRoots);
    const local = [{ x: center.x, y: center.y }];
    const localKeys = new Set([key(center.x, center.y)]);
    let attempts = 0;
    while (local.length < rootTarget && attempts < rootTarget * 30) {
      attempts += 1;
      const base = local[nextInt(0, local.length - 1)];
      const direction = nextInt(0, 3);
      const dx = direction === 0 ? 1 : direction === 1 ? -1 : 0;
      const dy = direction === 2 ? 1 : direction === 3 ? -1 : 0;
      const x = base.x + dx;
      const y = base.y + dy;
      if (Math.abs(x - center.x) + Math.abs(y - center.y) > clusterRadius) continue;
      if (x < world.minX || x > world.maxX || y < world.minY || y > world.maxY) continue;
      const positionKey = key(x, y);
      if (localKeys.has(positionKey) || roots.has(positionKey) || occupiedCells.has(positionKey)) continue;
      local.push({ x, y });
      localKeys.add(positionKey);
    }

    for (const root of local) {
      const amount = nextInt(minAmount, maxAmount);
      roots.set(key(root.x, root.y), {
        x: root.x,
        y: root.y,
        amount,
        capacity: Math.max(capacity, amount),
        growthRate,
      });
    }
  }

  state.food = [...roots.values()].sort((a, b) => (a.y - b.y) || (a.x - b.x));
  state.rngState = rngState;
  return state;
}
