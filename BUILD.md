Pledge — Hackathon Build Brief (PayPal AI Hackathon 2026)

Paste this whole file into Claude Code as your first message, or save it in the repo root as BUILD.md and say: "Read BUILD.md and start Phase 0."

Goal: a working, deployed prototype that wins the PayPal AI Hackathon. Not a full production launch. Hard deadline: submit on Devpost by Nov 12, 2026, 12:00 PM PT (Nov 13, 1:30 AM IST). Our own target: everything submitted by Nov 12, 9:00 PM IST. Judging: technical implementation (depth of PayPal + AI), design, potential impact, innovation, presentation (demo video). Prize targets: Best Use of PayPal + AI, Best Use of Agentic Commerce, Most Impactful, Best Demo Delivery.

0. How you (Claude Code) must work
0.1 Phases and check-ins
Build one phase at a time, in order (section 9).
Start each phase with a 3–6 line plan. Don't wait for approval unless a decision is genuinely mine.
End each phase by posting the Phase Report (section 10), then stop and wait for me to say "continue".
git commit -m "phase N: <summary>" at the end of each phase. Don't push unless I ask.
If a phase is taking much longer than its time budget, stop and tell me what to cut.
0.2 Credentials
When you need a key or account, stop and ask me: what it is, exactly where to get it (URL + clicks), which env var. Use section 8.
Secrets only in .env.local (git-ignored). Keep .env.example complete. Validate env with zod at boot.
Never expose a secret to the browser. Only NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_PAYPAL_CLIENT_ID may be public.
0.3 Save tokens and credits
Maintain CLAUDE.md (project summary, folder map, commands, conventions, current phase, open decisions). Update it at the end of every phase. I'll run /clear between phases; CLAUDE.md must be enough to continue.
Never read node_modules, .next, lockfiles or generated files.
Read only the files you need; edit small sections instead of rewriting files.
Run only related tests while working; full suite once per phase.
Prefer a few well-known libraries over writing hard things yourself; don't add a library for something trivial.
0.4 Quality bar (hackathon edition)
TypeScript strict. Zod on every input, every API response schema, and every AI output.
Unit tests for money math and the state machine (these protect the demo). Other tests only where cheap.
Everything involving money must be real PayPal sandbox calls. Nothing faked. The only simulated thing is time (section 6.5).
1. The product (what we're demonstrating)

Pledge protects freelancers from not getting paid on deals they already made outside any marketplace (WhatsApp, Instagram, email). We are not a marketplace; we step in after the freelancer and client already agreed.

Freelancer
Logs in (email + one-time code), sets name, profession, country, and their PayPal sandbox email for payouts.
New deal: uploads chat screenshots or types details, plus client name, client WhatsApp number, client country, deal currency, and the total agreed.
AI builds the plan: milestones, to-dos, due dates, workload weights, and "gaps" the chat didn't settle. Code turns weights into amounts that sum exactly to the total.
Freelancer edits anything; "Share" is blocked until amounts sum exactly to the total.
Shares a WhatsApp link (https://wa.me/<number>?text=... with the plan link).
After the client secures milestone 1, works, ticks to-dos, submits a delivery (files + note).
AI checks the delivery against the milestone's to-dos and flags anything missing before the client sees it.
Dashboard lists all deals: money held, released, waiting.
Scope guard: a client message asking for extra work is flagged as out of scope, and a paid add-on is drafted.
Client
Opens the plan link and sees everything without an account.
Can suggest a change → freelancer edits → new plan version.
Approves → creates account (email + code) → ticks explicit consent to auto-release after 72 hours of no response → secures milestone 1 via PayPal hold (authorize, not capture).
Client portal lists all deals with all freelancers.
Reviews a delivery: watermarked previews, AI check result, countdown.
Approves → PayPal capture → files unlock → secures the next milestone. Or asks for changes (uses a revision round, pauses the timer).
Accepts or declines add-ons (each add-on gets its own hold).
Money principles
One milestone held at a time (plus accepted add-ons).
Money goes from the client's PayPal directly to the freelancer's PayPal (payee on the order). Pledge never holds funds.
UI copy says "hold" / "secured" / "not charged yet". Never "escrow" or "guaranteed".
2. Stack (don't change without asking)
Concern	Choice
App + API	Next.js (App Router), TypeScript, Vercel
DB, auth, files	Supabase (Postgres + RLS, Auth email OTP, Storage)
Validation	Zod
Payments	PayPal REST (Orders v2 + Payments v2), sandbox, server-side only; PayPal JS SDK buttons on the client
AI	Anthropic Claude via an AIProvider adapter (vision model for screenshots, small fast model for checks). Ask me which key/provider I'm using
Jobs	Supabase pg_cron + pg_net → POST /api/jobs/tick every 15 min (secret header)
Images	sharp for thumbnails and watermarked previews
FX estimates	Free ECB rates (e.g. Frankfurter API), cached daily, display only
Tests	Vitest

No Redis, no queue service, no separate backend server, no paid services beyond AI usage.

3. Architecture (keep the backend reusable for a future UI)

The UI will be redesigned after the hackathon, so keep business logic out of it.

src/
  server/
    domain/      # pure logic: money, currencies, allocation, state machines, validation
    services/    # use-cases (createDeal, buildPlan, approvePlan, secureMilestone, deliver, approveDelivery, tick...)
    repos/       # Supabase queries
    providers/
      payments/  # PaymentProvider interface + paypal/ + mock/
      ai/        # AIProvider interface + anthropic/ + mock/ (prompts in ai/prompts/)
      fx/        # FxProvider + ecb/ + mock/
    http/        # auth guard, error mapper, request id, rate limit
    env.ts
  app/
    api/v1/...                 # thin route handlers over services (JSON)
    api/webhooks/paypal/route.ts
    api/jobs/tick/route.ts
    (ui)/...                   # UI: imports only from src/sdk
  sdk/                         # small typed fetch client for /api/v1, types inferred from zod schemas
supabase/migrations/
domain/ imports nothing from Next.js, Supabase or providers.
Route handlers: parse → service → respond. No business logic.
ESLint no-restricted-imports: UI may not import src/server/**.
API auth: Authorization: Bearer <supabase access token> or the Supabase cookie session.
One error shape: { error: { code, message, details? }, requestId }.
Provider interfaces
ts
interface PaymentProvider {
  supports(i: { payerCountry: string; payeeCountry: string; currency: string }): { ok: boolean; reason?: string };
  createHold(i: { milestoneId: string; amount: Money; payeeEmail: string; description: string; idempotencyKey: string }): Promise<{ orderId: string }>;
  confirmHold(i: { orderId: string; idempotencyKey: string }): Promise<{ authorizationId: string; expiresAt: string; honorExpiresAt: string }>;
  renewHold(i: { authorizationId: string; idempotencyKey: string }): Promise<{ authorizationId: string; honorExpiresAt: string }>;
  capture(i: { authorizationId: string; amount: Money; final: boolean; idempotencyKey: string }): Promise<{ captureId: string; status: string; gross: Money; fee?: Money; net?: Money; fxRate?: string; settlementCurrency?: string }>;
  cancelHold(i: { authorizationId: string; idempotencyKey: string }): Promise<void>;
  refund(i: { captureId: string; amount?: Money; idempotencyKey: string }): Promise<{ refundId: string; status: string }>;
  verifyWebhook(i: { headers: Headers; rawBody: string }): Promise<{ id: string; type: string; resource: unknown } | null>;
}
interface AIProvider {
  buildPlan(i: BuildPlanInput): Promise<PlanDraft>;
  checkDelivery(i: CheckDeliveryInput): Promise<DeliveryCheck>;
  classifyRequest(i: ScopeInput): Promise<ScopeResult>;
  summarizeChanges(i: { note: string; todos: string[] }): Promise<{ changes: string[] }>;
}

mock implementations are used by tests.

4. Data model

Money is always integer minor units (bigint) + ISO-4217 currency. Never floats.

profiles (id = auth.users.id, role freelancer|client, full_name, country_code, paypal_email (freelancers), is_demo bool, created_at)
deals (id, freelancer_id, client_id null until approved, client_name, client_whatsapp, client_country, title, currency, total_minor, status draft|shared|approved|active|completed|cancelled, current_version, share_token_hash, auto_release_hours default 72, created_at, updated_at)
deal_versions (id, deal_id, version, snapshot jsonb, created_at) — immutable record of what the client saw/approved
milestones (id, deal_id, kind milestone|addon, position, title, amount_minor, due_date, revisions_included, revisions_used, status, paypal_order_id, authorization_id, hold_expires_at, honor_expires_at, delivered_at, release_at, captured_at, capture_id, gross_minor, fee_minor, net_minor, settlement_currency, fx_rate, created_at, updated_at)
todos (id, milestone_id, position, label, done)
deliveries (id, milestone_id, round, note, files jsonb, ai_check jsonb, created_at)
change_requests (id, deal_id, milestone_id null, from_role, text, ai_summary jsonb, created_at)
consents (id, deal_id, deal_version, client_id, text, text_sha256, accepted_at, user_agent)
agent_actions (id, deal_id, milestone_id null, kind, title, detail jsonb, status proposed|approved|executed|dismissed|auto_executed, created_at, resolved_at) — powers the Deal Agent feed
events (id, deal_id, milestone_id, actor_role, type, payload jsonb, created_at) — append-only activity log
webhook_events (id = PayPal event id, type, received_at, payload jsonb)
ai_runs (id, user_id, task, model, input_tokens, output_tokens, latency_ms, ok, created_at)

RLS on every table. Freelancer: own deals and children. Client: deals where client_id = auth.uid(). events, consents, webhook_events, ai_runs, agent_actions written only by the server (service role). Public plan view goes through the server using the share token (store only its SHA-256 hash) and returns a redacted DTO (no phone number, no internal ids).

Indexes: deals(freelancer_id), deals(client_id), deals(share_token_hash), milestones(deal_id), milestones(status, release_at), milestones(status, honor_expires_at).

5. Domain rules
5.1 Money and currency
Money = { minor: bigint; currency: string }, helpers fromMajor, format (locale + exponent aware), add, sub.
Currency registry for the demo: USD, EUR, GBP, CAD, AUD, SGD, JPY. Exponents correct (JPY = 0; PayPal errors on decimals for JPY/HUF/TWD).
Country registry: country → default currency. If the client's currency isn't in the registry or isn't valid for cross-border PayPal (e.g. INR, BRL, MYR are in-country only), default to USD and say why.
allocate(total, weights): largest-remainder method; parts sum exactly to the total; each part ≥ 1 minor unit. Unit tests including JPY and uneven weights.
Currency exchange: Pledge never converts money. The deal is fixed in its currency. PayPal converts on the payer side and/or the payee side as needed. We show an indicative estimate in the other party's home currency (labelled "estimate, final rate set by PayPal") and, after capture, the actual gross/fee/net/exchange rate from PayPal's capture response (seller_receivable_breakdown).
5.2 Limits
Total: ≥ 5 and ≤ 10,000 major units; 1–8 milestones; each milestone due ≤ 21 days after it's secured.
Uploads: ≤ 20 MB/file, ≤ 10 files/delivery, ≤ 8 screenshots/plan; validate type by magic bytes.
AI rate limit: 30 calls/user/hour (count from ai_runs).
5.3 Milestone state machine
draft → awaiting_hold → held → delivered ⇄ changes_requested
                         │  │        │
                hold_at_risk  │     released
                         │    └→ voided
                         └→ voided
Pure function transition(state, event) in domain/, fully unit-tested.
Every DB status change is a conditional update (... WHERE id = $1 AND status = $expected RETURNING *). Zero rows → CONFLICT. This prevents double capture when the client approves at the same moment auto-release fires. Test it.
delivered sets release_at = delivered_at + auto_release_hours only if a consent exists for the current deal version.
changes_requested clears release_at and increments revisions_used; beyond revisions_included → suggest a paid add-on.
released unlocks original files and moves the next milestone to awaiting_hold.
6. PayPal (sandbox, all real calls)
6.1 Flow
Secure a milestone: server POST /v2/checkout/orders with intent: "AUTHORIZE", purchase_units[0].amount (deal currency, correct decimals), purchase_units[0].payee.email_address = freelancer's PayPal sandbox email, custom_id = milestone id, unique invoice_id. Client approves with PayPal JS SDK buttons (intent=authorize). Server then calls POST /v2/checkout/orders/{id}/authorize, stores authorization_id, hold_expires_at (+29 days), honor_expires_at (+3 days). Status → held.
Renew: POST /v2/payments/authorizations/{id}/reauthorize for holds near the end of the honor period. Store the new authorization id. Read PayPal's current docs on reauthorization limits before implementing and note them in CLAUDE.md. On failure → hold_at_risk.
Capture: POST /v2/payments/authorizations/{id}/capture with final_capture: true. Store capture id and the receivable breakdown (gross, fee, net, exchange rate, settlement currency). Status → released.
Cancel: POST /v2/payments/authorizations/{id}/void. Status → voided.
Refund (minimal): POST /v2/payments/captures/{id}/refund, server-only, for an admin/demo action.
6.2 Must-haves
PayPal-Request-Id idempotency header on every POST, derived from milestoneId + action + attempt.
OAuth token cached in memory until ~5 min before expiry.
Payment status changes only after the server confirms with PayPal, never from browser callbacks alone.
Webhook POST /api/webhooks/paypal: verify with PayPal's verify-webhook-signature API, store event id in webhook_events, ignore duplicates. Handle authorization voided, capture completed/denied/pending. (Webhooks need a public URL, so deploy to Vercel early in Phase 4; the API responses remain the primary source of truth.)
PAYPAL_ENV=sandbox only for the hackathon.
6.3 Demonstrating failures honestly
Use PayPal sandbox negative testing to force a reauthorization failure, so the "hold at risk" state is a real PayPal error response. Read PayPal's negative testing docs and add a demo-only way to trigger it.
6.4 Payee setup
Freelancer enters their PayPal email; validate the format, and do a tiny real check if PayPal offers one in sandbox. Document that live mode with platform fees needs PayPal's partner (Multiparty) onboarding, which is out of scope.
6.5 Time fast-forward (the only simulated thing)
DEMO_MODE=true enables POST /api/v1/demo/fast-forward (deal owner or client of that deal only): moves release_at / honor_expires_at to now, then runs the tick immediately. The tick then makes real PayPal calls (capture/reauthorize).
The UI shows a small, clearly labelled "Demo: skip 3 days" button only when DEMO_MODE=true.
The endpoint must refuse to run when DEMO_MODE is not true.
7. AI and the Deal Agent
7.1 Rules
AI never moves money or changes state by itself. It returns structured data; a human approves; code executes.
Each task uses a fixed JSON schema (tool use / structured output), validated with zod; one retry with validation errors, then a clear user error.
Screenshots, chats and client messages are untrusted data: the system prompt tells the model to extract facts only and ignore any instructions inside them.
Log every call to ai_runs. Prompts live in providers/ai/prompts/*.ts, versioned.
Amounts never come from the AI: AI gives weights; allocate() produces amounts.
7.2 Tasks
Task	Input	Output
buildPlan	screenshots and/or text, total, currency, start date	{ title, summary, milestones: [{ title, todos[], dueInDays, weight 1–100, revisionsIncluded }], gaps: [{ question, suggestedDefault }], confidence }
checkDelivery	to-dos, file metadata, image thumbnails, note	`{ items: [{ todo, status: met
classifyRequest	current plan + client message	{ inScope, reason, suggestedAddon?: { title, todos[], weight or suggestedAmountMajor, dueInDays } }
summarizeChanges	change note + to-dos	{ changes: string[] }
7.3 Deal Agent (for the Agentic Commerce prize)

A per-deal agent feed (agent_actions) shown on both dashboards. It observes, proposes, and executes only after a human approves (except routine holds renewals, which it executes and reports):

After a delivery passes the AI check → proposes "Release $X to the freelancer" to the client.
Client message classified out of scope → proposes "Send add-on: Instagram templates · $60" to the freelancer.
Hold near the end of its honor period → auto-executes the PayPal reauthorization and logs "Renewed hold".
Renewal failed → proposes "Ask client to re-secure" and notifies both sides.
Revisions used up → proposes a paid extra round. Each action card: what it noticed, what it wants to do, and buttons Approve / Dismiss. Approve calls the matching service (which makes the real PayPal call).
8. Credentials (ask me when each phase starts)
Phase	What	Where	Env vars
1	Supabase project (region: Mumbai or Singapore)	supabase.com → New project → Settings → API	NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
1	Email OTP on; also enable email+password (for judge demo accounts only)	Supabase → Authentication → Providers	—
3	AI key	console.anthropic.com → API Keys (tell me if I'm using another provider)	AI_PROVIDER, ANTHROPIC_API_KEY
4	PayPal sandbox app	developer.paypal.com → Apps & Credentials → Sandbox → Create App	PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, NEXT_PUBLIC_PAYPAL_CLIENT_ID, PAYPAL_ENV=sandbox
4	Sandbox accounts: 1 Business (freelancer, e.g. India or US) + 1 Personal (client, e.g. UK or US)	developer.paypal.com → Testing Tools → Sandbox Accounts	stored in docs/DEMO.md, not in code
4	Vercel project (needed for webhooks)	vercel.com → Add New → Project → import repo	APP_URL
4	Sandbox webhook	developer.paypal.com → your app → Add Webhook → <APP_URL>/api/webhooks/paypal	PAYPAL_WEBHOOK_ID
5	Jobs secret	any random 32+ char string	JOBS_SECRET
7	Demo mode	—	DEMO_MODE=true
9. Phases (time budgets in brackets)
Phase 0 — Skeleton [30 min]

Next.js + TS strict, ESLint (with the UI→server import ban), Prettier, Vitest, folder layout, CLAUDE.md, .env.example, env.ts. Done when: lint, typecheck, test all pass. Ask me for Phase 1 credentials.

Phase 1 — Database, auth, security base [2 h]

Migrations for section 4 (tables, enums, indexes, RLS). Email OTP login; profile created on first login; role chosen once. Auth guard (Bearer or cookie), error mapper, request id, security headers. GET /api/v1/me. Done when: I can log in with an OTP code and see my profile; a quick RLS test shows a user can't read another user's deal.

Phase 2 — Domain core [1.5 h]

Money, currency + country registries, allocate(), milestone and deal state machines, plan validation, consent text + SHA-256. Done when: unit tests pass for allocation (incl. JPY and uneven weights), all legal/illegal transitions, limits.

Phase 3 — Deals API + AI plan [2.5 h]

Services + routes: create deal (screenshots upload to private storage, or text), buildPlan via AI, edit plan, share (token + wa.me link), public plan by token (redacted), suggest change → new version, approve + consent (client account via OTP). AIProvider (Anthropic + mock) with buildPlan and summarizeChanges. Small typed SDK. Done when: with one real screenshot, the AI returns a plan whose amounts sum exactly to the total; the public link shows it without login; a client can approve with consent recorded.

Phase 4 — PayPal holds, capture, void, webhooks [3 h]

PaymentProvider (PayPal + mock). Secure milestone with JS SDK buttons + server authorize; capture; void; refund (admin); reauthorize; webhooks with verification and dedupe; idempotency keys; FX estimate + actual breakdown stored. Deploy to Vercel in this phase. Done when: on the deployed URL, a sandbox Personal account in one country holds money for a milestone, and capture lands it in the sandbox Business account in another; I can see both in the PayPal sandbox site. Two simultaneous approve calls produce exactly one capture (test).

Phase 5 — Delivery, AI check, scope guard, previews [3 h]

Delivery upload (magic-byte check), sharp thumbnails + watermarked previews, originals only via short-lived signed URL after released. checkDelivery and classifyRequest. Change requests with revision counting. Add-ons as milestones of kind addon with their own hold. Done when: the AI flags a missing to-do; the client can't download originals before capture and can after; an out-of-scope message produces an add-on proposal.

Phase 6 — Jobs + Deal Agent + fast-forward [2 h]

pg_cron + pg_net → /api/jobs/tick (idempotent, safe in parallel): renew holds, mark hold_at_risk, reminders (in-app notifications only), auto-release capture (only with consent). agent_actions feed and approve/dismiss endpoints. Demo fast-forward endpoint (section 6.5). Negative-testing trigger for a failed renewal. Done when: "skip 3 days" on a delivered milestone triggers a real sandbox capture; a forced reauthorization failure shows "hold at risk" with real PayPal error data; agent cards appear and work.

Phase 7 — UI polish, demo data, judge access, docs [4 h]

Build the UI on the SDK only. Screens:

Freelancer: onboarding (name, profession, country, PayPal email) → deals dashboard (stat tiles: held, released this month, waiting on clients; deals table) → new deal (screenshots/manual tabs, client name, WhatsApp, country, currency, total) → AI plan editor (milestone cards with workload bar, −/+ amount, to-dos, gaps banner, sum check that locks "Create WhatsApp link") → share screen (WhatsApp preview) → deal page (milestones with to-do checkboxes, payment card, activity log, Deal Agent feed, scope-guard card, submit work) → delivery screen with AI check.
Client: public plan page (no login; milestones, to-dos, amounts, "how paying works", Approve / Suggest a change) → account + consent checkbox (button disabled until ticked) → PayPal buttons → client portal (stat tiles, projects table) → project page (review panel with previews, AI check, countdown, Approve and pay / Ask for changes; add-on offers; Deal Agent feed; money summary).
Visual style: clean dashboard, left sidebar on desktop (stacks on mobile). Accent teal 
#0B6E5B (soft 
#E7F3EF), ink 
#101828, ground 
#F3F5F4, warning amber text 
#8A4B00 on 
#FFF6E6, error 
#A3261A on 
#FDF0EF. Rounded cards (16–20 px), 44 px minimum touch targets, real <button>/<label>, visible focus. Status always shown with text + colour.
Judge access: in DEMO_MODE, the login page shows "Try as freelancer" and "Try as client" buttons that sign into seeded demo accounts (email+password, is_demo = true). Real users still use OTP. Seed script creates: demo freelancer (Riya, brand designer, India, sandbox Business email) and demo client (Daniel, UK, GBP), plus 2–3 older finished deals so dashboards don't look empty, and one fresh deal ready to demo.
Docs: README.md (what it is, the problem, how PayPal and AI are used, architecture diagram in text, how to run locally, env vars, demo accounts + PayPal sandbox buyer login, what is simulated (only time) and why, known limits, license), docs/DEMO.md (exact click path for judges), LICENSE (MIT). Done when: a stranger can open the deployed URL, click "Try as client", and complete approve → PayPal hold → review → approve and pay in under 3 minutes.
Phase 8 (only if time remains) [optional]
If I confirm the AG Grid sponsor prize rules fit, use AG Grid Community for the deals/projects tables.
Playwright smoke test of the happy path.
Email notifications.
10. Phase Report template (post at the end of every phase, then stop)
## Phase N report: <name>   (time spent: ~X h)

**Done**
- …

**Try it**
1. …

**Tests:** X passing (Y new)

**Decisions I made** (tell me if you disagree)
- …

**Need from you before the next phase**
- [ ] …

**Risks / cuts I recommend**
- …

Reply "continue" for Phase N+1: <name>
11. Edge cases to handle (test the logic ones)
AI can't read screenshots or finds no price → ask the freelancer; never invent a price.
Total entered ≠ price in chat → show both; freelancer decides.
Amounts don't sum to total → share blocked.
Client approves an outdated plan version → PLAN_VERSION_CHANGED.
Client closes or cancels the PayPal window → stays awaiting_hold, can retry.
Authorization declined → clear message, retry.
Approve and auto-release at the same time → exactly one capture.
Capture pending/failed → stay delivered, retry with the same idempotency key, show status.
Duplicate/out-of-order webhooks → deduped; illegal transitions rejected.
Renewal fails → hold_at_risk, both notified, Deal Agent proposes re-secure; auto-release disabled until resolved.
No consent → no auto-release, ever.
Revisions used up → paid add-on suggested.
Disguised upload type → rejected.
Originals requested before capture → 403.
Freelancer and client are the same user → rejected.
Unsupported currency pair → explained, USD suggested.
Share token guessed → random 32 bytes, hashed, rate-limited.
Prompt injection in screenshot/message → ignored; output still schema-validated.
12. Appendix: 3-minute demo video plan (the seed data should support this exact story)
Time	Scene
0:00–0:20	The problem: freelancers deliver, clients go quiet. Key stat on screen (71% have trouble getting paid; average disputed invoice $6,000, Freelancers Union).
0:20–0:55	Riya drops WhatsApp screenshots into Pledge. AI builds 3 milestones, to-dos, and splits $400 by workload; flags "who owns source files?" She sends the WhatsApp link.
0:55–1:25	Daniel opens the link on his phone, approves, ticks consent, PayPal window → hold placed. "Not charged yet." Split-screen: hold visible in PayPal sandbox.
1:25–1:55	Riya submits work; AI catches the missing dark-background version; she adds it. Daniel sees watermarked previews + AI check + countdown.
1:55–2:25	Daniel approves → PayPal capture → split-screen: money arrives in Riya's sandbox account (show the GBP→USD/INR conversion and fee from PayPal's response). Files unlock.
2:25–2:50	Deal Agent: Daniel asks "can you also make Instagram templates?" → agent proposes a $60 add-on → approved → its own hold. Quick flash: "Demo: skip 3 days" auto-release, and a hold-at-risk card from a real sandbox error.
2:50–3:00	Close: "Pledge: get paid for every deal you close. Built on PayPal holds + AI."

No copyrighted music. Say on screen when time is skipped.

Start with Phase 0 now.
