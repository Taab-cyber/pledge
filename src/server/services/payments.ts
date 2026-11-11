// Money movement use-cases. Every PayPal call is real (sandbox); state only changes after PayPal confirms.
// Release safety: a capture first CLAIMS the milestone (conditional update, one winner), then calls
// PayPal with a deterministic PayPal-Request-Id, so even a lost race can't produce a second capture.
import { randomUUID } from "node:crypto";
import {
  canTransition,
  hasLiveHold,
  isDueForAutoRelease,
  type MilestoneStatus,
} from "../domain/milestone-machine";
import { money, type Money } from "../domain/money";
import { env } from "../env";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import {
  getPaymentProvider,
  PaymentError,
  type CaptureResult,
  type Simulate,
} from "../providers/payments";
import { breakdownFromPayPal } from "../providers/payments/paypal/paypal";
import { findDeal, type DealRow } from "../repos/deals";
import {
  findMilestoneBy,
  getPaymentMilestone,
  listDealMilestones,
  logEvent,
  updateDealStatusIf,
  updateMilestoneIf,
  type PaymentMilestone,
} from "../repos/milestones";
import { getProfile } from "../repos/profiles";
import { adminClient } from "../repos/supabase";

type Actor =
  { kind: "client" | "freelancer"; auth: AuthContext } | { kind: "auto" | "agent" | "system" };

const admin = () => adminClient();

async function load(milestoneId: string): Promise<{ ms: PaymentMilestone; deal: DealRow }> {
  const ms = await getPaymentMilestone(admin(), milestoneId);
  if (!ms) throw new AppError("NOT_FOUND", "Milestone not found.");
  const deal = await findDeal(admin(), ms.deal_id);
  if (!deal) throw new AppError("NOT_FOUND", "Milestone not found.");
  return { ms, deal };
}

function requireParty(deal: DealRow, auth: AuthContext, role: "client" | "freelancer") {
  const id = role === "client" ? deal.client_id : deal.freelancer_id;
  if (id !== auth.userId) {
    // Same answer whether the deal exists or not for strangers.
    if (deal.client_id !== auth.userId && deal.freelancer_id !== auth.userId) {
      throw new AppError("NOT_FOUND", "Milestone not found.");
    }
    throw new AppError(
      "FORBIDDEN",
      role === "client" ? "Only the client can do this." : "Only the freelancer can do this.",
    );
  }
}

const amountOf = (ms: PaymentMilestone, deal: DealRow): Money =>
  money(BigInt(ms.amount_minor), deal.currency);

function paymentFailed(err: PaymentError, fallback: string): AppError {
  const friendly: Record<string, string> = {
    DECLINED: "PayPal declined this payment. Try another payment method in PayPal.",
    HOLD_EXPIRED: "The PayPal hold has expired. The client needs to secure the milestone again.",
    HOLD_VOIDED: "The PayPal hold was cancelled.",
    NOT_APPROVED: "The payment wasn't approved in the PayPal window yet.",
    REAUTH_NOT_ALLOWED: "PayPal didn't allow the hold to be renewed.",
    UPSTREAM: "PayPal didn't respond. Please try again.",
  };
  return new AppError("PAYMENT_FAILED", friendly[err.code] ?? fallback, {
    paypal: { code: err.code, ...err.info },
  });
}

const errorRecord = (err: PaymentError, action: string) => ({
  action,
  code: err.code,
  message: err.message,
  ...err.info,
  at: new Date().toISOString(),
});

// ── Secure (hold) ────────────────────────────────────────────────────────────

