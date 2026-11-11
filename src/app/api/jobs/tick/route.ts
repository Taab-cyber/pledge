import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { AppError } from "@/server/http/errors";
import { route } from "@/server/http/route";
import { runTick } from "@/server/services/jobs";

function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called by pg_cron + pg_net every 15 minutes with the x-jobs-secret header. Safe to run in parallel. */
export const POST = route(async (req) => {
  if (!secretMatches(req.headers.get("x-jobs-secret"), env().JOBS_SECRET)) {
    throw new AppError("UNAUTHENTICATED", "Missing or wrong jobs secret.");
  }
  return runTick();
});
