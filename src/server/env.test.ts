import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("applies safe defaults when nothing is set", () => {
    const env = parseServerEnv({});
    expect(env.AI_PROVIDER).toBe("mock");
    expect(env.PAYPAL_ENV).toBe("sandbox");
    expect(env.DEMO_MODE).toBe(false);
    expect(env.APP_URL).toBe("http://localhost:3000");
  });

  it("treats empty strings as unset", () => {
    const env = parseServerEnv({ SUPABASE_SERVICE_ROLE_KEY: "", DEMO_MODE: "", AI_PROVIDER: "" });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(env.DEMO_MODE).toBe(false);
    expect(env.AI_PROVIDER).toBe("mock");
  });

  it("parses DEMO_MODE as a boolean", () => {
    expect(parseServerEnv({ DEMO_MODE: "true" }).DEMO_MODE).toBe(true);
    expect(parseServerEnv({ DEMO_MODE: "false" }).DEMO_MODE).toBe(false);
  });

  it("only allows the PayPal sandbox", () => {
    expect(() => parseServerEnv({ PAYPAL_ENV: "live" })).toThrow(/PAYPAL_ENV/);
  });

  it("requires an Anthropic key when the Anthropic provider is chosen", () => {
    expect(() => parseServerEnv({ AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(parseServerEnv({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "k" }).AI_PROVIDER).toBe(
      "anthropic",
    );
  });

  it("rejects a short jobs secret and a malformed URL", () => {
    expect(() => parseServerEnv({ JOBS_SECRET: "short" })).toThrow(/JOBS_SECRET/);
    expect(() => parseServerEnv({ NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });
});
