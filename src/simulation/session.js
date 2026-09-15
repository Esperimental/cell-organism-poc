import { clone, computeMetrics, connectedComponents, forageScore, forageSupportRatio, nearestFoodVector, normalizeState, step as stepBiology } from './sim.js?v=body-settling-1';
import { nextRandom, normalizeSeed, randomInt } from './rng.js';
import { foodContactCount, findFeedingReshape, applyReshape } from './morphology.js?v=body-settling-1';

const key = (x, y) => `${x},${y}`;
const SEARCH_DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

function totalWorldFood(state) {
  return state.food.reduce((sum, food) => sum + food.amount, 0);
}

function normalizeFoodPatches(state, world) {
  const defaults = world.foodPatches ?? {};
  for (const food of state.food) {
    food.capacity ??= defaults.defaultCapacity ?? Math.max(food.amount, 20);
    food.growthRate ??= defaults.defaultGrowthRate ?? 0;
    if (food.capacity < food.amount) food.capacity = food.amount;
  }
}

export function foodGrowthForTick(food, world) {
  if (!(food.growthRate > 0) || !(food.capacity > food.amount)) return 0;
  const recovery = world.foodPatches?.recovery ?? {};
  if (recovery.enabled === false) return Math.min(food.growthRate, food.capacity - food.amount);

  const floorFraction = Math.max(0, Math.min(1, recovery.dormantGrowthFraction ?? 0.001));
  const exponent = Math.max(0.1, recovery.recoveryExponent ?? 2);
  const fullGrowthAtFraction = Math.max(0.001, Math.min(1, recovery.fullGrowthAtFraction ?? 0.25));
  const fullness = Math.max(0, Math.min(1, food.amount / Math.max(food.capacity, 1e-9)));
  const recoveryProgress = Math.max(0, Math.min(1, fullness / fullGrowthAtFraction));
  const multiplier = floorFraction + (1 - floorFraction) * (recoveryProgress ** exponent);
  return Math.min(food.growthRate * multiplier, food.capacity - food.amount);
}

function growFood(state, world, events) {
  for (const food of state.food) {
    const amount = foodGrowthForTick(food, world);
    if (!(amount > 0)) continue;
    food.amount += amount;
    events.push({ tick: state.tick + 1, type: 'food_grew', x: food.x, y: food.y, amount });
  }
}

export function foodRootLimit(world) {
  const spread = world.foodSpread ?? {};
  if (Number.isFinite(spread.maxRoots)) return spread.maxRoots;
  const fraction = Math.max(0, spread.maxRootFraction ?? 0.08);
  const width = Math.max(0, world.maxX - world.minX + 1);
  const height = Math.max(0, world.maxY - world.minY + 1);
  return Math.floor(width * height * fraction);
}

function spreadFood(state, world, events) {
  const spread = world.foodSpread ?? {};
  if (!spread.enabled) return;
  const rootLimit = foodRootLimit(world);
  if (state.food.length >= rootLimit) return;

  const roots = new Map(state.food.map((food) => [key(food.x, food.y), food]));
  const candidates = [...state.food]
    .filter((food) => food.amount >= (spread.minBiomassToSpread ?? 0))
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));

  for (const source of candidates) {
    if (state.food.length >= rootLimit) break;
    const roll = nextRandom(state.rngState);
    state.rngState = roll.state;
    if (roll.value >= (spread.chancePerRootPerTick ?? 0)) continue;

    const directionRoll = randomInt(state.rngState, 0, SEARCH_DIRS.length - 1);
    state.rngState = directionRoll.state;
    const direction = SEARCH_DIRS[directionRoll.value];
    const x = source.x + direction.dx;
    const y = source.y + direction.dy;
    const positionKey = key(x, y);

    if (x < world.minX || x > world.maxX || y < world.minY || y > world.maxY) continue;
    if (roots.has(positionKey)) continue;

    const patchDefaults = world.foodPatches ?? {};
    const amount = Math.max(0, spread.seedAmount ?? 1);
    const patch = {
      x,
      y,
      amount,
      capacity: spread.newRootCapacity ?? patchDefaults.defaultCapacity ?? Math.max(amount, 1),
      growthRate: spread.newRootGrowthRate ?? patchDefaults.defaultGrowthRate ?? 0,
    };
    state.food.push(patch);
    roots.set(positionKey, patch);
    events.push({ tick: state.tick + 1, type: 'food_spread', fromX: source.x, fromY: source.y, x, y, amount });
  }
}

