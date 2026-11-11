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
