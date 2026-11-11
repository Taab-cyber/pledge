// Phase 5 against the real database + storage, with the mock AI and mock PayPal.
// Run: npm run test:integration
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.RUN_INTEGRATION === "1" || process.env.npm_lifecycle_event === "test:integration";
if (enabled) {
  process.loadEnvFile(".env.local");
  process.env.AI_PROVIDER = "mock";
  process.env.DEMO_MODE = "true";
}

describe.skipIf(!enabled)("deliveries, scope guard and add-ons (integration)", () => {
  type AuthContext = import("../http/auth").AuthContext;
  let deals: typeof import("./deals");
  let pub: typeof import("./public-plan");
  let pay: typeof import("./payments");
  let del: typeof import("./deliveries");
  let scope: typeof import("./scope");
  let supa: typeof import("../repos/supabase");
  const ids: string[] = [];
  const storedPaths: string[] = [];
  let freelancer: AuthContext;
  let client: AuthContext;
  let dealId = "";
  let m1 = "";

  const admin = () => supa.adminClient();
  const ms = async (id: string) =>
    (await admin().from("milestones").select("*").eq("id", id).single()).data as Record<
      string,
      unknown
    >;

  /** Uploads files the way the browser does: one-time slots, straight to storage. */
  async function upload(milestoneId: string, files: Array<{ name: string; bytes: Buffer }>) {
    const { slots } = await del.createUploadSlots(
      freelancer,
      milestoneId,
      files.map((f) => ({ name: f.name, size: f.bytes.byteLength })),
    );
    for (const [i, s] of slots.entries()) {
      const { error } = await admin()
        .storage.from("deal-inputs")
        .uploadToSignedUrl(s.path, s.token, files[i]!.bytes);
      if (error) throw error;
      storedPaths.push(s.path);
    }
    return slots.map((s, i) => ({ path: s.path, name: files[i]!.name }));
  }

  const png = (color: string) =>
    sharp({ create: { width: 300, height: 200, channels: 3, background: color } })
      .png()
      .toBuffer();
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
  const svg = Buffer.from(
    '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#0B6E5B"/></svg>',
  );

  beforeAll(async () => {
    deals = await import("./deals");
    pub = await import("./public-plan");
    pay = await import("./payments");
    del = await import("./deliveries");
    scope = await import("./scope");
    supa = await import("../repos/supabase");
    const { createMockPaymentProvider } = await import("../providers/payments/mock/mock");
    const { setPaymentProviderForTests } = await import("../providers/payments");
    const { setFxProviderForTests } = await import("../providers/fx");
    const { createMockFxProvider } = await import("../providers/fx/mock/mock");
    setPaymentProviderForTests(createMockPaymentProvider().provider);
    setFxProviderForTests(createMockFxProvider());

    const stamp = Date.now();
    for (const who of ["freelancer", "client"]) {
      const { data, error } = await admin().auth.admin.createUser({
        email: `it-del-${who}-${stamp}@pledge.test`,
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
        chatText: "logo + brand kit",
      },
      [],
    );
    dealId = created.id;
    await deals.buildPlan(freelancer, dealId); // mock: "Logo concepts" £120 (to-dos: PDF concepts, moodboard)
    const share = await deals.shareDeal(freelancer, dealId);
    await pub.approvePlan(
      client,
      share.shareUrl.split("/p/")[1]!,
      { version: 1, consent: true },
      "vitest",
    );
    const view = await deals.getDeal(freelancer, dealId);
    m1 = view.milestones[0]!.id;
    const { orderId } = await pay.createHoldOrder(client, m1);
    await pay.confirmHold(client, m1, orderId);
  });

  afterAll(async () => {
    if (!supa) return;
    const { setPaymentProviderForTests } = await import("../providers/payments");
    setPaymentProviderForTests(null);
    if (dealId) {
      const { data } = await admin()
        .from("deliveries")
        .select("files")
        .in(
          "milestone_id",
          (await admin().from("milestones").select("id").eq("deal_id", dealId)).data!.map(
            (m) => (m as { id: string }).id,
          ),
        );
      for (const d of (data ?? []) as Array<{
        files: Array<{ path: string; previewPath: string | null }>;
      }>) {
        for (const f of d.files)
          storedPaths.push(f.path, ...(f.previewPath ? [f.previewPath] : []));
      }
      await admin().storage.from("deal-inputs").remove(storedPaths);
    }
    for (const id of ids) {
      const { error } = await admin().auth.admin.deleteUser(id);
      if (error) throw new Error(`cleanup failed: ${error.message}`);
    }
    await admin().from("ai_runs").delete().eq("model", "mock").is("user_id", null);
  });

  it("rejects disguised files and foreign paths", async () => {
    const disguised = await upload(m1, [
      { name: "concepts.png", bytes: Buffer.from("MZ\x90\x00 this is an exe") },
    ]);
    await expect(
      del.checkDelivery(freelancer, m1, { note: "", files: disguised }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_FILE" });
    await expect(
      del.checkDelivery(freelancer, m1, {
        note: "",
        files: [{ path: `${dealId}/source/1.png`, name: "x.png" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      del.createUploadSlots(client, m1, [{ name: "a.png", size: 10 }]),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      del.createUploadSlots(freelancer, m1, [{ name: "big.zip", size: 21 * 1024 * 1024 }]),
    ).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });

  it("flags a missing to-do before the client sees anything, then delivers with watermarked previews", async () => {
    const files = await upload(m1, [
      { name: "logo-concepts.pdf", bytes: pdf },
      { name: "logo-mark.svg", bytes: svg },
      { name: "concept-1.png", bytes: await png("#101828") },
    ]);
    const { check } = await del.checkDelivery(freelancer, m1, {
      note: "Three concepts attached",
      files,
    });
    expect(check.verdict).toBe("missing");
    expect(check.items.find((i) => i.todo.startsWith("Moodboard"))?.status).toBe("missing");
    expect(check.items.find((i) => i.todo.startsWith("3 logo concepts"))?.status).toBe("met");
    expect((await ms(m1)).status).toBe("held"); // a check changes nothing

    const res = await del.deliverWork(freelancer, m1, { note: "Three concepts attached", files });
    expect(res).toMatchObject({ status: "delivered", round: 1, aiCheck: { verdict: "missing" } });
    expect(res.releaseAt).toBeTruthy(); // consent exists → auto-release scheduled

    const view = await deals.getDeal(client, dealId);
    const d = view.milestones[0]!.delivery!;
    expect(d.files.map((f) => [f.name, f.mime, !!f.previewUrl, f.originalAvailable])).toEqual([
      ["logo-concepts.pdf", "application/pdf", false, false],
      ["logo-mark.svg", "image/svg+xml", true, false],
      ["concept-1.png", "image/png", true, false],
    ]);
    // The preview really is a watermarked JPEG, not the original.
    const preview = await fetch(d.files[2]!.previewUrl!).then((r) => r.arrayBuffer());
    expect(Buffer.from(preview).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(view.agentActions.find((a) => a.kind === "release_payment")).toBeUndefined(); // check failed
  });

  it("blocks originals for the client before payment (403), allows the freelancer", async () => {
    await expect(del.fileLink(client, m1, 0, "original")).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
    });
    expect(await del.fileLink(client, m1, 2, "preview")).toMatch(/^https:\/\//);
    expect(await del.fileLink(freelancer, m1, 0, "original")).toMatch(/^https:\/\//);
  });

  it("counts revision rounds, pauses auto-release, and passes the check on the second delivery", async () => {
    const r = await del.requestChanges(
      client,
      m1,
      "Please add the moodboard with colour directions.",
    );
    expect(r).toEqual({ status: "changes_requested", revisionsLeft: 1 });
    expect(await ms(m1)).toMatchObject({
      status: "changes_requested",
      release_at: null,
      revisions_used: 1,
    });

    const files = await upload(m1, [
      { name: "logo-concepts.pdf", bytes: pdf },
      { name: "moodboard-colour-directions.png", bytes: await png("#E7F3EF") },
    ]);
    const res = await del.deliverWork(freelancer, m1, { note: "Added the moodboard", files });
    expect(res).toMatchObject({ round: 2, aiCheck: { verdict: "met" } });

    // Passing check → the Deal Agent proposes releasing the payment to the client (not shown to the freelancer).
    const asClient = await deals.getDeal(client, dealId);
    expect(asClient.milestones[0]!.delivery!.round).toBe(2);
    expect(asClient.agentActions.find((a) => a.kind === "release_payment")).toMatchObject({
      title: "Release £120.00 to Riya (test)",
      for: "client",
      status: "proposed",
    });
    const asFreelancer = await deals.getDeal(freelancer, dealId);
    expect(asFreelancer.agentActions.find((a) => a.kind === "release_payment")).toBeUndefined();
  });

  it("unlocks originals after the PayPal capture", async () => {
    await pay.releaseMilestone({ kind: "client", auth: client }, m1);
    const url = await del.fileLink(client, m1, 1, "original");
    const res = await fetch(url);
    const bytes = Buffer.from((await res.arrayBuffer()) as ArrayBuffer);
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47])); // the real PNG
  });

  it("flags extra work as out of scope and turns the proposal into an add-on with its own hold", async () => {
    const inScope = await scope.sendClientMessage(
      client,
      dealId,
      "When will the final logo files be ready?",
    );
    expect(inScope).toMatchObject({ inScope: true, proposal: null });

    const out = await scope.sendClientMessage(
      client,
      dealId,
      "Could you also make Instagram templates?",
    );
    expect(out.inScope).toBe(false);
    expect(out.proposal?.title).toBe("Send add-on: Instagram templates · £60.00"); // 15% of £400, from code
    await expect(scope.sendClientMessage(freelancer, dealId, "hi")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    const { addonId } = await scope.proposeAddon(freelancer, dealId, {
      title: "Instagram templates",
      todos: ["5 Instagram post templates", "Editable source files"],
      amountMajor: "60",
      dueInDays: 5,
      actionId: out.proposal!.id,
    });
    const view = await deals.getDeal(freelancer, dealId);
    expect(view.milestones.find((m) => m.id === addonId)).toMatchObject({
      kind: "addon",
      status: "draft",
      amount: { formatted: "£60.00" },
    });
    expect(view.agentActions.find((a) => a.id === out.proposal!.id)?.status).toBe("executed");

    await expect(scope.respondToAddon(freelancer, addonId, true)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await scope.respondToAddon(client, addonId, true)).toEqual({ status: "awaiting_hold" });
    await expect(scope.respondToAddon(client, addonId, true)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const { orderId } = await pay.createHoldOrder(client, addonId); // its own hold
    expect(await pay.confirmHold(client, addonId, orderId)).toEqual({ status: "held" });
  });

  it("suggests a paid extra round when revisions are used up", async () => {
    const view = await deals.getDeal(freelancer, dealId);
    const m2 = view.milestones.find((m) => m.kind === "milestone" && m.status === "awaiting_hold")!;
    const { orderId } = await pay.createHoldOrder(client, m2.id);
    await pay.confirmHold(client, m2.id, orderId);
    await del.deliverWork(freelancer, m2.id, { note: "final logo", files: [] });
    await admin()
      .from("milestones")
      .update({ revisions_used: m2.revisionsIncluded })
      .eq("id", m2.id);
    await expect(del.requestChanges(client, m2.id, "One more tweak please")).rejects.toMatchObject({
      code: "REVISIONS_USED_UP",
      details: { suggestAddon: true },
    });
    const after = await deals.getDeal(freelancer, dealId);
    expect(
      after.agentActions.some((a) => a.kind === "propose_extra_revision" && a.for === "freelancer"),
    ).toBe(true);
    expect(after.milestones.find((m) => m.id === m2.id)!.status).toBe("delivered");

    // To-dos: freelancer only.
    const todo = after.milestones.find((m) => m.id === m2.id)!.todos[0]!;
    expect(await del.setTodoDone(freelancer, todo.id, true)).toEqual({ id: todo.id, done: true });
    await expect(del.setTodoDone(client, todo.id, true)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
