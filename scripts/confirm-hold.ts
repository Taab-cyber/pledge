// Dev fallback when the PayPal popup can't complete in an embedded browser: the buyer approves the order at
// https://www.sandbox.paypal.com/checkoutnow?token=<orderId>, then this runs the same server step as the
// buttons' onApprove (authorize with PayPal → milestone held). Acts as the deal's client.
//   npx tsx scripts/confirm-hold.ts <milestoneId>
process.loadEnvFile(".env.local");

async function main() {
  const milestoneId = process.argv[2];
  if (!milestoneId) throw new Error("Usage: npx tsx scripts/confirm-hold.ts <milestoneId>");
  const { adminClient } = await import("../src/server/repos/supabase");
  const pay = await import("../src/server/services/payments");
  const admin = adminClient();
  const { data: ms } = await admin
    .from("milestones")
    .select("id, deal_id, paypal_order_id, status")
    .eq("id", milestoneId)
    .single();
  if (!ms?.paypal_order_id) throw new Error("This milestone has no PayPal order yet.");
  const { data: deal } = await admin
    .from("deals")
    .select("client_id")
    .eq("id", ms.deal_id)
    .single();
  const client = { userId: deal!.client_id as string, email: null, db: admin };
  const r = await pay.confirmHold(client, milestoneId, ms.paypal_order_id as string);
  const { data: after } = await admin
    .from("milestones")
    .select("status, authorization_id, hold_expires_at")
    .eq("id", milestoneId)
    .single();
  console.log(
    "result:",
    r.status,
    "| PayPal authorization:",
    after?.authorization_id,
    "| hold valid until:",
    after?.hold_expires_at,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  const details = (err as { details?: unknown }).details;
  if (details) console.error("details:", JSON.stringify(details).slice(0, 600));
  process.exit(1);
});

export {};
