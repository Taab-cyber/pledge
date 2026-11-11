import { env, requireEnv } from "../../env";
import { createPayPalProvider } from "./paypal/paypal";
import type { PaymentProvider } from "./types";

let override: PaymentProvider | null = null;
let paypal: PaymentProvider | null = null;

/** The real PayPal sandbox provider (one instance so the OAuth token cache is shared). */
export function getPaymentProvider(): PaymentProvider {
  if (override) return override;
  paypal ??= createPayPalProvider({
    clientId: requireEnv("PAYPAL_CLIENT_ID"),
    clientSecret: requireEnv("PAYPAL_CLIENT_SECRET"),
    webhookId: env().PAYPAL_WEBHOOK_ID,
  });
  return paypal;
}

/** Tests only: swap in the mock provider. */
export function setPaymentProviderForTests(p: PaymentProvider | null): void {
  override = p;
}

export * from "./types";
