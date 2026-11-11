import type { Money } from "../../domain/money";

/** A failed payment call with PayPal's own error data, so the UI can show what really happened. */
export class PaymentError extends Error {
  constructor(
    /** Our category: DECLINED, HOLD_EXPIRED, REAUTH_NOT_ALLOWED, INVALID, AUTH, UPSTREAM, … */
    readonly code: string,
    message: string,
    readonly info: {
      status?: number;
      name?: string;
      issue?: string;
      description?: string;
      debugId?: string;
    } = {},
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export interface CaptureResult {
  captureId: string;
  /** PayPal capture status: COMPLETED, PENDING, DECLINED, … */
  status: string;
  gross?: Money;
  fee?: Money;
  net?: Money;
  /** What the payee actually receives, in their settlement currency (after PayPal converts). */
  receivable?: Money;
  fxRate?: string;
  settlementCurrency?: string;
}

/** Demo-only: ask the PayPal sandbox to return a specific error (negative testing). */
export type Simulate = { mockApplicationCode: string } | undefined;

export interface PaymentProvider {
  readonly name: string;
  supports(i: { payerCountry: string; payeeCountry: string; currency: string }): {
    ok: boolean;
    reason?: string;
  };
  createHold(i: {
    milestoneId: string;
    amount: Money;
    payeeEmail: string;
    description: string;
    invoiceId: string;
    idempotencyKey: string;
  }): Promise<{ orderId: string }>;
  confirmHold(i: { orderId: string; milestoneId: string; idempotencyKey: string }): Promise<{
    authorizationId: string;
    status: string;
    expiresAt: string;
    honorExpiresAt: string;
  }>;
  renewHold(i: { authorizationId: string; idempotencyKey: string; simulate?: Simulate }): Promise<{
    authorizationId: string;
    expiresAt: string;
    honorExpiresAt: string;
  }>;
  capture(i: {
    authorizationId: string;
    amount: Money;
    final: boolean;
    idempotencyKey: string;
    simulate?: Simulate;
  }): Promise<CaptureResult>;
  cancelHold(i: { authorizationId: string; idempotencyKey: string }): Promise<void>;
  refund(i: { captureId: string; amount?: Money; idempotencyKey: string }): Promise<{
    refundId: string;
    status: string;
  }>;
  verifyWebhook(i: {
    headers: Headers;
    rawBody: string;
  }): Promise<{ id: string; type: string; resource: unknown } | null>;
}

export const HONOR_PERIOD_MS = 3 * 24 * 3_600_000;
export const AUTH_VALIDITY_MS = 29 * 24 * 3_600_000;
