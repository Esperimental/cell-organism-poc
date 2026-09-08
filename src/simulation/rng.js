export function normalizeSeed(seed) {
  const n = Number(seed);
  if (!Number.isInteger(n)) throw new Error('seed must be an integer');
  return n >>> 0;
}

export function nextRandom(state) {
  let t = (state + 0x6D2B79F5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
  const value = ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  return { value, state: t };
}

export function randomInt(state, minInclusive, maxInclusive) {
  if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive) || maxInclusive < minInclusive) {
    throw new Error('invalid integer range');
  }
  const next = nextRandom(state);
  const span = maxInclusive - minInclusive + 1;
  return {
    value: minInclusive + Math.floor(next.value * span),
    state: next.state,
  };
}
