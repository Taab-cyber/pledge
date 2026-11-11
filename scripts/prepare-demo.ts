// Creates/refreshes the demo accounts and a fresh approved deal ready for a PayPal hold.
//   npm run demo:prepare
// Needs in .env.local: Supabase keys, PAYPAL_SANDBOX_BUSINESS_EMAIL (Riya's payout account).
// Generates DEMO_PASSWORD into .env.local if missing (never printed). Demo users have is_demo = true.
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

async function main() {
  const payee = process.env.PAYPAL_SANDBOX_BUSINESS_EMAIL;
  if (!payee)
    throw new Error(
      "Set PAYPAL_SANDBOX_BUSINESS_EMAIL in .env.local (Riya's sandbox Business account email).",
    );
  if (!process.env.DEMO_PASSWORD)
    setEnvLine("DEMO_PASSWORD", `Pledge-${randomBytes(9).toString("base64url")}`);
  setEnvLine("DEMO_FREELANCER_EMAIL", DEMO.freelancer.email);
  setEnvLine("DEMO_CLIENT_EMAIL", DEMO.client.email);
  const password = process.env.DEMO_PASSWORD!;

  const { adminClient } = await import("../src/server/repos/supabase");
  const deals = await import("../src/server/services/deals");
  const pub = await import("../src/server/services/public-plan");
  const admin = adminClient();

  // Ensure both demo users exist with the shared demo password.
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

  const riya = { userId: ids.freelancer, email: DEMO.freelancer.email, db: admin };
  const daniel = { userId: ids.client, email: DEMO.client.email, db: admin };

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
  const token = share.shareUrl.split("/p/")[1]!;
  await pub.approvePlan(
    daniel,
    token,
    { version: share.version, consent: true },
    "prepare-demo script",
  );

  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  console.log("\nDemo deal ready (approved, first milestone waiting for a PayPal hold):");
  for (const m of planned.milestones)
    console.log(`  ${m.position + 1}. ${m.title} — ${m.amount.formatted}`);
  console.log(`\n  Open as Daniel (client): ${base}/deals/${deal.id}`);
  console.log(
    `  Demo logins: ${DEMO.client.email} / ${DEMO.freelancer.email} — password is DEMO_PASSWORD in .env.local`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  const details = (err as { details?: unknown }).details;
  if (details) console.error("details:", JSON.stringify(details).slice(0, 800));
  process.exit(1);
});