/** Step 1: create a PayPal order (intent AUTHORIZE) paying the freelancer directly. */
export async function createHoldOrder(
  auth: AuthContext,
  milestoneId: string,
): Promise<{ orderId: string }> {
  const { ms, deal } = await load(milestoneId);
  requireParty(deal, auth, "client");
  if (ms.status !== "awaiting_hold") {
    throw new AppError(
      "CONFLICT",
      ms.status === "held"
        ? "This milestone is already secured."
        : "This milestone can't be secured right now.",
    );
  }
  const freelancer = await getProfile(admin(), deal.freelancer_id);
  if (!freelancer.paypal_email) {
    throw new AppError("CONFLICT", "The freelancer hasn't added a PayPal email yet.");
  }
  const client = await getProfile(admin(), auth.userId);
  const provider = getPaymentProvider();
  const support = provider.supports({
    payerCountry: client.country_code ?? deal.client_country ?? "US",
    payeeCountry: freelancer.country_code ?? "US",
    currency: deal.currency,
  });
  if (!support.ok)
    throw new AppError("VALIDATION", support.reason ?? "This payment isn't supported.");

  const attempt = ms.hold_order_attempts + 1;
  let orderId: string;
  try {
    ({ orderId } = await provider.createHold({
      milestoneId: ms.id,
      amount: amountOf(ms, deal),
      payeeEmail: freelancer.paypal_email,
      description: `${deal.title || "Pledge deal"} — ${ms.title}`,
      invoiceId: `pledge-${ms.id}-o${attempt}`,
      idempotencyKey: `${ms.id}:order:${attempt}`,
    }));
  } catch (err) {
    if (err instanceof PaymentError) throw paymentFailed(err, "Couldn't start the PayPal payment.");
    throw err;
  }
  const updated = await updateMilestoneIf(
    admin(),
    ms.id,
    { status: "awaiting_hold", where: { hold_order_attempts: String(ms.hold_order_attempts) } },
    { paypal_order_id: orderId, hold_order_attempts: attempt },
  );
  if (!updated) throw new AppError("CONFLICT", "This milestone changed. Reload and try again.");
  await logEvent(admin(), {
    deal_id: deal.id,
    milestone_id: ms.id,
    actor_role: "client",
    type: "hold_order_created",
    payload: { orderId },
  });
  return { orderId };
}

/** Step 2: after the client approves in the PayPal window, the server authorizes the order. */
export async function confirmHold(auth: AuthContext, milestoneId: string, orderId: string) {
  const { ms, deal } = await load(milestoneId);
  requireParty(deal, auth, "client");
  if (ms.status === "held" && ms.paypal_order_id === orderId) return { status: ms.status }; // repeat call
  if (ms.status !== "awaiting_hold")
    throw new AppError("CONFLICT", "This milestone can't be secured right now.");
  // Only the order we created for this milestone can be authorized (never trust the browser alone).
  if (ms.paypal_order_id !== orderId) {
    throw new AppError("CONFLICT", "This PayPal window is out of date. Please try again.");
  }

  let hold;
  try {
    hold = await getPaymentProvider().confirmHold({
      orderId,
      milestoneId: ms.id,
      idempotencyKey: `${ms.id}:authorize:${orderId}`,
    });
  } catch (err) {
    if (err instanceof PaymentError) {
      await updateMilestoneIf(
        admin(),
        ms.id,
        { status: "awaiting_hold" },
        {
          last_payment_error: errorRecord(err, "authorize"),
        },
      );
      await logEvent(admin(), {
        deal_id: deal.id,
        milestone_id: ms.id,
        actor_role: "client",
        type: "hold_failed",
        payload: { code: err.code, issue: err.info.issue, debugId: err.info.debugId },
      });
      throw paymentFailed(err, "PayPal couldn't place the hold.");
    }
    throw err;
  }

  const due = ms.due_in_days
    ? new Date(Date.now() + ms.due_in_days * 86_400_000).toISOString().slice(0, 10)
    : null;
  const held = await updateMilestoneIf(
    admin(),
    ms.id,
    { status: "awaiting_hold", where: { paypal_order_id: orderId } },
    {
      status: "held",
      authorization_id: hold.authorizationId,
      hold_expires_at: hold.expiresAt,
      honor_expires_at: hold.honorExpiresAt,
      due_date: due,
      last_payment_error: null,
      capture_attempts: 0,
    },
  );
  if (!held) {
    const now = await getPaymentMilestone(admin(), ms.id);
    if (now?.status === "held" && now.authorization_id === hold.authorizationId)
      return { status: "held" as const };
    throw new AppError("CONFLICT", "This milestone changed while securing it.");
  }
  await updateDealStatusIf(admin(), deal.id, "approved", "active");
  await logEvent(admin(), {
    deal_id: deal.id,
    milestone_id: ms.id,
    actor_role: "client",
    type: "hold_placed",
    payload: {
      authorizationId: hold.authorizationId,
      amountMinor: ms.amount_minor,
      currency: deal.currency,
    },
  });
  return { status: "held" as const };
}

// ── Release (capture) ────────────────────────────────────────────────────────

const toMinor = (m?: Money) => (m ? Number(m.minor) : null);

