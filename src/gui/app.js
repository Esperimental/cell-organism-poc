import { computeMetrics } from '../simulation/sim.js';
import { generateInitialFood } from '../simulation/initialWorld.js';
import { GameSession } from '../simulation/session.js?v=body-settling-1';
import { clampZoom, computeCameraLayout } from './camera.js';
import { accumulatedSteps, speedRateForIndex } from './speed.js';
import { loadPreset } from '../experiments/presets.js?v=body-settling-1';
import { seekToTick } from '../experiments/seek.js';

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

const bench = Object.fromEntries([
  'experimentTools', 'experimentSelect', 'loadExperiment', 'experimentDescription',
  'step10', 'step100', 'targetTick', 'goTick', 'cancelSeek', 'replayLink',
  'experimentStatus', 'eventFilter', 'cellInspector', 'cellId', 'cellDetails',
].map((id) => [id, document.getElementById(id)]));
const rootUrl = new URL('../../', import.meta.url);
async function readJson(path) {
  const url = new URL(path, rootUrl);
  url.searchParams.set('v', new URL(import.meta.url).searchParams.get('v') ?? 'dev');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${path}: HTTP ${response.status}`);
  return response.json();
}
const params = new URLSearchParams(location.search);
const experimentId = params.get('experiment');
const catalog = await readJson('experiments/catalog.json');
for (const preset of catalog) bench.experimentSelect.add(new Option(preset.name, preset.id));
let loaded;
try {
  if (experimentId) {
    loaded = await loadPreset(experimentId, readJson, {
      seed: params.has('seed') ? Number(params.get('seed')) : undefined,
    });
  } else {
    const [scenario, rules, world] = await Promise.all([
      readJson('scenarios/food-east.json'), readJson('configs/baseline.json'), readJson('configs/world.json'),
    ]);
    const seed = freshRunSeed();
    loaded = { seed, session: new GameSession({ state: generateInitialFood(scenario, world, seed), rules, world, seed }) };
  }
} catch (error) {
  bench.experimentTools.open = true;
  bench.experimentStatus.textContent = error.message;
  bench.loadExperiment.onclick = () => {
    location.href = `?experiment=${encodeURIComponent(bench.experimentSelect.value)}`;
  };
  throw error;
}
const { session, seed: runSeed, preset } = loaded;
const { rules, world } = session;

function freshRunSeed() {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0];
  }
  return Date.now() >>> 0;
}

const initialState = session.initialState;
let state = session.state;
let motionFrom = new Map();
let motionStarted = 0;
let displayedPositions = new Map();

function visualPosition(cell) {
  return displayedPositions.get(cell.id) ?? cell;
}
let playing = !preset;
let lastFrameAt = 0;
let stepCarry = 0;
let lastEvents = [];
let remnants = [];
const camera = { zoom: 1, minZoom: 1, maxZoom: 8 };
let seeking = false;
let cancelRequested = false;
let eventHistory = [];
const interestingTypes = new Set(['movement', 'reshape', 'reproduction', 'sacrifice', 'death']);
let behaviourHistory = [];
bench.cellInspector.hidden = !preset;
bench.eventFilter.value = preset ? 'interesting' : 'all';
if (preset) {
  bench.experimentTools.open = true;
  bench.experimentSelect.value = preset.id;
  bench.experimentDescription.textContent = preset.description;
  bench.targetTick.value = String(preset.view?.tick ?? 0);
  els.speed.value = String(preset.view?.speed ?? 3);
  camera.zoom = clampZoom(preset.view?.zoom ?? 1);
  els.zoomLabel.textContent = `${Math.round(camera.zoom * 100)}%`;
}
bench.loadExperiment.addEventListener('click', () => {
  location.href = `?experiment=${encodeURIComponent(bench.experimentSelect.value)}`;
});
bench.experimentSelect.addEventListener('change', () => {
  bench.experimentDescription.textContent = catalog.find((entry) => entry.id === bench.experimentSelect.value)?.description ?? '';
});

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
    if (food.amount <= 0) continue;
    ctx.save();
    if (food.amount < (rules.foodSenseMinBiomass ?? 0)) ctx.globalAlpha = 0.3;
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
    ctx.restore();
  }
}

function drawConnections(l) {
  const byPos = new Map(state.cells.map((c) => [`${c.x},${c.y}`, c]));
  ctx.save();
  ctx.strokeStyle = 'rgba(88, 231, 181, .18)';
  ctx.lineWidth = l.size * 0.38;
  ctx.lineCap = 'round';
  for (const cell of state.cells) {
    const visual = visualPosition(cell);
    const a = worldToCanvas(visual.x, visual.y, l);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (!byPos.has(`${cell.x + dx},${cell.y + dy}`)) continue;
      const neighbour = visualPosition(byPos.get(`${cell.x + dx},${cell.y + dy}`));
      const b = worldToCanvas(neighbour.x, neighbour.y, l);
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
    const visual = visualPosition(cell);
    const p = worldToCanvas(visual.x, visual.y, l);
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
  const duration = Math.min(280, 850 / speedRateForIndex(els.speed.value));
  const progress = playing && rules.reshape?.responsive ? Math.max(0, Math.min(1, (time - motionStarted) / duration)) : 1;
  const eased = progress * progress * (3 - 2 * progress);
  displayedPositions = new Map(state.cells.map(cell => {
    const from = motionFrom.get(cell.id) ?? cell;
    return [cell.id, { x: from.x + (cell.x - from.x) * eased, y: from.y + (cell.y - from.y) * eased }];
  }));
  if (!seeking && preset) bench.experimentStatus.textContent = `${playing ? 'Playing' : 'Paused'} at tick ${state.tick}.`;
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
  els.connected.textContent = !state.cells.length ? 'Extinct' : metrics.connectedComponents <= 1 ? 'Yes' : `No (${metrics.connectedComponents})`;
  els.connected.style.color = metrics.connectedComponents <= 1 ? '#71efbd' : '#ff8c78';
  const filter = bench.eventFilter.value;
  const source = filter === 'all' ? eventHistory : behaviourHistory;
  const visibleEvents = source.filter((e) => filter === 'all' || filter === 'interesting' || e.type === filter);
  els.events.textContent = visibleEvents.length
    ? visibleEvents.slice(-12).reverse().map((e) => `t${e.tick}: ${formatEvent(e)}`).join('\n')
    : 'No matching events in retained history.';
  const cell = state.cells.find((candidate) => candidate.id === Number(bench.cellId.value));
  bench.cellDetails.textContent = cell
    ? `Cell ${cell.id} · (${cell.x}, ${cell.y})\nEnergy: ${cell.energy.toFixed(3)}\nStored food: ${cell.storedFood.toFixed(3)}`
    : 'Cell is not present at this tick.';
  if (preset) {
    bench.replayLink.href = `?experiment=${encodeURIComponent(preset.id)}&seed=${runSeed}&tick=${state.tick}`;
  }
}

function formatEvent(e) {
  if (e.type === 'activity') return `${e.mode}: ${e.reason.replaceAll('_', ' ')}`;
  if (e.type === 'reshape') return `${(e.reason ?? 'reshape').replaceAll('_', ' ')}: cell ${e.cellId} (${e.foodContactsBefore} → ${e.foodContactsAfter} food contacts)`;
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

function recordStep(result) {
  state = session.state;
  lastEvents = result.events;
  eventHistory.push(...result.events);
  eventHistory = eventHistory.slice(-300);
  behaviourHistory.push(...result.events.filter((event) => interestingTypes.has(event.type)));
  behaviourHistory = behaviourHistory.slice(-300);
  const createdAt = performance.now();
  for (const event of result.events.filter((candidate) => candidate.type === 'sacrifice')) {
    remnants.push({ x: event.x, y: event.y, createdAt });
  }
  if (remnants.length > 200) remnants = remnants.slice(-200);
}
function advance() {
  motionFrom = new Map(state.cells.map(cell => [cell.id, { ...visualPosition(cell) }]));
  motionStarted = performance.now();
  recordStep(session.step());
}

function reset() {
  if (preset) {
    playing = false;
    els.playPause.textContent = 'Play';
  }
  bench.experimentStatus.textContent = '';
  session.reset();
  state = session.state;
  motionFrom = new Map();
  displayedPositions = new Map();
  lastEvents = [];
  remnants = [];
  eventHistory = [];
  behaviourHistory = [];
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

canvas.addEventListener('click', (event) => {
  if (!preset) return;
  const rect = canvas.getBoundingClientRect();
  const l = layout();
  const x = Math.floor(((event.clientX - rect.left) * canvas.width / rect.width - l.ox) / l.size + l.minX);
  const y = Math.floor(((event.clientY - rect.top) * canvas.height / rect.height - l.oy) / l.size + l.minY);
  const cell = state.cells.find((candidate) => candidate.x === x && candidate.y === y);
  if (cell) bench.cellId.value = String(cell.id);
  render(performance.now());
});
bench.eventFilter.addEventListener('change', () => render(performance.now()));
bench.cellId.addEventListener('input', () => render(performance.now()));
bench.cancelSeek.addEventListener('click', () => { cancelRequested = true; });
async function jump(target) {
  if (seeking) return;
  playing = false;
  els.playPause.textContent = 'Play';
  seeking = true;
  cancelRequested = false;
  stepCarry = 0;
  lastFrameAt = 0;
  const locked = [els.playPause, els.step, els.reset, bench.step10, bench.step100, bench.goTick, bench.loadExperiment];
  locked.forEach((control) => { control.disabled = true; });
  bench.cancelSeek.disabled = false;
  try {
    const completed = await seekToTick(session, target, {
      cancelled: () => cancelRequested,
      onStep: recordStep,
      onReset: () => {
        state = session.state;
        lastEvents = []; eventHistory = []; behaviourHistory = []; remnants = [];
      },
      onProgress: (tick) => {
        bench.experimentStatus.textContent = `Advancing: ${tick} / ${target}`;
      },
    });
    bench.experimentStatus.textContent = `${completed ? 'Paused' : 'Cancelled'} at tick ${session.state.tick}.`;
  } catch (error) {
    bench.experimentStatus.textContent = error.message;
  } finally {
    state = session.state;
    seeking = false;
    locked.forEach((control) => { control.disabled = false; });
    bench.cancelSeek.disabled = true;
    render(performance.now());
  }
}
bench.goTick.addEventListener('click', () => jump(Number(bench.targetTick.value)));
bench.step10.addEventListener('click', () => jump(state.tick + 10));
bench.step100.addEventListener('click', () => jump(state.tick + 100));

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

  if (!seeking) render(time);
  requestAnimationFrame(frame);
}

updateSpeedLabel();
reset();
els.playPause.textContent = playing ? 'Pause' : 'Play';
bench.replayLink.hidden = !preset;
if (preset && params.has('tick')) {
  bench.targetTick.value = params.get('tick');
  await jump(Number(params.get('tick')));
}
requestAnimationFrame(frame);
