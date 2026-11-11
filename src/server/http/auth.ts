import type { SupabaseClient } from "@supabase/supabase-js";
import { userClientFromCookies, userClientFromToken } from "../repos/supabase";
import { AppError } from "./errors";

export interface AuthContext {
  userId: string;
  email: string | null;
  /** Supabase client acting as this user (RLS enforced). */
  db: SupabaseClient;
}

/** Extracts a bearer token; null when the header is missing or not a bearer token. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

/** Auth guard: `Authorization: Bearer <supabase access token>` or the Supabase cookie session. */
export async function requireUser(req: Request): Promise<AuthContext> {
  const token = parseBearer(req.headers.get("authorization"));
  const db = token ? userClientFromToken(token) : await userClientFromCookies();
  // getUser() verifies the token with Supabase Auth; getSession() alone would trust the cookie.
  const { data, error } = token ? await db.auth.getUser(token) : await db.auth.getUser();
  if (error || !data.user) {
    throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
  }
  return { userId: data.user.id, email: data.user.email ?? null, db };
}
