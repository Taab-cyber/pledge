// Sets a new random DEMO_PASSWORD (letters + digits only, easy to copy) for both demo accounts
// and saves it to .env.local. Never prints the password.
//   npx tsx scripts/reset-demo-password.ts
import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const password =
  "Pledge" + Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function main() {
  const { adminClient } = await import("../src/server/repos/supabase");
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const emails = [process.env.DEMO_FREELANCER_EMAIL, process.env.DEMO_CLIENT_EMAIL];
  for (const email of emails) {
    const user = data.users.find((u) => u.email === email);
    if (!user) throw new Error(`Demo user ${email} not found; run npm run demo:prepare`);
    const res = await admin.auth.admin.updateUserById(user.id, { password });
    if (res.error) throw res.error;
  }
  let env = readFileSync(".env.local", "utf8");
  env = env.replace(/^DEMO_PASSWORD=.*$/m, `DEMO_PASSWORD=${password}`);
  writeFileSync(".env.local", env);
  const line = env.split("\n").findIndex((l) => l.startsWith("DEMO_PASSWORD=")) + 1;
  console.log(
    `New demo password saved on line ${line} of .env.local (${password.length} characters, letters and digits only).`,
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
