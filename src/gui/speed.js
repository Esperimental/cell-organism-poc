export const SPEED_RATES = [1, 2, 4, 8, 16, 32, 64, 128, 256];

export function speedRateForIndex(index) {
  const numeric = Number(index);
  const safeIndex = Number.isFinite(numeric)
    ? Math.max(0, Math.min(SPEED_RATES.length - 1, Math.round(numeric)))
    : 0;
  return SPEED_RATES[safeIndex];
}

export function accumulatedSteps(elapsedMs, rate, carry = 0, maxSteps = 64) {
  const total = carry + Math.max(0, elapsedMs) * Math.max(0, rate) / 1000;
  const steps = Math.min(maxSteps, Math.floor(total));
  return { steps, carry: total - steps };
}
