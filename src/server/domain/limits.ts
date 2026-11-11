// Hackathon limits (BUILD.md §5.2).
import { exponentOf } from "./currencies";
import type { Money } from "./money";

export const LIMITS = {
  totalMinMajor: 5,
  totalMaxMajor: 10_000,
  milestonesMin: 1,
  milestonesMax: 8,
  /** Each milestone is due at most this many days after it is secured. */
  dueMaxDays: 21,
  todosMinPerMilestone: 1,
  todosMaxPerMilestone: 20,
  revisionsMax: 10,
  uploadMaxBytes: 20 * 1024 * 1024,
  deliveryMaxFiles: 10,
  planMaxScreenshots: 8,
  aiCallsPerHour: 30,
} as const;

export type TotalIssue = "TOTAL_TOO_SMALL" | "TOTAL_TOO_LARGE";

/** Deal totals must be within [5, 10 000] major units of the deal currency. */
export function checkTotal(total: Money): TotalIssue | null {
  const unit = 10n ** BigInt(exponentOf(total.currency));
  if (total.minor < BigInt(LIMITS.totalMinMajor) * unit) return "TOTAL_TOO_SMALL";
  if (total.minor > BigInt(LIMITS.totalMaxMajor) * unit) return "TOTAL_TOO_LARGE";
  return null;
}
