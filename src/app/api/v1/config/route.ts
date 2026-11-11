import { env } from "@/server/env";
import { route } from "@/server/http/route";

/** Public, non-secret settings the UI needs at runtime. */
export const GET = route(async () => {
  const e = env();
  return { demoMode: e.DEMO_MODE, paypalClientId: e.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? null };
});
