// Maps rows to API DTOs. Amounts leave the server as integer minor units + a formatted string.
import type { DealDto, MoneyDto } from "@/sdk/schemas";
import { fromMajor, format, money } from "../domain/money";
import { validatePlan, type PlanIssue } from "../domain/plan";
import type { ChangeRequestRow, DealRow, MilestoneRow } from "../repos/deals";

export function moneyDto(minor: number | bigint, currency: string): MoneyDto {
  const m = money(BigInt(minor), currency);
  return { minor: Number(m.minor), currency, formatted: format(m) };
}

export function issuesDto(issues: PlanIssue[]): DealDto["issues"] {
  return issues.map((i) => {
    const out: DealDto["issues"][number] = { code: i.code };
    if ("milestone" in i) out.milestone = i.milestone;
    if ("todo" in i) out.todo = i.todo;
    if ("differenceMinor" in i) out.differenceMinor = Number(i.differenceMinor);
    return out;
  });
}

/** The chat's price differs from the entered total (same currency, or a different currency at all). */
export function priceMismatch(
  priceInChat: { amount: string | null; currency: string | null },
  totalMinor: number,
  currency: string,
): boolean {
  if (!priceInChat.amount) return false;
  if (priceInChat.currency && priceInChat.currency.toUpperCase() !== currency) return true;
  try {
    return fromMajor(priceInChat.amount, currency).minor !== BigInt(totalMinor);
  } catch {
    return true; // e.g. "400.5" for JPY: not the same price
  }
}

export function toDealDto(
  deal: DealRow,
  milestones: MilestoneRow[],
  changes: ChangeRequestRow[],
  viewerId: string,
): DealDto {
  const viewerRole = deal.freelancer_id === viewerId ? "freelancer" : "client";
  const plan = milestones.filter((m) => m.kind === "milestone");
  const issues = validatePlan({
    currency: deal.currency,
    totalMinor: BigInt(deal.total_minor),
    milestones: plan.map((m) => ({
      title: m.title,
      amountMinor: BigInt(m.amount_minor),
      dueInDays: m.due_in_days ?? 0,
      revisionsIncluded: m.revisions_included,
      todos: m.todos.map((t) => t.label),
    })),
  });
  const sumMinor = plan.reduce((a, m) => a + m.amount_minor, 0);
  const meta = deal.plan_meta;

  return {
    id: deal.id,
    viewerRole,
    title: deal.title,
    status: deal.status,
    currency: deal.currency,
    total: moneyDto(deal.total_minor, deal.currency),
    clientName: deal.client_name,
    clientCountry: deal.client_country,
    clientWhatsapp: viewerRole === "freelancer" ? deal.client_whatsapp : null,
    currentVersion: deal.current_version,
    autoReleaseHours: deal.auto_release_hours,
    hasScreenshots: deal.source_files.length > 0,
    planMeta: meta
      ? {
          summary: meta.summary,
          gaps: meta.gaps,
          confidence: meta.confidence,
          priceInChat: meta.priceInChat,
          priceMismatch: priceMismatch(meta.priceInChat, deal.total_minor, deal.currency),
        }
      : null,
    milestones: milestones.map((m) => ({
      id: m.id,
      kind: m.kind,
      position: m.position,
      title: m.title,
      amount: moneyDto(m.amount_minor, deal.currency),
      dueInDays: m.due_in_days,
      revisionsIncluded: m.revisions_included,
      revisionsUsed: m.revisions_used,
      status: m.status,
      todos: m.todos.map((t) => ({ id: t.id, label: t.label, done: t.done })),
    })),
    sum: moneyDto(sumMinor, deal.currency),
    difference: moneyDto(deal.total_minor - sumMinor, deal.currency),
    issues: plan.length === 0 ? [{ code: "NO_PLAN_YET" }] : issuesDto(issues),
    canShare: plan.length > 0 && issues.length === 0,
    changeRequests: changes.map((c) => ({
      id: c.id,
      fromRole: c.from_role,
      text: c.text,
      aiChanges: c.ai_summary?.changes ?? null,
      createdAt: c.created_at,
    })),
    createdAt: deal.created_at,
  };
}
