import { env, requireEnv } from "../../env";
import { createGeminiProvider } from "./gemini/gemini";
import { createMockProvider } from "./mock/mock";
import type { AIProvider, AIProviderOptions } from "./types";

export function getAIProvider(opts: AIProviderOptions = {}): AIProvider {
  const e = env();
  if (e.AI_PROVIDER === "gemini") {
    return createGeminiProvider(
      {
        apiKey: requireEnv("GEMINI_API_KEY"),
        model: e.GEMINI_MODEL,
        fastModel: e.GEMINI_FAST_MODEL,
      },
      opts,
    );
  }
  return createMockProvider(opts);
}

export type * from "./types";