function maybeSpawnFood(state, world, events) {
  if (!world.foodSpawn?.enabled) return;
  if (totalWorldFood(state) >= world.foodSpawn.maxTotalFood) return;

  const roll = nextRandom(state.rngState);
  state.rngState = roll.state;
  if (roll.value >= world.foodSpawn.chancePerTick) return;

  const foodByPos = new Map(state.food.map((food) => [key(food.x, food.y), food]));
  const attempts = Math.max(1, world.foodSpawn.maxPlacementAttempts ?? 20);
  const patchDefaults = world.foodPatches ?? {};

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rx = randomInt(state.rngState, world.minX, world.maxX);
    state.rngState = rx.state;
    const ry = randomInt(state.rngState, world.minY, world.maxY);
    state.rngState = ry.state;
    const positionKey = key(rx.value, ry.value);

    const amountRoll = randomInt(state.rngState, world.foodSpawn.minAmount, world.foodSpawn.maxAmount);
    state.rngState = amountRoll.state;

    const room = world.foodSpawn.maxTotalFood - totalWorldFood(state);
    const amount = Math.min(amountRoll.value, room);
    if (amount <= 0) return;

    const existing = foodByPos.get(positionKey);
    if (existing) {
      existing.capacity ??= patchDefaults.defaultCapacity ?? Math.max(existing.amount, amount);
      existing.growthRate ??= patchDefaults.defaultGrowthRate ?? 0;
      existing.amount = Math.min(existing.capacity, existing.amount + amount);
    } else {
      state.food.push({
        x: rx.value,
        y: ry.value,
        amount,
        capacity: Math.max(amount, patchDefaults.defaultCapacity ?? amount),
        growthRate: patchDefaults.defaultGrowthRate ?? 0,
      });
    }

    events.push({ tick: state.tick + 1, type: 'food_spawned', x: rx.value, y: ry.value, amount });
    return;
  }
}

function anyFoodSensed(state, rules) {
  return connectedComponents(state).some((component) => {
    const vector = nearestFoodVector(component, state, rules);
    return vector.dx !== 0 || vector.dy !== 0;
  });
}

function chooseRandomDirection(state) {
  const roll = randomInt(state.rngState, 0, SEARCH_DIRS.length - 1);
  state.rngState = roll.state;
  return SEARCH_DIRS[roll.value];
}

function updateEnergyTrend(state, rules) {
  if (!state.cells.length) {
    state.energyTrend = { lastMeanEnergy: 0, decliningTicks: 0 };
    return;
  }
  const meanEnergy = state.cells.reduce((sum, cell) => sum + cell.energy, 0) / state.cells.length;
  const tolerance = rules.grazing?.energyTrendTolerance ?? 0.05;
  const previous = state.energyTrend?.lastMeanEnergy;
  let decliningTicks = state.energyTrend?.decliningTicks ?? 0;
  if (previous === undefined) {
    decliningTicks = 0;
  } else if (meanEnergy < previous - tolerance) {
    decliningTicks += 1;
  } else if (meanEnergy > previous + tolerance) {
    decliningTicks = 0;
  }
  state.energyTrend = { lastMeanEnergy: meanEnergy, decliningTicks };
}

