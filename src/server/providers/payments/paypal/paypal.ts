// PayPal REST adapter (Orders v2 + Payments v2), sandbox only. Server-side: holds the client secret.
import { z } from "zod";
import { IN_COUNTRY_ONLY_CURRENCIES, isSupportedCurrency } from "../../../domain/currencies";
import { providerAmountToMinor, toMajorString, type Money } from "../../../domain/money";
import {
  AUTH_VALIDITY_MS,
  HONOR_PERIOD_MS,
  PaymentError,
  type CaptureResult,
  type PaymentProvider,
  type Simulate,
} from "../types";

const SANDBOX = "https://api-m.sandbox.paypal.com";

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  webhookId?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
}

const AmountSchema = z.object({ currency_code: z.string(), value: z.string() });

const ErrorBodySchema = z
  .object({
    name: z.string().optional(),
    message: z.string().optional(),
    debug_id: z.string().optional(),
    details: z
      .array(z.object({ issue: z.string().optional(), description: z.string().optional() }))
      .optional(),
    error: z.string().optional(), // OAuth errors
    error_description: z.string().optional(),
  })
  .passthrough();

const OrderSchema = z.object({ id: z.string(), status: z.string() }).passthrough();

const AuthorizedOrderSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    purchase_units: z
      .array(
        z
          .object({
            custom_id: z.string().optional(),
            payments: z
              .object({
                authorizations: z
                  .array(
                    z
                      .object({
                        id: z.string(),
                        status: z.string(),
                        expiration_time: z.string().optional(),
                        custom_id: z.string().optional(),
                      })
                      .passthrough(),
                  )
                  .min(1),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

const AuthorizationSchema = z
  .object({ id: z.string(), status: z.string(), expiration_time: z.string().optional() })
  .passthrough();

const CaptureSchema = z
  .object({
    id: z.string(),
    status: z.string(),
    seller_receivable_breakdown: z
      .object({
        gross_amount: AmountSchema.optional(),
        paypal_fee: AmountSchema.optional(),
        net_amount: AmountSchema.optional(),
        receivable_amount: AmountSchema.optional(),
        exchange_rate: z
          .object({
            source_currency: z.string().optional(),
            target_currency: z.string().optional(),
            value: z.string().optional(),
          })
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const RefundSchema = z.object({ id: z.string(), status: z.string() }).passthrough();

/** PayPal issue codes → our categories. Anything unknown stays UPSTREAM with the raw issue kept. */
const ISSUE_CODES: Record<string, string> = {
  INSTRUMENT_DECLINED: "DECLINED",
  TRANSACTION_REFUSED: "DECLINED",
  PAYER_CANNOT_PAY: "DECLINED",
  PAYEE_ACCOUNT_RESTRICTED: "DECLINED",
  PAYER_ACTION_REQUIRED: "DECLINED",
  ORDER_NOT_APPROVED: "NOT_APPROVED",
  AUTHORIZATION_EXPIRED: "HOLD_EXPIRED",
  AUTHORIZATION_VOIDED: "HOLD_VOIDED",
  AUTHORIZATION_ALREADY_CAPTURED: "ALREADY_CAPTURED",
  REAUTHORIZATION_TOO_SOON: "REAUTH_NOT_ALLOWED",
  REAUTHORIZE_TOO_SOON: "REAUTH_NOT_ALLOWED",
  MAX_NUMBER_OF_REAUTHORIZATIONS_REACHED: "REAUTH_NOT_ALLOWED",
  INVALID_RESOURCE_ID: "NOT_FOUND",
  DUPLICATE_INVOICE_ID: "DUPLICATE",
  PAYEE_NOT_ENABLED_FOR_CARD_PROCESSING: "DECLINED",
};

export function createPayPalProvider(cfg: PayPalConfig): PaymentProvider {
  const base = cfg.baseUrl ?? SANDBOX;
  const doFetch = cfg.fetch ?? fetch;
  const now = cfg.now ?? Date.now;
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(force = false): Promise<string> {
    // Cached until ~5 minutes before it expires.
    if (!force && token && token.expiresAt - 5 * 60_000 > now()) return token.value;
    const res = await doFetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(20_000),
    });
    const json: unknown = await res.json().catch(() => ({}));
    if (!res.ok) throw toPaymentError(res.status, json, "AUTH");
    const parsed = z.object({ access_token: z.string(), expires_in: z.number() }).parse(json);
    token = { value: parsed.access_token, expiresAt: now() + parsed.expires_in * 1000 };
    return token.value;
  }

  async function call(
    method: "GET" | "POST",
    path: string,
    opts: {
      body?: unknown;
      idempotencyKey?: string;
      simulate?: Simulate;
      representation?: boolean;
    } = {},
  ): Promise<{ status: number; json: unknown }> {
    // Up to 2 retries for network/5xx errors (same PayPal-Request-Id, so they are safe),
    // plus one fresh token if PayPal says the cached one expired.
    let retries = 0;
    let refreshToken = false;
    for (;;) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${await accessToken(refreshToken)}`,
        "content-type": "application/json",
      };
      if (opts.idempotencyKey) headers["PayPal-Request-Id"] = opts.idempotencyKey.slice(0, 108);
      if (opts.representation) headers.prefer = "return=representation";
      if (opts.simulate) {
        headers["PayPal-Mock-Response"] = JSON.stringify({
          mock_application_codes: opts.simulate.mockApplicationCode,
        });
      }
      let res: Response;
      try {
        res = await doFetch(`${base}${path}`, {
          method,
          headers,
          body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
          signal: AbortSignal.timeout(30_000),
        });
      } catch (err) {
        // Network failure: retrying is safe because POSTs carry the same PayPal-Request-Id.
        if (retries++ < 2) continue;
        throw new PaymentError("UPSTREAM", "PayPal didn't respond. Please try again.", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
      const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
      if (res.status === 401 && !refreshToken) {
        refreshToken = true; // expired token: fetch a new one, once
        continue;
      }
      refreshToken = false;
      if (res.status >= 500 && retries++ < 2) continue;
      if (!res.ok) throw toPaymentError(res.status, json);
      return { status: res.status, json };
    }
  }

  const amount = (m: Money) => ({ currency_code: m.currency, value: toMajorString(m) });

  return {
    name: "paypal",

    supports({ payerCountry, payeeCountry, currency }) {
      if (!isSupportedCurrency(currency)) {
        return { ok: false, reason: `${currency} isn't supported for Pledge deals. Use USD.` };
      }
      if (IN_COUNTRY_ONLY_CURRENCIES.has(currency)) {
        return {
          ok: false,
          reason: `${currency} works only for payments inside one country. Use USD.`,
        };
      }
      if (payerCountry === "IN" && payeeCountry === "IN") {
        return {
          ok: false,
          reason: "PayPal doesn't support payments between two Indian accounts.",
        };
      }
      return { ok: true };
    },

    async createHold(i) {
      const { json } = await call("POST", "/v2/checkout/orders", {
        idempotencyKey: i.idempotencyKey,
        body: {
          intent: "AUTHORIZE",
          purchase_units: [
            {
              reference_id: i.milestoneId,
              custom_id: i.milestoneId,
              invoice_id: i.invoiceId,
              description: i.description.slice(0, 127),
              amount: amount(i.amount),
              payee: { email_address: i.payeeEmail },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                brand_name: "Pledge",
                shipping_preference: "NO_SHIPPING",
                user_action: "CONTINUE",
              },
            },
          },
        },
      });
      return { orderId: OrderSchema.parse(json).id };
    },

    async confirmHold(i) {
      const { json } = await call(
        "POST",
        `/v2/checkout/orders/${encodeURIComponent(i.orderId)}/authorize`,
        {
          idempotencyKey: i.idempotencyKey,
          representation: true,
          body: {},
        },
      );
      const order = AuthorizedOrderSchema.parse(json);
      const unit = order.purchase_units[0]!;
      // Never trust an order id from the browser alone: it must be the order we created for this milestone.
      if (unit.custom_id && unit.custom_id !== i.milestoneId) {
        throw new PaymentError("INVALID", "This PayPal order belongs to a different milestone.");
      }
      const auth = unit.payments.authorizations[0]!;
      if (auth.status === "DENIED") {
        throw new PaymentError("DECLINED", "PayPal declined the hold. Try another payment method.");
      }
      const t = now();
      return {
        authorizationId: auth.id,
        status: auth.status,
        expiresAt: auth.expiration_time ?? new Date(t + AUTH_VALIDITY_MS).toISOString(),
        honorExpiresAt: new Date(t + HONOR_PERIOD_MS).toISOString(),
      };
    },

    async renewHold(i) {
      const { json } = await call(
        "POST",
        `/v2/payments/authorizations/${encodeURIComponent(i.authorizationId)}/reauthorize`,
        { idempotencyKey: i.idempotencyKey, representation: true, body: {}, simulate: i.simulate },
      );
      const auth = AuthorizationSchema.parse(json);
      const t = now();
      return {
        authorizationId: auth.id,
        expiresAt: auth.expiration_time ?? new Date(t + AUTH_VALIDITY_MS).toISOString(),
        honorExpiresAt: new Date(t + HONOR_PERIOD_MS).toISOString(),
      };
    },

    async capture(i): Promise<CaptureResult> {
      const { json } = await call(
        "POST",
        `/v2/payments/authorizations/${encodeURIComponent(i.authorizationId)}/capture`,
        {
          idempotencyKey: i.idempotencyKey,
          representation: true,
          simulate: i.simulate,
          body: { amount: amount(i.amount), final_capture: i.final },
        },
      );
      const cap = CaptureSchema.parse(json);
      return {
        captureId: cap.id,
        status: cap.status,
        ...breakdownFromPayPal(cap.seller_receivable_breakdown),
      };
    },

    async cancelHold(i) {
      await call(
        "POST",
        `/v2/payments/authorizations/${encodeURIComponent(i.authorizationId)}/void`,
        {
          idempotencyKey: i.idempotencyKey,
        },
      );
    },

    async refund(i) {
      const { json } = await call(
        "POST",
        `/v2/payments/captures/${encodeURIComponent(i.captureId)}/refund`,
        {
          idempotencyKey: i.idempotencyKey,
          representation: true,
          body: i.amount ? { amount: amount(i.amount) } : {},
        },
      );
      const r = RefundSchema.parse(json);
      return { refundId: r.id, status: r.status };
    },

    async verifyWebhook({ headers, rawBody }) {
      if (!cfg.webhookId) return null;
      const h = (k: string) => headers.get(k) ?? "";
      let event: unknown;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return null;
      }
      const { json } = await call("POST", "/v1/notifications/verify-webhook-signature", {
        body: {
          auth_algo: h("paypal-auth-algo"),
          cert_url: h("paypal-cert-url"),
          transmission_id: h("paypal-transmission-id"),
          transmission_sig: h("paypal-transmission-sig"),
          transmission_time: h("paypal-transmission-time"),
          webhook_id: cfg.webhookId,
          webhook_event: event,
        },
      });
      const ok = z.object({ verification_status: z.string() }).safeParse(json);
      if (!ok.success || ok.data.verification_status !== "SUCCESS") return null;
      const e = z
        .object({ id: z.string(), event_type: z.string(), resource: z.unknown() })
        .safeParse(event);
      return e.success
        ? { id: e.data.id, type: e.data.event_type, resource: e.data.resource }
        : null;
    },
  };
}

const BreakdownSchema = z
  .object({
    gross_amount: AmountSchema.optional(),
    paypal_fee: AmountSchema.optional(),
    net_amount: AmountSchema.optional(),
    receivable_amount: AmountSchema.optional(),
    exchange_rate: z.object({ value: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

/** seller_receivable_breakdown (capture response or webhook resource) → amounts PayPal reports. */
export function breakdownFromPayPal(raw: unknown): Omit<CaptureResult, "captureId" | "status"> {
  const b = BreakdownSchema.safeParse(raw ?? {});
  if (!b.success) return {};
  const toMoney = (a?: z.infer<typeof AmountSchema>): Money | undefined =>
    a
      ? { minor: providerAmountToMinor(a.value, a.currency_code), currency: a.currency_code }
      : undefined;
  const receivable = toMoney(b.data.receivable_amount);
  const net = toMoney(b.data.net_amount);
  return {
    gross: toMoney(b.data.gross_amount),
    fee: toMoney(b.data.paypal_fee),
    net,
    receivable,
    fxRate: b.data.exchange_rate?.value,
    settlementCurrency: receivable?.currency ?? net?.currency,
  };
}

function toPaymentError(status: number, json: unknown, fallback = "UPSTREAM"): PaymentError {
  const body = ErrorBodySchema.safeParse(json ?? {});
  const b = body.success ? body.data : {};
  const issue = b.details?.[0]?.issue;
  const description = b.details?.[0]?.description ?? b.message ?? b.error_description;
  const code =
    (issue && ISSUE_CODES[issue]) ||
    (status === 401 || status === 403
      ? "AUTH"
      : status === 404
        ? "NOT_FOUND"
        : status === 422
          ? "INVALID"
          : fallback);
  return new PaymentError(code, description ?? `PayPal returned ${status}.`, {
    status,
    name: b.name ?? b.error,
    issue,
    description,
    debugId: b.debug_id,
  });
}
