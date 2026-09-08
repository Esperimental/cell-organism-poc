import { computeMetrics } from '../simulation/sim.js';
import { GameSession } from '../simulation/session.js';

const canvas = document.getElementById('dish');
const ctx = canvas.getContext('2d');
const els = {
  playPause: document.getElementById('playPause'),
  step: document.getElementById('step'),
  reset: document.getElementById('reset'),
  speed: document.getElementById('speed'),
  tick: document.getElementById('tick'),
  cells: document.getElementById('cells'),
  energy: document.getElementById('energy'),
  storedFood: document.getElementById('storedFood'),
  foodLeft: document.getElementById('foodLeft'),
  connected: document.getElementById('connected'),
  events: document.getElementById('events'),
};

const [scenario, rules, world] = await Promise.all([
  fetch('../../scenarios/food-east.json').then((r) => r.json()),
  fetch('../../configs/baseline.json').then((r) => r.json()),
  fetch('../../configs/world.json').then((r) => r.json()),
]);

const session = new GameSession({ state: scenario, rules, world, seed: 42 });
const initialState = session.initialState;
let state = session.state;
let playing = true;
let lastStepAt = 0;
let lastEvents = [];

function boundsForState() {
  return { minX: world.minX, maxX: world.maxX, minY: world.minY, maxY: world.maxY };
}

function layout() {
  const { minX, maxX, minY, maxY } = boundsForState();
  const cols = maxX - minX + 1;
  const rows = maxY - minY + 1;
  const pad = 44;
  const size = Math.min((canvas.width - pad * 2) / cols, (canvas.height - pad * 2) / rows);
  const worldWidth = cols * size;
  const worldHeight = rows * size;
  return {
    minX,
    minY,
    size,
    ox: (canvas.width - worldWidth) / 2,
    oy: (canvas.height - worldHeight) / 2,
  };
}

function worldToCanvas(x, y, l) {
  return {
    x: l.ox + (x - l.minX + 0.5) * l.size,
    y: l.oy + (y - l.minY + 0.5) * l.size,
  };
}

