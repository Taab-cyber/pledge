// In-memory PayPal stand-in for tests: honours idempotency keys like PayPal does, and counts calls.
import type { Money } from "../../../domain/money";
import {
  AUTH_VALIDITY_MS,
  HONOR_PERIOD_MS,
  PaymentError,
  type CaptureResult,
  type PaymentProvider,
} from "../types";

export interface MockPaymentState {
  orders: Map<string, { milestoneId: string; amount: Money; payeeEmail: string }>;
  authorizations: Map<
    string,
    { orderId: string; amount: Money; status: "CREATED" | "CAPTURED" | "VOIDED" }
  >;
  captures: Map<string, CaptureResult>;
  /** Responses by idempotency key: a repeated key returns the first result (or error). */
  byKey: Map<string, unknown>;
  calls: Record<string, number>;
  /** Make the next call of this kind fail with this PaymentError code. */
  failNext: Partial<Record<"capture" | "renewHold" | "confirmHold" | "createHold", string>>;
  /** Delay (ms) before capture resolves, to widen race windows in tests. */
  captureDelayMs: number;
}

export function createMockPaymentProvider(now: () => number = Date.now) {
  const state: MockPaymentState = {
    orders: new Map(),
    authorizations: new Map(),
    captures: new Map(),
    byKey: new Map(),
    calls: {},
    failNext: {},
    captureDelayMs: 0,
  };
  let seq = 0;
  // Unique per process like real PayPal ids (parallel test files share one database).
  const run = Math.random().toString(36).slice(2, 8).toUpperCase();
  const id = (p: string) => `${p}-${run}-${++seq}`;

  async function idem<T>(kind: string, key: string, run: () => Promise<T>): Promise<T> {
    state.calls[kind] = (state.calls[kind] ?? 0) + 1;
    const k = `${kind}:${key}`;
    if (state.byKey.has(k)) {
      const prev = state.byKey.get(k);
      if (prev instanceof Error) throw prev;
      return prev as T;
    }
    try {
      const out = await run();
      state.byKey.set(k, out);
      return out;
    } catch (err) {
      state.byKey.set(k, err);
      throw err;
    }
  }

  function maybeFail(kind: keyof MockPaymentState["failNext"]) {
    const code = state.failNext[kind];
    if (code) {
      delete state.failNext[kind];
      throw new PaymentError(code, `Mock ${kind} failure: ${code}`, {
        issue: code,
        debugId: "mock-debug",
      });
    }
  }

  const provider: PaymentProvider = {
    name: "mock",
    supports: ({ payerCountry, payeeCountry }) =>
      payerCountry === "IN" && payeeCountry === "IN"
        ? { ok: false, reason: "PayPal doesn't support payments between two Indian accounts." }
        : { ok: true },

    createHold: (i) =>
      idem("createHold", i.idempotencyKey, async () => {
        maybeFail("createHold");
        const orderId = id("ORDER");
        state.orders.set(orderId, {
          milestoneId: i.milestoneId,
          amount: i.amount,
          payeeEmail: i.payeeEmail,
        });
        return { orderId };
      }),

    confirmHold: (i) =>
      idem("confirmHold", i.idempotencyKey, async () => {
        maybeFail("confirmHold");
        const order = state.orders.get(i.orderId);
        if (!order) throw new PaymentError("NOT_FOUND", "Unknown order");
        if (order.milestoneId !== i.milestoneId)
          throw new PaymentError("INVALID", "Order mismatch");
        const authorizationId = id("AUTH");
        state.authorizations.set(authorizationId, {
          orderId: i.orderId,
          amount: order.amount,
          status: "CREATED",
        });
        return {
          authorizationId,
          status: "CREATED",
          expiresAt: new Date(now() + AUTH_VALIDITY_MS).toISOString(),
          honorExpiresAt: new Date(now() + HONOR_PERIOD_MS).toISOString(),
        };
      }),

    renewHold: (i) =>
      idem("renewHold", i.idempotencyKey, async () => {
        maybeFail("renewHold");
        const prev = state.authorizations.get(i.authorizationId);
        if (!prev || prev.status !== "CREATED")
          throw new PaymentError("HOLD_VOIDED", "Not renewable");
        const authorizationId = id("AUTH");
        state.authorizations.set(authorizationId, { ...prev });
        return {
          authorizationId,
          expiresAt: new Date(now() + AUTH_VALIDITY_MS).toISOString(),
          honorExpiresAt: new Date(now() + HONOR_PERIOD_MS).toISOString(),
        };
      }),

    capture: (i) =>
      idem("capture", i.idempotencyKey, async () => {
        if (state.captureDelayMs) await new Promise((r) => setTimeout(r, state.captureDelayMs));
        maybeFail("capture");
        const auth = state.authorizations.get(i.authorizationId);
        if (!auth) throw new PaymentError("NOT_FOUND", "Unknown authorization");
        if (auth.status === "CAPTURED")
          throw new PaymentError("ALREADY_CAPTURED", "Already captured");
        if (auth.status === "VOIDED") throw new PaymentError("HOLD_VOIDED", "Voided");
        auth.status = "CAPTURED";
        const fee = (i.amount.minor * 5n) / 100n;
        const result: CaptureResult = {
          captureId: id("CAPTURE"),
          status: "COMPLETED",
          gross: i.amount,
          fee: { minor: fee, currency: i.amount.currency },
          net: { minor: i.amount.minor - fee, currency: i.amount.currency },
        };
        state.captures.set(result.captureId, result);
        return result;
      }),

    cancelHold: (i) =>
      idem("cancelHold", i.idempotencyKey, async () => {
        const auth = state.authorizations.get(i.authorizationId);
        if (!auth) throw new PaymentError("NOT_FOUND", "Unknown authorization");
        auth.status = "VOIDED";
      }),

    refund: (i) =>
      idem("refund", i.idempotencyKey, async () => {
        if (!state.captures.has(i.captureId))
          throw new PaymentError("NOT_FOUND", "Unknown capture");
        return { refundId: id("REFUND"), status: "COMPLETED" };
      }),

    async verifyWebhook({ headers, rawBody }) {
      // Tests sign events with a shared header; anything else is rejected.
      if (headers.get("x-mock-webhook") !== "valid") return null;
      const e = JSON.parse(rawBody) as { id: string; event_type: string; resource: unknown };
      return { id: e.id, type: e.event_type, resource: e.resource };
    },
  };
  return { provider, state };
}
