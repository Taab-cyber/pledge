"use client";

import { createApiClient } from "./client";
import { supabaseBrowser } from "./supabase-browser";

/** API client for UI code: sends the signed-in user's access token as a bearer token. */
export const api = createApiClient({
  getAccessToken: async () => {
    const { data } = await supabaseBrowser().auth.getSession();
    return data.session?.access_token ?? null;
  },
});

export { ApiError } from "./client";
export { supabaseBrowser } from "./supabase-browser";
export type * from "./schemas";

/**
 * Uploads files straight to private storage through one-time slots, then returns the payload for
 * api.milestones.checkDelivery / deliver. Big files never pass through our API.
 */
export async function uploadDeliveryFiles(
  milestoneId: string,
  files: File[],
): Promise<Array<{ path: string; name: string }>> {
  if (files.length === 0) return [];
  const { slots } = await api.milestones.uploadSlots(
    milestoneId,
    files.map((f) => ({ name: f.name, size: f.size })),
  );
  const storage = supabaseBrowser().storage.from("deal-inputs");
  await Promise.all(
    slots.map(async (slot, i) => {
      const { error } = await storage.uploadToSignedUrl(slot.path, slot.token, files[i]!);
      if (error) throw new Error(`Upload failed for ${files[i]!.name}: ${error.message}`);
    }),
  );
  return slots.map((s, i) => ({ path: s.path, name: files[i]!.name }));
}
