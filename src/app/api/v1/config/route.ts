import { COUNTRIES, suggestDealCurrency } from "@/server/domain/countries";
import { SUPPORTED_CURRENCIES } from "@/server/domain/currencies";
import { env } from "@/server/env";
import { route } from "@/server/http/route";

/** Public, non-secret settings the UI needs at runtime (plus country → currency suggestions). */
export const GET = route(async () => {
  const e = env();
  const countries = Object.values(COUNTRIES)
    .map((c) => {
      const s = suggestDealCurrency(c.code);
      return { code: c.code, name: c.name, currency: s.currency, reason: s.reason ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    demoMode: e.DEMO_MODE,
    paypalClientId: e.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? null,
    countries,
    currencies: Object.keys(SUPPORTED_CURRENCIES),
    // Demo only: the seeded plan link, so "Try as client" has something to approve.
    demoPlanUrl: e.DEMO_MODE ? (e.DEMO_SHARE_URL ?? null) : null,
  };
});