function energyTrendDemandsMigration(state, rules) {
  if (!state.cells.length) return false;
  const grazing = rules.grazing ?? {};
  const minimumDeclineTicks = grazing.energyDeclineTicksBeforeMigration ?? 4;
  const threshold = rules.stem.maxEnergy * (grazing.energyDeclineMeanEnergyFraction ?? 0.6);
  const meanEnergy = state.cells.reduce((sum, cell) => sum + cell.energy, 0) / state.cells.length;
  return (state.energyTrend?.decliningTicks ?? 0) >= minimumDeclineTicks && meanEnergy < threshold;
}

function hasUnderSupportedGrazing(state, rules) {
  const minimumSupport = rules.grazing?.minSupportRatio ?? 1.1;
  return connectedComponents(state).some((component) =>
    forageScore(component, state, rules) > 0
    && forageSupportRatio(component, state, rules) < minimumSupport);
}

function componentCenter(component) {
  if (!component.length) return { x: 0, y: 0 };
  return {
    x: component.reduce((sum, cell) => sum + cell.x, 0) / component.length,
    y: component.reduce((sum, cell) => sum + cell.y, 0) / component.length,
  };
}

function largestComponent(state) {
  return connectedComponents(state).sort((a, b) => b.length - a.length)[0] ?? [];
}

function rememberPasture(state, point, rules) {
  if (!point) return;
  const grazing = rules.grazing ?? {};
  const radius = grazing.migrationRevisitRadius ?? 8;
  const maxHistory = grazing.migrationHistorySize ?? 8;
  state.pastureHistory ??= [];

  const existing = state.pastureHistory.find((entry) =>
    Math.abs(entry.x - point.x) + Math.abs(entry.y - point.y) <= radius);
  if (existing) {
    existing.visitedTick = state.tick;
  } else {
    state.pastureHistory.push({ x: point.x, y: point.y, visitedTick: state.tick });
  }

  state.pastureHistory.sort((a, b) => b.visitedTick - a.visitedTick);
  if (state.pastureHistory.length > maxHistory) state.pastureHistory.length = maxHistory;
}

function recentPastureValueFactor(state, food, rules) {
  const grazing = rules.grazing ?? {};
  const cooldown = grazing.migrationRevisitCooldownTicks ?? 1800;
  const radius = grazing.migrationRevisitRadius ?? 8;
  const minimumFactor = grazing.migrationRecentPastureMinValueFraction ?? 0.12;
  if (!(cooldown > 0) || !state.pastureHistory?.length) return 1;

  let latestVisit = null;
  for (const entry of state.pastureHistory) {
    if (Math.abs(entry.x - food.x) + Math.abs(entry.y - food.y) > radius) continue;
    if (latestVisit === null || entry.visitedTick > latestVisit) latestVisit = entry.visitedTick;
  }
  if (latestVisit === null) return 1;
  const age = Math.max(0, state.tick - latestVisit);
  if (age >= cooldown) return 1;
  return minimumFactor + (1 - minimumFactor) * (age / cooldown);
}

