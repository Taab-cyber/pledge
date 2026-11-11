// Dev check: creates a real PayPal SANDBOX order for a deal's milestone awaiting a hold, through the
// same service the page uses, then reads the order back from PayPal. No money moves (not approved).
//   npx tsx scripts/check-paypal-order.ts <dealId>
process.loadEnvFile(".env.local");

async function main() {
  const dealId = process.argv[2];
  if (!dealId) throw new Error("Usage: npx tsx scripts/check-paypal-order.ts <dealId>");
  const { adminClient } = await import("../src/server/repos/supabase");
  const pay = await import("../src/server/services/payments");
  const admin = adminClient();

  const { data: deal, error } = await admin
    .from("deals")
    .select("client_id")
    .eq("id", dealId)
    .single();
  if (error || !deal?.client_id) throw new Error("Deal not found or not approved yet.");
  const { data: ms } = await admin
    .from("milestones")
    .select("id, title, amount_minor, status")
    .eq("deal_id", dealId)
    .eq("status", "awaiting_hold")
    .order("position")
    .limit(1)
    .single();
  if (!ms) throw new Error("No milestone is waiting for a hold.");
  console.log(`milestone: ${ms.title} (${ms.amount_minor} minor units)`);

  const client = { userId: deal.client_id as string, email: null, db: admin };
  const { orderId } = await pay.createHoldOrder(client, ms.id as string);
  console.log(`PayPal sandbox order created: ${orderId}`);

  const tok = (await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  }).then((r) => r.json())) as { access_token: string };
  const order = (await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}`, {
    headers: { authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json())) as {
    status: string;
    intent: string;
    purchase_units: Array<{ amount: unknown; payee: unknown; custom_id?: string }>;
  };
  const pu = order.purchase_units[0]!;
  console.log(
    `PayPal says: status=${order.status} intent=${order.intent} amount=${JSON.stringify(pu.amount)} payee=${JSON.stringify(pu.payee)} custom_id_matches=${pu.custom_id === ms.id}`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  const details = (err as { details?: unknown }).details;
  if (details) console.error("details:", JSON.stringify(details).slice(0, 800));
  process.exit(1);
});
