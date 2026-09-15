// Replay through ordinary step(), retaining no unbounded event/metric history.
export async function seekToTick(session, target, {
  batchSize = 50,
  cancelled = () => false,
  onStep = () => {},
  onReset = () => {},
  onProgress = () => {},
  yieldBatch = () => new Promise((resolve) => setTimeout(resolve, 0)),
} = {}) {
  if (!Number.isSafeInteger(target) || target < session.initialState.tick) {
    throw new Error(`Target must be an integer at least ${session.initialState.tick}`);
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) throw new Error('Invalid batch size');
  if (cancelled()) return false;
  if (target < session.state.tick) {
    session.reset();
    onReset();
  }
  while (session.state.tick < target && !cancelled()) {
    for (let i = 0; i < batchSize && session.state.tick < target && !cancelled(); i += 1) {
      onStep(session.step({ includeMetrics: false }));
    }
    onProgress(session.state.tick, target);
    await yieldBatch();
  }
  return session.state.tick === target;
}
