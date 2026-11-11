import { describe, expect, it } from "vitest";
import {
  DEAL_STATUSES,
  dealTransition,
  isPlanEditable,
  type DealEvent,
  type DealStatus,
} from "./deal-machine";
import {
  MILESTONE_STATUSES,
  canTransition,
  computeReleaseAt,
  hasLiveHold,
  isDueForAutoRelease,
  isTerminal,
  transition,
  useRevision,
  type MilestoneEvent,
  type MilestoneStatus,
} from "./milestone-machine";

const MILESTONE_EVENTS: MilestoneEvent[] = [
  "open_for_hold",
  "hold_confirmed",
  "deliver",
  "request_changes",
  "release",
  "renewal_failed",
  "renewed",
  "resecure",
  "void",
];

// The complete legal set. Every other (state, event) pair must be rejected.
const LEGAL: Record<string, MilestoneStatus> = {
  "draft:open_for_hold": "awaiting_hold",
  "draft:void": "voided",
  "awaiting_hold:hold_confirmed": "held",
  "awaiting_hold:void": "voided",
  "held:deliver": "delivered",
  "held:renewal_failed": "hold_at_risk",
  "held:void": "voided",
  "hold_at_risk:renewed": "held",
  "hold_at_risk:resecure": "awaiting_hold",
  "hold_at_risk:void": "voided",
  "delivered:request_changes": "changes_requested",
  "delivered:release": "released",
  "delivered:renewal_failed": "hold_at_risk",
  "changes_requested:deliver": "delivered",
  "changes_requested:renewal_failed": "hold_at_risk",
};

describe("milestone transition()", () => {
  for (const state of MILESTONE_STATUSES) {
    for (const event of MILESTONE_EVENTS) {
      const key = `${state}:${event}`;
      const expected = LEGAL[key];
      it(`${key} → ${expected ?? "ILLEGAL"}`, () => {
        const res = transition(state, event);
        if (expected) {
          expect(res).toEqual({ ok: true, from: state, to: expected });
          expect(canTransition(state, event)).toBe(true);
        } else {
          expect(res).toMatchObject({ ok: false, error: "ILLEGAL_TRANSITION" });
          expect(canTransition(state, event)).toBe(false);
        }
      });
    }
  }

  it("cannot release twice or after voiding", () => {
    expect(transition("released", "release").ok).toBe(false);
    expect(transition("voided", "release").ok).toBe(false);
    expect(isTerminal("released")).toBe(true);
    expect(isTerminal("voided")).toBe(true);
  });

  it("does not release money that isn't delivered", () => {
    for (const s of [
      "draft",
      "awaiting_hold",
      "held",
      "hold_at_risk",
      "changes_requested",
    ] as const) {
      expect(transition(s, "release").ok).toBe(false);
    }
  });

  it("knows which states hold live money", () => {
    expect(MILESTONE_STATUSES.filter(hasLiveHold)).toEqual([
      "held",
      "hold_at_risk",
      "delivered",
      "changes_requested",
    ]);
  });
});

describe("auto-release", () => {
  const delivered = new Date("2026-11-12T10:00:00Z");

  it("sets release_at only with consent", () => {
    expect(computeReleaseAt(delivered, 72, true)?.toISOString()).toBe("2026-11-15T10:00:00.000Z");
    expect(computeReleaseAt(delivered, 72, false)).toBeNull();
  });

  it("fires only for delivered milestones past release_at", () => {
    const at = new Date("2026-11-15T10:00:00Z");
    expect(isDueForAutoRelease({ status: "delivered", release_at: at }, at)).toBe(true);
    expect(
      isDueForAutoRelease({ status: "delivered", release_at: at }, new Date(at.getTime() - 1)),
    ).toBe(false);
    expect(isDueForAutoRelease({ status: "delivered", release_at: null }, at)).toBe(false);
    expect(isDueForAutoRelease({ status: "changes_requested", release_at: at }, at)).toBe(false);
    expect(isDueForAutoRelease({ status: "hold_at_risk", release_at: at }, at)).toBe(false);
  });
});

describe("useRevision", () => {
  it("counts rounds and suggests a paid add-on when they run out", () => {
    expect(useRevision(2, 0)).toEqual({ allowed: true, revisionsUsed: 1, remaining: 1 });
    expect(useRevision(2, 1)).toEqual({ allowed: true, revisionsUsed: 2, remaining: 0 });
    expect(useRevision(2, 2)).toEqual({
      allowed: false,
      reason: "REVISIONS_USED_UP",
      suggestAddon: true,
    });
    expect(useRevision(0, 0).allowed).toBe(false);
  });
});

describe("deal transitions", () => {
  const EVENTS: DealEvent[] = ["edit", "share", "approve", "first_hold", "complete", "cancel"];
  const LEGAL_DEAL: Record<string, DealStatus> = {
    "draft:edit": "draft",
    "draft:share": "shared",
    "draft:cancel": "cancelled",
    "shared:edit": "draft",
    "shared:share": "shared",
    "shared:approve": "approved",
    "shared:cancel": "cancelled",
    "approved:first_hold": "active",
    "approved:cancel": "cancelled",
    "active:complete": "completed",
    "active:cancel": "cancelled",
  };

  for (const state of DEAL_STATUSES) {
    for (const event of EVENTS) {
      const key = `${state}:${event}`;
      it(`${key} → ${LEGAL_DEAL[key] ?? "ILLEGAL"}`, () => {
        const res = dealTransition(state, event);
        expect(res.ok ? res.to : null).toBe(LEGAL_DEAL[key] ?? null);
      });
    }
  }

  it("allows plan edits only before approval", () => {
    expect(DEAL_STATUSES.filter(isPlanEditable)).toEqual(["draft", "shared"]);
  });
});
