// Deal lifecycle. Editing a shared plan creates a new version but keeps the status "shared".
import type { TransitionResult } from "./milestone-machine";

export const DEAL_STATUSES = [
  "draft",
  "shared",
  "approved",
  "active",
  "completed",
  "cancelled",
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export type DealEvent =
  | "share" //          freelancer creates the WhatsApp link
  | "approve" //        client approves the current version (+ consent)
  | "first_hold" //     first milestone secured
  | "complete" //       every milestone released or voided
  | "cancel";

const TRANSITIONS: Record<DealStatus, Partial<Record<DealEvent, DealStatus>>> = {
  draft: { share: "shared", cancel: "cancelled" },
  shared: { share: "shared", approve: "approved", cancel: "cancelled" },
  approved: { first_hold: "active", cancel: "cancelled" },
  active: { complete: "completed", cancel: "cancelled" },
  completed: {},
  cancelled: {},
};

export function dealTransition(state: DealStatus, event: DealEvent): TransitionResult<DealStatus> {
  const to = TRANSITIONS[state][event];
  return to
    ? { ok: true, from: state, to }
    : { ok: false, from: state, event, error: "ILLEGAL_TRANSITION" };
}

/** The plan can be edited (new version) until the client approves it. */
export function isPlanEditable(state: DealStatus): boolean {
  return state === "draft" || state === "shared";
}
