import { COUNTRIES, suggestDealCurrency } from "@/server/domain/countries";
import { SUPPORTED_CURRENCIES } from "@/server/domain/currencies";
import { hashShareToken, isWellFormedShareToken } from "@/server/domain/share-token";
import { env } from "@/server/env";
import { route } from "@/server/http/route";
import { findDealByTokenHash } from "@/server/repos/deals";
import { adminClient } from "@/server/repos/supabase";

/**
 * Demo only: the seeded plan link, but only while it still opens a plan waiting for approval.
 * Re-sharing rotates the link (and approving closes it), so a stale link is hidden, not shown broken.
 */
async function liveDemoPlanUrl(url: string | undefined): Promise<string | null> {
  const token = url?.split("/p/")[1]?.split(/[?#]/)[0];
  if (!url || !token || !isWellFormedShareToken(token)) return null;
  const deal = await findDealByTokenHash(adminClient(), hashShareToken(token)).catch(() => null);
  return deal?.status === "shared" ? url : null;
}

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
    demoPlanUrl: e.DEMO_MODE ? await liveDemoPlanUrl(e.DEMO_SHARE_URL) : null,
  };
});