function captureColumns(r: CaptureResult) {
  return {
    capture_id: r.captureId,
    capture_status: r.status,
    gross_minor: toMinor(r.gross),
    fee_minor: toMinor(r.fee),
    net_minor: toMinor(r.net),
    receivable_minor: toMinor(r.receivable),
    settlement_currency: r.settlementCurrency ?? null,
    fx_rate: r.fxRate ?? null,
  };
}

export async function releaseMilestone(
  actor: Actor,
  milestoneId: string,
  opts: { simulate?: Simulate } = {},
) {
  const { ms, deal } = await load(milestoneId);
  if (actor.kind === "client") requireParty(deal, actor.auth, "client");
  else if (actor.kind === "freelancer")
    throw new AppError("FORBIDDEN", "Only the client can release payment.");
  if (ms.status === "released") throw new AppError("CONFLICT", "This milestone was already paid.");
  if (ms.status !== "delivered")
    throw new AppError("CONFLICT", "Payment can be released after the work is delivered.");
  if (
    actor.kind === "auto" &&
    !isDueForAutoRelease(
      { status: ms.status, release_at: ms.release_at ? new Date(ms.release_at) : null },
      new Date(),
    )
  ) {
    throw new AppError("CONFLICT", "Auto-release isn't due for this milestone.");
  }
  if (!ms.authorization_id) throw new AppError("CONFLICT", "There's no PayPal hold to capture.");

  // 1) Claim: exactly one caller can move capture_claim from NULL to its key.
  const claim = `${actor.kind}:${randomUUID()}`;
  const claimed = await updateMilestoneIf(
    admin(),
    ms.id,
    { status: "delivered", where: { capture_claim: null } },
    { capture_claim: claim },
  );
  if (!claimed) throw new AppError("CONFLICT", "Payment is already being released.");

  // 2) Capture with a deterministic request id (retries of the same attempt can't double-capture).
  const attempt = claimed.capture_attempts + 1;
  let result: CaptureResult;
  try {
    result = await getPaymentProvider().capture({
      authorizationId: ms.authorization_id,
      amount: amountOf(ms, deal),
      final: true,
      idempotencyKey: `${ms.id}:capture:${attempt}`,
      simulate: opts.simulate,
    });
  } catch (err) {
    if (err instanceof PaymentError) {
      // Definitive failures use a new request id next time; network errors retry the same one.
      const definitive = err.code !== "UPSTREAM";
      await updateMilestoneIf(
        admin(),
        ms.id,
        { status: "delivered", where: { capture_claim: claim } },
        {
          capture_claim: null,
          capture_attempts: definitive ? attempt : claimed.capture_attempts,
          last_payment_error: errorRecord(err, "capture"),
        },
      );
      await logEvent(admin(), {
        deal_id: deal.id,
        milestone_id: ms.id,
        actor_role: actor.kind === "client" ? "client" : "system",
        type: "capture_failed",
        payload: { code: err.code, issue: err.info.issue, debugId: err.info.debugId },
      });
      throw paymentFailed(err, "PayPal couldn't release the payment.");
    }
    await updateMilestoneIf(
      admin(),
      ms.id,
      { status: "delivered", where: { capture_claim: claim } },
      { capture_claim: null },
    );
    throw err;
  }

  if (result.status !== "COMPLETED") {
    // PENDING: money is captured but not settled yet. Keep the claim so nobody captures again;
    // the PAYMENT.CAPTURE.COMPLETED webhook finishes the release.
    await updateMilestoneIf(
      admin(),
      ms.id,
      { status: "delivered", where: { capture_claim: claim } },
      {
        ...captureColumns(result),
        capture_attempts: attempt,
      },
    );
    await logEvent(admin(), {
      deal_id: deal.id,
      milestone_id: ms.id,
      actor_role: "system",
      type: "capture_pending",
      payload: { captureId: result.captureId, status: result.status },
    });
    return { status: "delivered" as const, captureStatus: result.status };
  }

  await finishRelease(
    deal,
    ms.id,
    claim,
    result,
    attempt,
    actor.kind === "client" ? "client" : "system",
  );
  return { status: "released" as const, captureStatus: result.status };
}

