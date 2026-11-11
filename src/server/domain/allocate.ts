// Splits a total into parts proportional to integer weights (largest-remainder method).
// Guarantees: parts sum exactly to the total, and every part is at least 1 minor unit.

export class AllocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AllocationError";
  }
}

export function allocate(total: bigint, weights: readonly number[]): bigint[] {
  if (weights.length === 0) throw new AllocationError("Need at least one weight.");
  if (!weights.every((w) => Number.isSafeInteger(w) && w > 0)) {
    throw new AllocationError("Weights must be positive integers.");
  }
  if (total < BigInt(weights.length)) {
    throw new AllocationError("Total is too small to give every part at least 1 minor unit.");
  }

  const ws = weights.map((w) => BigInt(w));
  const weightSum = ws.reduce((a, b) => a + b, 0n);

  const parts = ws.map((w) => (total * w) / weightSum);
  let leftover = total - parts.reduce((a, b) => a + b, 0n);

  // Hand out the leftover units to the largest remainders; ties go to the earlier part.
  const order = ws
    .map((w, i) => ({ i, r: (total * w) % weightSum }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (leftover === 0n) break;
    parts[i] = (parts[i] ?? 0n) + 1n;
    leftover -= 1n;
  }

  // Tiny weights can round to 0: move 1 unit at a time from the largest part (earliest on ties).
  for (let i = 0; i < parts.length; i++) {
    while ((parts[i] ?? 0n) < 1n) {
      const donor = indexOfLargest(parts);
      parts[donor] = (parts[donor] ?? 0n) - 1n;
      parts[i] = (parts[i] ?? 0n) + 1n;
    }
  }
  return parts;
}

function indexOfLargest(xs: bigint[]): number {
  let best = 0;
  for (let i = 1; i < xs.length; i++) if ((xs[i] ?? 0n) > (xs[best] ?? 0n)) best = i;
  return best;
}
