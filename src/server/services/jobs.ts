// Scheduled tick (pg_cron → pg_net → POST /api/jobs/tick every 15 min). Idempotent and safe in parallel:
// releases go through the capture claim, renewals use a state-derived PayPal-Request-Id, and every status
// change is a conditional update.
import { z } from "zod";
import { format, money } from "../domain/money";
import { AppError } from "../http/errors";
import { findDeal } from "../repos/deals";
import { insertAgentAction } from "../repos/deliveries";
import {
  PAYMENT_COLUMNS,
  PaymentMilestoneSchema,
  type PaymentMilestone,
} from "../repos/milestones";
import { getProfile } from "../repos/profiles";
import { adminClient } from "../repos/supabase";
import { releaseMilestone, renewHold } from "./payments";

const admin = () => adminClient();
const REMINDER_WINDOW_MS = 24 * 3_600_000;

export interface TickSummary {
  released: string[];
  renewed: string[];
  atRisk: string[];
  reminders: number;
  skipped: string[];
  errors: Array<{ milestoneId: string; message: string }>;
}

const baseQuery = () => admin().from("milestones").select(PAYMENT_COLUMNS);
type MilestoneQuery = ReturnType<typeof baseQuery>;

async function select(build: (q: MilestoneQuery) => MilestoneQuery) {
  const { data, error } = await build(baseQuery());
  if (error) throw new AppError("INTERNAL", "Tick query failed.", { db: error.message });
  return z.array(PaymentMilestoneSchema).parse(data);
}

const amountText = async (ms: PaymentMilestone) => {
  const deal = await findDeal(admin(), ms.deal_id);
  return { deal, amount: deal ? format(money(BigInt(ms.amount_minor), deal.currency)) : "" };
};

async function alreadyLogged(milestoneId: string, kind: string): Promise<boolean> {
  const { count } = await admin()
    .from("agent_actions")
    .select("id", { count: "exact", head: true })
    .eq("milestone_id", milestoneId)
    .eq("kind", kind);
  return (count ?? 0) > 0;
}

export async function runTick(opts: { dealId?: string; now?: Date } = {}): Promise<TickSummary> {
  const now = opts.now ?? new Date();
  const iso = now.toISOString();
  const summary: TickSummary = {
    released: [],
    renewed: [],
    atRisk: [],
    reminders: 0,
    skipped: [],
    errors: [],
  };
  const scoped = (q: MilestoneQuery) => (opts.dealId ? q.eq("deal_id", opts.dealId) : q);

  // 1) Auto-release: delivered, consent-based release time passed, nobody releasing it right now.
  const due = await select((q) =>
    scoped(q.eq("status", "delivered").lte("release_at", iso).is("capture_claim", null)),
  );
  for (const ms of due) {
    try {
      const r = await releaseMilestone({ kind: "auto" }, ms.id, { now });
      if (r.status !== "released") {
        summary.skipped.push(ms.id); // e.g. capture pending at PayPal
        continue;
      }
      summary.released.push(ms.id);
      const { deal, amount } = await amountText(ms);
      const freelancer = deal ? await getProfile(admin(), deal.freelancer_id) : null;
      await insertAgentAction(admin(), {
        deal_id: ms.deal_id,
        milestone_id: ms.id,
        kind: "auto_released",
        status: "auto_executed",
        title: `Auto-released ${amount} to ${freelancer?.full_name ?? "the freelancer"}`,
        detail: {
          noticed: `No response ${deal?.auto_release_hours ?? 72} hours after delivery, and the client consented to auto-release.`,
          wants: "Released the held payment through PayPal.",
          for: "both",
        },
      });
    } catch (err) {
      if (err instanceof AppError && err.code === "CONFLICT")
        summary.skipped.push(ms.id); // lost the race: fine
      else
        summary.errors.push({
          milestoneId: ms.id,
          message: err instanceof Error ? err.message : String(err),
        });
    }
  }

  // 2) Renewals: live holds past their 3-day honor period (PayPal allows reauthorizing from day 4).
  const renewals = await select((q) =>
    scoped(
      q
        .in("status", ["held", "delivered", "changes_requested"])
        .not("authorization_id", "is", null)
        .is("capture_claim", null)
        .lte("honor_expires_at", iso),
    ),
  );
  for (const ms of renewals) {
    // The 3-day honor period and the 72 h auto-release can end together: releasing wins.
    if (ms.status === "delivered" && ms.release_at && ms.release_at <= iso) continue;
    try {
      const r = await renewHold(ms.id);
      const { amount } = await amountText(ms);
      if (r.ok) {
        summary.renewed.push(ms.id);
        await insertAgentAction(admin(), {
          deal_id: ms.deal_id,
          milestone_id: ms.id,
          kind: "hold_renewed",
          status: "auto_executed",
          title: `Renewed hold for "${ms.title}"`,
          detail: {
            noticed: "The PayPal hold reached the end of its 3-day honor period.",
            wants: `Reauthorized ${amount} with PayPal so the money stays secured.`,
            for: "both",
          },
        });
      } else {
        summary.atRisk.push(ms.id);
        const e = r.error as {
          issue?: string;
          description?: string;
          debugId?: string;
          message?: string;
        };
        await insertAgentAction(admin(), {
          deal_id: ms.deal_id,
          milestone_id: ms.id,
          kind: "resecure",
          title: `Ask the client to re-secure "${ms.title}"`,
          detail: {
            noticed: `PayPal refused to renew the hold: ${e.issue ?? e.message ?? "unknown error"}${e.debugId ? ` (debug id ${e.debugId})` : ""}.`,
            wants: `Secure ${amount} again with a new PayPal hold. Auto-release is paused until then.`,
            for: "both",
            paypal: e,
          },
        });
      }
    } catch (err) {
      if (err instanceof AppError && err.code === "CONFLICT") summary.skipped.push(ms.id);
      else
        summary.errors.push({
          milestoneId: ms.id,
          message: err instanceof Error ? err.message : String(err),
        });
    }
  }

  // 3) Reminders (in-app): payment auto-releases within 24 h.
  const soon = new Date(now.getTime() + REMINDER_WINDOW_MS).toISOString();
  const upcoming = await select((q) =>
    scoped(q.eq("status", "delivered").gt("release_at", iso).lte("release_at", soon)),
  );
  for (const ms of upcoming) {
    if (await alreadyLogged(ms.id, "reminder_release")) continue;
    const { amount } = await amountText(ms);
    await insertAgentAction(admin(), {
      deal_id: ms.deal_id,
      milestone_id: ms.id,
      kind: "reminder_release",
      status: "auto_executed",
      title: `${amount} auto-releases within 24 hours`,
      detail: {
        noticed: `"${ms.title}" was delivered and is waiting for your review.`,
        wants: "Approve it, or ask for changes to pause the timer.",
        for: "client",
        releaseAt: ms.release_at,
      },
    });
    summary.reminders++;
  }
  return summary;
}