/** Marks released (guarded by the claim), then opens the next milestone or completes the deal. */
async function finishRelease(
  deal: DealRow,
  milestoneId: string,
  claim: string | null,
  result: CaptureResult,
  attempt: number | null,
  actor: "client" | "system",
) {
  const patch: Record<string, unknown> = {
    status: "released",
    captured_at: new Date().toISOString(),
    last_payment_error: null,
    ...captureColumns(result),
  };
  if (attempt !== null) patch.capture_attempts = attempt;
  const released = await updateMilestoneIf(
    admin(),
    milestoneId,
    { status: "delivered", where: claim ? { capture_claim: claim } : undefined },
    patch,
  );
  if (!released) return; // already finished by the other path (API response vs webhook)
  await logEvent(admin(), {
    deal_id: deal.id,
    milestone_id: milestoneId,
    actor_role: actor,
    type: "released",
    payload: {
      captureId: result.captureId,
      gross: toMinor(result.gross),
      fee: toMinor(result.fee),
      net: toMinor(result.net),
      receivable: toMinor(result.receivable),
      settlementCurrency: result.settlementCurrency ?? null,
      fxRate: result.fxRate ?? null,
    },
  });
  await openNextMilestone(deal);
}

async function openNextMilestone(deal: DealRow) {
  const all = await listDealMilestones(admin(), deal.id);
  const next = all.find((m) => m.kind === "milestone" && m.status === "draft");
  if (next) {
    await updateMilestoneIf(admin(), next.id, { status: "draft" }, { status: "awaiting_hold" });
    return;
  }
  const done = all.every((m) => m.status === "released" || m.status === "voided");
  if (done) {
    if (await updateDealStatusIf(admin(), deal.id, "active", "completed")) {
      await logEvent(admin(), { deal_id: deal.id, actor_role: "system", type: "deal_completed" });
    }
  }
}

// ── Cancel (void) ────────────────────────────────────────────────────────────

export async function cancelHold(auth: AuthContext, milestoneId: string) {
  const { ms, deal } = await load(milestoneId);
  requireParty(deal, auth, "freelancer");
  if (!canTransition(ms.status, "void"))
    throw new AppError("CONFLICT", "This milestone can't be cancelled now.");
  if (ms.authorization_id && hasLiveHold(ms.status)) {
    try {
      await getPaymentProvider().cancelHold({
        authorizationId: ms.authorization_id,
        idempotencyKey: `${ms.id}:void:${ms.authorization_id}`,
      });
    } catch (err) {
      if (err instanceof PaymentError && err.code !== "HOLD_VOIDED")
        throw paymentFailed(err, "PayPal couldn't cancel the hold.");
    }
  }
  const voided = await updateMilestoneIf(
    admin(),
    ms.id,
    { status: ms.status },
    { status: "voided", release_at: null },
  );
  if (!voided) throw new AppError("CONFLICT", "This milestone changed. Reload and try again.");
  await logEvent(admin(), {
    deal_id: deal.id,
    milestone_id: ms.id,
    actor_role: "freelancer",
    type: "hold_voided",
  });
  return { status: "voided" as const };
}

// ── Renew (reauthorize) — called by the scheduled tick (Phase 6) ─────────────

export async function renewHold(milestoneId: string, opts: { simulate?: Simulate } = {}) {
  const { ms, deal } = await load(milestoneId);
  if (!hasLiveHold(ms.status) || !ms.authorization_id)
    throw new AppError("CONFLICT", "No live hold to renew.");
  try {
    const r = await getPaymentProvider().renewHold({
      authorizationId: ms.authorization_id,
      // Same state → same request id (parallel ticks are idempotent); after a failure the row
      // changes, so a retry gets a fresh id instead of PayPal replaying the cached error.
      idempotencyKey: `${ms.id}:reauth:${ms.authorization_id}:${Date.parse(ms.updated_at)}`,
      simulate: opts.simulate,
    });
    const to: MilestoneStatus = ms.status === "hold_at_risk" ? "held" : ms.status;
    const updated = await updateMilestoneIf(
      admin(),
      ms.id,
      { status: ms.status, where: { authorization_id: ms.authorization_id } },
      {
        status: to,
        authorization_id: r.authorizationId,
        honor_expires_at: r.honorExpiresAt,
        hold_expires_at: r.expiresAt,
        last_payment_error: null,
      },
    );
    if (!updated) throw new AppError("CONFLICT", "This milestone changed during renewal.");
    await logEvent(admin(), {
      deal_id: deal.id,
      milestone_id: ms.id,
      actor_role: "agent",
      type: "hold_renewed",
      payload: { authorizationId: r.authorizationId },
    });
    return { ok: true as const, status: to };
  } catch (err) {
    if (!(err instanceof PaymentError)) throw err;
    const to: MilestoneStatus = canTransition(ms.status, "renewal_failed")
      ? "hold_at_risk"
      : ms.status;
    await updateMilestoneIf(
      admin(),
      ms.id,
      { status: ms.status },
      {
        status: to,
        release_at: to === "hold_at_risk" ? null : ms.release_at, // no auto-release while at risk
        last_payment_error: errorRecord(err, "reauthorize"),
      },
    );
    await logEvent(admin(), {
      deal_id: deal.id,
      milestone_id: ms.id,
      actor_role: "agent",
      type: "hold_renewal_failed",
      payload: {
        code: err.code,
        issue: err.info.issue,
        description: err.info.description,
        debugId: err.info.debugId,
      },
    });
    return { ok: false as const, status: to, error: errorRecord(err, "reauthorize") };
  }
}

