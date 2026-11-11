// Milestone state machine (BUILD.md §5.3). Pure: the service layer persists the result with a
// conditional update (WHERE status = from), so a race (approve vs auto-release) yields one winner.
//
// draft → awaiting_hold → held → delivered ⇄ changes_requested
//                           │       │   │
//                hold_at_risk ←─────┘   └→ released
//                           └→ voided   (held / hold_at_risk / awaiting_hold can be voided)

export const MILESTONE_STATUSES = [
  "draft",
  "awaiting_hold",
  "held",
  "hold_at_risk",
  "delivered",
  "changes_requested",
  "released",
  "voided",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export type MilestoneEvent =
  | "open_for_hold" //      plan approved / previous milestone released → client can secure it
  | "hold_confirmed" //     PayPal authorization succeeded
  | "deliver" //            freelancer submits work
  | "request_changes" //    client asks for changes (uses a revision round)
  | "release" //            PayPal capture completed
  | "renewal_failed" //     reauthorization failed: hold may lapse
  | "renewed" //            reauthorization succeeded after being at risk
  | "resecure" //           client starts a fresh hold after a failed renewal
  | "void"; //              hold cancelled / milestone dropped

const TRANSITIONS: Record<MilestoneStatus, Partial<Record<MilestoneEvent, MilestoneStatus>>> = {
  draft: { open_for_hold: "awaiting_hold", void: "voided" },
  awaiting_hold: { hold_confirmed: "held", void: "voided" },
  held: { deliver: "delivered", renewal_failed: "hold_at_risk", void: "voided" },
  hold_at_risk: { renewed: "held", resecure: "awaiting_hold", void: "voided" },
  delivered: {
    request_changes: "changes_requested",
    release: "released",
    renewal_failed: "hold_at_risk",
  },
  changes_requested: { deliver: "delivered", renewal_failed: "hold_at_risk" },
  released: {},
  voided: {},
};

export type TransitionResult<S> =
  { ok: true; from: S; to: S } | { ok: false; from: S; event: string; error: "ILLEGAL_TRANSITION" };

export function transition(
  state: MilestoneStatus,
  event: MilestoneEvent,
): TransitionResult<MilestoneStatus> {
  const to = TRANSITIONS[state][event];
  return to
    ? { ok: true, from: state, to }
    : { ok: false, from: state, event, error: "ILLEGAL_TRANSITION" };
}

export function canTransition(state: MilestoneStatus, event: MilestoneEvent): boolean {
  return TRANSITIONS[state][event] !== undefined;
}

export function isTerminal(state: MilestoneStatus): boolean {
  return Object.keys(TRANSITIONS[state]).length === 0;
}

/** States in which a live PayPal authorization exists (renewals apply; voiding releases it). */
export function hasLiveHold(state: MilestoneStatus): boolean {
  return (
    state === "held" ||
    state === "delivered" ||
    state === "changes_requested" ||
    state === "hold_at_risk"
  );
}

/**
 * Auto-release time for a delivery: only with the client's consent for the current deal version.
 * No consent → null → never auto-released.
 */
export function computeReleaseAt(
  deliveredAt: Date,
  autoReleaseHours: number,
  hasConsentForCurrentVersion: boolean,
): Date | null {
  if (!hasConsentForCurrentVersion) return null;
  return new Date(deliveredAt.getTime() + autoReleaseHours * 3_600_000);
}

export type RevisionOutcome =
  | { allowed: true; revisionsUsed: number; remaining: number }
  | { allowed: false; reason: "REVISIONS_USED_UP"; suggestAddon: true };

/** A change request uses one revision round; past the included rounds, suggest a paid add-on. */
export function useRevision(revisionsIncluded: number, revisionsUsed: number): RevisionOutcome {
  if (revisionsUsed >= revisionsIncluded) {
    return { allowed: false, reason: "REVISIONS_USED_UP", suggestAddon: true };
  }
  const used = revisionsUsed + 1;
  return { allowed: true, revisionsUsed: used, remaining: revisionsIncluded - used };
}

/** Auto-release may fire only for a delivered milestone whose release time has passed. */
export function isDueForAutoRelease(
  m: { status: MilestoneStatus; release_at: Date | null },
  now: Date,
): boolean {
  return (
    m.status === "delivered" && m.release_at !== null && m.release_at.getTime() <= now.getTime()
  );
}
