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

export const DeliveryCheckSchema = z.object({
  items: z
    .array(
      z.object({
        todo: z.string().min(1).max(300).describe("The to-do text, copied exactly"),
        status: z.enum(["met", "missing", "unclear"]),
        reason: z
          .string()
          .min(1)
          .max(300)
          .describe("What in the delivery shows this (or what's absent)"),
      }),
    )
    .max(25),
  summary: z.string().max(400).describe("One or two plain sentences for the client"),
});
export type DeliveryCheckOutput = z.infer<typeof DeliveryCheckSchema>;

export interface CheckDeliveryInput {
  milestoneTitle: string;
  todos: string[];
  note: string;
  files: Array<{ name: string; mime: string; sizeBytes: number }>;
  /** Small unwatermarked thumbnails of image files (never the originals). */
  thumbnails: ImageInput[];
}

export const ScopeResultSchema = z.object({
  inScope: z.boolean(),
  reason: z.string().min(1).max(300),
  suggestedAddon: z
    .object({
      title: z.string().min(1).max(120),
      todos: z.array(z.string().min(1).max(200)).min(1).max(10),
      weight: z
        .int()
        .min(1)
        .max(100)
        .describe("Workload compared with the WHOLE original deal (100 = as much work again)"),
      dueInDays: z.int().min(1).max(21),
    })
    .nullable()
    .describe("Only when out of scope: a paid add-on covering the extra work, else null"),
});
export type ScopeResult = z.infer<typeof ScopeResultSchema>;

export interface ScopeInput {
  dealTitle: string;
  milestones: Array<{ title: string; todos: string[] }>;
  message: string;
}

export interface AIProvider {
  readonly name: string;
  buildPlan(i: BuildPlanInput): Promise<PlanDraft>;
  summarizeChanges(i: SummarizeChangesInput): Promise<ChangeSummary>;
  checkDelivery(i: CheckDeliveryInput): Promise<DeliveryCheckOutput>;
  classifyRequest(i: ScopeInput): Promise<ScopeResult>;
}

export interface AIProviderOptions {
  onRun?: (run: AiRunLog) => void | Promise<void>;
}
