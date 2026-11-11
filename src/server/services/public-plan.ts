// Client-side use-cases reached through the share link: view (no login), suggest a change, approve.
import type { PublicPlan } from "@/sdk/schemas";
import { ApprovePlanInputSchema, SuggestChangeInputSchema } from "@/sdk/schemas";
import { consentRecord } from "../domain/consent";
import { hashShareToken, isWellFormedShareToken } from "../domain/share-token";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import {
  approveDealRpc,
  countRecentChangeRequests,
  findDealByTokenHash,
  getVersionSnapshot,
  insertChangeRequest,
  type DealRow,
} from "../repos/deals";
import { getProfile, updateProfile } from "../repos/profiles";
import { adminClient } from "../repos/supabase";
import { aiFor } from "./ai";
import { moneyDto } from "./deal-view";

const SUGGESTIONS_PER_HOUR = 10;

async function dealForToken(token: string): Promise<DealRow> {
  // Same response for malformed and unknown tokens: nothing to learn from guessing.
  const deal = isWellFormedShareToken(token)
    ? await findDealByTokenHash(adminClient(), hashShareToken(token))
    : null;
  if (!deal || deal.current_version < 1) throw new AppError("NOT_FOUND", "This link isn't valid.");
  return deal;
}

function stateOf(deal: DealRow): PublicPlan["state"] {
  if (deal.status === "shared") return "open";
  if (deal.status === "draft") return "being_updated";
  if (deal.status === "cancelled") return "closed";
  return "approved";
}

async function freelancerName(freelancerId: string) {
  const p = await getProfile(adminClient(), freelancerId);
  return {
    name: p.full_name ?? "Your freelancer",
    profession: p.profession,
    country: p.country_code,
  };
}

/** Redacted view of the latest shared version: no phone number, no internal ids. */
export async function getPublicPlan(token: string): Promise<PublicPlan> {
  const deal = await dealForToken(token);
  const snap = await getVersionSnapshot(adminClient(), deal.id, deal.current_version);
  const freelancer = await freelancerName(deal.freelancer_id);
  const consent = consentRecord({
    dealTitle: snap.title,
    dealVersion: deal.current_version,
    freelancerName: freelancer.name,
    autoReleaseHours: snap.auto_release_hours,
  });
  return {
    version: deal.current_version,
    state: stateOf(deal),
    title: snap.title,
    summary: snap.summary,
    freelancer,
    clientName: deal.client_name,
    total: moneyDto(snap.total_minor, snap.currency),
    autoReleaseHours: snap.auto_release_hours,
    milestones: snap.milestones.map((m) => ({
      position: m.position,
      title: m.title,
      amount: moneyDto(m.amount_minor, snap.currency),
      dueInDays: m.due_in_days,
      revisionsIncluded: m.revisions_included,
      todos: m.todos,
    })),
    consentText: consent.text,
  };
}

/** Anyone with the link can suggest a change; the AI turns it into a short list for the freelancer. */
export async function suggestChange(token: string, rawInput: unknown) {
  const { text } = SuggestChangeInputSchema.parse(rawInput);
  const deal = await dealForToken(token);
  if (deal.status !== "shared" && deal.status !== "draft") {
    throw new AppError(
      "CONFLICT",
      "This plan is already approved. Message the freelancer instead.",
    );
  }
  const since = new Date(Date.now() - 3_600_000).toISOString();
  if ((await countRecentChangeRequests(adminClient(), deal.id, since)) >= SUGGESTIONS_PER_HOUR) {
    throw new AppError("RATE_LIMITED", "Too many suggestions for this plan. Try again later.");
  }

  const snap = await getVersionSnapshot(adminClient(), deal.id, deal.current_version);
  let changes: string[] = [];
  try {
    const summary = await aiFor(null).summarizeChanges({
      note: text,
      todos: snap.milestones.flatMap((m) => m.todos.map((t) => `${m.title}: ${t}`)),
    });
    changes = summary.changes;
  } catch (err) {
    // The suggestion still reaches the freelancer without the AI summary.
    console.error("summarizeChanges failed", err instanceof Error ? err.message : err);
  }
  await insertChangeRequest(adminClient(), {
    deal_id: deal.id,
    from_role: "client",
    text,
    ai_summary: changes.length ? { changes } : null,
  });
  return { received: true as const, changes };
}

/** Signed-in client approves the exact version they saw and consents to auto-release. */
export async function approvePlan(
  auth: AuthContext,
  token: string,
  rawInput: unknown,
  userAgent: string,
) {
  const input = ApprovePlanInputSchema.parse(rawInput);
  const deal = await dealForToken(token);
  if (deal.freelancer_id === auth.userId) {
    throw new AppError(
      "FORBIDDEN",
      "You can't approve your own plan. Sign in with the client's account.",
    );
  }
  if (deal.current_version !== input.version) {
    throw new AppError(
      "PLAN_VERSION_CHANGED",
      "The plan changed since you opened it. Reload to see the latest version.",
    );
  }

  const profile = await getProfile(auth.db, auth.userId);
  if (profile.role === "freelancer") {
    throw new AppError(
      "FORBIDDEN",
      "This account is a freelancer account. Sign in as a client to approve.",
    );
  }
  if (profile.role === null) await updateProfile(auth.db, auth.userId, { role: "client" });

  const freelancer = await freelancerName(deal.freelancer_id);
  const snap = await getVersionSnapshot(adminClient(), deal.id, input.version);
  const consent = consentRecord({
    dealTitle: snap.title,
    dealVersion: input.version,
    freelancerName: freelancer.name,
    autoReleaseHours: snap.auto_release_hours,
  });
  await approveDealRpc(adminClient(), {
    dealId: deal.id,
    clientId: auth.userId,
    version: input.version,
    text: consent.text,
    sha256: consent.textSha256,
    userAgent,
  });
  return { dealId: deal.id, status: "approved" as const };
}
