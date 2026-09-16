const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const key = (x, y) => `${x},${y}`;

function inBounds(x, y, world) {
  if (!world) return true;
  return x >= world.minX && x <= world.maxX && y >= world.minY && y <= world.maxY;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizeState(input) {
  const state = clone(input);
  state.tick ??= 0;
  state.nextCellId ??= Math.max(0, ...state.cells.map((c) => c.id)) + 1;
  state.food ??= [];
  for (const cell of state.cells) {
    cell.storedFood ??= 0;
  }
  return state;
}

function cellMap(state) {
  return new Map(state.cells.map((c) => [key(c.x, c.y), c]));
}

function foodMap(state, minAmount = 0) {
  return new Map(state.food.filter((f) => f.amount >= minAmount && f.amount > 0).map((f) => [key(f.x, f.y), f]));
}

function neighbors(cell, map) {
  return DIRS.map(({ dx, dy }) => map.get(key(cell.x + dx, cell.y + dy))).filter(Boolean);
}

export function connectedComponents(state) {
  const map = cellMap(state);
  const seen = new Set();
  const components = [];
  for (const cell of state.cells) {
    if (seen.has(cell.id)) continue;
    const stack = [cell];
    const component = [];
    seen.add(cell.id);
    while (stack.length) {
      const current = stack.pop();
      component.push(current);
      for (const n of neighbors(current, map)) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          stack.push(n);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function centroid(cells) {
  if (!cells.length) return null;
  return {
    x: cells.reduce((s, c) => s + c.x, 0) / cells.length,
    y: cells.reduce((s, c) => s + c.y, 0) / cells.length,
  };
}

export function nearestFoodVector(component, state, rules) {
  if (!state.food.length) return { dx: 0, dy: 0 };
  let vx = 0;
  let vy = 0;
  for (const cell of component) {
    for (const food of state.food) {
      if (food.amount < (rules.foodSenseMinBiomass ?? 0.000001)) continue;
      const dx = food.x - cell.x;
      const dy = food.y - cell.y;
      const d = Math.abs(dx) + Math.abs(dy);
      if (d === 0 || d > rules.foodSenseRadius) continue;
      const weight = food.amount / d;
      vx += Math.sign(dx) * weight;
      vy += Math.sign(dy) * weight;
    }
  }
  if (Math.abs(vx) >= Math.abs(vy) && vx !== 0) return { dx: Math.sign(vx), dy: 0 };
  if (vy !== 0) return { dx: 0, dy: Math.sign(vy) };
  return { dx: 0, dy: 0 };
}

function canTranslate(component, state, dx, dy, world) {
  if (dx === 0 && dy === 0) return false;
  const occupied = cellMap(state);
  const own = new Set(component.map((c) => c.id));
  for (const cell of component) {
    if (!inBounds(cell.x + dx, cell.y + dy, world)) return false;
    const target = occupied.get(key(cell.x + dx, cell.y + dy));
    if (target && !own.has(target.id)) return false;
  }
  return true;
}

export function effectiveFoodIntakeRate(state, rules) {
  if (!state.cells.length) return rules.stem.foodIntakeRate;
  const meanEnergy = state.cells.reduce((sum, cell) => sum + cell.energy, 0) / state.cells.length;
  const threshold = rules.stem.maxEnergy * (rules.stem.emergencyIntakeMeanEnergyFraction ?? 0.55);
  if (meanEnergy < threshold) return rules.stem.emergencyFoodIntakeRate ?? rules.stem.foodIntakeRate;
  return rules.stem.foodIntakeRate;
}

function grazingIntakeRate(food, rules, intakeRate = rules.stem.foodIntakeRate) {
  if (!food || food.amount <= 0) return 0;
  const capacity = Math.max(food.capacity ?? food.amount, 1e-9);
  const fullness = Math.max(0, Math.min(1, food.amount / capacity));
  const minimumFraction = rules.stem.foodIntakeMinFraction ?? 0.15;
  return intakeRate * Math.max(minimumFraction, fullness);
}

export function forageScore(component, state, rules, dx = 0, dy = 0, preference = false) {
  const fmap = foodMap(state);
  const intakeRate = effectiveFoodIntakeRate(state, rules);
  return component.reduce((sum, cell) => {
    const food = fmap.get(key(cell.x + dx, cell.y + dy));
    const intake = grazingIntakeRate(food, rules, intakeRate);
    const scent = preference && rules.reshape?.responsive ? (food?.recentlyGrazed ?? 0) * 0.35 : 0;
    return sum + Math.max(0, intake - scent);
  }, 0);
}

export function forageSupportRatio(component, state, rules) {
  if (!component.length) return 0;
  const occupied = cellMap(state);
  const maintenance = component.reduce(
    (sum, cell) => sum + rules.maintenanceEnergy + exposedEdges(cell, occupied) * rules.exposedEdgeEnergyCost,
    0,
  );
  if (maintenance <= 0) return Infinity;
  const potentialEnergy = forageScore(component, state, rules) * rules.stem.digestionEfficiency;
  return potentialEnergy / maintenance;
}

function consumeFood(state, rules, events) {
  const fmap = foodMap(state);
  const intakeRate = effectiveFoodIntakeRate(state, rules);
  for (const cell of [...state.cells].sort((a, b) => a.id - b.id)) {
    const capacity = Math.max(0, rules.stem.foodCapacity - cell.storedFood);
    if (capacity <= 0) continue;
    const food = fmap.get(key(cell.x, cell.y));
    if (!food || food.amount <= 0) continue;
    const amount = Math.min(grazingIntakeRate(food, rules, intakeRate), capacity, food.amount);
    if (amount <= 0) continue;
    food.amount -= amount;
    if (rules.reshape?.responsive) food.recentlyGrazed = Math.min(1, (food.recentlyGrazed ?? 0) + 0.12);
    cell.storedFood += amount;
    events.push({ tick: state.tick, type: 'food_consumed', cellId: cell.id, x: cell.x, y: cell.y, amount });
  }
  state.food = state.food.filter((f) => f.amount > 1e-9 || f.capacity !== undefined);
}

function shareScalar(state, property, rate, maxValue, eventType, events) {
  const map = cellMap(state);
  const balances = new Map(state.cells.map((c) => [c.id, c[property]]));
  const pairs = [];
  for (const cell of state.cells) {
    for (const n of neighbors(cell, map)) {
      if (cell.id < n.id) pairs.push([cell, n]);
    }
  }
  pairs.sort((a, b) => (a[0].id - b[0].id) || (a[1].id - b[1].id));
  for (const [a, b] of pairs) {
    const aValue = balances.get(a.id);
    const bValue = balances.get(b.id);
    const diff = aValue - bValue;
    if (Math.abs(diff) < 1e-9) continue;
    const donor = diff > 0 ? a : b;
    const receiver = diff > 0 ? b : a;
    const donorValue = balances.get(donor.id);
    const receiverValue = balances.get(receiver.id);
    const amount = Math.min(Math.abs(diff) * rate, donorValue, maxValue - receiverValue);
    if (amount <= 0) continue;
    balances.set(donor.id, donorValue - amount);
    balances.set(receiver.id, receiverValue + amount);
    events.push({ tick: state.tick, type: eventType, from: donor.id, to: receiver.id, amount });
  }
  for (const cell of state.cells) cell[property] = balances.get(cell.id);
}

function exposedEdges(cell, map) {
  return DIRS.reduce((count, { dx, dy }) => count + (map.has(key(cell.x + dx, cell.y + dy)) ? 0 : 1), 0);
}

const DIAGONALS = [
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

function occupiedNeighborCount(x, y, occupied) {
  return DIRS.reduce((count, { dx, dy }) => count + (occupied.has(key(x + dx, y + dy)) ? 1 : 0), 0);
}

function occupiedDiagonalCount(x, y, occupied) {
  return DIAGONALS.reduce((count, { dx, dy }) => count + (occupied.has(key(x + dx, y + dy)) ? 1 : 0), 0);
}

export function chooseReproductionSpot(parent, state, world, occupiedInput = null) {
  const occupied = occupiedInput ?? cellMap(state);
  const center = centroid([...occupied.values()]);
  const perimeter = new Map();

  for (const cell of occupied.values()) {
    for (const { dx, dy } of DIRS) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const positionKey = key(x, y);
      if (!inBounds(x, y, world) || occupied.has(positionKey)) continue;
      perimeter.set(positionKey, { x, y });
    }
  }

  const candidates = [...perimeter.values()]
    .map((spot) => {
      const touchingCells = occupiedNeighborCount(spot.x, spot.y, occupied);
      const diagonalCells = occupiedDiagonalCount(spot.x, spot.y, occupied);
      return {
        ...spot,
        touchingCells,
        diagonalCells,
        roundnessScore: touchingCells * 2 + diagonalCells,
        centroidDistance: center ? Math.abs(spot.x - center.x) + Math.abs(spot.y - center.y) : 0,
      };
    })
    .sort((a, b) =>
      (b.roundnessScore - a.roundnessScore)
      || (b.touchingCells - a.touchingCells)
      || (b.diagonalCells - a.diagonalCells)
      || (a.centroidDistance - b.centroidDistance)
      || (a.y - b.y)
      || (a.x - b.x));
  return candidates[0] ?? null;
}

function reproduce(state, rules, world, events, diagnostics) {
  const occupied = cellMap(state);
  const newborns = [];
  for (const cell of [...state.cells].sort((a, b) => a.id - b.id)) {
    if (cell.energy < rules.reproduction.energyThreshold) { diagnostics.reproductionBlockedEnergy += 1; continue; }
    if (cell.storedFood < rules.reproduction.foodThreshold) { diagnostics.reproductionBlockedFood += 1; continue; }
    if ((cell.lastReproductionTick ?? -Infinity) + rules.reproduction.cooldown > state.tick) continue;
    const spot = chooseReproductionSpot(cell, state, world, occupied);
    if (!spot) { diagnostics.reproductionBlockedSpace += 1; continue; }
    cell.energy -= rules.reproduction.energyCost;
    cell.storedFood -= rules.reproduction.foodCost;
    cell.lastReproductionTick = state.tick;
    const newborn = {
      id: state.nextCellId++,
      x: spot.x,
      y: spot.y,
      type: 'stem',
      energy: rules.reproduction.childEnergy,
      storedFood: 0,
      lastReproductionTick: state.tick,
    };
    newborns.push(newborn);
    occupied.set(key(spot.x, spot.y), newborn);
    events.push({ tick: state.tick, type: 'reproduction', parentId: cell.id, childId: newborn.id, x: newborn.x, y: newborn.y, touchingCells: spot.touchingCells, diagonalCells: spot.diagonalCells, roundnessScore: spot.roundnessScore });
  }
  state.cells.push(...newborns);
}

export function chooseSacrificeCell(component, state, direction) {
  if (!component || component.length <= 1) return null;
  const occupied = cellMap(state);
  const dx = direction?.dx ?? 0;
  const dy = direction?.dy ?? 0;
  const center = centroid(component);
  const candidates = [];

  for (const cell of component) {
    const touchingCells = occupiedNeighborCount(cell.x, cell.y, occupied);
    if (touchingCells >= 4) continue;
    const reduced = component.filter((candidate) => candidate.id !== cell.id);
    if (connectedComponents({ tick: state.tick, cells: reduced, food: [] }).length > 1) continue;
    const rearScore = center ? -((cell.x - center.x) * dx + (cell.y - center.y) * dy) : 0;
    candidates.push({ cell, touchingCells, rearScore });
  }

  candidates.sort((a, b) =>
    (a.touchingCells - b.touchingCells)
    || (b.rearScore - a.rearScore)
    || (a.cell.id - b.cell.id));
  return candidates[0] ?? null;
}

function redistributeRecoveredEnergy(state, amount, maxEnergy) {
  if (amount <= 0 || !state.cells.length) return 0;
  let remaining = amount;
  let recipients = state.cells.filter((cell) => cell.energy < maxEnergy - 1e-9);
  while (remaining > 1e-9 && recipients.length) {
    const share = remaining / recipients.length;
    let distributed = 0;
    for (const cell of recipients) {
      const accepted = Math.min(share, maxEnergy - cell.energy);
      cell.energy += accepted;
      distributed += accepted;
    }
    if (distributed <= 1e-9) break;
    remaining -= distributed;
    recipients = state.cells.filter((cell) => cell.energy < maxEnergy - 1e-9);
  }
  return amount - remaining;
}

export function sacrificeForTravel(state, rules, component, direction, events) {
  const config = rules.survival?.sacrifice;
  if (!config?.enabled || component.length <= (config.minCells ?? 2)) return null;
  const meanEnergy = component.reduce((sum, cell) => sum + cell.energy, 0) / component.length;
  const largeOrganismMinCells = config.largeOrganismMinCells ?? Infinity;
  const thresholdFraction = component.length >= largeOrganismMinCells
    ? (config.largeOrganismMeanEnergyThresholdFraction ?? config.meanEnergyThresholdFraction ?? 0.2)
    : (config.meanEnergyThresholdFraction ?? 0.2);
  const threshold = rules.stem.maxEnergy * thresholdFraction;
  if (meanEnergy >= threshold) return null;

  const selected = chooseSacrificeCell(component, state, direction);
  if (!selected) return null;
  const sacrificed = selected.cell;
  const recoveryFraction = config.energyRecoveryFraction ?? 0.8;
  const recoverable = sacrificed.energy * recoveryFraction;
  state.cells = state.cells.filter((cell) => cell.id !== sacrificed.id);
  const recovered = redistributeRecoveredEnergy(state, recoverable, rules.stem.maxEnergy);
  const event = {
    tick: state.tick,
    type: 'sacrifice',
    cellId: sacrificed.id,
    x: sacrificed.x,
    y: sacrificed.y,
    energyBefore: sacrificed.energy,
    recoveredEnergy: recovered,
    lostEnergy: sacrificed.energy - recovered,
    touchingCells: selected.touchingCells,
    rearScore: selected.rearScore,
  };
  events.push(event);
  return event;
}

function enforceInvariants(state, rules, world) {
  const positions = new Set();
  const ids = new Set();
  for (const cell of state.cells) {
    if (cell.energy < -1e-9 || cell.energy > rules.stem.maxEnergy + 1e-9) throw new Error(`energy invariant failed for cell ${cell.id}`);
    if (cell.storedFood < -1e-9 || cell.storedFood > rules.stem.foodCapacity + 1e-9) throw new Error(`food invariant failed for cell ${cell.id}`);
    if (ids.has(cell.id)) throw new Error(`duplicate cell id ${cell.id}`);
    ids.add(cell.id);
    if (!inBounds(cell.x, cell.y, world)) throw new Error(`cell ${cell.id} is outside world bounds`);
    const k = key(cell.x, cell.y);
    if (positions.has(k)) throw new Error(`duplicate cell position ${k}`);
    positions.add(k);
  }
}

export function computeMetrics(state, initialState = null) {
  const components = connectedComponents(state);
  const energies = state.cells.map((c) => c.energy);
  const meanEnergy = energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : 0;
  const variance = energies.length ? energies.reduce((s, e) => s + (e - meanEnergy) ** 2, 0) / energies.length : 0;
  const map = cellMap(state);
  const exposed = state.cells.reduce((s, c) => s + exposedEdges(c, map), 0);
  const largest = components.reduce((m, c) => Math.max(m, c.length), 0);
  const currentCentroid = centroid(state.cells);
  let nearestFoodDistance = null;
  const edibleFood = state.food.filter((food) => food.amount > 1e-9);
  if (state.cells.length && edibleFood.length) {
    let minimumDistance = Infinity;
    for (const cell of state.cells) {
      for (const food of edibleFood) {
        const distance = Math.abs(cell.x - food.x) + Math.abs(cell.y - food.y);
        if (distance < minimumDistance) minimumDistance = distance;
      }
    }
    nearestFoodDistance = Number.isFinite(minimumDistance) ? minimumDistance : null;
  }
  return {
    tick: state.tick,
    cellCount: state.cells.length,
    connectedComponents: components.length,
    largestComponentFraction: state.cells.length ? largest / state.cells.length : 0,
    meanEnergy,
    minEnergy: energies.length ? Math.min(...energies) : 0,
    maxEnergy: energies.length ? Math.max(...energies) : 0,
    energyStdDev: Math.sqrt(variance),
    totalStoredFood: state.cells.reduce((s, c) => s + c.storedFood, 0),
    exposedEdges: exposed,
    compactness: state.cells.length ? exposed / state.cells.length : 0,
    centroid: currentCentroid,
    nearestFoodDistance,
    centroidDisplacement: initialState && currentCentroid && initialState.cells.length ? (() => {
      const start = centroid(initialState.cells);
      return Math.abs(currentCentroid.x - start.x) + Math.abs(currentCentroid.y - start.y);
    })() : 0,
  };
}

export function step(stateInput, rules, world = null, fallbackDirection = null, options = {}) {
  const state = normalizeState(stateInput);
  state.tick += 1;
  if (rules.reshape?.responsive) for (const food of state.food) {
    food.recentlyGrazed = Math.max(0, (food.recentlyGrazed ?? 0) - 0.02);
  }
  const events = [];
  const diagnostics = { reproductionBlockedEnergy: 0, reproductionBlockedFood: 0, reproductionBlockedSpace: 0 };

  // Collective rigid translation: each connected component votes toward sensed food.
  if (!options.skipTranslation) for (const component of connectedComponents(state)) {
    const currentForage = forageScore(component, state, rules);
    let direction = null;
    const forcedDirection = options.preferFallbackDirection && fallbackDirection ? fallbackDirection : null;

    if (forcedDirection) {
      direction = forcedDirection;
    } else if (currentForage > 0) {
      const responsive = rules.reshape?.responsive;
      const currentPreference = forageScore(component, state, rules, 0, 0, responsive);
      const improvement = rules.grazing?.moveForageImprovement ?? 1.15;
      const candidates = DIRS
        .filter(({ dx, dy }) => canTranslate(component, state, dx, dy, world))
        .map(({ dx, dy }) => ({ dx, dy, score: forageScore(component, state, rules, dx, dy, responsive) }))
        .sort((a, b) => (b.score - a.score) || (a.dy - b.dy) || (a.dx - b.dx));
      if (candidates[0]?.score > (responsive ? currentPreference + 0.25 : currentForage * improvement)) {
        direction = candidates[0];
      } else if ((!responsive || component.every(c => c.energy < rules.stem.maxEnergy * 0.35))
        && forageSupportRatio(component, state, rules) < (rules.grazing?.minSupportRatio ?? 1.1)) {
        const sensed = nearestFoodVector(component, state, rules);
        direction = (sensed.dx === 0 && sensed.dy === 0 && fallbackDirection) ? fallbackDirection : sensed;
      }
    } else {
      const sensed = nearestFoodVector(component, state, rules);
      direction = (sensed.dx === 0 && sensed.dy === 0 && fallbackDirection) ? fallbackDirection : sensed;
    }

    const dx = direction?.dx ?? 0;
    const dy = direction?.dy ?? 0;
    if (!canTranslate(component, state, dx, dy, world)) continue;
    if (dx || dy) sacrificeForTravel(state, rules, component, { dx, dy }, events);
    const liveIds = new Set(state.cells.map((cell) => cell.id));
    const movingComponent = component.filter((cell) => liveIds.has(cell.id));
    if (!movingComponent.length || !canTranslate(movingComponent, state, dx, dy, world)) continue;
    if (!movingComponent.every((c) => c.energy >= rules.movementEnergy)) continue;
    for (const cell of movingComponent) {
      cell.x += dx;
      cell.y += dy;
      cell.energy -= rules.movementEnergy;
    }
    if (dx || dy) events.push({ tick: state.tick, type: 'movement', cellIds: movingComponent.map((c) => c.id), dx, dy, forageBefore: currentForage, forageAfter: forageScore(movingComponent, state, rules) });
  }

  if (!options.skipConsumption) consumeFood(state, rules, events);
  shareScalar(state, 'storedFood', rules.stem.foodTransferRate, rules.stem.foodCapacity, 'food_transfer', events);

  for (const cell of state.cells) {
    const digested = Math.min(cell.storedFood, rules.stem.digestionRate, (rules.stem.maxEnergy - cell.energy) / rules.stem.digestionEfficiency);
    if (digested > 0) {
      cell.storedFood -= digested;
      cell.energy += digested * rules.stem.digestionEfficiency;
      events.push({ tick: state.tick, type: 'digestion', cellId: cell.id, amount: digested });
    }
  }

  shareScalar(state, 'energy', rules.stem.energyTransferRate, rules.stem.maxEnergy, 'energy_transfer', events);

  const map = cellMap(state);
  for (const cell of state.cells) {
    const maintenance = rules.maintenanceEnergy + exposedEdges(cell, map) * rules.exposedEdgeEnergyCost;
    cell.energy = Math.max(0, cell.energy - maintenance);
  }

  reproduce(state, rules, world, events, diagnostics);

  const dead = state.cells.filter((c) => c.energy <= 0);
  for (const cell of dead) events.push({ tick: state.tick, type: 'death', cellId: cell.id, reason: 'starvation' });
  state.cells = state.cells.filter((c) => c.energy > 0);

  enforceInvariants(state, rules, world);
  return { state, events, diagnostics, metrics: computeMetrics(state) };
}

export function simulate(initialInput, rules, ticks) {
  const initialState = normalizeState(initialInput);
  let state = clone(initialState);
  const events = [];
  const metricsByTick = [computeMetrics(state, initialState)];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(state, rules);
    state = result.state;
    events.push(...result.events);
    metricsByTick.push(computeMetrics(state, initialState));
  }
  const summary = {
    ticks,
    startingCells: initialState.cells.length,
    endingCells: state.cells.length,
    starvationDeaths: events.filter((e) => e.type === 'death').length,
    reproductionEvents: events.filter((e) => e.type === 'reproduction').length,
    foodConsumed: events.filter((e) => e.type === 'food_consumed').reduce((s, e) => s + e.amount, 0),
    movementEvents: events.filter((e) => e.type === 'movement').length,
    movementEnergySpent: events.filter((e) => e.type === 'movement').reduce((s, e) => s + e.cellIds.length * rules.movementEnergy, 0),
    ...computeMetrics(state, initialState),
  };
  return { initialState, finalState: state, events, metricsByTick, summary };
}

export function renderAscii(state) {
  const points = [
    ...state.cells.map((c) => ({ x: c.x, y: c.y })),
    ...state.food.map((f) => ({ x: f.x, y: f.y })),
  ];
  if (!points.length) return '(empty)\n';
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  minX -= 1;
  maxX += 1;
  minY -= 1;
  maxY += 1;
  const cells = cellMap(state);
  const foods = foodMap(state);
  const rows = [];
  for (let y = minY; y <= maxY; y += 1) {
    let row = '';
    for (let x = minX; x <= maxX; x += 1) {
      if (cells.has(key(x, y))) row += 'S';
      else if (foods.has(key(x, y))) row += 'F';
      else row += '.';
    }
    rows.push(row);
  }
  return `${rows.join('\n')}\n`;
}
