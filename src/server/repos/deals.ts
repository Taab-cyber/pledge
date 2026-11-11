// Deal queries. Reads take a client (user-scoped → RLS, or admin); writes use admin + RPCs.
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../http/errors";

const SourceFileSchema = z.object({ path: z.string(), mime: z.string(), size: z.number() });
export type SourceFile = z.infer<typeof SourceFileSchema>;

export const PlanMetaSchema = z.object({
  summary: z.string(),
  gaps: z.array(z.object({ question: z.string(), suggestedDefault: z.string() })),
  confidence: z.number(),
  priceInChat: z.object({ amount: z.string().nullable(), currency: z.string().nullable() }),
  promptVersion: z.string().optional(),
  provider: z.string().optional(),
});
export type PlanMeta = z.infer<typeof PlanMetaSchema>;

export const DealRowSchema = z.object({
  id: z.uuid(),
  freelancer_id: z.uuid(),
  client_id: z.uuid().nullable(),
  client_name: z.string(),
  client_whatsapp: z.string().nullable(),
  client_country: z.string().nullable(),
  title: z.string(),
  currency: z.string(),
  total_minor: z.number().int(),
  status: z.enum(["draft", "shared", "approved", "active", "completed", "cancelled"]),
  current_version: z.number().int(),
  auto_release_hours: z.number().int(),
  source_text: z.string().nullable(),
  source_files: z.array(SourceFileSchema),
  plan_meta: PlanMetaSchema.nullable(),
  created_at: z.string(),
});
export type DealRow = z.infer<typeof DealRowSchema>;

const DEAL_COLUMNS =
  "id, freelancer_id, client_id, client_name, client_whatsapp, client_country, title, currency, total_minor, status, current_version, auto_release_hours, source_text, source_files, plan_meta, created_at";

const MilestoneRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["milestone", "addon"]),
  position: z.number().int(),
  title: z.string(),
  amount_minor: z.number().int(),
  due_in_days: z.number().int().nullable(),
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
  todos: z.array(
    z.object({ id: z.uuid(), position: z.number().int(), label: z.string(), done: z.boolean() }),
  ),
});
export type MilestoneRow = z.infer<typeof MilestoneRowSchema>;

const ChangeRequestRowSchema = z.object({
  id: z.uuid(),
  from_role: z.enum(["freelancer", "client"]),
  text: z.string(),
  ai_summary: z.object({ changes: z.array(z.string()) }).nullable(),
  created_at: z.string(),
});
export type ChangeRequestRow = z.infer<typeof ChangeRequestRowSchema>;

