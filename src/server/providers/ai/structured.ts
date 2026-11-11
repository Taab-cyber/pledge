// Shared "call model → parse JSON → validate with zod → one retry with the errors" loop.
import { z } from "zod";
import { AppError } from "../../http/errors";
import type { AiRunLog } from "./types";

export interface ModelTurn {
  role: "user" | "model";
  text: string;
}

export interface ModelReply {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export type CallModel = (extraTurns: ModelTurn[]) => Promise<ModelReply>;

/** JSON Schema for a zod schema, in the shape structured-output APIs accept. */
export function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const out = z.toJSONSchema(schema, { target: "draft-2020-12" }) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

export async function runStructured<S extends z.ZodType>(opts: {
  task: string;
  model: string;
  schema: S;
  call: CallModel;
  onRun?: (run: AiRunLog) => void | Promise<void>;
}): Promise<z.infer<S>> {
  const extra: ModelTurn[] = [];
  let lastIssue = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    let reply: ModelReply | undefined;
    try {
      reply = await opts.call(extra);
    } catch (err) {
      await opts.onRun?.(log(opts, started, null, false));
      throw err;
    }
    const parsed = parseJson(reply.text);
    const result = parsed.ok ? opts.schema.safeParse(parsed.value) : null;
    const ok = !!result?.success;
    await opts.onRun?.(log(opts, started, reply, ok));
    if (result?.success) return result.data;

    lastIssue = parsed.ok
      ? (result?.error.issues ?? [])
          .slice(0, 10)
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ")
      : "Response was not valid JSON.";
    extra.push(
      { role: "model", text: reply.text.slice(0, 20_000) },
      {
        role: "user",
        text: `Your JSON failed validation: ${lastIssue}. Return the corrected JSON only.`,
      },
    );
  }
  throw new AppError("UPSTREAM", "The AI couldn't produce a valid result. Please try again.", {
    task: opts.task,
    issue: lastIssue,
  });
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    return { ok: false };
  }
}

function log(
  opts: { task: string; model: string },
  started: number,
  reply: ModelReply | null,
  ok: boolean,
): AiRunLog {
  return {
    task: opts.task,
    model: opts.model,
    inputTokens: reply?.inputTokens ?? null,
    outputTokens: reply?.outputTokens ?? null,
    latencyMs: Date.now() - started,
    ok,
  };
}
