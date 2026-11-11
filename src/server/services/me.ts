import type { MeResponse, UpdateMeInput } from "@/sdk/schemas";
import { isOnboarded, planProfileUpdate } from "../domain/profile";
import type { AuthContext } from "../http/auth";
import { AppError } from "../http/errors";
import { getProfile, updateProfile } from "../repos/profiles";

export async function getMe(auth: AuthContext): Promise<MeResponse> {
  const profile = await getProfile(auth.db, auth.userId);
  return { user: { id: auth.userId, email: auth.email }, profile, onboarded: isOnboarded(profile) };
}

export async function updateMe(auth: AuthContext, input: UpdateMeInput): Promise<MeResponse> {
  const current = await getProfile(auth.db, auth.userId);
  const plan = planProfileUpdate(current, input);
  if (!plan.ok) {
    if (plan.error === "ROLE_ALREADY_SET") {
      throw new AppError("ROLE_ALREADY_SET", "Your role is already set and can't be changed.");
    }
    throw new AppError("VALIDATION", "Only freelancers add a PayPal payout email.", {
      field: "paypal_email",
    });
  }
  const profile =
    Object.keys(plan.patch).length === 0
      ? current
      : await updateProfile(auth.db, auth.userId, plan.patch);
  return { user: { id: auth.userId, email: auth.email }, profile, onboarded: isOnboarded(profile) };
}
