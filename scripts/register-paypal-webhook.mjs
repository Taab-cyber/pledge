// Registers (or reuses) the sandbox webhook for APP_URL/api/webhooks/paypal and saves PAYPAL_WEBHOOK_ID.
//   node scripts/register-paypal-webhook.mjs https://your-app.vercel.app
import { readFileSync, writeFileSync } from "node:fs";

process.loadEnvFile(".env.local");
const base = (process.argv[2] ?? "").replace(/\/$/, "");
if (!base.startsWith("https://")) throw new Error("Pass the public https URL of the deployed app.");
const url = `${base}/api/webhooks/paypal`;
const API = "https://api-m.sandbox.paypal.com";

const auth = Buffer.from(
  `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
).toString("base64");
const { access_token } = await fetch(`${API}/v1/oauth2/token`, {
  method: "POST",
  headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
  body: "grant_type=client_credentials",
}).then((r) => r.json());
const h = { authorization: `Bearer ${access_token}`, "content-type": "application/json" };

const events = [
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.REFUNDED",
];
const list = await fetch(`${API}/v1/notifications/webhooks`, { headers: h }).then((r) => r.json());
let hook = (list.webhooks ?? []).find((w) => w.url === url);
if (!hook) {
  const res = await fetch(`${API}/v1/notifications/webhooks`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ url, event_types: events.map((name) => ({ name })) }),
  });
  hook = await res.json();
  if (!res.ok) throw new Error(`PayPal refused the webhook: ${JSON.stringify(hook).slice(0, 400)}`);
  console.log("created webhook", hook.id);
} else {
  console.log("webhook already registered", hook.id);
}
let env = readFileSync(".env.local", "utf8");
env = /^PAYPAL_WEBHOOK_ID=.*$/m.test(env)
  ? env.replace(/^PAYPAL_WEBHOOK_ID=.*$/m, `PAYPAL_WEBHOOK_ID=${hook.id}`)
  : `${env.trimEnd()}\nPAYPAL_WEBHOOK_ID=${hook.id}\n`;
writeFileSync(".env.local", env);
console.log("events:", (hook.event_types ?? []).map((e) => e.name).join(", "));
