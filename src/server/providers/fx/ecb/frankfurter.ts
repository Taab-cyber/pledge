// Free ECB reference rates via the Frankfurter API, cached per base currency per day. Estimates only.
import { z } from "zod";
import type { FxProvider, FxRate } from "../types";

const Latest = z.object({ date: z.string(), rates: z.record(z.string(), z.number()) });

export function createFrankfurterProvider(
  opts: { fetch?: typeof fetch; now?: () => number } = {},
): FxProvider {
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { day: string; rates: Record<string, number>; asOf: string }>();

  return {
    name: "frankfurter",
    async rate(from, to): Promise<FxRate | null> {
      if (from === to) return { rate: "1", asOf: new Date(now()).toISOString().slice(0, 10) };
      const day = new Date(now()).toISOString().slice(0, 10);
      let entry = cache.get(from);
      if (!entry || entry.day !== day) {
        try {
          const res = await doFetch(
            `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}`,
            {
              signal: AbortSignal.timeout(8_000),
            },
          );
          if (!res.ok) return null;
          const json = Latest.parse(await res.json());
          entry = { day, rates: json.rates, asOf: json.date };
          cache.set(from, entry);
        } catch {
          return null; // estimates are optional: never block a page on them
        }
      }
      const r = entry.rates[to];
      return r === undefined ? null : { rate: String(r), asOf: entry.asOf };
    },
  };
}
