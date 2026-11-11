// Resets the demo: Riya (freelancer) + Daniel (client), two finished example deals so dashboards aren't
// empty, and one fresh plan Riya has shared with Daniel (ready for "Try as client").
//   npm run demo:prepare      (then redeploy so the live app knows DEMO_SHARE_URL)
// Needs in .env.local: Supabase keys, PAYPAL_SANDBOX_BUSINESS_EMAIL (Riya's payout account), AI keys.
// Generates DEMO_PASSWORD if missing and writes DEMO_SHARE_URL (never prints the password).
// Seeded history uses capture ids starting "SEED-": it is example data, not real PayPal payments.
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const ENV_FILE = ".env.local";
process.loadEnvFile(ENV_FILE);

function setEnvLine(key: string, value: string) {
  let text = readFileSync(ENV_FILE, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  text = re.test(text)
    ? text.replace(re, `${key}=${value}`)
    : `${text.trimEnd()}\n${key}=${value}\n`;
  writeFileSync(ENV_FILE, text);
  process.env[key] = value;
}

const DEMO = {
  freelancer: {
    email: process.env.DEMO_FREELANCER_EMAIL || "riya@demo.pledge.test",
    full_name: "Riya Sharma",
    profession: "Brand designer",
    country_code: "IN",
  },
  client: {
    email: process.env.DEMO_CLIENT_EMAIL || "daniel@demo.pledge.test",
    full_name: "Daniel Okafor",
    profession: null,
    country_code: "GB",
  },
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

interface HistoryDeal {
  title: string;
  clientName: string;
  clientCountry: string;
  currency: string;
  milestones: Array<{ title: string; amount: number; todos: string[]; paidDaysAgo: number }>;
}

const HISTORY: HistoryDeal[] = [
  {
    title: "Café Rosa — menu redesign",
    clientName: "Daniel",
    clientCountry: "GB",
    currency: "GBP",
    milestones: [
      {
        title: "Menu layout concepts",
        amount: 9000,
        todos: ["2 layout concepts as PDF"],
        paidDaysAgo: 40,
      },
      {
        title: "Final print-ready menus",
        amount: 16000,
        todos: ["Print-ready PDF, A4 and A3", "Editable source file"],
        paidDaysAgo: 3,
      },
    ],
  },
  {
    title: "Studio Lumen — hero illustrations",
    clientName: "Aisha Rahman",
    clientCountry: "US",
    currency: "USD",
    milestones: [
      { title: "Sketches", amount: 15000, todos: ["3 rough sketches"], paidDaysAgo: 60 },
      {
        title: "Two final illustrations",
        amount: 30000,
        todos: ["2 illustrations as PNG 3000px", "Layered source files"],
        paidDaysAgo: 45,
      },
      {
        title: "Mobile crops",
        amount: 15000,
        todos: ["Mobile crops for both illustrations"],
        paidDaysAgo: 2,
      },
    ],
  },
];

async function main() {
  const payee = process.env.PAYPAL_SANDBOX_BUSINESS_EMAIL;
  if (!payee) {
    throw new Error(
      "Set PAYPAL_SANDBOX_BUSINESS_EMAIL in .env.local (Riya's sandbox Business account).",
    );
  }
  if (!process.env.DEMO_PASSWORD) {
    setEnvLine("DEMO_PASSWORD", `Pledge${randomBytes(9).toString("hex")}`);
  }
  setEnvLine("DEMO_FREELANCER_EMAIL", DEMO.freelancer.email);
  setEnvLine("DEMO_CLIENT_EMAIL", DEMO.client.email);
  const password = process.env.DEMO_PASSWORD!;

  const { adminClient } = await import("../src/server/repos/supabase");
  const deals = await import("../src/server/services/deals");
  const admin = adminClient();

  // 1) Demo users with the shared demo password.
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listErr) throw listErr;
  const ids: Record<"freelancer" | "client", string> = { freelancer: "", client: "" };
  for (const role of ["freelancer", "client"] as const) {
    const who = DEMO[role];
    const existing = list.users.find((u) => u.email === who.email);
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });
      if (error) throw error;
      ids[role] = existing.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: who.email,
        password,
        email_confirm: true,
      });
      if (error) throw error;
      ids[role] = data.user.id;
    }
    const { error } = await admin
      .from("profiles")
      .update({
        role,
        full_name: who.full_name,
        profession: who.profession,
        country_code: who.country_code,
        paypal_email: role === "freelancer" ? payee : null,
        is_demo: true,
      })
      .eq("id", ids[role]);
    if (error) throw error;
  }

  // 2) Reset: remove Riya's previous deals (milestones, versions, events… cascade).
  const { data: old } = await admin.from("deals").select("id").eq("freelancer_id", ids.freelancer);
  if (old?.length) {
    await admin
      .from("deals")
      .delete()
      .in(
        "id",
        old.map((d) => (d as { id: string }).id),
      );
    console.log(`removed ${old.length} previous demo deal(s)`);
  }

  // 3) Finished example deals (labelled seeded history: capture ids start with SEED-).
  for (const h of HISTORY) {
    const total = h.milestones.reduce((a, m) => a + m.amount, 0);
    const { data: deal, error } = await admin
      .from("deals")
      .insert({
        freelancer_id: ids.freelancer,
        client_id: h.clientName === "Daniel" ? ids.client : null,
        client_name: h.clientName,
        client_whatsapp: "+447700900123",
        client_country: h.clientCountry,
        title: h.title,
        currency: h.currency,
        total_minor: total,
        status: "completed",
        current_version: 1,
        plan_meta: {
          summary: "Example finished deal (seeded for the demo).",
          gaps: [],
          confidence: 1,
          priceInChat: { amount: null, currency: null },
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    const dealId = (deal as { id: string }).id;
    await admin.from("deal_versions").insert({
      deal_id: dealId,
      version: 1,
      snapshot: {
        title: h.title,
        currency: h.currency,
        total_minor: total,
        auto_release_hours: 72,
        summary: null,
        milestones: [],
      },
    });
    for (const [i, m] of h.milestones.entries()) {
      const fee = Math.round(m.amount * 0.044) + 30;
      const { data: ms, error: mErr } = await admin
        .from("milestones")
        .insert({
          deal_id: dealId,
          position: i,
          title: m.title,
          amount_minor: m.amount,
          due_in_days: 7,
          status: "released",
          delivered_at: daysAgo(m.paidDaysAgo + 1),
          captured_at: daysAgo(m.paidDaysAgo),
          capture_id: `SEED-${randomBytes(6).toString("hex").toUpperCase()}`,
          capture_status: "COMPLETED",
          gross_minor: m.amount,
          fee_minor: fee,
          net_minor: m.amount - fee,
          settlement_currency: h.currency,
        })
        .select("id")
        .single();
      if (mErr) throw mErr;
      await admin.from("todos").insert(
        m.todos.map((label, j) => ({
          milestone_id: (ms as { id: string }).id,
          position: j,
          label,
          done: true,
        })),
      );
    }
    await admin.from("events").insert({
      deal_id: dealId,
      actor_role: "system",
      type: "seeded_history",
      payload: { seeded: true },
    });
    console.log(`seeded finished deal: ${h.title}`);
  }

  // 4) Fresh plan from the demo chat screenshot (real AI), shared with Daniel, not approved yet.
  const riya = { userId: ids.freelancer, email: DEMO.freelancer.email, db: admin };
  const png = readFileSync("docs/demo/chat-riya-daniel.png");
  const deal = await deals.createDeal(
    riya,
    {
      title: "Northern Bean — logo and brand kit",
      clientName: "Daniel",
      clientWhatsapp: "+447700900123",
      clientCountry: "GB",
      currency: "GBP",
      totalMajor: "400",
    },
    [{ name: "chat.png", bytes: new Uint8Array(png) }],
  );
  const planned = await deals.buildPlan(riya, deal.id);
  const share = await deals.shareDeal(riya, deal.id);
  setEnvLine("DEMO_SHARE_URL", share.shareUrl);

  console.log("\nFresh plan shared with Daniel (waiting for approval):");
  for (const m of planned.milestones) {
    console.log(`  ${m.position + 1}. ${m.title} — ${m.amount.formatted}`);
  }
  console.log(`\n  Plan link (also shown in Daniel's portal): ${share.shareUrl}`);
  console.log(
    `  Demo logins: ${DEMO.client.email} / ${DEMO.freelancer.email}; password = DEMO_PASSWORD in .env.local`,
  );
  console.log("  Redeploy (node scripts/deploy-vercel.mjs) so the live app knows DEMO_SHARE_URL.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  const details = (err as { details?: unknown }).details;
  if (details) console.error("details:", JSON.stringify(details).slice(0, 800));
  process.exit(1);
});
