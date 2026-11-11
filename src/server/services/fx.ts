// Indicative conversions for display only. Pledge never converts money; PayPal does at capture.
import type { DealDto } from "@/sdk/schemas";
import { countryInfo } from "../domain/countries";
import { estimateConversion, formatAnyCurrency } from "../domain/money";
import { getFxProvider } from "../providers/fx";

type Estimate = NonNullable<DealDto["estimates"]["freelancer"]>;

export async function estimate(
  minor: bigint,
  from: string,
  toCountry: string | null | undefined,
): Promise<Estimate | null> {
  const to = toCountry ? countryInfo(toCountry)?.currency : undefined;
  if (!to || to === from) return null;
  const r = await getFxProvider().rate(from, to);
  if (!r) return null;
  const est = estimateConversion(minor, from, to, r.rate);
  return {
    amount: { minor: Number(est), currency: to, formatted: formatAnyCurrency(est, to) },
    rate: r.rate,
    asOf: r.asOf,
    note: "estimate, final rate set by PayPal",
  };
}