// ── Refund (demo/admin only) ─────────────────────────────────────────────────

export async function refundMilestone(auth: AuthContext, milestoneId: string) {
  if (!env().DEMO_MODE) throw new AppError("FORBIDDEN", "Refunds are a demo-only action.");
  const { ms, deal } = await load(milestoneId);
  requireParty(deal, auth, "freelancer");
  if (ms.status !== "released" || !ms.capture_id)
    throw new AppError("CONFLICT", "Only paid milestones can be refunded.");
  try {
    const r = await getPaymentProvider().refund({
      captureId: ms.capture_id,
      idempotencyKey: `${ms.id}:refund:${ms.capture_id}`,
    });
    await logEvent(admin(), {
      deal_id: deal.id,
      milestone_id: ms.id,
      actor_role: "freelancer",
      type: "refunded",
      payload: { refundId: r.refundId, status: r.status },
    });
    return r;
  } catch (err) {
    if (err instanceof PaymentError)
      throw paymentFailed(err, "PayPal couldn't refund this payment.");
    throw err;
  }
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

/** Applies a verified PayPal event. The API responses remain the main source of truth. */
export async function applyPayPalEvent(type: string, resource: unknown): Promise<string> {
  const r = (resource ?? {}) as {
    id?: string;
    status?: string;
    supplementary_data?: { related_ids?: { authorization_id?: string } };
    seller_receivable_breakdown?: unknown;
  };
  if (type === "PAYMENT.AUTHORIZATION.VOIDED" && r.id) {
    const ms = await findMilestoneBy(admin(), "authorization_id", r.id);
    if (!ms || !canTransition(ms.status, "void")) return "ignored";
    const done = await updateMilestoneIf(
      admin(),
      ms.id,
      { status: ms.status },
      { status: "voided", release_at: null },
    );
    if (!done) return "ignored";
    await logEvent(admin(), {
      deal_id: ms.deal_id,
      milestone_id: ms.id,
      actor_role: "system",
      type: "hold_voided_by_paypal",
    });
    const deal = await findDeal(admin(), ms.deal_id);
    if (deal) await openNextMilestone(deal);
    return "voided";
  }
  if (type.startsWith("PAYMENT.CAPTURE.") && r.id) {
    const ms =
      (await findMilestoneBy(admin(), "capture_id", r.id)) ??
      (r.supplementary_data?.related_ids?.authorization_id
        ? await findMilestoneBy(
            admin(),
            "authorization_id",
            r.supplementary_data.related_ids.authorization_id,
          )
        : null);
    if (!ms) return "ignored";
    const deal = await findDeal(admin(), ms.deal_id);
    if (!deal) return "ignored";
    if (type === "PAYMENT.CAPTURE.COMPLETED" && ms.status === "delivered") {
      // Same breakdown shape as the capture API response.
      const result = {
        captureId: r.id,
        status: "COMPLETED",
        ...breakdownFromPayPal(r.seller_receivable_breakdown),
      };
      await finishRelease(deal, ms.id, null, result, null, "system");
      return "released";
    }
    if (type === "PAYMENT.CAPTURE.DENIED" && ms.status === "delivered") {
      await updateMilestoneIf(
        admin(),
        ms.id,
        { status: "delivered" },
        { capture_claim: null, capture_status: "DENIED" },
      );
      await logEvent(admin(), {
        deal_id: ms.deal_id,
        milestone_id: ms.id,
        actor_role: "system",
        type: "capture_denied",
      });
      return "denied";
    }
    if (type === "PAYMENT.CAPTURE.PENDING") {
      await logEvent(admin(), {
        deal_id: ms.deal_id,
        milestone_id: ms.id,
        actor_role: "system",
        type: "capture_pending",
      });
      return "pending";
    }
  }
  return "ignored";
}

export { load as loadMilestone, requireParty, openNextMilestone };
