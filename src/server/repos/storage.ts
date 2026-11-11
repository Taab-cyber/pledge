import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "../http/errors";

export const DEAL_INPUTS_BUCKET = "deal-inputs";

export async function uploadPrivate(
  admin: SupabaseClient,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await admin.storage
    .from(DEAL_INPUTS_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error)
    throw new AppError("INTERNAL", "Could not store the file.", { storage: error.message });
}

export async function downloadPrivate(admin: SupabaseClient, path: string): Promise<Buffer> {
  const { data, error } = await admin.storage.from(DEAL_INPUTS_BUCKET).download(path);
  if (error || !data) throw new AppError("INTERNAL", "Could not read a stored file.");
  return Buffer.from(await data.arrayBuffer());
}

export async function removePrivate(admin: SupabaseClient, paths: string[]): Promise<void> {
  if (paths.length) await admin.storage.from(DEAL_INPUTS_BUCKET).remove(paths);
}
