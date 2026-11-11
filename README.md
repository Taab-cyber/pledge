# Pledge

**Get paid for every deal you close in a chat.**

Pledge protects freelancers from not getting paid on deals they already made outside any marketplace
(WhatsApp, Instagram, email). AI turns the chat into a milestone plan; the client approves it from one link
and secures each milestone with a **PayPal hold** before work starts. When the work is delivered, an AI check
compares it with the plan, and the client approves (PayPal captures the hold and pays the freelancer
directly) or asks for changes. If the client goes quiet, the payment auto-releases after 72 hours, but only
because they consented to that up front.

**Live demo:** https://pledge-one.vercel.app (click **Try as client** or **Try as freelancer**; PayPal sandbox,
no real money). Step-by-step judge path: [docs/DEMO.md](docs/DEMO.md).

Built for the PayPal AI Hackathon 2026.

## The problem

Freelancers agree work in chats, deliver, and then the client stops replying. 71% of freelancers have had
trouble getting paid, and the average disputed invoice is about $6,000 (Freelancers Union). Marketplaces
solve this with escrow, but most freelance deals never touch a marketplace.

## How PayPal is used (all real sandbox calls)

| Step                                           | PayPal API                                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client secures a milestone                     | `POST /v2/checkout/orders` (`intent: AUTHORIZE`, `payee.email_address` = freelancer) → PayPal JS SDK buttons → server `POST /v2/checkout/orders/{id}/authorize`                            |
| Client approves the work / auto-release        | `POST /v2/payments/authorizations/{id}/capture` (`final_capture: true`, `Prefer: return=representation`); we store PayPal's `seller_receivable_breakdown` (gross, fee, net, exchange rate) |
| Hold reaches the end of its 3-day honor period | `POST /v2/payments/authorizations/{id}/reauthorize` (the Deal Agent does this automatically)                                                                                               |
| Freelancer cancels                             | `POST /v2/payments/authorizations/{id}/void`                                                                                                                                               |
| Demo refund                                    | `POST /v2/payments/captures/{id}/refund`                                                                                                                                                   |
| Events                                         | Webhooks verified with `POST /v1/notifications/verify-webhook-signature`, stored once by event id                                                                                          |

- Money goes from the client's PayPal straight to the freelancer's PayPal (the freelancer is the order's
  payee). **Pledge never holds funds**, so there is no escrow.
- Every POST carries a `PayPal-Request-Id`. A capture first claims the milestone with a conditional database
  update, so a client clicking "Approve" while auto-release fires produces **exactly one capture** (tested).
- Cross-border: the deal is fixed in one currency; PayPal converts. Pledge shows an indicative estimate (ECB
  rates via Frankfurter, labelled "estimate, final rate set by PayPal") and, after capture, PayPal's actual
  figures.
- Failures are shown as they are. A failed hold renewal shows PayPal's real error and debug id, and the
  Deal Agent proposes re-securing.

## How AI is used (Google Gemini, free tier, behind a provider interface)

