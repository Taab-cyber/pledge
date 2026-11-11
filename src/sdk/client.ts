// Small typed client for /api/v1. Every response is validated against its zod schema.
import { z } from "zod";
import {
  AddonResultSchema,
  AppConfigSchema,
  CheckDeliveryResultSchema,
  DeliverResultSchema,
  DemoLoginResultSchema,
  MessageResultSchema,
  RequestChangesResultSchema,
  UploadSlotsResultSchema,
  ApprovePlanResultSchema,
  DealDtoSchema,
  DealListSchema,
  HoldOrderResultSchema,
  MilestoneActionResultSchema,
  RefundResultSchema,
  ErrorBodySchema,
  MeResponseSchema,
  PublicPlanSchema,
  ShareResultSchema,
  SuggestChangeResultSchema,
  type CreateDealInput,
  type EditPlanInput,
  type UpdateMeInput,
} from "./schemas";

export interface DeliveryPayload {
  note: string;
  files: Array<{ path: string; name: string }>;
}
export interface AddonPayload {
  title: string;
  todos: string[];
  amountMajor: string;
  dueInDays: number;
  actionId?: string;
}
const FileUrlSchema = z.object({ url: z.string() });
const TodoResultSchema = z.object({ id: z.string(), done: z.boolean() });
const AgentResultSchema = z.object({ status: z.enum(["executed", "dismissed"]) }).passthrough();
const FastForwardResultSchema = z
  .object({
    skipped: z.enum(["release", "renewal"]),
    milestones: z.number(),
    tick: z
      .object({
        released: z.array(z.string()),
        renewed: z.array(z.string()),
        atRisk: z.array(z.string()),
      })
      .passthrough(),
  })
  .passthrough();

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
    config: () => call("GET", "/config", AppConfigSchema),
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
      message: (id: string, text: string) =>
        call("POST", `/deals/${encodeURIComponent(id)}/messages`, MessageResultSchema, { text }),
      proposeAddon: (id: string, input: AddonPayload) =>
        call("POST", `/deals/${encodeURIComponent(id)}/addons`, AddonResultSchema, input),
      share: (id: string) =>
        call("POST", `/deals/${encodeURIComponent(id)}/share`, ShareResultSchema),
    },
    milestones: {
      /** Client: create the PayPal order; pass the id to the PayPal buttons' createOrder. */
      createHold: (id: string) =>
        call("POST", `/milestones/${encodeURIComponent(id)}/hold`, HoldOrderResultSchema),
      /** Client: call from the PayPal buttons' onApprove; the server authorizes with PayPal. */
      confirmHold: (id: string, orderId: string) =>
        call(
          "POST",
          `/milestones/${encodeURIComponent(id)}/hold/confirm`,
          MilestoneActionResultSchema,
          {
            orderId,
          },
        ),
      uploadSlots: (id: string, files: Array<{ name: string; size: number }>) =>
        call(
          "POST",
          `/milestones/${encodeURIComponent(id)}/delivery/uploads`,
          UploadSlotsResultSchema,
          {
            files,
          },
        ),
      checkDelivery: (id: string, input: DeliveryPayload) =>
        call(
          "POST",
          `/milestones/${encodeURIComponent(id)}/delivery/check`,
          CheckDeliveryResultSchema,
          input,
        ),
      deliver: (id: string, input: DeliveryPayload) =>
        call("POST", `/milestones/${encodeURIComponent(id)}/deliver`, DeliverResultSchema, input),
      fileUrl: (id: string, index: number, kind: "original" | "preview" = "original") =>
        call(
          "GET",
          `/milestones/${encodeURIComponent(id)}/files/${index}?kind=${kind}`,
          FileUrlSchema,
        ),
      requestChanges: (id: string, text: string) =>
        call(
          "POST",
          `/milestones/${encodeURIComponent(id)}/request-changes`,
          RequestChangesResultSchema,
          {
            text,
          },
        ),
      respondToAddon: (id: string, accept: boolean) =>
        call("POST", `/milestones/${encodeURIComponent(id)}/addon`, MilestoneActionResultSchema, {
          accept,
        }),
      release: (id: string, opts: { simulateDecline?: boolean } = {}) =>
        call(
          "POST",
          `/milestones/${encodeURIComponent(id)}/release`,
          MilestoneActionResultSchema,
          opts,
        ),
      resecure: (id: string) =>
        call("POST", `/milestones/${encodeURIComponent(id)}/resecure`, MilestoneActionResultSchema),
      cancel: (id: string) =>
        call("POST", `/milestones/${encodeURIComponent(id)}/cancel`, MilestoneActionResultSchema),
    },
    todos: {
      set: (id: string, done: boolean) =>
        call("PATCH", `/todos/${encodeURIComponent(id)}`, TodoResultSchema, { done }),
    },
    agent: {
      approve: (id: string) =>
        call("POST", `/agent-actions/${encodeURIComponent(id)}/approve`, AgentResultSchema),
      dismiss: (id: string) =>
        call("POST", `/agent-actions/${encodeURIComponent(id)}/dismiss`, AgentResultSchema),
    },
    demo: {
      login: (as: "freelancer" | "client") =>
        call("POST", "/demo/login", DemoLoginResultSchema, { as }),
      deliver: (milestoneId: string, skipLast = false) =>
        call("POST", "/demo/deliver", DeliverResultSchema, { milestoneId, skipLast }),
      fastForward: (dealId: string, what: "release" | "renewal") =>
        call("POST", "/demo/fast-forward", FastForwardResultSchema, { dealId, what }),
      refund: (milestoneId: string) =>
        call("POST", "/demo/refund", RefundResultSchema, { milestoneId }),
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
