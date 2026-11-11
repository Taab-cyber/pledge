// Pure profile rules: the role is chosen once; only freelancers have a PayPal payout email.

export type Role = "freelancer" | "client";

export interface ProfileState {
  role: Role | null;
  full_name: string | null;
  country_code: string | null;
  paypal_email: string | null;
}

export interface ProfilePatch {
  role?: Role;
  full_name?: string;
  profession?: string;
  country_code?: string;
  paypal_email?: string;
}

export type ProfileRuleError = "ROLE_ALREADY_SET" | "PAYPAL_EMAIL_FREELANCER_ONLY";

export function planProfileUpdate(
  current: ProfileState,
  input: ProfilePatch,
): { ok: true; patch: ProfilePatch } | { ok: false; error: ProfileRuleError } {
  if (input.role && current.role && input.role !== current.role) {
    return { ok: false, error: "ROLE_ALREADY_SET" };
  }
  const role = current.role ?? input.role ?? null;
  if (input.paypal_email !== undefined && role !== "freelancer") {
    return { ok: false, error: "PAYPAL_EMAIL_FREELANCER_ONLY" };
  }
  const patch: ProfilePatch = { ...input };
  if (current.role) delete patch.role; // already set: nothing to write
  return { ok: true, patch };
}

/** Onboarding is complete when the fields each role needs are filled. */
export function isOnboarded(p: ProfileState): boolean {
  if (!p.role || !p.full_name || !p.country_code) return false;
  return p.role === "client" || !!p.paypal_email;
}
