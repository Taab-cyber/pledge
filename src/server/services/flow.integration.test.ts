// End-to-end Phase 3 flow against the real Supabase project (and the configured AI provider).
// Run: npm run test:integration
// Creates two throwaway users, runs the flow, then deletes them (deals cascade) and their files.
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled =
  process.env.RUN_INTEGRATION === "1" || process.env.npm_lifecycle_event === "test:integration";
if (enabled) process.loadEnvFile(".env.local");

describe.skipIf(!enabled)("phase 3 flow (integration)", () => {
  type Mods = {
    deals: typeof import("./deals");
    pub: typeof import("./public-plan");
    supa: typeof import("../repos/supabase");
  };
  let m: Mods;
  const ids: string[] = [];
  let freelancer: import("../http/auth").AuthContext;
  let client: import("../http/auth").AuthContext;
  let dealId = "";

  beforeAll(async () => {
    m = {
      deals: await import("./deals"),
      pub: await import("./public-plan"),
      supa: await import("../repos/supabase"),
    };
    const admin = m.supa.adminClient();
    const stamp = Date.now();
    for (const who of ["freelancer", "client"]) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `it-${who}-${stamp}@pledge.test`,
        email_confirm: true,
      });
      if (error) throw error;
      ids.push(data.user.id);
    }
    await admin
      .from("profiles")
      .update({
        role: "freelancer",
        full_name: "Riya (test)",
        profession: "Brand designer",
        country_code: "IN",
        paypal_email: "riya-test@business.example.com",
      })
      .eq("id", ids[0]!);
    // Services read with auth.db; the admin client stands in for the users' own sessions here.
    freelancer = { userId: ids[0]!, email: null, db: admin };
    client = { userId: ids[1]!, email: null, db: admin };
  });

  afterAll(async () => {
    if (!m) return;
    const admin = m.supa.adminClient();
    if (dealId) {
      const { data } = await admin.storage.from("deal-inputs").list(`${dealId}/source`);
      await admin.storage
        .from("deal-inputs")
        .remove((data ?? []).map((f) => `${dealId}/source/${f.name}`));
    }
    for (const id of ids) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) throw new Error(`cleanup failed for ${id}: ${error.message}`);
    }
  });

  it("runs create → AI plan → edit → share → public view → suggest → re-share → approve", async () => {
    const png = readFileSync("docs/demo/chat-riya-daniel.png");
    const created = await m.deals.createDeal(
      freelancer,
      {
        clientName: "Daniel",
        clientWhatsapp: "+44 7700 900123",
        clientCountry: "GB",
        currency: "GBP",
        totalMajor: "400",
      },
      [{ name: "chat.png", bytes: new Uint8Array(png) }],
    );
    dealId = created.id;
    expect(created.hasScreenshots).toBe(true);
    expect(created.canShare).toBe(false);

    // AI plan: amounts come from allocate() and sum exactly to the total.
    const planned = await m.deals.buildPlan(freelancer, dealId);
    const sum = planned.milestones.reduce((a, x) => a + x.amount.minor, 0);
    console.log(
      "AI plan:",
      JSON.stringify(
        {
          title: planned.title,
          milestones: planned.milestones.map((x) => [
            x.title,
            x.amount.formatted,
            x.dueInDays,
            x.todos.map((t) => t.label),
          ]),
          gaps: planned.planMeta?.gaps,
          priceInChat: planned.planMeta?.priceInChat,
          priceMismatch: planned.planMeta?.priceMismatch,
        },
        null,
        2,
      ),
    );
    expect(sum).toBe(40000);
    expect(planned.canShare).toBe(true);

    // Edits that break the sum block sharing.
    const asEdit = planned.milestones.map((x) => ({
      title: x.title,
      amountMajor: (x.amount.minor / 100).toFixed(2),
      dueInDays: x.dueInDays ?? 7,
      revisionsIncluded: x.revisionsIncluded,
      todos: x.todos.map((t) => t.label),
    }));
    const broken = await m.deals.editPlan(freelancer, dealId, {
      milestones: asEdit.map((x, i) => (i === 0 ? { ...x, amountMajor: "1.00" } : x)),
    });
    expect(broken.canShare).toBe(false);
    await expect(m.deals.shareDeal(freelancer, dealId)).rejects.toMatchObject({
      code: "PLAN_INVALID",
    });
    await m.deals.editPlan(freelancer, dealId, { milestones: asEdit });

    // Share v1 → public view without login, no phone number leaked.
    const share1 = await m.deals.shareDeal(freelancer, dealId);
    expect(share1.version).toBe(1);
    expect(share1.whatsappUrl).toMatch(/^https:\/\/wa\.me\/447700900123\?text=/);
    const token1 = share1.shareUrl.split("/p/")[1]!;
    const view1 = await m.pub.getPublicPlan(token1);
    expect(view1).toMatchObject({ version: 1, state: "open", total: { formatted: "£400.00" } });
    expect(JSON.stringify(view1)).not.toContain("7700900123");
    expect(JSON.stringify(view1)).not.toContain(dealId);

    // Client suggests a change; freelancer edits → link shows "being updated"; old version can't be approved.
    const suggestion = await m.pub.suggestChange(token1, {
      text: "Looks great! Could you also add 5 Instagram post templates?",
    });
    expect(suggestion.received).toBe(true);
    await m.deals.editPlan(freelancer, dealId, {
      milestones: asEdit.map((x, i) =>
        i === asEdit.length - 1 ? { ...x, todos: [...x.todos, "Menu board design"] } : x,
      ),
    });
    expect((await m.pub.getPublicPlan(token1)).state).toBe("being_updated");
    await expect(
      m.pub.approvePlan(client, token1, { version: 1, consent: true }, "it"),
    ).rejects.toMatchObject({
      code: "PLAN_VERSION_CHANGED",
    });

    // Re-share → v2 with a new link; the old link stops working.
    const share2 = await m.deals.shareDeal(freelancer, dealId);
    expect(share2.version).toBe(2);
    const token2 = share2.shareUrl.split("/p/")[1]!;
    await expect(m.pub.getPublicPlan(token1)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The freelancer can't approve their own plan; consent must be ticked.
    await expect(
      m.pub.approvePlan(freelancer, token2, { version: 2, consent: true }, "it"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      m.pub.approvePlan(client, token2, { version: 2, consent: false }, "it"),
    ).rejects.toThrow();

    // Client approves v2 → consent recorded with its hash, first milestone opens for a hold.
    expect(
      await m.pub.approvePlan(client, token2, { version: 2, consent: true }, "vitest"),
    ).toEqual({
      dealId,
      status: "approved",
    });
    const admin = m.supa.adminClient();
    const { data: consents } = await admin
      .from("consents")
      .select("deal_version, text, text_sha256")
      .eq("deal_id", dealId);
    expect(consents).toHaveLength(1);
    const { sha256Hex } = await import("../domain/consent");
    expect(consents![0]!.text_sha256).toBe(sha256Hex(consents![0]!.text));
    expect(consents![0]!.deal_version).toBe(2);

    const after = await m.deals.getDeal(client, dealId);
    expect(after.status).toBe("approved");
    expect(after.milestones.map((x) => x.status)).toEqual([
      "awaiting_hold",
      ...after.milestones.slice(1).map(() => "draft"),
    ]);
    const { data: prof } = await admin
      .from("profiles")
      .select("role")
      .eq("id", client.userId)
      .single();
    expect(prof?.role).toBe("client");

    // Approved plans are locked; the suggestion reached the freelancer.
    await expect(
      m.deals.editPlan(freelancer, dealId, { milestones: asEdit }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const fv = await m.deals.getDeal(freelancer, dealId);
    expect(fv.changeRequests[0]?.text).toContain("Instagram");
  }, 180_000);
});
