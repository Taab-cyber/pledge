// Scope guard + add-ons. A client message asking for extra work is classified by the AI; if it's out
// of scope the Deal Agent drafts a paid add-on for the freelancer. Amounts are computed by code.
import { exponentOf } from "../domain/currencies";
import { addonAmountFromWeight } from "../domain/delivery";
import { LIMITS } from "../domain/limits";
import { format, fromMajor, money } from "../domain/money";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import { findDeal, insertChangeRequest, listMilestones } from "../repos/deals";
import { getAgentAction, insertAgentAction, resolveAgentAction } from "../repos/deliveries";
import { logEvent, updateMilestoneIf } from "../repos/milestones";
import { adminClient } from "../repos/supabase";
import { aiFor, assertAiQuota } from "./ai";
import { loadMilestone, openNextMilestone, requireParty } from "./payments";

const admin = () => adminClient();
const OPEN_DEAL = new Set(["approved", "active"]);

async function loadDeal(dealId: string) {
  const deal = await findDeal(admin(), dealId);
  if (!deal) throw new AppError("NOT_FOUND", "Deal not found.");
  return deal;
}

/** Client message → AI scope check → (if extra work) an add-on proposal for the freelancer. */
export async function sendClientMessage(auth: AuthContext, dealId: string, text: string) {
  const deal = await loadDeal(dealId);
  if (deal.client_id !== auth.userId) {
    if (deal.freelancer_id === auth.userId)
      throw new AppError("FORBIDDEN", "Only the client sends requests here.");
    throw new AppError("NOT_FOUND", "Deal not found.");
  }
  if (!OPEN_DEAL.has(deal.status)) throw new AppError("CONFLICT", "This deal is closed.");

  const plan = (await listMilestones(admin(), deal.id)).filter((m) => m.status !== "voided");
  await assertAiQuota(auth.userId);
  const result = await aiFor(auth.userId).classifyRequest({
    dealTitle: deal.title,
    milestones: plan.map((m) => ({ title: m.title, todos: m.todos.map((t) => t.label) })),
    message: text,
  });

  const messageId = await insertChangeRequest(admin(), {
    deal_id: deal.id,
    from_role: "client",
    text,
    kind: "message",
    ai_summary: { scope: { inScope: result.inScope, reason: result.reason } },
  });

  let proposal: { id: string; title: string } | null = null;
  if (!result.inScope && result.suggestedAddon) {
    const a = result.suggestedAddon;
    const amountMinor = addonAmountFromWeight(BigInt(deal.total_minor), deal.currency, a.weight);
    const amount = format(money(amountMinor, deal.currency));
    const action = await insertAgentAction(admin(), {
      deal_id: deal.id,
      kind: "propose_addon",
      title: `Send add-on: ${a.title} · ${amount}`,
      detail: {
        noticed: `The client asked: "${text.slice(0, 200)}". ${result.reason}`,
        wants: `Offer a paid add-on "${a.title}" for ${amount} (${a.dueInDays} days).`,
        for: "freelancer",
        messageId,
        addon: {
          title: a.title,
          todos: a.todos,
          amountMinor: Number(amountMinor),
          dueInDays: a.dueInDays,
        },
      },
    });
    proposal = { id: action.id, title: action.title };
  }
  return { inScope: result.inScope, reason: result.reason, proposal };
}

/** Freelancer offers a paid add-on (from an agent proposal or by hand). It gets its own PayPal hold. */
export async function proposeAddon(
  auth: AuthContext,
  dealId: string,
  input: {
    title: string;
    todos: string[];
    amountMajor: string;
    dueInDays: number;
    actionId?: string;
  },
) {
  const deal = await loadDeal(dealId);
  if (deal.freelancer_id !== auth.userId) throw new AppError("NOT_FOUND", "Deal not found.");
  if (!OPEN_DEAL.has(deal.status))
    throw new AppError("CONFLICT", "Add-ons can be sent once the client has approved the plan.");
  let amountMinor: bigint;
  try {
    amountMinor = fromMajor(input.amountMajor, deal.currency).minor;
  } catch (err) {
    throw new AppError("VALIDATION", err instanceof Error ? err.message : "Invalid amount.");
  }
  const unit = 10n ** BigInt(exponentOf(deal.currency));
  if (
    amountMinor < BigInt(LIMITS.totalMinMajor) * unit ||
    amountMinor > BigInt(LIMITS.totalMaxMajor) * unit
  ) {
    throw new AppError(
      "VALIDATION",
      `Add-ons must be between ${LIMITS.totalMinMajor} and ${LIMITS.totalMaxMajor} ${deal.currency}.`,
    );
  }

  const existing = await listMilestones(admin(), deal.id);
  const position = existing.filter((m) => m.kind === "addon").length;
  const { data, error } = await admin()
    .from("milestones")
    .insert({
      deal_id: deal.id,
      kind: "addon",
      position,
      title: input.title,
      amount_minor: Number(amountMinor),
      due_in_days: input.dueInDays,
      revisions_included: 1,
      status: "draft", // = offered, waiting for the client's answer
    })
    .select("id")
    .single();
  if (error) throw new AppError("INTERNAL", "Could not create the add-on.", { db: error.code });
  const addonId = (data as { id: string }).id;
  const { error: todoErr } = await admin()
    .from("todos")
    .insert(input.todos.map((label, i) => ({ milestone_id: addonId, position: i, label })));
  if (todoErr) throw new AppError("INTERNAL", "Could not save the add-on to-dos.");

  if (input.actionId) {
    const action = await getAgentAction(admin(), input.actionId);
    if (action?.deal_id === deal.id)
      await resolveAgentAction(admin(), action.id, "executed", { addonId });
  }
  await logEvent(admin(), {
    deal_id: deal.id,
    milestone_id: addonId,
    actor_role: "freelancer",
    type: "addon_offered",
    payload: { title: input.title, amountMinor: Number(amountMinor) },
  });
  return { addonId, status: "draft" as const };
}

/** Client accepts (→ waiting for its own hold) or declines (→ cancelled) an offered add-on. */
export async function respondToAddon(auth: AuthContext, milestoneId: string, accept: boolean) {
  const { ms, deal } = await loadMilestone(milestoneId);
  requireParty(deal, auth, "client");
  if (ms.kind !== "addon" || ms.status !== "draft") {
    throw new AppError("CONFLICT", "This add-on has already been answered.");
  }
  const updated = await updateMilestoneIf(
    admin(),
    ms.id,
    { status: "draft" },
    {
      status: accept ? "awaiting_hold" : "voided",
    },
  );
  if (!updated) throw new AppError("CONFLICT", "This add-on has already been answered.");
  await logEvent(admin(), {
    deal_id: deal.id,
    milestone_id: ms.id,
    actor_role: "client",
    type: accept ? "addon_accepted" : "addon_declined",
  });
  if (!accept) await openNextMilestone(deal);
  return { status: updated.status };
}
