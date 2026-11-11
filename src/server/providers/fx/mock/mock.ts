import type { FxProvider } from "../types";

/** Fixed rates for tests. */
export function createMockFxProvider(
  rates: Record<string, string> = { "GBP:INR": "124.67", "GBP:USD": "1.3307" },
): FxProvider {
  return {
    name: "mock",
    async rate(from, to) {
      if (from === to) return { rate: "1", asOf: "2026-11-11" };
      const r = rates[`${from}:${to}`];
      return r ? { rate: r, asOf: "2026-11-11" } : null;
    },
  };
}
