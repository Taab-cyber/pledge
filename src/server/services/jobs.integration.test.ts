// Phase 6 against the real database with mock PayPal + mock AI: tick, Deal Agent, fast-forward.
// Run: npm run test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.RUN_INTEGRATION === "1" || process.env.npm_lifecycle_event === "test:integration";
if (enabled) {
  process.loadEnvFile(".env.local");
  process.env.AI_PROVIDER = "mock";
  process.env.DEMO_MODE = "true";
}

const HOUR = 3_600_000;

describe.skipIf(!enabled)("tick, Deal Agent and fast-forward (integration)", () => {
  type AuthContext = import("../http/auth").AuthContext;
  let deals: typeof import("./deals");
  let pay: typeof import("./payments");
  let del: typeof import("./deliveries");
  let jobs: typeof import("./jobs");
  let agent: typeof import("./agent");
  let demo: typeof import("./demo");
  let supa: typeof import("../repos/supabase");
  let mock: ReturnType<typeof import("../providers/payments/mock/mock").createMockPaymentProvider>;
  const ids: string[] = [];
  let freelancer: AuthContext;
  let client: AuthContext;
  let dealId = "";
  let ms: Array<{ id: string; title: string }> = [];

  const admin = () => supa.adminClient();
  const row = async (id: string) =>
    (
      await admin()
        .from("milestones")
        .select("status, release_at, authorization_id, capture_id")
        .eq("id", id)
        .single()
    ).data as {
      status: string;
      release_at: string | null;
      authorization_id: string | null;
      capture_id: string | null;
    };
  const actions = async (kind: string) =>
    ((
      await admin()
        .from("agent_actions")
        .select("id, kind, status, milestone_id, detail")
        .eq("deal_id", dealId)
        .eq("kind", kind)
    ).data ?? []) as Array<{
      id: string;
      status: string;
      milestone_id: string;
      detail: Record<string, unknown>;
    }>;
  const hold = async (id: string) => {
    const { orderId } = await pay.createHoldOrder(client, id);
    await pay.confirmHold(client, id, orderId);
  };

  beforeAll(async () => {
    deals = await import("./deals");
    pay = await import("./payments");
    del = await import("./deliveries");
    jobs = await import("./jobs");
    agent = await import("./agent");
    demo = await import("./demo");
    supa = await import("../repos/supabase");
    const pub = await import("./public-plan");
    const { createMockPaymentProvider } = await import("../providers/payments/mock/mock");
    const { setPaymentProviderForTests } = await import("../providers/payments");
    const { setFxProviderForTests } = await import("../providers/fx");
    const { createMockFxProvider } = await import("../providers/fx/mock/mock");
    mock = createMockPaymentProvider();
    setPaymentProviderForTests(mock.provider);
    setFxProviderForTests(createMockFxProvider());

    const stamp = Date.now();
    for (const who of ["freelancer", "client"]) {
      const { data, error } = await admin().auth.admin.createUser({
        email: `it-job-${who}-${stamp}@pledge.test`,
        email_confirm: true,
      });
      if (error) throw error;
      ids.push(data.user.id);
    }
    await admin()
      .from("profiles")
      .update({
        role: "freelancer",
        full_name: "Riya (test)",
        country_code: "IN",
        paypal_email: "riya@business.example.com",
      })
      .eq("id", ids[0]!);
    await admin().from("profiles").update({ country_code: "GB" }).eq("id", ids[1]!);
    freelancer = { userId: ids[0]!, email: null, db: admin() };
    client = { userId: ids[1]!, email: null, db: admin() };
    const created = await deals.createDeal(
      freelancer,
      {
        clientName: "Daniel",
        clientWhatsapp: "+447700900123",
        clientCountry: "GB",
        currency: "GBP",
        totalMajor: "400",
        chatText: "logo",
      },
      [],
    );
    dealId = created.id;
    await deals.buildPlan(freelancer, dealId);
    const share = await deals.shareDeal(freelancer, dealId);
    await pub.approvePlan(
      client,
      share.shareUrl.split("/p/")[1]!,
      { version: 1, consent: true },
      "vitest",
    );
    ms = (await deals.getDeal(freelancer, dealId)).milestones.map((m) => ({
      id: m.id,
      title: m.title,
    }));
  });

  afterAll(async () => {
    if (!supa) return;
    const { setPaymentProviderForTests } = await import("../providers/payments");
    setPaymentProviderForTests(null);
    for (const id of ids) {
      const { error } = await admin().auth.admin.deleteUser(id);
      if (error) throw new Error(`cleanup failed: ${error.message}`);
    }
  });

  it("reminds once, then auto-releases exactly once when two ticks race", async () => {
    const m1 = ms[0]!.id;
    await hold(m1);
    await del.deliverWork(freelancer, m1, { note: "concepts", files: [] });
    const releaseAt = Date.parse((await row(m1)).release_at!);

    expect(await jobs.runTick({ dealId })).toMatchObject({ released: [], reminders: 0 }); // 72 h away
    const nearly = new Date(releaseAt - 2 * HOUR);
    expect((await jobs.runTick({ dealId, now: nearly })).reminders).toBe(1);
    expect((await jobs.runTick({ dealId, now: nearly })).reminders).toBe(0); // no duplicate reminder
    expect(await actions("reminder_release")).toHaveLength(1);

    mock.state.captureDelayMs = 250;
    const later = new Date(releaseAt + HOUR);
    const [a, b] = await Promise.all([
      jobs.runTick({ dealId, now: later }),
      jobs.runTick({ dealId, now: later }),
    ]);
    mock.state.captureDelayMs = 0;
    expect([...a.released, ...b.released]).toEqual([m1]);
    // The losing tick either saw CONFLICT (skipped) or found nothing left to do; never a second capture.
    expect([...a.skipped, ...b.skipped].length).toBeLessThanOrEqual(1);
    expect(mock.state.calls.capture).toBe(1);
    expect((await row(m1)).status).toBe("released");
    expect(await actions("auto_released")).toMatchObject([{ status: "auto_executed" }]);
  });

  it("never auto-releases without a release time (no consent)", async () => {
    const m2 = ms[1]!.id;
    await hold(m2);
    await del.deliverWork(freelancer, m2, { note: "final logo", files: [] });
    await admin().from("milestones").update({ release_at: null }).eq("id", m2); // as if no consent
    const res = await jobs.runTick({ dealId, now: new Date(Date.now() + 1000 * HOUR) });
    expect(res.released).not.toContain(m2);
    expect((await row(m2)).status).toBe("delivered");
  });

  it("renews holds after the honor period, and flags + re-secures a failed renewal", async () => {
    const m2 = ms[1]!.id;
    const before = (await row(m2)).authorization_id;
    await admin()
      .from("milestones")
      .update({ honor_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", m2);
    const ok = await jobs.runTick({ dealId });
    expect(ok.renewed).toEqual([m2]);
    expect((await row(m2)).authorization_id).not.toBe(before);
    // The "no consent" test above already jumped 1000 h ahead, which renewed this hold once too.
    const renewedRows = await actions("hold_renewed");
    expect(renewedRows.length).toBeGreaterThanOrEqual(1);
    expect(renewedRows.every((r) => r.status === "auto_executed" && r.milestone_id === m2)).toBe(
      true,
    );

    await admin()
      .from("milestones")
      .update({ honor_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", m2);
    mock.state.failNext.renewHold = "REAUTH_NOT_ALLOWED";
    const bad = await jobs.runTick({ dealId });
    expect(bad.atRisk).toEqual([m2]);
    expect(await row(m2)).toMatchObject({ status: "hold_at_risk", release_at: null });
    const [resecure] = await actions("resecure");
    expect(resecure).toMatchObject({ status: "proposed", milestone_id: m2 });
    expect(String(resecure!.detail.noticed)).toContain("REAUTH_NOT_ALLOWED");

    await expect(agent.approveAgentAction(freelancer, resecure!.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const twice = await Promise.allSettled([
      agent.approveAgentAction(client, resecure!.id),
      agent.approveAgentAction(client, resecure!.id),
    ]);
    expect(twice.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await row(m2)).status).toBe("awaiting_hold");
    expect((await actions("resecure"))[0]!.status).toBe("executed");
    await hold(m2); // fresh hold works
    expect((await row(m2)).status).toBe("held");
  });

  it("lets the client approve the agent's release proposal (real capture path), and dismiss others", async () => {
    const m2 = ms[1]!.id;
    // Mock check passes when every to-do has a word in the note/file names.
    await del.deliverWork(freelancer, m2, {
      note: "Final logo SVG PNG, dark-background version, favicon 512x512",
      files: [],
    });
    const [proposal] = (await actions("release_payment")).filter((a) => a.milestone_id === m2);
    expect(proposal).toBeTruthy();
    await expect(agent.approveAgentAction(freelancer, proposal!.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await agent.approveAgentAction(client, proposal!.id)).toMatchObject({
      status: "executed",
    });
    expect((await row(m2)).status).toBe("released");
    await expect(agent.approveAgentAction(client, proposal!.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const [reminder] = await actions("reminder_release");
    await expect(agent.approveAgentAction(client, reminder!.id)).rejects.toMatchObject({
      code: "CONFLICT",
    }); // informational
  });

  it("fast-forwards time for the demo and the tick makes the release", async () => {
    const m3 = ms[2]!.id;
    await expect(demo.fastForward(client, dealId, "release")).rejects.toMatchObject({
      code: "CONFLICT",
    }); // nothing delivered
    await hold(m3);
    await del.deliverWork(freelancer, m3, { note: "brand kit", files: [] });
    const r = await demo.fastForward(client, dealId, "release");
    expect(r).toMatchObject({ skipped: "release", milestones: 1, tick: { released: [m3] } });
    expect((await row(m3)).status).toBe("released");
    const { data } = await admin().from("deals").select("status").eq("id", dealId).single();
    expect((data as { status: string }).status).toBe("completed");

    const stranger = { userId: "00000000-0000-4000-8000-000000000999", email: null, db: admin() };
    await expect(demo.fastForward(stranger, dealId, "release")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
