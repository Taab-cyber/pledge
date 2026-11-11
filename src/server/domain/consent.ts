// Auto-release consent: the exact text the client agrees to, and its SHA-256 (stored with the consent).
import { createHash } from "node:crypto";

export const CONSENT_TEXT_VERSION = 1;

export interface ConsentInput {
  dealTitle: string;
  dealVersion: number;
  freelancerName: string;
  autoReleaseHours: number;
}

/** Deterministic text: the same input always yields the same text and hash. */
export function consentText(i: ConsentInput): string {
  return [
    `Pledge consent v${CONSENT_TEXT_VERSION} — "${i.dealTitle.trim()}" (plan version ${i.dealVersion}).`,
    `When I secure a milestone, PayPal places a hold on my payment method. I am not charged yet.`,
    `When ${i.freelancerName.trim()} submits a delivery for that milestone, I can approve it (PayPal then charges the held amount) or ask for changes.`,
    `If I do neither within ${i.autoReleaseHours} hours of the delivery, I agree that Pledge may ask PayPal to charge the held amount and pay ${i.freelancerName.trim()} automatically.`,
    `Asking for changes pauses this timer. This consent applies only to this plan version.`,
  ].join("\n");
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function consentRecord(i: ConsentInput): { text: string; textSha256: string } {
  const text = consentText(i);
  return { text, textSha256: sha256Hex(text) };
}
