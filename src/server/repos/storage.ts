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

/** One-time upload slot: the browser uploads straight to storage (bypasses Vercel's 4.5 MB body limit). */
export async function createUploadSlot(
  admin: SupabaseClient,
  path: string,
): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await admin.storage.from(DEAL_INPUTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new AppError("INTERNAL", "Could not prepare the upload.");
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function movePrivate(admin: SupabaseClient, from: string, to: string): Promise<void> {
  const { error } = await admin.storage.from(DEAL_INPUTS_BUCKET).move(from, to);
  if (error)
    throw new AppError("INTERNAL", "Could not store the delivery file.", {
      storage: error.message,
    });
}

/** Short-lived signed URLs; `download` forces an attachment (never rendered inline, e.g. SVG). */
export async function signedUrl(
  admin: SupabaseClient,
  path: string,
  seconds: number,
  download?: string,
): Promise<string> {
  const { data, error } = await admin.storage
    .from(DEAL_INPUTS_BUCKET)
    .createSignedUrl(path, seconds, download ? { download } : undefined);
  if (error || !data) throw new AppError("INTERNAL", "Could not create a file link.");
  return data.signedUrl;
}

export async function signedUrls(
  admin: SupabaseClient,
  paths: string[],
  seconds: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await admin.storage
    .from(DEAL_INPUTS_BUCKET)
    .createSignedUrls(paths, seconds);
  if (error || !data) return out; // previews are optional: the page still works without them
  for (const d of data) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}
