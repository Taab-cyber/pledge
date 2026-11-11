import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "../env";

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } } as const;

const url = () => requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = () => requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

/** Acts as the signed-in user via their access token; RLS applies. */
export function userClientFromToken(accessToken: string): SupabaseClient {
  return createClient(url(), anonKey(), {
    ...noPersist,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Acts as the signed-in user via the Supabase auth cookies; RLS applies. */
export async function userClientFromCookies(): Promise<SupabaseClient> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createServerClient(url(), anonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const c of list) store.set(c.name, c.value, c.options);
        } catch {
          // Read-only cookie context; the browser client refreshes the session itself.
        }
      },
    },
  });
}

let admin: SupabaseClient | undefined;

/** Service-role client: bypasses RLS. Server-only; use after the service layer has authorized the action. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(url(), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), noPersist);
  return admin;
}