export const SnapshotSchema = z.object({
  title: z.string(),
  currency: z.string(),
  total_minor: z.number().int(),
  auto_release_hours: z.number().int(),
  summary: z.string().nullable(),
  milestones: z.array(
    z.object({
      position: z.number().int(),
      title: z.string(),
      amount_minor: z.number().int(),
      due_in_days: z.number().int().nullable(),
      revisions_included: z.number().int(),
      todos: z.array(z.string()),
    }),
  ),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

function dbError(what: string, error: { code?: string; message: string }): AppError {
  return new AppError("INTERNAL", `Could not ${what}.`, { db: error.code });
}

export async function insertDeal(
  admin: SupabaseClient,
  row: {
    freelancer_id: string;
    client_name: string;
    client_whatsapp: string;
    client_country: string;
    title: string;
    currency: string;
    total_minor: number;
    source_text: string | null;
  },
): Promise<string> {
  const { data, error } = await admin.from("deals").insert(row).select("id").single();
  if (error) throw dbError("create the deal", error);
  return z.object({ id: z.uuid() }).parse(data).id;
}

export async function setSourceFiles(admin: SupabaseClient, dealId: string, files: SourceFile[]) {
  const { error } = await admin.from("deals").update({ source_files: files }).eq("id", dealId);
  if (error) throw dbError("save screenshots", error);
}

export async function deleteDeal(admin: SupabaseClient, dealId: string) {
  await admin.from("deals").delete().eq("id", dealId);
}

export async function findDeal(db: SupabaseClient, id: string): Promise<DealRow | null> {
  const { data, error } = await db.from("deals").select(DEAL_COLUMNS).eq("id", id).maybeSingle();
  if (error) {
    if (error.code === "22P02") return null; // not a uuid
    throw dbError("load the deal", error);
  }
  return data ? DealRowSchema.parse(data) : null;
}

export async function findDealByTokenHash(
  admin: SupabaseClient,
  hash: string,
): Promise<DealRow | null> {
  const { data, error } = await admin
    .from("deals")
    .select(DEAL_COLUMNS)
    .eq("share_token_hash", hash)
    .maybeSingle();
  if (error) throw dbError("load the plan", error);
  return data ? DealRowSchema.parse(data) : null;
}

export async function listDeals(db: SupabaseClient, userId: string): Promise<DealRow[]> {
  const { data, error } = await db
    .from("deals")
    .select(DEAL_COLUMNS)
    .or(`freelancer_id.eq.${userId},client_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw dbError("load deals", error);
  return z.array(DealRowSchema).parse(data);
}

export async function listMilestones(db: SupabaseClient, dealId: string): Promise<MilestoneRow[]> {
  const { data, error } = await db
    .from("milestones")
    .select(
      "id, kind, position, title, amount_minor, due_in_days, revisions_included, revisions_used, status, todos(id, position, label, done)",
    )
    .eq("deal_id", dealId)
    .order("kind")
    .order("position");
  if (error) throw dbError("load milestones", error);
  return z
    .array(MilestoneRowSchema)
    .parse(data)
    .map((m) => ({ ...m, todos: [...m.todos].sort((a, b) => a.position - b.position) }));
}

export async function listChangeRequests(
  db: SupabaseClient,
  dealId: string,
): Promise<ChangeRequestRow[]> {
  const { data, error } = await db
    .from("change_requests")
    .select("id, from_role, text, ai_summary, created_at")
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw dbError("load change requests", error);
  return z.array(ChangeRequestRowSchema).parse(data);
}

export async function countRecentChangeRequests(
  admin: SupabaseClient,
  dealId: string,
  sinceIso: string,
) {
  const { count, error } = await admin
    .from("change_requests")
    .select("id", { count: "exact", head: true })
    .eq("deal_id", dealId)
    .gte("created_at", sinceIso);
  if (error) throw dbError("check limits", error);
  return count ?? 0;
}

export async function insertChangeRequest(
  admin: SupabaseClient,
  row: { deal_id: string; from_role: "client" | "freelancer"; text: string; ai_summary: unknown },
) {
  const { error } = await admin.from("change_requests").insert(row);
  if (error) throw dbError("save the suggestion", error);
  await admin.from("events").insert({
    deal_id: row.deal_id,
    actor_role: row.from_role,
    type: "change_suggested",
    payload: {},
  });
}

export async function getVersionSnapshot(
  admin: SupabaseClient,
  dealId: string,
  version: number,
): Promise<Snapshot> {
  const { data, error } = await admin
    .from("deal_versions")
    .select("snapshot")
    .eq("deal_id", dealId)
    .eq("version", version)
    .single();
  if (error) throw dbError("load the plan version", error);
  return SnapshotSchema.parse((data as { snapshot: unknown }).snapshot);
}

// ── RPCs (atomic, service role only) ─────────────────────────────────────────

const RPC_ERRORS: Record<string, [AppError["code"], string]> = {
  NOT_FOUND: ["NOT_FOUND", "Deal not found."],
  PLAN_NOT_EDITABLE: ["CONFLICT", "This plan was already approved and can't be edited."],
  PLAN_INVALID: ["PLAN_INVALID", "Milestone amounts must add up exactly to the total."],
  SAME_USER: ["FORBIDDEN", "You can't approve your own plan. Sign in with the client's account."],
  DEAL_TAKEN: ["CONFLICT", "This plan was already approved by someone else."],
  PLAN_BEING_EDITED: [
    "PLAN_VERSION_CHANGED",
    "The freelancer is updating this plan. Wait for the new link.",
  ],
  DEAL_NOT_SHARED: ["CONFLICT", "This plan can't be approved right now."],
  PLAN_VERSION_CHANGED: [
    "PLAN_VERSION_CHANGED",
    "The plan changed since you opened it. Reload to see the latest version.",
  ],
};

async function rpc<T>(
  admin: SupabaseClient,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) {
    const known = Object.keys(RPC_ERRORS).find((k) => error.message.includes(k));
    if (known) {
      const [code, message] = RPC_ERRORS[known]!;
      throw new AppError(code, message);
    }
    throw dbError(fn.replace(/_/g, " "), error);
  }
  return data as T;
}

export interface PlanMilestoneWrite {
  title: string;
  amount_minor: number;
  due_in_days: number;
  revisions_included: number;
  todos: string[];
}

export function replacePlan(
  admin: SupabaseClient,
  dealId: string,
  title: string | null,
  planMeta: PlanMeta | null,
  milestones: PlanMilestoneWrite[],
) {
  return rpc<void>(admin, "replace_plan", {
    p_deal_id: dealId,
    p_title: title,
    p_plan_meta: planMeta,
    p_milestones: milestones,
  });
}

export function shareDealRpc(admin: SupabaseClient, dealId: string, tokenHash: string) {
  return rpc<number>(admin, "share_deal", { p_deal_id: dealId, p_token_hash: tokenHash });
}

export function approveDealRpc(
  admin: SupabaseClient,
  a: {
    dealId: string;
    clientId: string;
    version: number;
    text: string;
    sha256: string;
    userAgent: string;
  },
) {
  return rpc<void>(admin, "approve_deal", {
    p_deal_id: a.dealId,
    p_client_id: a.clientId,
    p_version: a.version,
    p_text: a.text,
    p_text_sha256: a.sha256,
    p_user_agent: a.userAgent,
  });
}