export function chooseMigrationTarget(state, rules) {
  const component = largestComponent(state);
  if (!component.length) return null;
  const center = componentCenter(component);
  const grazing = rules.grazing ?? {};
  const meanEnergy = component.reduce((sum, cell) => sum + cell.energy, 0) / component.length;
  const emergencyThreshold = rules.stem.maxEnergy * (grazing.emergencyMigrationMeanEnergyFraction ?? rules.stem.emergencyIntakeMeanEnergyFraction ?? 0.45);
  const emergency = meanEnergy < emergencyThreshold;
  const minDistance = emergency ? 1 : (grazing.migrationMinDistance ?? 10);
  const senseRadius = grazing.migrationSenseRadius ?? 60;
  const minBiomass = grazing.migrationTargetMinBiomass ?? 8;
  const pastureRadius = grazing.migrationPastureRadius ?? 4;
  const travelCostWeight = grazing.migrationTravelCostWeight ?? 2;
  const usableBiomassPerCell = grazing.migrationUsableBiomassPerCell ?? 10;
  const jitterFraction = grazing.migrationTargetJitterFraction ?? 0;

  const candidateTiles = state.food.filter((food) => food.amount >= (rules.foodSenseMinBiomass ?? 0));
  const candidates = [];

  for (const food of candidateTiles) {
    const distance = Math.abs(food.x - center.x) + Math.abs(food.y - center.y);
    if (distance < minDistance || distance > senseRadius) continue;

    const localBiomass = state.food.reduce((sum, nearby) => {
      const localDistance = Math.abs(nearby.x - food.x) + Math.abs(nearby.y - food.y);
      return localDistance <= pastureRadius ? sum + nearby.amount : sum;
    }, 0);
    if (localBiomass < minBiomass) continue;
    const usableBiomass = Math.min(localBiomass, component.length * usableBiomassPerCell);
    const revisitFactor = emergency ? 1 : recentPastureValueFactor(state, food, rules);
    const pastureEnergyValue = usableBiomass * rules.stem.digestionEfficiency * revisitFactor;
    const travelCost = distance * component.length * rules.movementEnergy;
    let score = emergency
      ? (-distance * 1000 + localBiomass)
      : (pastureEnergyValue - travelCostWeight * travelCost);

    if (!emergency && jitterFraction > 0) {
      const roll = nextRandom(state.rngState ?? 0);
      state.rngState = roll.state;
      score *= 1 + (roll.value * 2 - 1) * jitterFraction;
    }

    candidates.push({
      x: food.x,
      y: food.y,
      amount: food.amount,
      distance,
      localBiomass,
      usableBiomass,
      revisitFactor,
      pastureEnergyValue,
      travelCost,
      score,
      emergency,
    });
  }

  candidates.sort((a, b) =>
    (b.score - a.score)
    || (a.distance - b.distance)
    || (b.localBiomass - a.localBiomass)
    || (a.y - b.y)
    || (a.x - b.x));
  return candidates[0] ?? null;
}

function directionTowardTarget(component, target) {
  const center = componentCenter(component);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > 0.001) return { dx: Math.sign(dx), dy: 0 };
  if (Math.abs(dy) > 0.001) return { dx: 0, dy: Math.sign(dy) };
  return null;
}

function migrationDirectionForTick(state, rules) {
  const component = largestComponent(state);
  if (!component.length) {
    state.migration = null;
    return { handled: false, direction: null };
  }

  const minimumSupport = rules.grazing?.minSupportRatio ?? 1.1;
  const currentForage = forageScore(component, state, rules);
  const currentSupport = currentForage > 0 ? forageSupportRatio(component, state, rules) : 0;

  if (state.migration?.target) {
    const target = state.migration.target;
    const reachedTarget = component.some((cell) => cell.x === target.x && cell.y === target.y);
    if (reachedTarget && currentForage > 0 && currentSupport >= minimumSupport) {
      rememberPasture(state, target, rules);
      state.migration = null;
      return { handled: false, direction: null };
    }
    if (reachedTarget && currentSupport < minimumSupport) {
      rememberPasture(state, target, rules);
      state.migration = null;
    }
  }

  const energyDeclining = energyTrendDemandsMigration(state, rules);
  if (!state.migration?.target && (currentForage <= 0 || currentSupport < minimumSupport || energyDeclining)) {
    if (currentForage > 0) rememberPasture(state, componentCenter(component), rules);
    const target = chooseMigrationTarget(state, rules);
    if (target) {
      state.migration = {
        target: { x: target.x, y: target.y },
        startedTick: state.tick,
      };
    }
  }

  if (!state.migration?.target) return { handled: false, direction: null };

  const moveEveryTicks = Math.max(1, rules.search?.moveEveryTicks ?? 2);
  if ((state.tick + 1) % moveEveryTicks !== 0) return { handled: true, direction: null };
  return { handled: true, direction: directionTowardTarget(component, state.migration.target) };
}

