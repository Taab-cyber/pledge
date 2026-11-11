// Milestone payment state. Every status change is a conditional update on the expected status:
// zero rows means someone else changed it first (→ CONFLICT), which is what prevents double captures.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { MilestoneStatus } from "../domain/milestone-machine";
import { AppError } from "../http/errors";

export const PaymentMilestoneSchema = z.object({
  id: z.uuid(),
  deal_id: z.uuid(),
  kind: z.enum(["milestone", "addon"]),
  position: z.number().int(),
  title: z.string(),
  amount_minor: z.number().int(),
  due_in_days: z.number().int().nullable(),
  due_date: z.string().nullable(),
  revisions_included: z.number().int(),
  revisions_used: z.number().int(),
  status: z.enum([
    "draft",
    "awaiting_hold",
    "held",
    "hold_at_risk",
    "delivered",
    "changes_requested",
    "released",
    "voided",
  ]),
  paypal_order_id: z.string().nullable(),
  authorization_id: z.string().nullable(),
  hold_expires_at: z.string().nullable(),
  honor_expires_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  release_at: z.string().nullable(),
  captured_at: z.string().nullable(),
  capture_id: z.string().nullable(),
  capture_status: z.string().nullable(),
  capture_claim: z.string().nullable(),
  capture_attempts: z.number().int(),
  hold_order_attempts: z.number().int(),
  gross_minor: z.number().int().nullable(),
  fee_minor: z.number().int().nullable(),
  net_minor: z.number().int().nullable(),
  receivable_minor: z.number().int().nullable(),
  settlement_currency: z.string().nullable(),
  fx_rate: z.union([z.number(), z.string()]).nullable(),
  last_payment_error: z.record(z.string(), z.unknown()).nullable(),
  updated_at: z.string(),
});
export type PaymentMilestone = z.infer<typeof PaymentMilestoneSchema>;

export const PAYMENT_COLUMNS =
  "id, deal_id, kind, position, title, amount_minor, due_in_days, due_date, revisions_included, revisions_used, status, paypal_order_id, authorization_id, hold_expires_at, honor_expires_at, delivered_at, release_at, captured_at, capture_id, capture_status, capture_claim, capture_attempts, hold_order_attempts, gross_minor, fee_minor, net_minor, receivable_minor, settlement_currency, fx_rate, last_payment_error, updated_at";

function fail(what: string, error: { code?: string; message: string }): AppError {
  return new AppError("INTERNAL", `Could not ${what}.`, { db: error.code });
}

export async function getPaymentMilestone(
  admin: SupabaseClient,
  id: string,
): Promise<PaymentMilestone | null> {
  const { data, error } = await admin
    .from("milestones")
    .select(PAYMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw fail("load the milestone", error);
  }
  return data ? PaymentMilestoneSchema.parse(data) : null;
}

export async function findMilestoneBy(
  admin: SupabaseClient,
  column: "authorization_id" | "capture_id" | "paypal_order_id",
  value: string,
): Promise<PaymentMilestone | null> {
  const { data, error } = await admin
    .from("milestones")
    .select(PAYMENT_COLUMNS)
    .eq(column, value)
    .limit(1)
    .maybeSingle();
  if (error) throw fail("find the milestone", error);
  return data ? PaymentMilestoneSchema.parse(data) : null;
}

export async function listDealMilestones(
  admin: SupabaseClient,
  dealId: string,
): Promise<PaymentMilestone[]> {
  const { data, error } = await admin
    .from("milestones")
    .select(PAYMENT_COLUMNS)
    .eq("deal_id", dealId)
    .order("kind")
    .order("position");
  if (error) throw fail("load milestones", error);
  return z.array(PaymentMilestoneSchema).parse(data);
}

export interface Guard {
  status: MilestoneStatus | MilestoneStatus[];
  /** Extra equality guards, e.g. { capture_claim: key }; null means "IS NULL". */
  where?: Record<string, string | null>;
}

/**
 * UPDATE milestones SET … WHERE id = $id AND status = $expected [AND …] RETURNING *.
 * Returns null when no row matched (state moved on): callers turn that into CONFLICT.
 */
export async function updateMilestoneIf(
  admin: SupabaseClient,
  id: string,
  guard: Guard,
  patch: Record<string, unknown>,
): Promise<PaymentMilestone | null> {
  let q = admin.from("milestones").update(patch).eq("id", id);
  q = Array.isArray(guard.status) ? q.in("status", guard.status) : q.eq("status", guard.status);
  for (const [k, v] of Object.entries(guard.where ?? {}))
    q = v === null ? q.is(k, null) : q.eq(k, v);
  const { data, error } = await q.select(PAYMENT_COLUMNS).maybeSingle();
  if (error) throw fail("update the milestone", error);
  return data ? PaymentMilestoneSchema.parse(data) : null;
}

export async function updateDealStatusIf(
  admin: SupabaseClient,
  dealId: string,
  from: string,
  to: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("deals")
    .update({ status: to })
    .eq("id", dealId)
    .eq("status", from)
    .select("id");
  if (error) throw fail("update the deal", error);
  return (data ?? []).length > 0;
}

export async function logEvent(
  admin: SupabaseClient,
  e: {
    deal_id: string;
    milestone_id?: string | null;
    actor_role: "freelancer" | "client" | "system" | "agent";
    type: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await admin.from("events").insert({ payload: {}, ...e });
  if (error) console.error("event insert failed", e.type, error.code);
}

export async function hasConsentForVersion(
  admin: SupabaseClient,
  dealId: string,
  version: number,
  clientId: string,
): Promise<boolean> {
  const { count, error } = await admin
    .from("consents")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId)
    .eq("deal_version", version)
    .eq("client_id", clientId);
  if (error) throw fail("check consent", error);
  return (count ?? 0) > 0;
}

export async function nextDeliveryRound(
  admin: SupabaseClient,
  milestoneId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("deliveries")
    .select("id", { count: "exact", head: true })
    .eq("milestone_id", milestoneId);
  if (error) throw fail("count deliveries", error);
  return (count ?? 0) + 1;
}

/** Returns false when the event id was already stored (duplicate webhook). */
export async function recordWebhookEvent(
  admin: SupabaseClient,
  e: { id: string; type: string; payload: unknown },
): Promise<boolean> {
  const { error } = await admin.from("webhook_events").insert(e);
  if (!error) return true;
  if (error.code === "23505") return false;
  throw fail("store the webhook", error);
}
