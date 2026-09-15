import { GameSession } from '../simulation/session.js';

export function runLongevity({ state, rules, world, seed = 0, ticks = 100000, checkpointEvery = 10000 }) {
  const session = new GameSession({ state, rules, world, seed });
  const checkpoints = [];
  let births = 0;
  let sacrifices = 0;
  let deaths = 0;

  for (let tick = 1; tick <= ticks; tick += 1) {
    const result = session.step({ includeMetrics: false, includeActivity: false });
    births += result.events.filter((event) => event.type === 'reproduction').length;
    sacrifices += result.events.filter((event) => event.type === 'sacrifice').length;
    deaths += result.events.filter((event) => event.type === 'death').length;

    if (tick % checkpointEvery === 0 || !session.state.cells.length) {
      const totalEnergy = session.state.cells.reduce((sum, cell) => sum + cell.energy, 0);
      const meanEnergy = session.state.cells.length ? totalEnergy / session.state.cells.length : 0;
      checkpoints.push({
        tick: session.state.tick,
        cells: session.state.cells.length,
        meanEnergy,
        foodRoots: session.state.food.length,
        totalFood: session.state.food.reduce((sum, food) => sum + food.amount, 0),
        births,
        sacrifices,
        deaths,
      });
    }

    if (!session.state.cells.length) break;
  }

  return {
    alive: session.state.cells.length > 0,
    finalTick: session.state.tick,
    finalCells: session.state.cells.length,
    checkpoints,
    state: session.snapshot(),
  };
}
