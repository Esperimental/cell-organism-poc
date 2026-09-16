import { clone, computeMetrics, connectedComponents, forageScore } from './sim.js?v=grazing-scent-1';

const DIRS = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

const key = (x, y) => `${x},${y}`;

function inBounds(x, y, world) {
  return x >= world.minX && x <= world.maxX && y >= world.minY && y <= world.maxY;
}

function edibleFoodKeys(state, rules) {
  const minimum = rules.foodSenseMinBiomass ?? 0.000001;
  return new Set(state.food.filter((food) => food.amount >= minimum).map((food) => key(food.x, food.y)));
}

export function foodContactCount(state, rules) {
  const food = edibleFoodKeys(state, rules);
  return state.cells.reduce((count, cell) => count + (food.has(key(cell.x, cell.y)) ? 1 : 0), 0);
}

function isBoundaryCell(cell, occupied) {
  return DIRS.some(({ dx, dy }) => !occupied.has(key(cell.x + dx, cell.y + dy)));
}

function candidateIsConnected(state) {
  return state.cells.length <= 1 || connectedComponents(state).length === 1;
}

export function findFeedingReshape(state, rules, world, allowPreparation = true) {
  const config = rules.reshape ?? {};
  if (!config.enabled || state.cells.length < 2) return null;

  const energyCost = config.cellMoveEnergy ?? rules.movementEnergy;
  const foodWeight = config.foodContactWeight ?? 10;
  const compactnessWeight = config.compactnessWeight ?? 1;
  const occupied = new Set(state.cells.map((cell) => key(cell.x, cell.y)));
  const beforeContacts = foodContactCount(state, rules);
  const responsive = config.responsive === true;
  if (!responsive && beforeContacts === 0) return null;
  const reachRadius = config.reachRadius ?? 3;
  const food = state.food.filter((entry) => entry.amount >= (rules.foodSenseMinBiomass ?? 0.000001));
  const distanceToFood = (x, y) => food.reduce((distance, entry) =>
    Math.min(distance, Math.abs(entry.x - x) + Math.abs(entry.y - y)), reachRadius + 1);
  const beforeExposed = computeMetrics(state).exposedEdges;

  let best = null;
  const cells = [...state.cells].sort((a, b) => a.id - b.id);
  for (const cell of cells) {
    if (cell.energy < energyCost || !isBoundaryCell(cell, occupied)) continue;

    const moves = responsive ? [...DIRS, { dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 }] : DIRS;
    for (const { dx, dy } of moves) {
      const x = cell.x + dx;
      const y = cell.y + dy;
      const destinationKey = key(x, y);
      if (!inBounds(x, y, world) || occupied.has(destinationKey)) continue;
      // A diagonal fold pivots around an attached neighbour, never across free space.
      if (dx && dy && !occupied.has(key(cell.x + dx, cell.y)) && !occupied.has(key(cell.x, cell.y + dy))) continue;
      const recent = state.bodyResponse?.reshape;
      if (responsive && recent?.cellId === cell.id && state.tick - recent.tick < 8
        && x === recent.from.x && y === recent.from.y) continue;

      const candidateState = clone(state);
      const moved = candidateState.cells.find((candidate) => candidate.id === cell.id);
      moved.x = x;
      moved.y = y;
      if (!candidateIsConnected(candidateState)) continue;

      const afterContacts = foodContactCount(candidateState, rules);
      const contactGain = afterContacts - beforeContacts;
      if (contactGain < 0 || (!responsive && contactGain === 0)) continue;
      const afterExposed = computeMetrics(candidateState).exposedEdges;
      const exposedIncrease = afterExposed - beforeExposed;
      const approach = responsive ? distanceToFood(cell.x, cell.y) - distanceToFood(x, y) : 0;
      // Preparatory surface moves may approach food before making contact.
      // With no contact or approach, only settle an already-feeding body.
      let preparationGain = 0;
      if (!contactGain && approach <= 0 && !(beforeContacts > 0 && approach === 0 && exposedIncrease < 0)) {
        if (!responsive || !allowPreparation || approach < 0 || beforeContacts === 0) continue;
        const followup = findFeedingReshape(candidateState, rules, world, false);
        if (!followup || followup.foodContactsAfter <= beforeContacts) continue;
        preparationGain = (followup.foodContactsAfter - beforeContacts) * 2;
      }
      const feedingGain = forageScore(candidateState.cells, candidateState, rules, 0, 0, responsive) - forageScore(state.cells, state, rules, 0, 0, responsive);
      const score = (responsive ? feedingGain : contactGain) * foodWeight + approach * (config.approachWeight ?? 3) - exposedIncrease * compactnessWeight + preparationGain;
      if (score <= 0) continue;

      const candidate = {
        cellId: cell.id,
        from: { x: cell.x, y: cell.y },
        to: { x, y },
        energyCost,
        foodContactsBefore: beforeContacts,
        foodContactsAfter: afterContacts,
        exposedEdgesBefore: beforeExposed,
        exposedEdgesAfter: afterExposed,
        score,
        reason: preparationGain > 0 ? 'preparing_fold' : contactGain > 0 ? 'feeding_contact' : approach > 0 ? 'reaching' : 'settling',
      };
      if (!best || candidate.score > best.score || (candidate.score === best.score && candidate.cellId < best.cellId)) {
        best = candidate;
      }
    }
  }
  return best;
}

export function applyReshape(state, reshape) {
  if (!reshape) return false;
  const cell = state.cells.find((candidate) => candidate.id === reshape.cellId);
  if (!cell || cell.energy < reshape.energyCost) return false;
  cell.x = reshape.to.x;
  cell.y = reshape.to.y;
  cell.energy -= reshape.energyCost;
  state.bodyResponse ??= {};
  state.bodyResponse.reshape = { cellId: cell.id, from: reshape.from, tick: state.tick + 1 };
  return true;
}
