// Money flow against the real database with the mock PayPal provider (no sandbox calls).
// Run: npm run test:integration
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.RUN_INTEGRATION === "1" || process.env.npm_lifecycle_event === "test:integration";
if (enabled) {
  process.loadEnvFile(".env.local");
  process.env.AI_PROVIDER = "mock"; // plan building isn't under test here
  process.env.DEMO_MODE = "true";
}

describe.skipIf(!enabled)("payments flow (integration, mock PayPal)", () => {
  type AuthContext = import("../http/auth").AuthContext;
  let deals: typeof import("./deals");
  let pub: typeof import("./public-plan");
  let pay: typeof import("./payments");
  let del: typeof import("./deliveries");
  let hooks: typeof import("./webhooks");
  let supa: typeof import("../repos/supabase");
  let mock: ReturnType<typeof import("../providers/payments/mock/mock").createMockPaymentProvider>;
  const ids: string[] = [];
  const webhookIds: string[] = [];
  let freelancer: AuthContext;
  let client: AuthContext;
  let dealId = "";

  const admin = () => supa.adminClient();
  const milestones = async () => {
    const { data } = await admin()
      .from("milestones")
      .select(
        "id, position, status, authorization_id, capture_id, capture_claim, capture_attempts, release_at, gross_minor, fee_minor, net_minor, last_payment_error",
      )
      .eq("deal_id", dealId)
      .order("position");
    return data as Array<Record<string, unknown> & { id: string; status: string }>;
  };
  const dealStatus = async () =>
    (
      (await admin().from("deals").select("status").eq("id", dealId).single()).data as {
        status: string;
      }
    ).status;

  beforeAll(async () => {
    deals = await import("./deals");
    pub = await import("./public-plan");
    pay = await import("./payments");
    del = await import("./deliveries");
    hooks = await import("./webhooks");
    supa = await import("../repos/supabase");
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
        email: `it-pay-${who}-${stamp}@pledge.test`,
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
    await admin()
      .from("profiles")
      .update({ full_name: "Daniel (test)", country_code: "GB" })
      .eq("id", ids[1]!);
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
        chatText: "logo + brand kit, £400",
      },
      [],
    );
    dealId = created.id;
    await deals.buildPlan(freelancer, dealId); // mock plan: 3 milestones £120 / £180 / £100
    const share = await deals.shareDeal(freelancer, dealId);
    const token = share.shareUrl.split("/p/")[1]!;
    await pub.approvePlan(client, token, { version: 1, consent: true }, "vitest");
  });

  afterAll(async () => {
    if (!supa) return;
    const { setPaymentProviderForTests } = await import("../providers/payments");
    setPaymentProviderForTests(null);
    if (webhookIds.length) await admin().from("webhook_events").delete().in("id", webhookIds);
    for (const id of ids) {
      const { error } = await admin().auth.admin.deleteUser(id);
      if (error) throw new Error(`cleanup failed: ${error.message}`);
    }
    await admin().from("ai_runs").delete().eq("model", "mock").is("user_id", null);
  });

  it("holds, delivers and releases exactly once when approval and auto-release race", async () => {
    const [m1] = await milestones();
    expect(m1!.status).toBe("awaiting_hold");

    // Only the client can secure; the hold needs the order the server created.
    await expect(pay.createHoldOrder(freelancer, m1!.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const { orderId } = await pay.createHoldOrder(client, m1!.id);
    await expect(pay.confirmHold(client, m1!.id, "ORDER-forged")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await pay.confirmHold(client, m1!.id, orderId)).toEqual({ status: "held" });
    expect(await pay.confirmHold(client, m1!.id, orderId)).toEqual({ status: "held" }); // repeat is harmless
    expect(await dealStatus()).toBe("active");
    expect(mock.state.calls.confirmHold).toBe(1);

    // Nothing can be released before delivery.
    await expect(
      pay.releaseMilestone({ kind: "client", auth: client }, m1!.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // Delivery with consent → release_at = +72h.
    const delivered = await del.deliverWork(freelancer, m1!.id, {
      note: "Concepts attached",
      files: [],
    });
    expect(delivered.status).toBe("delivered");
    expect(Date.parse(delivered.releaseAt!) - Date.now()).toBeGreaterThan(71 * 3_600_000);

    // Make auto-release due, then race it against the client's approval.
    await admin()
      .from("milestones")
      .update({ release_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", m1!.id);
    mock.state.captureDelayMs = 300;
    const results = await Promise.allSettled([
      pay.releaseMilestone({ kind: "client", auth: client }, m1!.id),
      pay.releaseMilestone({ kind: "auto" }, m1!.id),
      pay.releaseMilestone({ kind: "client", auth: client }, m1!.id),
    ]);
    mock.state.captureDelayMs = 0;
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason.code),
    ).toEqual(["CONFLICT", "CONFLICT"]);
    expect(mock.state.calls.capture).toBe(1);
    expect(mock.state.captures.size).toBe(1);

    const [after1, m2] = await milestones();
    expect(after1).toMatchObject({
      status: "released",
      gross_minor: 12000,
      fee_minor: 600,
      net_minor: 11400,
    });
    expect(after1!.capture_id).toBeTruthy();
    expect(m2!.status).toBe("awaiting_hold"); // next milestone opens

    // The payout shows in the deal view with PayPal's figures and an INR estimate for Riya.
    const view = await deals.getDeal(freelancer, dealId);
    expect(view.milestones[0]!.payment.payout).toMatchObject({
      gross: { formatted: "£120.00" },
      net: { formatted: "£114.00" },
    });
    expect(view.estimates.freelancer).toMatchObject({
      amount: { currency: "INR", formatted: "₹49,868.00" },
      note: "estimate, final rate set by PayPal",
    });
    expect(view.estimates.client).toBeNull(); // client pays in their own currency

    // Releasing again is refused.
    await expect(
      pay.releaseMilestone({ kind: "client", auth: client }, m1!.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("keeps the milestone delivered after a declined capture, then retries with a new request id", async () => {
    const [, m2] = await milestones();
    const { orderId } = await pay.createHoldOrder(client, m2!.id);
    await pay.confirmHold(client, m2!.id, orderId);
    await del.deliverWork(freelancer, m2!.id, { note: "Final logo", files: [] });

    mock.state.failNext.capture = "DECLINED";
    await expect(
      pay.releaseMilestone({ kind: "client", auth: client }, m2!.id),
    ).rejects.toMatchObject({
      code: "PAYMENT_FAILED",
      details: { paypal: { code: "DECLINED" } },
    });
    const [, failed] = await milestones();
    expect(failed).toMatchObject({ status: "delivered", capture_claim: null, capture_attempts: 1 });
    expect(failed!.last_payment_error).toMatchObject({ action: "capture", code: "DECLINED" });

    const before = mock.state.calls.capture!;
    expect(await pay.releaseMilestone({ kind: "client", auth: client }, m2!.id)).toMatchObject({
      status: "released",
    });
    expect(mock.state.calls.capture).toBe(before + 1);
    expect([...mock.state.byKey.keys()].filter((k) => k.startsWith(`capture:${m2!.id}`))).toEqual([
      `capture:${m2!.id}:capture:1`,
      `capture:${m2!.id}:capture:2`,
    ]);
  });

  it("marks a hold at risk when renewal fails (no auto-release), and recovers on renewal", async () => {
    const [, , m3] = await milestones();
    const { orderId } = await pay.createHoldOrder(client, m3!.id);
    await pay.confirmHold(client, m3!.id, orderId);
    await del.deliverWork(freelancer, m3!.id, { note: "Brand kit", files: [] });

    mock.state.failNext.renewHold = "REAUTH_NOT_ALLOWED";
    const failed = await pay.renewHold(m3!.id);
    expect(failed).toMatchObject({ ok: false, status: "hold_at_risk" });
    const [, , atRisk] = await milestones();
    expect(atRisk).toMatchObject({ status: "hold_at_risk", release_at: null });
    await expect(pay.releaseMilestone({ kind: "auto" }, m3!.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const renewed = await pay.renewHold(m3!.id);
    expect(renewed).toMatchObject({ ok: true, status: "held" });
    const [, , back] = await milestones();
    expect(back!.authorization_id).not.toBe(atRisk!.authorization_id);
  });

  it("applies verified webhooks once and completes the deal", async () => {
    const [, , m3] = await milestones();
    const event = {
      id: `WH-TEST-${Date.now()}`,
      event_type: "PAYMENT.AUTHORIZATION.VOIDED",
      resource: { id: m3!.authorization_id },
    };
    webhookIds.push(event.id);
    const headers = new Headers({ "x-mock-webhook": "valid" });
    await expect(
      hooks.handlePayPalWebhook(new Headers(), JSON.stringify(event)),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await hooks.handlePayPalWebhook(headers, JSON.stringify(event))).toEqual({
      received: true,
      duplicate: false,
      outcome: "voided",
    });
    expect(await hooks.handlePayPalWebhook(headers, JSON.stringify(event))).toEqual({
      received: true,
      duplicate: true,
    });

    const statuses = (await milestones()).map((m) => m.status);
    expect(statuses).toEqual(["released", "released", "voided"]);

    // A stale capture event for a released milestone changes nothing.
    const [m1] = await milestones();
    const stale = {
      id: `WH-TEST-${Date.now()}-2`,
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: m1!.capture_id },
    };
    webhookIds.push(stale.id);
    expect(await hooks.handlePayPalWebhook(headers, JSON.stringify(stale))).toMatchObject({
      outcome: "ignored",
    });

    // Every milestone is released or voided → the deal is completed.
    expect(await dealStatus()).toBe("completed");
    const { data: events } = await admin().from("events").select("type").eq("deal_id", dealId);
    const types = (events as Array<{ type: string }>).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        "hold_placed",
        "delivered",
        "released",
        "capture_failed",
        "hold_renewal_failed",
        "hold_renewed",
        "hold_voided_by_paypal",
      ]),
    );
  });

  it("refunds a paid milestone in demo mode (freelancer only)", async () => {
    const [m1] = await milestones();
    await expect(pay.refundMilestone(client, m1!.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await pay.refundMilestone(freelancer, m1!.id)).toMatchObject({ status: "COMPLETED" });
  });
});
