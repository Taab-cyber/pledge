// DEMO_MODE only: "skip time" so a 72-hour auto-release or a 3-day honor period can be shown live.
// It only moves timestamps; the tick then makes the real PayPal calls (capture / reauthorize).
import { env } from "../env";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import { findDeal } from "../repos/deals";
import { logEvent } from "../repos/milestones";
import { adminClient } from "../repos/supabase";
import { runTick } from "./jobs";

export type FastForward = "release" | "renewal";

export async function fastForward(auth: AuthContext, dealId: string, what: FastForward) {
  if (!env().DEMO_MODE)
    throw new AppError("FORBIDDEN", "Time skipping is only available in demo mode.");
  const admin = adminClient();
  const deal = await findDeal(admin, dealId);
  if (!deal || (deal.client_id !== auth.userId && deal.freelancer_id !== auth.userId)) {
    throw new AppError("NOT_FOUND", "Deal not found.");
  }
  const past = new Date(Date.now() - 1000).toISOString();

  // release: only milestones that already have a consent-based release time (no consent → nothing to skip).
  // renewal: pretend the 3-day honor period is over, so the tick asks PayPal to reauthorize for real.
  const { data, error } =
    what === "release"
      ? await admin
          .from("milestones")
          .update({ release_at: past })
          .eq("deal_id", dealId)
          .eq("status", "delivered")
          .not("release_at", "is", null)
          .select("id")
      : await admin
          .from("milestones")
          .update({ honor_expires_at: past })
          .eq("deal_id", dealId)
          .in("status", ["held", "delivered", "changes_requested"])
          .not("authorization_id", "is", null)
          .select("id");
  if (error) throw new AppError("INTERNAL", "Could not skip time.", { db: error.code });
  if (!data || data.length === 0) {
    throw new AppError(
      "CONFLICT",
      what === "release"
        ? "Nothing to auto-release: no delivered milestone with auto-release consent."
        : "No active PayPal hold to renew.",
    );
  }
  await logEvent(admin, {
    deal_id: dealId,
    actor_role: deal.freelancer_id === auth.userId ? "freelancer" : "client",
    type: "demo_time_skipped",
    payload: { what, milestones: data.length },
  });
  return { skipped: what, milestones: data.length, tick: await runTick({ dealId }) };
}
