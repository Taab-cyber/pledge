import { AppError, toErrorBody } from "./errors";
import { getRequestId } from "./request-id";

export interface RouteContext<P> {
  requestId: string;
  params: P;
}

type NextCtx<P> = { params: Promise<P> };

/**
 * Wraps a route handler: request id, JSON response, one error shape.
 * Handlers return plain data (sent as 200 JSON) or a Response.
 */
export function route<P = Record<string, never>>(
  handler: (req: Request, ctx: RouteContext<P>) => Promise<unknown>,
) {
  return async (req: Request, nextCtx: NextCtx<P>): Promise<Response> => {
    const requestId = getRequestId(req.headers);
    let res: Response;
    try {
      const params = nextCtx?.params ? await nextCtx.params : ({} as P);
      const out = await handler(req, { requestId, params });
      res = out instanceof Response ? out : Response.json(out);
    } catch (err) {
      const { status, body } = toErrorBody(err, requestId);
      if (status >= 500) console.error(`[${requestId}]`, err);
      res = Response.json(body, { status });
    }
    res.headers.set("x-request-id", requestId);
    res.headers.set("cache-control", "no-store");
    return res;
  };
}

/** Parses a JSON body; a malformed body becomes BAD_REQUEST instead of a 500. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
}
