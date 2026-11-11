import { route } from "@/server/http/route";
import { handlePayPalWebhook } from "@/server/services/webhooks";

/** PayPal sandbox webhook: verified with PayPal, stored once by event id, then applied. */
export const POST = route(async (req) => {
  const rawBody = await req.text();
  return handlePayPalWebhook(req.headers, rawBody);
});
