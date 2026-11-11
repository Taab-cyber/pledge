// Delivery rules: every to-do gets exactly one AI verdict; add-on amounts come from code, not the AI.
import { exponentOf } from "./currencies";

export type CheckStatus = "met" | "missing" | "unclear";

export interface CheckItem {
  todo: string;
  status: CheckStatus;
  reason: string;
}

export interface DeliveryCheck {
  items: CheckItem[];
  summary: string;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Aligns the AI's items with the milestone's real to-dos: unknown items are dropped, duplicates
 * collapse to the first, and any to-do the AI skipped becomes "unclear" so nothing silently passes.
 */
export function normalizeCheck(todos: string[], ai: DeliveryCheck): DeliveryCheck {
  const byTodo = new Map<string, CheckItem>();
  for (const item of ai.items) {
    const key = norm(item.todo);
    if (!byTodo.has(key)) byTodo.set(key, item);
  }
  const items = todos.map((todo): CheckItem => {
    const found = byTodo.get(norm(todo));
    return found
      ? { todo, status: found.status, reason: found.reason }
      : { todo, status: "unclear", reason: "The check didn't cover this item." };
  });
  return { items, summary: ai.summary };
}

/** Overall verdict for badges: any missing → missing; else any unclear → unclear; else met. */
export function checkVerdict(check: DeliveryCheck): CheckStatus {
  if (check.items.some((i) => i.status === "missing")) return "missing";
  if (check.items.some((i) => i.status === "unclear")) return "unclear";
  return "met";
}

/**
 * Suggested add-on price from the AI's workload weight (1-100, where 100 = the whole original deal),
 * rounded to whole major units, minimum 5. The freelancer always edits/confirms before sending.
 */
export function addonAmountFromWeight(
  totalMinor: bigint,
  currency: string,
  weight: number,
): bigint {
  const w = BigInt(Math.min(100, Math.max(1, Math.round(weight))));
  const unit = 10n ** BigInt(exponentOf(currency));
  const raw = (totalMinor * w) / 100n;
  const rounded = ((raw + unit / 2n) / unit) * unit;
  return rounded < 5n * unit ? 5n * unit : rounded;
}
