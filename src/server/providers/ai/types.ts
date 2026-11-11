// AI contracts. The AI only returns structured data; code decides amounts and state changes.
import { z } from "zod";

export const PlanDraftSchema = z.object({
  title: z.string().min(1).max(120).describe("Short project title, e.g. 'Logo and brand kit'"),
  summary: z.string().max(600).describe("2-3 sentences describing what was agreed"),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1).max(120),
        todos: z
          .array(z.string().min(1).max(200))
          .min(1)
          .max(12)
          .describe("Concrete, checkable deliverables for this milestone"),
        dueInDays: z
          .int()
          .min(1)
          .max(21)
          .describe("Days to finish this milestone after the client secures it"),
        weight: z.int().min(1).max(100).describe("Relative workload of this milestone, 1-100"),
        revisionsIncluded: z.int().min(0).max(5),
      }),
    )
    .min(1)
    .max(8),
  gaps: z
    .array(
      z.object({
        question: z.string().min(1).max(200),
        suggestedDefault: z.string().min(1).max(200),
      }),
    )
    .max(6)
    .describe("Things the chat did not settle, with a sensible default"),
  priceInChat: z
    .object({
      amount: z
        .string()
        .nullable()
        .describe("Price explicitly agreed in the chat as a plain number like '400', else null"),
      currency: z.string().nullable().describe("ISO-4217 code of that price, else null"),
    })
    .describe("Only what the chat literally says; never guess"),
  unreadable: z.boolean().describe("true if the screenshots/text could not be read at all"),
  confidence: z.number().min(0).max(1),
});
export type PlanDraft = z.infer<typeof PlanDraftSchema>;

export const ChangeSummarySchema = z.object({
  changes: z
    .array(z.string().min(1).max(200))
    .max(10)
    .describe("Concrete changes to the plan the client is asking for"),
});
export type ChangeSummary = z.infer<typeof ChangeSummarySchema>;

export interface ImageInput {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: Buffer;
}

export interface BuildPlanInput {
  images: ImageInput[];
  chatText?: string;
  totalMajor: string;
  currency: string;
  startDate: string; // YYYY-MM-DD
  freelancerProfession?: string;
}

export interface SummarizeChangesInput {
  note: string;
  todos: string[];
}

/** One logged model call (written to ai_runs). */
export interface AiRunLog {
  task: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  ok: boolean;
}

export interface AIProvider {
  readonly name: string;
  buildPlan(i: BuildPlanInput): Promise<PlanDraft>;
  summarizeChanges(i: SummarizeChangesInput): Promise<ChangeSummary>;
  // checkDelivery and classifyRequest arrive in Phase 5.
}

export interface AIProviderOptions {
  onRun?: (run: AiRunLog) => void | Promise<void>;
}
