// Small typed client for /api/v1. Every response is validated against its zod schema.
import type { z } from "zod";
import { ErrorBodySchema, MeResponseSchema, type UpdateMeInput } from "./schemas";

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
    if (body !== undefined) headers["content-type"] = "application/json";

    const res = await doFetch(`${base}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
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
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
