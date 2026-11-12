"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Browser Supabase client (auth only; data goes through /api/v1). Uses public keys only. */
export function supabaseBrowser(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase public env vars are missing. See .env.example.");
  client ??= createBrowserClient(url, key, {
    // The default cross-tab lock (navigator.locks) can stay held by a closed or frozen tab, after which
    // getSession() waits forever and buttons spin on "Approving…". Run auth steps without it.
    auth: { lock: async (_name, _timeout, fn) => fn() },
  });
  return client;
}
