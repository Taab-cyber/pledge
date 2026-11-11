// Stores the tick URL + JOBS_SECRET in Supabase Vault (via public.set_tick_config, service_role only),
// so pg_cron can call POST <APP_URL>/api/jobs/tick. Never prints the secret.
//   npx tsx scripts/set-tick-config.ts https://pledge-one.vercel.app
process.loadEnvFile(".env.local");

async function main() {
  const base = (process.argv[2] ?? "").replace(/\/$/, "");
  if (!base.startsWith("https://"))
    throw new Error("Pass the public https URL of the deployed app.");
  const secret = process.env.JOBS_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("JOBS_SECRET (32+ chars) missing in .env.local");
  const { adminClient } = await import("../src/server/repos/supabase");
  const { error } = await adminClient().rpc("set_tick_config", {
    p_url: `${base}/api/jobs/tick`,
    p_secret: secret,
  });
  if (error) throw new Error(`set_tick_config failed: ${error.message}`);
  console.log(`Tick configured: ${base}/api/jobs/tick (secret stored in Vault)`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};
