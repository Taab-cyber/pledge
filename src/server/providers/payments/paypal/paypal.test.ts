import { describe, expect, it } from "vitest";
import { money } from "../../../domain/money";
import { PaymentError } from "../types";
import { breakdownFromPayPal, createPayPalProvider } from "./paypal";

type Call = { url: string; init: RequestInit; headers: Record<string, string>; body: unknown };

/** Scripted fake PayPal: answers OAuth automatically, then replies from the queue. */
function fakePayPal(replies: Array<{ status: number; body?: unknown }>) {
  const calls: Call[] = [];
  let tokenCalls = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    if (url.endsWith("/v1/oauth2/token")) {
      tokenCalls++;
      return Response.json({ access_token: `tok-${tokenCalls}`, expires_in: 32400 });
    }
    calls.push({
      url,
      init,
      headers,
      body: init.body ? JSON.parse(init.body as string) : undefined,
    });
    const next = replies.shift();
    if (!next) throw new Error(`unexpected call ${url}`);
    return next.status === 204
      ? new Response(null, { status: 204 })
      : Response.json(next.body ?? {}, { status: next.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, tokenCalls: () => tokenCalls };
}

const cfg = (f: typeof fetch, now = () => 1_800_000_000_000) => ({
  clientId: "id",
  clientSecret: "secret",
  webhookId: "WH-1",
  fetch: f,
  now,
});

describe("PayPal provider", () => {
  it("creates an AUTHORIZE order paying the freelancer, with idempotency and exact decimals", async () => {
    const fake = fakePayPal([{ status: 201, body: { id: "ORDER-1", status: "CREATED" } }]);
    const pp = createPayPalProvider(cfg(fake.fetchImpl));
    const out = await pp.createHold({
      milestoneId: "m1",
      amount: money(12000n, "GBP"),
      payeeEmail: "riya@business.example.com",
      description: "Logo — concepts",
      invoiceId: "pledge-m1-o1",
      idempotencyKey: "m1:order:1",
    });
    expect(out).toEqual({ orderId: "ORDER-1" });
    const c = fake.calls[0]!;
    expect(c.url).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    expect(c.headers["PayPal-Request-Id"]).toBe("m1:order:1");
    expect(c.headers.authorization).toBe("Bearer tok-1");
    expect(c.body).toMatchObject({
      intent: "AUTHORIZE",
      purchase_units: [
        {
          custom_id: "m1",
          invoice_id: "pledge-m1-o1",
          amount: { currency_code: "GBP", value: "120.00" },
          payee: { email_address: "riya@business.example.com" },
        },
      ],
    });
  });

  it("sends JPY without decimals", async () => {
    const fake = fakePayPal([{ status: 201, body: { id: "O", status: "CREATED" } }]);
    await createPayPalProvider(cfg(fake.fetchImpl)).createHold({
      milestoneId: "m",
      amount: money(5000n, "JPY"),
      payeeEmail: "a@b.co",
      description: "x",
      invoiceId: "i",
      idempotencyKey: "k",
    });
    expect(
      (fake.calls[0]!.body as { purchase_units: [{ amount: unknown }] }).purchase_units[0].amount,
    ).toEqual({
      currency_code: "JPY",
      value: "5000",
    });
  });

  it("authorizes the order and returns hold + 3-day honor period", async () => {
    const now = () => Date.parse("2026-11-12T10:00:00Z");
    const fake = fakePayPal([
      {
        status: 201,
        body: {
          id: "ORDER-1",
          status: "COMPLETED",
          purchase_units: [
            {
              custom_id: "m1",
              payments: {
                authorizations: [
                  { id: "AUTH-1", status: "CREATED", expiration_time: "2026-12-11T10:00:00Z" },
                ],
              },
            },
          ],
        },
      },
    ]);
    const hold = await createPayPalProvider(cfg(fake.fetchImpl, now)).confirmHold({
      orderId: "ORDER-1",
      milestoneId: "m1",
      idempotencyKey: "m1:authorize:ORDER-1",
    });
    expect(hold).toEqual({
      authorizationId: "AUTH-1",
      status: "CREATED",
      expiresAt: "2026-12-11T10:00:00Z",
      honorExpiresAt: "2026-11-15T10:00:00.000Z",
    });
    expect(fake.calls[0]!.url).toContain("/v2/checkout/orders/ORDER-1/authorize");
    expect(fake.calls[0]!.headers.prefer).toBe("return=representation");
  });

  it("refuses an order that belongs to another milestone", async () => {
    const fake = fakePayPal([
      {
        status: 201,
        body: {
          id: "O",
          status: "COMPLETED",
          purchase_units: [
            { custom_id: "other", payments: { authorizations: [{ id: "A", status: "CREATED" }] } },
          ],
        },
      },
    ]);
    await expect(
      createPayPalProvider(cfg(fake.fetchImpl)).confirmHold({
        orderId: "O",
        milestoneId: "m1",
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("captures and parses the receivable breakdown, including currency conversion", async () => {
    const fake = fakePayPal([
      {
        status: 201,
        body: {
          id: "CAP-1",
          status: "COMPLETED",
          seller_receivable_breakdown: {
            gross_amount: { currency_code: "GBP", value: "120.00" },
            paypal_fee: { currency_code: "GBP", value: "5.82" },
            net_amount: { currency_code: "GBP", value: "114.18" },
            receivable_amount: { currency_code: "USD", value: "149.40" },
            exchange_rate: { source_currency: "GBP", target_currency: "USD", value: "1.30846" },
          },
        },
      },
    ]);
    const r = await createPayPalProvider(cfg(fake.fetchImpl)).capture({
      authorizationId: "AUTH-1",
      amount: money(12000n, "GBP"),
      final: true,
      idempotencyKey: "m1:capture:1",
    });
    expect(r).toEqual({
      captureId: "CAP-1",
      status: "COMPLETED",
      gross: { minor: 12000n, currency: "GBP" },
      fee: { minor: 582n, currency: "GBP" },
      net: { minor: 11418n, currency: "GBP" },
      receivable: { minor: 14940n, currency: "USD" },
      fxRate: "1.30846",
      settlementCurrency: "USD",
    });
    expect(fake.calls[0]!.body).toEqual({
      amount: { currency_code: "GBP", value: "120.00" },
      final_capture: true,
    });
    expect(fake.calls[0]!.headers["PayPal-Request-Id"]).toBe("m1:capture:1");
  });

  it("sends the negative-testing header only when simulating", async () => {
    const fake = fakePayPal([
      {
        status: 422,
        body: {
          name: "UNPROCESSABLE_ENTITY",
          debug_id: "dbg-42",
          details: [
            { issue: "INSTRUMENT_DECLINED", description: "The instrument presented was declined." },
          ],
        },
      },
    ]);
    const err = await createPayPalProvider(cfg(fake.fetchImpl))
      .capture({
        authorizationId: "A",
        amount: money(100n, "USD"),
        final: true,
        idempotencyKey: "k",
        simulate: { mockApplicationCode: "INSTRUMENT_DECLINED" },
      })
      .catch((e: unknown) => e);
    expect(fake.calls[0]!.headers["PayPal-Mock-Response"]).toBe(
      '{"mock_application_codes":"INSTRUMENT_DECLINED"}',
    );
    expect(err).toBeInstanceOf(PaymentError);
    expect(err).toMatchObject({
      code: "DECLINED",
      info: { status: 422, issue: "INSTRUMENT_DECLINED", debugId: "dbg-42" },
    });
  });

  it("retries 5xx with the same request id, and refreshes an expired token once", async () => {
    const fake = fakePayPal([
      { status: 503, body: {} },
      { status: 401, body: { error: "invalid_token" } },
      { status: 204 },
    ]);
    await createPayPalProvider(cfg(fake.fetchImpl)).cancelHold({
      authorizationId: "A",
      idempotencyKey: "m:void:A",
    });
    expect(fake.calls.map((c) => c.headers["PayPal-Request-Id"])).toEqual([
      "m:void:A",
      "m:void:A",
      "m:void:A",
    ]);
    expect(fake.tokenCalls()).toBe(2); // initial token + one refresh after the 401
  });

  it("caches the OAuth token across calls", async () => {
    const fake = fakePayPal([
      { status: 201, body: { id: "R1", status: "COMPLETED" } },
      { status: 201, body: { id: "R2", status: "COMPLETED" } },
    ]);
    const pp = createPayPalProvider(cfg(fake.fetchImpl));
    await pp.refund({ captureId: "C", idempotencyKey: "a" });
    await pp.refund({ captureId: "C", idempotencyKey: "b" });
    expect(fake.tokenCalls()).toBe(1);
  });

  it("maps a too-early reauthorization to REAUTH_NOT_ALLOWED with PayPal's details", async () => {
    const fake = fakePayPal([
      {
        status: 422,
        body: {
          name: "UNPROCESSABLE_ENTITY",
          debug_id: "d1",
          details: [{ issue: "REAUTHORIZATION_TOO_SOON", description: "Too soon" }],
        },
      },
    ]);
    await expect(
      createPayPalProvider(cfg(fake.fetchImpl)).renewHold({
        authorizationId: "A",
        idempotencyKey: "k",
      }),
    ).rejects.toMatchObject({
      code: "REAUTH_NOT_ALLOWED",
      info: { issue: "REAUTHORIZATION_TOO_SOON" },
    });
  });

  it("verifies webhooks with PayPal and rejects failures", async () => {
    const event = {
      id: "WH-EVT-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "CAP-1" },
    };
    const ok = fakePayPal([{ status: 200, body: { verification_status: "SUCCESS" } }]);
    const headers = new Headers({
      "paypal-transmission-id": "t1",
      "paypal-auth-algo": "SHA256withRSA",
    });
    expect(
      await createPayPalProvider(cfg(ok.fetchImpl)).verifyWebhook({
        headers,
        rawBody: JSON.stringify(event),
      }),
    ).toEqual({ id: "WH-EVT-1", type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "CAP-1" } });
    expect(ok.calls[0]!.body).toMatchObject({
      webhook_id: "WH-1",
      transmission_id: "t1",
      webhook_event: event,
    });

    const bad = fakePayPal([{ status: 200, body: { verification_status: "FAILURE" } }]);
    expect(
      await createPayPalProvider(cfg(bad.fetchImpl)).verifyWebhook({
        headers,
        rawBody: JSON.stringify(event),
      }),
    ).toBeNull();
  });

  it("rejects unsupported pairs with a reason", () => {
    const pp = createPayPalProvider(cfg(fakePayPal([]).fetchImpl));
    expect(pp.supports({ payerCountry: "GB", payeeCountry: "IN", currency: "GBP" })).toEqual({
      ok: true,
    });
    expect(pp.supports({ payerCountry: "IN", payeeCountry: "IN", currency: "USD" }).ok).toBe(false);
    expect(pp.supports({ payerCountry: "GB", payeeCountry: "IN", currency: "INR" }).ok).toBe(false);
  });
});

describe("breakdownFromPayPal", () => {
  it("handles INR settlement and missing parts", () => {
    expect(
      breakdownFromPayPal({
        gross_amount: { currency_code: "GBP", value: "400.00" },
        receivable_amount: { currency_code: "INR", value: "48123.55" },
        exchange_rate: { value: "120.31" },
      }),
    ).toMatchObject({
      gross: { minor: 40000n, currency: "GBP" },
      receivable: { minor: 4812355n, currency: "INR" },
      settlementCurrency: "INR",
      fxRate: "120.31",
    });
    expect(breakdownFromPayPal(undefined)).toEqual({
      gross: undefined,
      fee: undefined,
      net: undefined,
      receivable: undefined,
      fxRate: undefined,
      settlementCurrency: undefined,
    });
  });
});
