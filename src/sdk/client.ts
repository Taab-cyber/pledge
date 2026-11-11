// Small typed client for /api/v1. Every response is validated against its zod schema.
import type { z } from "zod";
import {
  ApprovePlanResultSchema,
  DealDtoSchema,
  DealListSchema,
  ErrorBodySchema,
  MeResponseSchema,
  PublicPlanSchema,
  ShareResultSchema,
  SuggestChangeResultSchema,
  type CreateDealInput,
  type EditPlanInput,
  type UpdateMeInput,
} from "./schemas";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClientOptions {
  baseUrl?: string;
  /** Returns the Supabase access token, or null to rely on the cookie session. */
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof fetch;
}

export function createApiClient(opts: ApiClientOptions = {}) {
  const base = opts.baseUrl ?? "";
  const doFetch = opts.fetch ?? fetch;

  async function call<S extends z.ZodType>(
    method: string,
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<z.infer<S>> {
    const headers: Record<string, string> = { accept: "application/json" };
    const token = await opts.getAccessToken?.();
    if (token) headers.authorization = `Bearer ${token}`;
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    if (body !== undefined && !isForm) headers["content-type"] = "application/json";

    const res = await doFetch(`${base}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
      credentials: "same-origin",
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ErrorBodySchema.safeParse(json);
      if (parsed.success) {
        const { code, message, details } = parsed.data.error;
        throw new ApiError(res.status, code, message, details, parsed.data.requestId);
      }
      throw new ApiError(res.status, "INTERNAL", `Request failed (${res.status}).`);
    }
    return schema.parse(json);
  }

  return {
    me: {
      get: () => call("GET", "/me", MeResponseSchema),
      update: (input: UpdateMeInput) => call("PATCH", "/me", MeResponseSchema, input),
    },
    deals: {
      list: () => call("GET", "/deals", DealListSchema),
      get: (id: string) => call("GET", `/deals/${encodeURIComponent(id)}`, DealDtoSchema),
      /** Screenshots are sent as multipart; without them the body is plain JSON. */
      create: (input: CreateDealInput, screenshots: Blob[] = []) => {
        if (screenshots.length === 0) return call("POST", "/deals", DealDtoSchema, input);
        const form = new FormData();
        form.set("data", JSON.stringify(input));
        screenshots.forEach((s, i) =>
          form.append("screenshots", s, s instanceof File ? s.name : `screenshot-${i + 1}`),
        );
        return call("POST", "/deals", DealDtoSchema, form);
      },
      buildPlan: (id: string) =>
        call("POST", `/deals/${encodeURIComponent(id)}/plan`, DealDtoSchema),
      editPlan: (id: string, input: EditPlanInput) =>
        call("PUT", `/deals/${encodeURIComponent(id)}/plan`, DealDtoSchema, input),
      share: (id: string) =>
        call("POST", `/deals/${encodeURIComponent(id)}/share`, ShareResultSchema),
    },
    publicPlans: {
      get: (token: string) =>
        call("GET", `/public/plans/${encodeURIComponent(token)}`, PublicPlanSchema),
      suggestChange: (token: string, text: string) =>
        call(
          "POST",
          `/public/plans/${encodeURIComponent(token)}/changes`,
          SuggestChangeResultSchema,
          { text },
        ),
      approve: (token: string, version: number) =>
        call(
          "POST",
          `/public/plans/${encodeURIComponent(token)}/approve`,
          ApprovePlanResultSchema,
          { version, consent: true },
        ),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
