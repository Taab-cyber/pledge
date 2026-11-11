import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "../http/errors";

export const DeliveryFileSchema = z.object({
  name: z.string(),
  mime: z.string(),
  size: z.number().int(),
  path: z.string(),
  previewPath: z.string().nullable(),
});
export type DeliveryFile = z.infer<typeof DeliveryFileSchema>;

export const StoredCheckSchema = z.object({
  items: z.array(
    z.object({
      todo: z.string(),
      status: z.enum(["met", "missing", "unclear"]),
      reason: z.string(),
    }),
  ),
  summary: z.string(),
  verdict: z.enum(["met", "missing", "unclear"]),
  model: z.string().optional(),
});
export type StoredCheck = z.infer<typeof StoredCheckSchema>;

export const DeliveryRowSchema = z.object({
  id: z.uuid(),
  milestone_id: z.uuid(),
  round: z.number().int(),
  note: z.string(),
  files: z.array(DeliveryFileSchema),
  ai_check: StoredCheckSchema.nullable().catch(null),
  created_at: z.string(),
});
export type DeliveryRow = z.infer<typeof DeliveryRowSchema>;

const COLS = "id, milestone_id, round, note, files, ai_check, created_at";

export async function insertDelivery(
  admin: SupabaseClient,
  row: {
    milestone_id: string;
    round: number;
    note: string;
    files: DeliveryFile[];
    ai_check: StoredCheck | null;
  },
): Promise<DeliveryRow> {
  const { data, error } = await admin.from("deliveries").insert(row).select(COLS).single();
  if (error) throw new AppError("INTERNAL", "Could not save the delivery.", { db: error.code });
  return DeliveryRowSchema.parse(data);
}

/** Latest delivery round per milestone (reads honour RLS when given a user client). */
export async function latestDeliveries(
  db: SupabaseClient,
  milestoneIds: string[],
): Promise<Map<string, DeliveryRow>> {
  const out = new Map<string, DeliveryRow>();
  if (milestoneIds.length === 0) return out;
  const { data, error } = await db
    .from("deliveries")
    .select(COLS)
    .in("milestone_id", milestoneIds)
    .order("round", { ascending: false });
  if (error) throw new AppError("INTERNAL", "Could not load deliveries.", { db: error.code });
  for (const row of z.array(DeliveryRowSchema).parse(data)) {
    if (!out.has(row.milestone_id)) out.set(row.milestone_id, row);
  }
  return out;
}

// ── Agent actions (Deal Agent feed) ──────────────────────────────────────────

export const AgentActionRowSchema = z.object({
  id: z.uuid(),
  deal_id: z.uuid(),
  milestone_id: z.uuid().nullable(),
  kind: z.string(),
  title: z.string(),
  detail: z.record(z.string(), z.unknown()),
  status: z.enum(["proposed", "approved", "executed", "dismissed", "auto_executed"]),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});
export type AgentActionRow = z.infer<typeof AgentActionRowSchema>;

const ACTION_COLS =
  "id, deal_id, milestone_id, kind, title, detail, status, created_at, resolved_at";

export async function insertAgentAction(
  admin: SupabaseClient,
  row: {
    deal_id: string;
    milestone_id?: string | null;
    kind: string;
    title: string;
    detail: Record<string, unknown>;
    status?: AgentActionRow["status"];
  },
): Promise<AgentActionRow> {
  const { data, error } = await admin
    .from("agent_actions")
    .insert(row)
    .select(ACTION_COLS)
    .single();
  if (error)
    throw new AppError("INTERNAL", "Could not save the agent proposal.", { db: error.code });
  return AgentActionRowSchema.parse(data);
}

export async function listAgentActions(
  db: SupabaseClient,
  dealId: string,
): Promise<AgentActionRow[]> {
  const { data, error } = await db
    .from("agent_actions")
    .select(ACTION_COLS)
    .eq("deal_id", dealId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new AppError("INTERNAL", "Could not load the agent feed.", { db: error.code });
  return z.array(AgentActionRowSchema).parse(data);
}

export async function getAgentAction(
  admin: SupabaseClient,
  id: string,
): Promise<AgentActionRow | null> {
  const { data, error } = await admin
    .from("agent_actions")
    .select(ACTION_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (error.code === "22P02") return null;
    throw new AppError("INTERNAL", "Could not load the agent proposal.", { db: error.code });
  }
  return data ? AgentActionRowSchema.parse(data) : null;
}

/** Resolve a proposal once: proposed → status (conditional, so a double click resolves it only once). */
export async function resolveAgentAction(
  admin: SupabaseClient,
  id: string,
  status: "approved" | "executed" | "dismissed",
  detailPatch?: Record<string, unknown>,
): Promise<AgentActionRow | null> {
  const current = await getAgentAction(admin, id);
  if (!current) return null;
  const { data, error } = await admin
    .from("agent_actions")
    .update({
      status,
      resolved_at: new Date().toISOString(),
      detail: detailPatch ? { ...current.detail, ...detailPatch } : current.detail,
    })
    .eq("id", id)
    .eq("status", "proposed")
    .select(ACTION_COLS)
    .maybeSingle();
  if (error)
    throw new AppError("INTERNAL", "Could not update the agent proposal.", { db: error.code });
  return data ? AgentActionRowSchema.parse(data) : null;
}
