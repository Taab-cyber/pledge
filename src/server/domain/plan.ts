// Plan rules: amounts come from allocate(), and sharing is blocked until everything is valid.
import { allocate } from "./allocate";
import { isSupportedCurrency } from "./currencies";
import { LIMITS, checkTotal } from "./limits";

export interface PlanMilestone {
  title: string;
  amountMinor: bigint;
  dueInDays: number;
  revisionsIncluded: number;
  todos: string[];
}

export interface Plan {
  currency: string;
  totalMinor: bigint;
  milestones: PlanMilestone[];
}

export type PlanIssue =
  | { code: "UNSUPPORTED_CURRENCY" }
  | { code: "TOTAL_TOO_SMALL" | "TOTAL_TOO_LARGE" }
  | { code: "TOO_FEW_MILESTONES" | "TOO_MANY_MILESTONES" }
  | { code: "SUM_MISMATCH"; sumMinor: bigint; totalMinor: bigint; differenceMinor: bigint }
  | { code: "EMPTY_TITLE"; milestone: number }
  | { code: "AMOUNT_NOT_POSITIVE"; milestone: number }
  | { code: "DUE_OUT_OF_RANGE"; milestone: number }
  | { code: "REVISIONS_OUT_OF_RANGE"; milestone: number }
  | { code: "TOO_FEW_TODOS" | "TOO_MANY_TODOS"; milestone: number }
  | { code: "EMPTY_TODO"; milestone: number; todo: number };

export function validatePlan(plan: Plan): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (!isSupportedCurrency(plan.currency)) return [{ code: "UNSUPPORTED_CURRENCY" }];

  const totalIssue = checkTotal({ minor: plan.totalMinor, currency: plan.currency });
  if (totalIssue) issues.push({ code: totalIssue });

  const n = plan.milestones.length;
  if (n < LIMITS.milestonesMin) issues.push({ code: "TOO_FEW_MILESTONES" });
  if (n > LIMITS.milestonesMax) issues.push({ code: "TOO_MANY_MILESTONES" });

  plan.milestones.forEach((m, i) => {
    if (m.title.trim() === "") issues.push({ code: "EMPTY_TITLE", milestone: i });
    if (m.amountMinor < 1n) issues.push({ code: "AMOUNT_NOT_POSITIVE", milestone: i });
    if (!Number.isInteger(m.dueInDays) || m.dueInDays < 1 || m.dueInDays > LIMITS.dueMaxDays) {
      issues.push({ code: "DUE_OUT_OF_RANGE", milestone: i });
    }
    if (
      !Number.isInteger(m.revisionsIncluded) ||
      m.revisionsIncluded < 0 ||
      m.revisionsIncluded > LIMITS.revisionsMax
    ) {
      issues.push({ code: "REVISIONS_OUT_OF_RANGE", milestone: i });
    }
    if (m.todos.length < LIMITS.todosMinPerMilestone)
      issues.push({ code: "TOO_FEW_TODOS", milestone: i });
    if (m.todos.length > LIMITS.todosMaxPerMilestone)
      issues.push({ code: "TOO_MANY_TODOS", milestone: i });
    m.todos.forEach((t, j) => {
      if (t.trim() === "") issues.push({ code: "EMPTY_TODO", milestone: i, todo: j });
    });
  });

  const sumMinor = plan.milestones.reduce((acc, m) => acc + m.amountMinor, 0n);
  if (n > 0 && sumMinor !== plan.totalMinor) {
    issues.push({
      code: "SUM_MISMATCH",
      sumMinor,
      totalMinor: plan.totalMinor,
      differenceMinor: plan.totalMinor - sumMinor,
    });
  }
  return issues;
}

/** "Share" is allowed only when the plan has no issues (amounts sum exactly to the total). */
export function canShare(plan: Plan): boolean {
  return validatePlan(plan).length === 0;
}

export interface WeightedMilestone {
  title: string;
  weight: number;
  dueInDays: number;
  revisionsIncluded: number;
  todos: string[];
}

/** Turns AI weights into exact amounts. The AI never supplies amounts. */
export function planFromWeights(
  currency: string,
  totalMinor: bigint,
  milestones: WeightedMilestone[],
): Plan {
  const amounts = allocate(
    totalMinor,
    milestones.map((m) => m.weight),
  );
  return {
    currency,
    totalMinor,
    milestones: milestones.map((m, i) => ({
      title: m.title,
      amountMinor: amounts[i] ?? 0n,
      dueInDays: m.dueInDays,
      revisionsIncluded: m.revisionsIncluded,
      todos: m.todos,
    })),
  };
}
