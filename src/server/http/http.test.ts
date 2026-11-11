import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// auth.ts imports the Supabase repo module; stub it so these tests stay offline.
vi.mock("../repos/supabase", () => ({
  userClientFromToken: vi.fn(),
  userClientFromCookies: vi.fn(),
}));

import { parseBearer } from "./auth";
import { AppError, toErrorBody } from "./errors";
import { getRequestId } from "./request-id";
import { readJson, route } from "./route";

describe("toErrorBody", () => {
  it("maps AppError to its status and code", () => {
    const { status, body } = toErrorBody(new AppError("CONFLICT", "Already captured"), "req-1");
    expect(status).toBe(409);
    expect(body).toEqual({
      error: { code: "CONFLICT", message: "Already captured" },
      requestId: "req-1",
    });
  });

  it("maps zod errors to VALIDATION with field paths", () => {
    const err = z.object({ a: z.string() }).safeParse({ a: 1 }).error;
    const { status, body } = toErrorBody(err, "req-2");
    expect(status).toBe(422);
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details).toEqual([{ path: "a", message: expect.any(String) }]);
  });

  it("hides internals of unknown errors", () => {
    const { status, body } = toErrorBody(new Error("db password is hunter2"), "req-3");
    expect(status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });
});

describe("getRequestId", () => {
  it("reuses a safe incoming id and replaces unsafe ones", () => {
    expect(getRequestId(new Headers({ "x-request-id": "abc-12345" }))).toBe("abc-12345");
    expect(getRequestId(new Headers({ "x-request-id": "<script>" }))).toMatch(/^[0-9a-f-]{36}$/);
    expect(getRequestId(new Headers())).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("parseBearer", () => {
  it("extracts bearer tokens only", () => {
    expect(parseBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearer("bearer  tok")).toBe("tok");
    expect(parseBearer("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});

describe("route()", () => {
  const ctx = { params: Promise.resolve({}) };

  it("returns JSON with a request id and no-store", async () => {
    const res = await route(async () => ({ ok: true }))(new Request("http://x/"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("x-request-id")).toBeTruthy();
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("turns thrown errors into the error shape with the same request id", async () => {
    const handler = route(async () => {
      throw new AppError("UNAUTHENTICATED", "Sign in to continue.");
    });
    const res = await handler(
      new Request("http://x/", { headers: { "x-request-id": "trace-0001" } }),
      ctx,
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Sign in to continue." },
      requestId: "trace-0001",
    });
  });

  it("rejects malformed JSON bodies with BAD_REQUEST", async () => {
    const handler = route(async (req) => readJson(req));
    const res = await handler(new Request("http://x/", { method: "POST", body: "{nope" }), ctx);
    expect(res.status).toBe(400);
  });
});
