// Google Gemini adapter (REST generateContent with responseJsonSchema). Server-only.
import { z } from "zod";
import { AppError } from "../../../http/errors";
import {
  BUILD_PLAN_PROMPT_VERSION,
  BUILD_PLAN_SYSTEM,
  buildPlanUserText,
} from "../prompts/build-plan";
import {
  CHECK_DELIVERY_PROMPT_VERSION,
  CHECK_DELIVERY_SYSTEM,
  checkDeliveryUserText,
} from "../prompts/check-delivery";
import {
  CLASSIFY_REQUEST_PROMPT_VERSION,
  CLASSIFY_REQUEST_SYSTEM,
  classifyRequestUserText,
} from "../prompts/classify-request";
import {
  SUMMARIZE_CHANGES_PROMPT_VERSION,
  SUMMARIZE_CHANGES_SYSTEM,
  summarizeChangesUserText,
} from "../prompts/summarize-changes";
import { jsonSchemaFor, runStructured, type ModelReply, type ModelTurn } from "../structured";
import {
  ChangeSummarySchema,
  DeliveryCheckSchema,
  PlanDraftSchema,
  ScopeResultSchema,
  type AIProvider,
  type AIProviderOptions,
  type ImageInput,
} from "../types";

const API = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  fastModel: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}

const ResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }).optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
  usageMetadata: z
    .object({
      promptTokenCount: z.number().optional(),
      candidatesTokenCount: z.number().optional(),
    })
    .optional(),
});

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

export function createGeminiProvider(cfg: GeminiConfig, opts: AIProviderOptions = {}): AIProvider {
  const doFetch = cfg.fetch ?? fetch;

  async function generate(
    model: string,
    system: string,
    userParts: Part[],
    schema: z.ZodType,
    extra: ModelTurn[],
  ): Promise<ModelReply> {
    const contents = [
      { role: "user", parts: userParts },
      ...extra.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    ];
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: jsonSchemaFor(schema),
        temperature: 0.2,
      },
    });
    let res: Response | undefined;
    // The free tier sometimes answers 500/503 ("high demand"): retry once after a short pause,
    // then fall back to the other free model (both read images) for a third try.
    const models =
      model === cfg.fastModel ? [model, model, cfg.model] : [model, model, cfg.fastModel];
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await doFetch(`${API}/${encodeURIComponent(models[attempt]!)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
          body,
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 90_000),
        });
      } catch (err) {
        if (attempt < 2) continue;
        throw new AppError("UPSTREAM", "The AI service didn't respond. Please try again.", {
          cause: err instanceof Error ? err.name : "unknown",
        });
      }
      if (res.status < 500 || attempt === 2) break;
      await new Promise((r) => setTimeout(r, cfg.retryDelayMs ?? 1500));
    }
    if (!res) throw new AppError("UPSTREAM", "The AI service didn't respond. Please try again.");
    if (res.status === 429) {
      throw new AppError(
        "RATE_LIMITED",
        "The free AI quota is used up for now. Try again in a minute.",
      );
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AppError("UPSTREAM", "The AI service returned an error.", {
        status: res.status,
        body: body.slice(0, 500),
      });
    }
    const json = ResponseSchema.parse(await res.json());
    if (json.promptFeedback?.blockReason) {
      throw new AppError("UPSTREAM", "The AI refused this input.", {
        blockReason: json.promptFeedback.blockReason,
      });
    }
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    return {
      text,
      inputTokens: json.usageMetadata?.promptTokenCount ?? null,
      outputTokens: json.usageMetadata?.candidatesTokenCount ?? null,
    };
  }

  const imagePart = (img: ImageInput): Part => ({
    inlineData: { mimeType: img.mimeType, data: img.data.toString("base64") },
  });

  return {
    name: "gemini",

    buildPlan(i) {
      const parts: Part[] = [{ text: buildPlanUserText(i) }, ...i.images.map(imagePart)];
      return runStructured({
        task: BUILD_PLAN_PROMPT_VERSION,
        model: cfg.model,
        schema: PlanDraftSchema,
        call: (extra) => generate(cfg.model, BUILD_PLAN_SYSTEM, parts, PlanDraftSchema, extra),
        onRun: opts.onRun,
      });
    },

    summarizeChanges(i) {
      const parts: Part[] = [{ text: summarizeChangesUserText(i) }];
      return runStructured({
        task: SUMMARIZE_CHANGES_PROMPT_VERSION,
        model: cfg.fastModel,
        schema: ChangeSummarySchema,
        call: (extra) =>
          generate(cfg.fastModel, SUMMARIZE_CHANGES_SYSTEM, parts, ChangeSummarySchema, extra),
        onRun: opts.onRun,
      });
    },

    checkDelivery(i) {
      // Vision model: thumbnails let it see e.g. whether a dark-background version exists.
      const parts: Part[] = [{ text: checkDeliveryUserText(i) }, ...i.thumbnails.map(imagePart)];
      return runStructured({
        task: CHECK_DELIVERY_PROMPT_VERSION,
        model: cfg.model,
        schema: DeliveryCheckSchema,
        call: (extra) =>
          generate(cfg.model, CHECK_DELIVERY_SYSTEM, parts, DeliveryCheckSchema, extra),
        onRun: opts.onRun,
      });
    },

    classifyRequest(i) {
      const parts: Part[] = [{ text: classifyRequestUserText(i) }];
      return runStructured({
        task: CLASSIFY_REQUEST_PROMPT_VERSION,
        model: cfg.fastModel,
        schema: ScopeResultSchema,
        call: (extra) =>
          generate(cfg.fastModel, CLASSIFY_REQUEST_SYSTEM, parts, ScopeResultSchema, extra),
        onRun: opts.onRun,
      });
    },
  };
}
