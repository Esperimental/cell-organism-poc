import { computeMetrics } from '../simulation/sim.js';
import { generateInitialFood } from '../simulation/initialWorld.js';
import { GameSession } from '../simulation/session.js';
import { clampZoom, computeCameraLayout } from './camera.js';
import { accumulatedSteps, speedRateForIndex } from './speed.js';

const canvas = document.getElementById('dish');
const ctx = canvas.getContext('2d');
const els = {
  playPause: document.getElementById('playPause'),
  step: document.getElementById('step'),
  reset: document.getElementById('reset'),
  speed: document.getElementById('speed'),
  speedLabel: document.getElementById('speedLabel'),
  zoomOut: document.getElementById('zoomOut'),
  zoomIn: document.getElementById('zoomIn'),
  zoomFit: document.getElementById('zoomFit'),
  zoomLabel: document.getElementById('zoomLabel'),
  tick: document.getElementById('tick'),
  seed: document.getElementById('seed'),
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

function freshRunSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0];
  }
  return Date.now() >>> 0;
}

const runSeed = freshRunSeed();
const randomizedScenario = generateInitialFood(scenario, world, runSeed);
const session = new GameSession({ state: randomizedScenario, rules, world, seed: runSeed });
const initialState = session.initialState;
let state = session.state;
let playing = true;
let lastFrameAt = 0;
let stepCarry = 0;
let lastEvents = [];
let remnants = [];
const camera = { zoom: 1, minZoom: 1, maxZoom: 8 };

function boundsForState() {
  return { minX: world.minX, maxX: world.maxX, minY: world.minY, maxY: world.maxY };
}

function layout() {
  return computeCameraLayout({
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    world,
    cells: state.cells,
    zoom: camera.zoom,
  });
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
  for (let gx = l.minX; gx <= l.maxX + 1; gx += 1) {
    const x = l.ox + (gx - l.minX) * l.size;
    if (x < 0 || x > canvas.width) continue;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let gy = l.minY; gy <= l.maxY + 1; gy += 1) {
    const y = l.oy + (gy - l.minY) * l.size;
    if (y < 0 || y > canvas.height) continue;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  const left = l.ox;
  const top = l.oy;
  const width = (l.maxX - l.minX + 1) * l.size;
  const height = (l.maxY - l.minY + 1) * l.size;
  ctx.strokeStyle = 'rgba(124, 181, 169, 0.18)';
  ctx.strokeRect(left, top, width, height);
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

function drawRemnants(l, time) {
  const lifetime = 1800;
  remnants = remnants.filter((remnant) => time - remnant.createdAt < lifetime);
  for (const remnant of remnants) {
    const age = Math.max(0, time - remnant.createdAt);
    const alpha = Math.max(0, 1 - age / lifetime);
    const p = worldToCanvas(remnant.x, remnant.y, l);
    const r = l.size * (0.34 - 0.08 * (age / lifetime));
    ctx.save();
    ctx.globalAlpha = alpha * 0.8;
    const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 1.7);
    glow.addColorStop(0, 'rgba(210, 150, 92, .75)');
    glow.addColorStop(1, 'rgba(120, 70, 45, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(126, 92, 72, .72)';
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
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
  drawRemnants(l, time);
  drawCells(l, time);

  const metrics = computeMetrics(state, initialState);
  els.tick.textContent = String(state.tick);
  els.seed.textContent = String(runSeed);
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
  if (e.type === 'sacrifice') return `Cell ${e.cellId} sacrificed (${e.recoveredEnergy.toFixed(1)} energy recovered)`;
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
  const createdAt = performance.now();
  for (const event of result.events.filter((candidate) => candidate.type === 'sacrifice')) {
    remnants.push({ x: event.x, y: event.y, createdAt });
  }
  if (remnants.length > 200) remnants = remnants.slice(-200);
}

function reset() {
  session.reset();
  state = session.state;
  lastEvents = [];
  remnants = [];
  stepCarry = 0;
  lastFrameAt = 0;
  render(performance.now());
}

function updateSpeedLabel() {
  els.speedLabel.textContent = `${speedRateForIndex(els.speed.value)} t/s`;
}

els.playPause.addEventListener('click', () => {
  playing = !playing;
  stepCarry = 0;
  lastFrameAt = 0;
  els.playPause.textContent = playing ? 'Pause' : 'Play';
});
els.step.addEventListener('click', () => {
  playing = false;
  els.playPause.textContent = 'Play';
  advance();
  render(performance.now());
});
els.reset.addEventListener('click', reset);
els.speed.addEventListener('input', updateSpeedLabel);

function setZoom(nextZoom) {
  camera.zoom = clampZoom(nextZoom, camera.minZoom, camera.maxZoom);
  els.zoomLabel.textContent = `${Math.round(camera.zoom * 100)}%`;
  render(performance.now());
}

els.zoomIn.addEventListener('click', () => setZoom(camera.zoom * 1.25));
els.zoomOut.addEventListener('click', () => setZoom(camera.zoom / 1.25));
els.zoomFit.addEventListener('click', () => setZoom(1));
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  setZoom(camera.zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
}, { passive: false });

function frame(time) {
  if (!lastFrameAt) lastFrameAt = time;
  const elapsedMs = Math.min(250, Math.max(0, time - lastFrameAt));
  lastFrameAt = time;

  if (playing) {
    const rate = speedRateForIndex(els.speed.value);
    const accumulated = accumulatedSteps(elapsedMs, rate, stepCarry, 64);
    stepCarry = accumulated.carry;
    for (let i = 0; i < accumulated.steps; i += 1) advance();
  }

  render(time);
  requestAnimationFrame(frame);
}

updateSpeedLabel();
reset();
requestAnimationFrame(frame);
