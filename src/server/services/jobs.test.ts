import { beforeEach, describe, expect, it, vi } from "vitest";

// Offline guards: no database is touched when these refuse.
const envState = { DEMO_MODE: false, JOBS_SECRET: "s".repeat(40) as string | undefined };
vi.mock("../env", () => ({ env: () => envState, requireEnv: () => "x" }));
vi.mock("../repos/supabase", () => ({
  adminClient: () => {
    throw new Error("database must not be touched");
  },
}));
vi.mock("./jobs", async (orig) => ({
  ...(await orig()),
  runTick: vi.fn(async () => ({ released: [] })),
}));

const auth = { userId: "u", email: null, db: {} as never };

describe("demo fast-forward", () => {
  beforeEach(() => {
    envState.DEMO_MODE = false;
  });

  it("refuses to run unless DEMO_MODE is on", async () => {
    const { fastForward } = await import("./demo");
    await expect(
      fastForward(auth, "00000000-0000-4000-8000-000000000001", "release"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("POST /api/jobs/tick", () => {
  it("requires the exact jobs secret", async () => {
    const { POST } = await import("@/app/api/jobs/tick/route");
    const ctx = { params: Promise.resolve({}) };
    const call = (secret?: string) =>
      POST(
        new Request("http://x/api/jobs/tick", {
          method: "POST",
          headers: secret ? { "x-jobs-secret": secret } : {},
        }),
        ctx,
      );
    expect((await call()).status).toBe(401);
    expect((await call("wrong")).status).toBe(401);
    expect((await call("s".repeat(41))).status).toBe(401);
    const ok = await call("s".repeat(40));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ released: [] });

    envState.JOBS_SECRET = undefined; // unset secret never matches
    expect((await call("s".repeat(40))).status).toBe(401);
  });
});