function searchDirectionForTick(state, rules) {
  const search = rules.search ?? {};
  if (!search.enabled || !state.cells.length) return null;

  const migration = migrationDirectionForTick(state, rules);
  if (migration.handled) return migration.direction;

  const forceEscapeSearch = hasUnderSupportedGrazing(state, rules);
  if (anyFoodSensed(state, rules) && !forceEscapeSearch) return null;

  state.search ??= { direction: null, ticksInDirection: 0 };
  const moveEveryTicks = Math.max(1, search.moveEveryTicks ?? 2);
  if ((state.tick + 1) % moveEveryTicks !== 0) return null;

  let shouldTurn = !state.search.direction;
  if (!shouldTurn && state.search.ticksInDirection >= (search.maxHeadingTicks ?? 20)) shouldTurn = true;
  if (!shouldTurn) {
    const roll = nextRandom(state.rngState);
    state.rngState = roll.state;
    shouldTurn = roll.value < (search.turnChance ?? 0.05);
  }

  if (shouldTurn) {
    state.search.direction = chooseRandomDirection(state);
    state.search.ticksInDirection = 0;
  }

  state.search.ticksInDirection += 1;
  return state.search.direction;
}

function classifyActivity(stateBefore, stateAfter, rules, events, searchDirection) {
  if (!stateAfter.cells.length) return { mode: 'DEAD', reason: 'no_cells' };
  const reshape = events.find((event) => event.type === 'reshape');
  if (reshape) return { mode: 'RESHAPING', reason: reshape.reason };
  if (events.some((event) => event.type === 'sacrifice')) return { mode: 'SURVIVAL', reason: 'sacrificing_cells_for_travel' };
  if (events.some((event) => event.type === 'food_consumed')) return { mode: 'FEEDING', reason: 'grazing_underfoot' };
  const moved = events.some((event) => event.type === 'movement');
  if (moved && stateAfter.migration?.target) return { mode: 'MIGRATING', reason: 'committed_to_new_pasture' };
  if (moved && searchDirection) return { mode: 'SEARCHING', reason: 'no_food_sensed' };
  if (moved) return { mode: 'SEEKING', reason: 'food_sensed' };
  if (!anyFoodSensed(stateBefore, rules)) return { mode: 'SEARCHING', reason: searchDirection ? 'movement_blocked_or_low_energy' : 'search_wait_tick' };
  const canAllMove = stateBefore.cells.every((cell) => cell.energy >= rules.movementEnergy);
  if (!canAllMove) return { mode: 'BLOCKED', reason: 'low_energy' };
  return { mode: 'SEEKING', reason: 'movement_blocked' };
}

export class GameSession {
  constructor({ state, rules, world, seed = 0 }) {
    this.rules = clone(rules);
    this.world = clone(world);
    this.initialState = normalizeState(state);
    this.initialState.rngState ??= normalizeSeed(seed);
    normalizeFoodPatches(this.initialState, this.world);
    this.initialState.search ??= { direction: null, ticksInDirection: 0 };
    this.initialState.activity ??= { mode: 'IDLE', reason: 'initial_state' };
    this.state = clone(this.initialState);
  }

  step({ includeMetrics = true, includeActivity = true } = {}) {
    const worldEvents = [];
    updateEnergyTrend(this.state, this.rules);
    growFood(this.state, this.world, worldEvents);
    spreadFood(this.state, this.world, worldEvents);
    maybeSpawnFood(this.state, this.world, worldEvents);
    const before = includeActivity ? clone(this.state) : null;
    const searchDirection = searchDirectionForTick(this.state, this.rules);
    const migrationActive = Boolean(this.state.migration?.target);
    // Opt-in while the body response is being evaluated in controlled scenes.
    // A reshaping opportunity pauses translation until the next body cadence.
    const reshape = this.rules.reshape?.responsive && !migrationActive
      ? findFeedingReshape(this.state, this.rules, this.world) : null;
    if (reshape && (this.state.tick + 1) % Math.max(1, this.rules.reshape.moveEveryTicks ?? 3) === 0) {
      applyReshape(this.state, reshape);
      worldEvents.push({ tick: this.state.tick + 1, type: 'reshape', ...reshape });
    }
    const movementOptions = migrationActive
      ? (searchDirection ? { preferFallbackDirection: true } : { skipTranslation: true })
      : (reshape ? { skipTranslation: true } : {});
    const result = stepBiology(
      this.state,
      this.rules,
      this.world,
      searchDirection,
      movementOptions,
    );
    this.state = result.state;
    let activityEvent = null;
    if (includeActivity) {
      this.state.activity = classifyActivity(before, this.state, this.rules, [...worldEvents, ...result.events], searchDirection);
      activityEvent = { tick: this.state.tick, type: 'activity', ...this.state.activity };
    }
    return {
      state: this.state,
      events: activityEvent ? [...worldEvents, ...result.events, activityEvent] : [...worldEvents, ...result.events],
      diagnostics: result.diagnostics,
      metrics: includeMetrics ? computeMetrics(this.state, this.initialState) : null,
    };
  }

