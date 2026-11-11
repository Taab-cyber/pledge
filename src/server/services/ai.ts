// AI access for services: per-user hourly limit (counted from ai_runs) and logging of every call.
import { LIMITS } from "../domain/limits";
import { AppError } from "../http/errors";
import { getAIProvider, type AIProvider } from "../providers/ai";
import { adminClient } from "../repos/supabase";

export async function assertAiQuota(userId: string, now = new Date()): Promise<void> {
  const since = new Date(now.getTime() - 3_600_000).toISOString();
  const { count, error } = await adminClient()
    .from("ai_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if (error) throw new AppError("INTERNAL", "Could not check AI usage.");
  if ((count ?? 0) >= LIMITS.aiCallsPerHour) {
    throw new AppError("RATE_LIMITED", "You've hit the hourly AI limit. Try again later.");
  }
}

/** Provider whose every call is written to ai_runs (user_id null for anonymous client calls). */
export function aiFor(userId: string | null): AIProvider {
  return getAIProvider({
    onRun: async (run) => {
      const { error } = await adminClient().from("ai_runs").insert({
        user_id: userId,
        task: run.task,
        model: run.model,
        input_tokens: run.inputTokens,
        output_tokens: run.outputTokens,
        latency_ms: run.latencyMs,
        ok: run.ok,
      });
      if (error) console.error("ai_runs insert failed", error.code);
    },
  });
}
