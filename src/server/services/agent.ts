// Deal Agent: it proposes, a human approves, and the matching service makes the real call.
// Approve is claimed first (proposed → approved), so a double click executes it once.
import { exponentOf } from "../domain/currencies";
import { toMajorString } from "../domain/money";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import { findDeal } from "../repos/deals";
import { getAgentAction, moveAgentAction, resolveAgentAction } from "../repos/deliveries";
import { getPaymentMilestone } from "../repos/milestones";
import { adminClient } from "../repos/supabase";
import { releaseMilestone, resecureMilestone } from "./payments";
import { proposeAddon } from "./scope";

const admin = () => adminClient();

async function loadForViewer(auth: AuthContext, actionId: string) {
  const action = await getAgentAction(admin(), actionId);
  const deal = action ? await findDeal(admin(), action.deal_id) : null;
  if (!action || !deal || (deal.client_id !== auth.userId && deal.freelancer_id !== auth.userId)) {
    throw new AppError("NOT_FOUND", "Proposal not found.");
  }
  const role = deal.freelancer_id === auth.userId ? "freelancer" : "client";
  const target = (action.detail as { for?: string }).for ?? "both";
  return { action, deal, role, target };
}

/** Who may approve each kind of proposal. */
const APPROVER: Record<string, "client" | "freelancer"> = {
  release_payment: "client",
  resecure: "client",
  propose_addon: "freelancer",
  propose_extra_revision: "freelancer",
};

export async function approveAgentAction(auth: AuthContext, actionId: string) {
  const { action, deal, role } = await loadForViewer(auth, actionId);
  const approver = APPROVER[action.kind];
  if (!approver)
    throw new AppError("CONFLICT", "This item is informational and has nothing to approve.");
  if (approver !== role) throw new AppError("FORBIDDEN", `Only the ${approver} can approve this.`);
  if (action.status !== "proposed")
    throw new AppError("CONFLICT", "This proposal was already handled.");
  if (!(await moveAgentAction(admin(), action.id, "proposed", "approved"))) {
    throw new AppError("CONFLICT", "This proposal was already handled.");
  }

  try {
    let result: unknown;
    switch (action.kind) {
      case "release_payment":
        result = await releaseMilestone(
          { kind: "client", auth },
          mustMilestone(action.milestone_id),
        );
        break;
      case "resecure":
        result = await resecureMilestone(auth, mustMilestone(action.milestone_id));
        break;
      case "propose_addon": {
        const a = (
          action.detail as {
            addon?: { title: string; todos: string[]; amountMinor: number; dueInDays: number };
          }
        ).addon;
        if (!a) throw new AppError("CONFLICT", "This proposal has no add-on details.");
        result = await proposeAddon(auth, deal.id, {
          title: a.title,
          todos: a.todos,
          amountMajor: toMajorString({ minor: BigInt(a.amountMinor), currency: deal.currency }),
          dueInDays: a.dueInDays,
        });
        break;
      }
      case "propose_extra_revision": {
        const ms = await getPaymentMilestone(admin(), mustMilestone(action.milestone_id));
        if (!ms) throw new AppError("NOT_FOUND", "Milestone not found.");
        // One extra round ≈ 15% of the milestone, whole units, at least 5 (freelancer can edit later).
        const unit = 10n ** BigInt(exponentOf(deal.currency));
        let minor = ((BigInt(ms.amount_minor) * 15n) / 100n / unit) * unit;
        if (minor < 5n * unit) minor = 5n * unit;
        result = await proposeAddon(auth, deal.id, {
          title: `Extra revision round: ${ms.title}`,
          todos: [
            "One more round of changes",
            ...(clientNote(action.detail) ? [clientNote(action.detail)!] : []),
          ],
          amountMajor: toMajorString({ minor, currency: deal.currency }),
          dueInDays: 3,
        });
        break;
      }
    }
    await moveAgentAction(admin(), action.id, "approved", "executed", {
      ...action.detail,
      result: result ?? null,
    });
    return { status: "executed" as const, result };
  } catch (err) {
    // Put it back so the person can try again (e.g. PayPal declined).
    await moveAgentAction(admin(), action.id, "approved", "proposed");
    throw err;
  }
}

export async function dismissAgentAction(auth: AuthContext, actionId: string) {
  const { action, role, target } = await loadForViewer(auth, actionId);
  if (target !== "both" && target !== role)
    throw new AppError("FORBIDDEN", "This proposal isn't yours to dismiss.");
  const done = await resolveAgentAction(admin(), action.id, "dismissed");
  if (!done) throw new AppError("CONFLICT", "This proposal was already handled.");
  return { status: "dismissed" as const };
}

function mustMilestone(id: string | null): string {
  if (!id) throw new AppError("CONFLICT", "This proposal isn't linked to a milestone.");
  return id;
}

function clientNote(detail: Record<string, unknown>): string | null {
  const note = detail.clientNote;
  return typeof note === "string" && note.trim()
    ? `Client asked: ${note.trim().slice(0, 250)}`
    : null;
}
