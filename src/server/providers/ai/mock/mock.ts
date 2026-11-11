// Deterministic AI provider for tests and local work without a key.
import type { AIProvider, AIProviderOptions, PlanDraft } from "../types";

export const MOCK_PLAN: PlanDraft = {
  title: "Logo and brand kit",
  summary: "A new logo, a small brand kit and final source files for a coffee shop.",
  milestones: [
    {
      title: "Logo concepts",
      todos: ["3 logo concepts as PDF", "Moodboard with 2 colour directions"],
      dueInDays: 5,
      weight: 30,
      revisionsIncluded: 2,
    },
    {
      title: "Final logo",
      todos: ["Final logo in SVG and PNG", "Dark-background version", "Favicon 512x512"],
      dueInDays: 5,
      weight: 45,
      revisionsIncluded: 2,
    },
    {
      title: "Brand kit",
      todos: ["Colour palette with HEX codes", "Typography guide", "Business card design"],
      dueInDays: 4,
      weight: 25,
      revisionsIncluded: 1,
    },
  ],
  gaps: [
    {
      question: "Who owns the source files?",
      suggestedDefault: "Client gets them after final payment",
    },
  ],
  priceInChat: { amount: null, currency: null },
  unreadable: false,
  confidence: 0.8,
};

export function createMockProvider(opts: AIProviderOptions = {}): AIProvider {
  const logRun = (task: string) =>
    opts.onRun?.({ task, model: "mock", inputTokens: 0, outputTokens: 0, latencyMs: 0, ok: true });

  return {
    name: "mock",
    async buildPlan(i) {
      await logRun("build-plan@1");
      // Mirror a price written as "price: 400" in the chat text so mismatch handling can be tested.
      const price = /price:\s*(\d+(?:\.\d+)?)/i.exec(i.chatText ?? "")?.[1] ?? null;
      return {
        ...structuredClone(MOCK_PLAN),
        priceInChat: { amount: price, currency: price ? i.currency : null },
      };
    },
    async summarizeChanges(i) {
      await logRun("summarize-changes@1");
      const changes = i.note
        .split(/[.\n!?]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((s) => s.slice(0, 200));
      return { changes };
    },
  };
}