  run(ticks) {
    if (!Number.isInteger(ticks) || ticks < 0) throw new Error('ticks must be a non-negative integer');
    const events = [];
    const metricsByTick = [computeMetrics(this.state, this.initialState)];
    const diagnostics = { reproductionBlockedEnergy: 0, reproductionBlockedFood: 0, reproductionBlockedSpace: 0 };
    for (let i = 0; i < ticks; i += 1) {
      const result = this.step();
      events.push(...result.events);
      for (const key of Object.keys(diagnostics)) diagnostics[key] += result.diagnostics[key] ?? 0;
      metricsByTick.push(result.metrics);
    }
    return {
      initialState: clone(this.initialState),
      finalState: clone(this.state),
      events,
      metricsByTick,
      diagnostics,
      summary: this.summary(events, ticks, diagnostics),
    };
  }

  summary(events, ticks, diagnostics = {}) {
    const activityCounts = {};
    for (const event of events.filter((e) => e.type === 'activity')) {
      activityCounts[event.mode] = (activityCounts[event.mode] ?? 0) + 1;
    }
    return {
      ticks,
      startingCells: this.initialState.cells.length,
      endingCells: this.state.cells.length,
      starvationDeaths: events.filter((e) => e.type === 'death').length,
      reproductionEvents: events.filter((e) => e.type === 'reproduction').length,
      sacrificeEvents: events.filter((e) => e.type === 'sacrifice').length,
      sacrificeEnergyRecovered: events.filter((e) => e.type === 'sacrifice').reduce((s, e) => s + e.recoveredEnergy, 0),
      sacrificeEnergyLost: events.filter((e) => e.type === 'sacrifice').reduce((s, e) => s + e.lostEnergy, 0),
      foodSpawnEvents: events.filter((e) => e.type === 'food_spawned').length,
      foodSpawned: events.filter((e) => e.type === 'food_spawned').reduce((s, e) => s + e.amount, 0),
      foodSpreadEvents: events.filter((e) => e.type === 'food_spread').length,
      foodConsumed: events.filter((e) => e.type === 'food_consumed').reduce((s, e) => s + e.amount, 0),
      foodRegrown: events.filter((e) => e.type === 'food_grew').reduce((s, e) => s + e.amount, 0),
      movementEvents: events.filter((e) => e.type === 'movement').length,
      finalFoodContacts: foodContactCount(this.state, this.rules),
      movementEnergySpent: events.filter((e) => e.type === 'movement').reduce((s, e) => s + e.cellIds.length * this.rules.movementEnergy, 0),
      activityCounts,
      reproductionBlockedEnergy: diagnostics.reproductionBlockedEnergy ?? 0,
      reproductionBlockedFood: diagnostics.reproductionBlockedFood ?? 0,
      reproductionBlockedSpace: diagnostics.reproductionBlockedSpace ?? 0,
      rngState: this.state.rngState,
      ...computeMetrics(this.state, this.initialState),
    };
  }

  reset() {
    this.state = clone(this.initialState);
  }

  snapshot() {
    return clone(this.state);
  }
}
