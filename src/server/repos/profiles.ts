import type { SupabaseClient } from "@supabase/supabase-js";
import { ProfileSchema, type Profile } from "@/sdk/schemas";
import type { ProfilePatch } from "../domain/profile";
import { AppError } from "../http/errors";

const COLUMNS =
  "id, role, full_name, profession, country_code, paypal_email, is_demo, created_at, updated_at";

export async function getProfile(db: SupabaseClient, id: string): Promise<Profile> {
  const { data, error } = await db.from("profiles").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new AppError("INTERNAL", "Could not load profile.", { db: error.code });
  if (!data) throw new AppError("NOT_FOUND", "Profile not found.");
  return ProfileSchema.parse(data);
}

export async function updateProfile(
  db: SupabaseClient,
  id: string,
  patch: ProfilePatch,
): Promise<Profile> {
  const { data, error } = await db
    .from("profiles")
    .update(patch)
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    if (error.message.includes("ROLE_ALREADY_SET")) {
      throw new AppError("ROLE_ALREADY_SET", "Your role is already set and can't be changed.");
    }
    if (error.code === "23514") {
      throw new AppError("VALIDATION", "Some fields are invalid.", { db: error.message });
    }
    throw new AppError("INTERNAL", "Could not save profile.", { db: error.code });
  }
  if (!data) throw new AppError("NOT_FOUND", "Profile not found.");
  return ProfileSchema.parse(data);
}
