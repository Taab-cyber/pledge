import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "./client";

const profile = {
  id: "5b0c6a9e-4f3e-4c1a-9b7a-2d8e1f0a3c11",
  role: null,
  full_name: null,
  profession: null,
  country_code: null,
  paypal_email: null,
  is_demo: false,
  created_at: "2026-11-11T00:00:00Z",
  updated_at: "2026-11-11T00:00:00Z",
};

describe("createApiClient", () => {
  it("sends the bearer token and validates the response", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ user: { id: profile.id, email: "a@b.co" }, profile, onboarded: false }),
    );
    const api = createApiClient({ fetch: fetchMock, getAccessToken: async () => "tok" });
    const me = await api.me.get();
    expect(me.user.email).toBe("a@b.co");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/me");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("throws ApiError with the server's code and request id", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { error: { code: "ROLE_ALREADY_SET", message: "nope" }, requestId: "r1" },
        { status: 409 },
      ),
    );
    const api = createApiClient({ fetch: fetchMock });
    await expect(api.me.update({ role: "client" })).rejects.toMatchObject({
      name: "ApiError",
      status: 409,
      code: "ROLE_ALREADY_SET",
      requestId: "r1",
    });
    expect(ApiError).toBeDefined();
  });

  it("rejects a response that doesn't match the schema", async () => {
    const api = createApiClient({ fetch: vi.fn(async () => Response.json({ user: 1 })) });
    await expect(api.me.get()).rejects.toThrow();
  });
});