| Task               | What it does                                                                                                                      | Guard rails                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buildPlan`        | Reads chat screenshots (vision) → milestones, to-dos, due days, **workload weights**, open questions, the price the chat mentions | The AI never sets amounts: code splits the total by weight with a largest-remainder allocation that sums exactly. A different chat price is flagged, never applied. |
| `checkDelivery`    | Compares delivered files (names + thumbnails) and the note with each to-do: met / missing / unclear                               | Presence only, never taste. Every to-do gets exactly one verdict.                                                                                                   |
| `classifyRequest`  | Scope guard: is a client's message in the plan or extra work? Drafts a paid add-on                                                | Add-on price is computed by code from a weight; the freelancer edits before sending.                                                                                |
| `summarizeChanges` | Turns a client's suggestion into a short list of concrete changes                                                                 |                                                                                                                                                                     |

All AI output is JSON-schema-constrained and validated with zod (one retry with the errors). Chats, notes and
messages are treated as untrusted data (prompt-injection resistant). Every call is logged (`ai_runs`) and
rate-limited (30 per user per hour).

**Deal Agent:** a per-deal feed that notices and proposes ("Release £140 to Riya", "Send add-on: Instagram
templates · £60", "Ask the client to re-secure"). A person approves, then the matching service makes the
real call. The only automatic actions are routine hold renewals and consented auto-releases, which it
reports.

## Architecture

```
Browser (Next.js pages, src/app/(ui))
   │  typed SDK (src/sdk) ──► /api/v1/* route handlers (parse → service → respond)
   │                                   │
   │                         src/server/services   use-cases (deals, payments, deliveries, scope, agent, jobs)
   │                         src/server/domain     pure rules: money, allocate(), state machines, consent
   │                         src/server/repos      Supabase (Postgres + RLS, Storage)
   │                         src/server/providers  PayPal · Gemini · Frankfurter (each with a mock)
   │
PayPal JS SDK buttons ──► PayPal ──► webhooks ──► /api/webhooks/paypal
Supabase pg_cron (every 15 min) ──► pg_net ──► /api/jobs/tick (auto-release, renewals, reminders)
```

- Stack: Next.js 16 (App Router) + TypeScript strict, Supabase (Postgres with row-level security, email-code
  auth, private Storage, Vault, pg_cron/pg_net), zod, PayPal REST v2, Gemini, sharp, Vitest, Vercel.
- Money is always integer minor units (`bigint`) + ISO-4217 code. JPY has no decimals.
- Every milestone status change is a conditional update on the expected status (state machine in
  `src/server/domain/milestone-machine.ts`, fully unit-tested).
- Deliveries upload straight to private storage. Clients see watermarked previews; originals unlock only after
  PayPal captures (403 before).

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

Database: apply `supabase/migrations/*.sql` in order (Supabase SQL Editor, or `npm run db:migrate` with
`SUPABASE_DB_URL`). Then `npm run demo:prepare` seeds the demo accounts and deals, and
`npx tsx scripts/set-tick-config.ts <public-url>` wires the scheduler.

| Env var                                                                                                               | What                                           |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`                              | Supabase project                               |
| `AI_PROVIDER` (`gemini`/`mock`), `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FAST_MODEL`                                | AI                                             |
| `PAYPAL_ENV=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_WEBHOOK_ID` | PayPal sandbox                                 |
| `APP_URL`                                                                                                             | Public URL (share links, webhooks)             |
| `JOBS_SECRET`                                                                                                         | Secret header for `/api/jobs/tick` (32+ chars) |
| `DEMO_MODE`, `DEMO_FREELANCER_EMAIL`, `DEMO_CLIENT_EMAIL`, `DEMO_PASSWORD`, `DEMO_SHARE_URL`                          | Judge access and demo controls                 |

Tests: `npm run check` (lint, typecheck, 210+ unit tests) and `npm run test:integration` (real database,
mock PayPal/AI, cleans up after itself).

## What is simulated, and why

Only **time**. In demo mode, "Demo: skip 3 days" moves a milestone's auto-release time (or a hold's
honor period) into the past and runs the scheduled tick right away. The tick then makes the **real** PayPal
sandbox capture or reauthorization. Judges can't wait 72 hours. "Demo: freelancer delivers now" lets one
person play both sides by uploading labelled sample files as the demo freelancer. The two finished example
deals on the dashboards are seeded history (their capture ids start with `SEED-`).

## Known limits

- PayPal sandbox only. Live mode with platform fees would need PayPal's partner (Multiparty) onboarding.
- PayPal only allows reauthorizing a hold after its 3-day honor period, so a fresh hold renewed early fails
  with PayPal's real "too soon" error; the demo uses this to show "hold at risk".
- Supabase's built-in email sends codes only to project members and is rate-limited; judges use the demo
  buttons. Real users would need custom SMTP.
- Gemini free tier: requests may be used by Google to improve its models; occasional "high demand" errors
  (we retry and fall back to the second free model).
- Email notifications are in-app only (Deal Agent feed).

## License

[MIT](LICENSE)
