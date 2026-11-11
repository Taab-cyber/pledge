// Deploys Pledge to the user's Vercel account (VERCEL_TOKEN in .env.local).
//   node scripts/deploy-vercel.mjs
// 1) ensures project "pledge" exists, 2) syncs production env vars (names printed, values never),
// 3) sets APP_URL to the production domain, 4) runs `vercel deploy --prod`.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const token = process.env.VERCEL_TOKEN;
if (!token) throw new Error("VERCEL_TOKEN missing in .env.local");
const PROJECT = "pledge";
const api = "https://api.vercel.com";

async function vercel(method, path, body) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${api}${path}${teamId ? `${sep}teamId=${teamId}` : ""}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

let teamId = "";
const user = await vercel("GET", "/v2/user");
teamId = user.json.user?.defaultTeamId ?? "";

// 1) Project
let project = await vercel("GET", `/v9/projects/${PROJECT}`);
if (project.status === 404) {
  project = await vercel("POST", "/v11/projects", { name: PROJECT, framework: "nextjs" });
  if (project.status >= 300)
    throw new Error(`Could not create project: ${JSON.stringify(project.json).slice(0, 300)}`);
  console.log("created Vercel project", PROJECT);
}
const projectId = project.json.id;

// Production domain (e.g. pledge-xyz.vercel.app)
const domains = await vercel("GET", `/v9/projects/${projectId}/domains`);
const domain = domains.json.domains?.find((d) => d.name.endsWith(".vercel.app"))?.name;
if (!domain) throw new Error("No .vercel.app domain found for the project yet.");
const appUrl = `https://${domain}`;

// 2) Env vars for production (+ preview). Secrets are "sensitive" (write-only in the dashboard).
const plain = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_PAYPAL_CLIENT_ID",
  "AI_PROVIDER",
  "PAYPAL_ENV",
  "DEMO_MODE",
  "GEMINI_MODEL",
  "GEMINI_FAST_MODEL",
  "DEMO_FREELANCER_EMAIL",
  "DEMO_CLIENT_EMAIL",
  "DEMO_SHARE_URL",
];
const secret = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "JOBS_SECRET",
  "DEMO_PASSWORD",
];
const vars = [];
for (const key of [...plain, ...secret]) {
  const value = process.env[key];
  if (!value) continue;
  vars.push({
    key,
    value,
    type: secret.includes(key) ? "sensitive" : "plain",
    target: ["production", "preview"],
  });
}
vars.push({ key: "APP_URL", value: appUrl, type: "plain", target: ["production", "preview"] });
const env = await vercel("POST", `/v10/projects/${projectId}/env?upsert=true`, vars);
if (env.status >= 300)
  throw new Error(`Could not set env vars: ${JSON.stringify(env.json).slice(0, 300)}`);
console.log("env vars synced:", vars.map((v) => v.key).join(", "));

// 3) Link this folder to the project for the CLI, then deploy.
mkdirSync(".vercel", { recursive: true });
writeFileSync(".vercel/project.json", JSON.stringify({ projectId, orgId: teamId }));
const out = spawnSync(
  "npx",
  ["--yes", "vercel@65.14.0", "deploy", "--prod", "--yes", "--token", token],
  { stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32", encoding: "utf8" },
);
if (out.status !== 0) throw new Error("vercel deploy failed (see output above)");
console.log("deployment:", out.stdout.trim().split("\n").pop());
console.log("APP_URL:", appUrl);