function drawGrid(l) {
  ctx.save();
  ctx.strokeStyle = 'rgba(124, 181, 169, 0.055)';
  ctx.lineWidth = 1;
  for (let x = l.ox; x <= canvas.width - l.ox + 1; x += l.size) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = l.oy; y <= canvas.height - l.oy + 1; y += l.size) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawFood(l, time) {
  for (const food of state.food) {
    const p = worldToCanvas(food.x, food.y, l);
    const pulse = 0.88 + Math.sin(time * 0.004 + food.x * 0.7 + food.y) * 0.09;
    const fullness = food.capacity ? Math.max(0.2, Math.min(1, food.amount / food.capacity)) : 1;
    const r = l.size * (0.12 + fullness * 0.16) * pulse;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.6);
    glow.addColorStop(0, 'rgba(255, 210, 105, .9)');
    glow.addColorStop(.32, 'rgba(255, 174, 60, .55)');
    glow.addColorStop(1, 'rgba(255, 174, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffc465';
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawConnections(l) {
  const byPos = new Map(state.cells.map((c) => [`${c.x},${c.y}`, c]));
  ctx.save();
  ctx.strokeStyle = 'rgba(88, 231, 181, .18)';
  ctx.lineWidth = l.size * 0.38;
  ctx.lineCap = 'round';
  for (const cell of state.cells) {
    const a = worldToCanvas(cell.x, cell.y, l);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (!byPos.has(`${cell.x + dx},${cell.y + dy}`)) continue;
      const b = worldToCanvas(cell.x + dx, cell.y + dy, l);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawCells(l, time) {
  const grazingCellIds = new Set(lastEvents.filter((event) => event.type === 'food_consumed').map((event) => event.cellId));
  for (const cell of state.cells) {
    const p = worldToCanvas(cell.x, cell.y, l);
    const energy = Math.max(0, Math.min(1, cell.energy / rules.stem.maxEnergy));
    const grazing = grazingCellIds.has(cell.id);
    const breath = grazing ? 1 + 0.08 * (0.5 + 0.5 * Math.sin(time * 0.012 + cell.id)) : 1;
    const r = l.size * 0.35 * breath;
    const glow = ctx.createRadialGradient(p.x, p.y, r * 0.15, p.x, p.y, r * 1.8);
    glow.addColorStop(0, grazing ? `rgba(255, 220, 120, ${0.38 + energy * 0.3})` : `rgba(126, 255, 207, ${0.25 + energy * 0.3})`);
    glow.addColorStop(1, 'rgba(70, 210, 165, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.8, 0, Math.PI * 2); ctx.fill();

    const cellFill = ctx.createRadialGradient(p.x - r * .3, p.y - r * .35, r * .08, p.x, p.y, r);
    cellFill.addColorStop(0, grazing ? `hsl(92 82% ${62 + energy * 10}%)` : `hsl(155 78% ${62 + energy * 12}%)`);
    cellFill.addColorStop(1, grazing ? `hsl(132 58% ${30 + energy * 16}%)` : `hsl(164 58% ${26 + energy * 18}%)`);
    ctx.fillStyle = cellFill;
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = 'rgba(191,255,231,.46)';
    ctx.lineWidth = Math.max(1, l.size * .025);
    ctx.stroke();

    if (cell.storedFood > 0.05) {
      const fraction = Math.min(1, cell.storedFood / rules.stem.foodCapacity);
      ctx.fillStyle = `rgba(255, 190, 80, ${0.45 + fraction * .4})`;
      ctx.beginPath(); ctx.arc(p.x + r * .28, p.y + r * .15, Math.max(2, r * .13), 0, Math.PI * 2); ctx.fill();
    }
  }
}

function render(time = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const bg = ctx.createRadialGradient(canvas.width * .5, canvas.height * .45, 30, canvas.width * .5, canvas.height * .5, canvas.width * .72);
  bg.addColorStop(0, '#10272a');
  bg.addColorStop(1, '#061014');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const l = layout();
  drawGrid(l);
  drawFood(l, time);
  drawConnections(l);
  drawCells(l, time);

  const metrics = computeMetrics(state, initialState);
  els.tick.textContent = String(state.tick);
  els.cells.textContent = String(state.cells.length);
  els.energy.textContent = metrics.meanEnergy.toFixed(1);
  els.storedFood.textContent = metrics.totalStoredFood.toFixed(1);
  els.foodLeft.textContent = state.food.reduce((sum, f) => sum + f.amount, 0).toFixed(1);
  els.connected.textContent = metrics.connectedComponents <= 1 ? 'Yes' : `No (${metrics.connectedComponents})`;
  els.connected.style.color = metrics.connectedComponents <= 1 ? '#71efbd' : '#ff8c78';
  els.events.innerHTML = lastEvents.length
    ? lastEvents.slice(-5).reverse().map((e) => formatEvent(e)).join('<br>')
    : 'No events this tick.';
}

function formatEvent(e) {
  if (e.type === 'activity') return `${e.mode}: ${e.reason.replaceAll('_', ' ')}`;
  if (e.type === 'reshape') return `Cell ${e.cellId} reshaped (${e.foodContactsBefore} → ${e.foodContactsAfter} food contacts)`;
  if (e.type === 'movement') return `Moved ${e.dx}, ${e.dy}`;
  if (e.type === 'food_spawned') return `Food appeared at ${e.x}, ${e.y} (+${e.amount})`;
  if (e.type === 'food_consumed') return `Cell ${e.cellId} grazed ${e.amount.toFixed(2)}`;
  if (e.type === 'reproduction') return `Cell ${e.parentId} divided → ${e.childId}`;
  if (e.type === 'death') return `Cell ${e.cellId} died`;
  if (e.type === 'digestion') return `Cell ${e.cellId} digested ${e.amount.toFixed(1)}`;
  if (e.type === 'energy_transfer') return `Energy ${e.from} → ${e.to}`;
  if (e.type === 'food_transfer') return `Food ${e.from} → ${e.to}`;
  return e.type;
}

function advance() {
  const result = session.step();
  state = session.state;
  lastEvents = result.events;
}

function reset() {
  session.reset();
  state = session.state;
  lastEvents = [];
  render(performance.now());
}

els.playPause.addEventListener('click', () => {
  playing = !playing;
  els.playPause.textContent = playing ? 'Pause' : 'Play';
});
els.step.addEventListener('click', () => {
  playing = false;
  els.playPause.textContent = 'Play';
  advance();
  render(performance.now());
});
els.reset.addEventListener('click', reset);

function frame(time) {
  const stepsPerSecond = Number(els.speed.value);
  const interval = 1000 / stepsPerSecond;
  if (playing && time - lastStepAt >= interval) {
    advance();
    lastStepAt = time;
  }
  render(time);
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
