import { z } from "zod";

export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  VALIDATION: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ROLE_ALREADY_SET: 409,
  PLAN_VERSION_CHANGED: 409,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  INTERNAL: 500,
} as const;
export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
  requestId: string;
}

/** Maps any thrown value to the single API error shape. Unknown errors never leak internals. */
export function toErrorBody(err: unknown, requestId: string): { status: number; body: ErrorBody } {
  if (err instanceof AppError) {
    const error: ErrorBody["error"] = { code: err.code, message: err.message };
    if (err.details !== undefined) error.details = err.details;
    return { status: err.status, body: { error, requestId } };
  }
  if (err instanceof z.ZodError) {
    return {
      status: ERROR_STATUS.VALIDATION,
      body: {
        error: {
          code: "VALIDATION",
          message: "Some fields are invalid.",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        requestId,
      },
    };
  }
  return {
    status: ERROR_STATUS.INTERNAL,
    body: { error: { code: "INTERNAL", message: "Something went wrong." }, requestId },
  };
}
