// Small in-memory fixed-window limiter for public endpoints (per server instance).
// Good enough to slow down token guessing in a hackathon deploy; per-user AI limits use ai_runs instead.
import { AppError } from "./errors";

const windows = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): void {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 10_000) prune(now, windowMs);
    return;
  }
  w.count += 1;
  if (w.count > limit) {
    throw new AppError("RATE_LIMITED", "Too many requests. Please wait a minute and try again.");
  }
}

function prune(now: number, windowMs: number) {
  for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
}

/** Best-effort client IP (Vercel sets x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
  );
}

export function resetRateLimits(): void {
  windows.clear();
}
