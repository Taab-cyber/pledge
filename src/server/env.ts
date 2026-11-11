import { z } from "zod";

// Treat empty strings from .env files as "not set".
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess(blankToUndefined, schema.optional());

// Vars needed by later phases are optional here; services call requireEnv() for the ones they use.
const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.preprocess(blankToUndefined, z.url().default("http://localhost:3000")),

    NEXT_PUBLIC_SUPABASE_URL: optional(z.url()),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optional(z.string()),
    SUPABASE_SERVICE_ROLE_KEY: optional(z.string()),

    AI_PROVIDER: z.preprocess(blankToUndefined, z.enum(["gemini", "mock"]).default("mock")),
    GEMINI_API_KEY: optional(z.string()),
    // Vision-capable model for plans; fast model for checks. Free-tier models (Nov 2026).
    GEMINI_MODEL: z.preprocess(blankToUndefined, z.string().default("gemini-3.6-flash")),
    GEMINI_FAST_MODEL: z.preprocess(blankToUndefined, z.string().default("gemini-3.5-flash-lite")),

    PAYPAL_ENV: z.preprocess(blankToUndefined, z.literal("sandbox").default("sandbox")),
    PAYPAL_CLIENT_ID: optional(z.string()),
    PAYPAL_CLIENT_SECRET: optional(z.string()),
    NEXT_PUBLIC_PAYPAL_CLIENT_ID: optional(z.string()),
    PAYPAL_WEBHOOK_ID: optional(z.string()),

    JOBS_SECRET: optional(z.string().min(32, "JOBS_SECRET must be at least 32 characters")),
    DEMO_MODE: z.preprocess(blankToUndefined, z.stringbool().default(false)),
    // Judge access ("Try as freelancer / client"): seeded demo accounts, used only when DEMO_MODE=true.
    DEMO_FREELANCER_EMAIL: optional(z.email()),
    DEMO_CLIENT_EMAIL: optional(z.email()),
    DEMO_PASSWORD: optional(z.string().min(12)),
    /** Share link of the seeded demo plan (written by npm run demo:prepare), shown to the demo client. */
    DEMO_SHARE_URL: optional(z.url()),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "gemini" && !env.GEMINI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "GEMINI_API_KEY is required when AI_PROVIDER=gemini",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

let cached: ServerEnv | undefined;

/** Validated server env. Parsed once; called at boot from src/instrumentation.ts. */
export function env(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}

/** Returns a var that a feature needs, or throws a clear error naming it. */
export function requireEnv<K extends keyof ServerEnv>(key: K): NonNullable<ServerEnv[K]> {
  const value = env()[key];
  if (value === undefined || value === null) {
    throw new Error(`Missing environment variable ${String(key)}. See .env.example.`);
  }
  return value as NonNullable<ServerEnv[K]>;
}
