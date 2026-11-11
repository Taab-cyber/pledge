// PayPal webhooks: verify with PayPal, store each event id once (duplicates ignored), then apply.
import { AppError } from "../http/errors";
import { getPaymentProvider } from "../providers/payments";
import { recordWebhookEvent } from "../repos/milestones";
import { adminClient } from "../repos/supabase";
import { applyPayPalEvent } from "./payments";

export async function handlePayPalWebhook(headers: Headers, rawBody: string) {
  const event = await getPaymentProvider().verifyWebhook({ headers, rawBody });
  if (!event) throw new AppError("BAD_REQUEST", "Webhook signature could not be verified.");

  const fresh = await recordWebhookEvent(adminClient(), {
    id: event.id,
    type: event.type,
    payload: JSON.parse(rawBody) as unknown,
  });
  if (!fresh) return { received: true, duplicate: true };

  // Out-of-order or stale events are harmless: applyPayPalEvent only moves along legal transitions.
  const outcome = await applyPayPalEvent(event.type, event.resource);
  return { received: true, duplicate: false, outcome };
}
