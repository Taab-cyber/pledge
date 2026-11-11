# Pledge — project memory for Claude Code

Read this first after every /clear. The full brief is [BUILD.md](BUILD.md); read only the section you need.

## What it is

Pledge protects freelancers from non-payment on deals made outside marketplaces (WhatsApp, Instagram, email).
AI turns the chat into a milestone plan; the client secures each milestone with a real PayPal sandbox hold
(authorize, capture on approval or auto-release after 72 h with consent). Money goes client → freelancer
directly (payee on the order); Pledge never holds funds. UI copy: "hold" / "secured" / "not charged yet",
never "escrow" or "guaranteed".

Deadline: Devpost, Nov 12 2026 12:00 PM PT. Our target: Nov 12, 9:00 PM IST.

## Current phase

- Phase 0 — Skeleton: **done**
- Phase 1 — Database, auth, security base: **done** (OTP login confirmed working)
- Phase 2 — Domain core: **done**
- Phase 3 — Deals API + AI plan: **done** (end-to-end test passes with real Gemini)
- Phase 4 — PayPal holds/capture/void/webhooks + Vercel deploy: **done**, except the live browser run
  (client approves a real sandbox hold in PayPal's popup → capture). The user deferred it to the end.
- Phase 5 — deliveries, AI check, scope guard, previews, revisions, add-ons: **done** (deployed)
- Phase 6 — jobs tick + Deal Agent + fast-forward: **done** (pg_cron → pg_net → live tick verified, 200)
- Phase 7 — UI, judge access, seed data, docs: **done** (deployed)
- Remaining: the user's live PayPal browser run (see "Deferred to the end"), the demo video, Devpost
  submission, and filling the sandbox buyer password into the submission notes (not in the repo).

## UI (Phase 7)

- Route groups: `src/app/(ui)/page.tsx` (landing), `login`, `p/[token]` (public plan, no login), and
  `(app)/…` for signed-in pages wrapped by `_ui/app-shell.tsx` (sidebar on desktop, menu on mobile; `useMe()`
  gives the profile). `(app)/layout.tsx` sets `export const instant = false`.
- Pages: `(app)/deals` (dashboard / client portal: stat tiles + table, `DealListItem` has held/released/
  releasedThisMonth/nextStep/waitingOnYou), `(app)/deals/new`, `(app)/deals/[id]` (deal page),
  `(app)/deals/[id]/plan` (plan editor + share screen), `(app)/me` (profile/onboarding).
- Kit: `_ui/kit.tsx` (Button, Card, PageHeader, StatTile, Pill, Banner, Field, DealStatus, MilestoneStatus).
  Tokens in `globals.css` (`bg-accent`, `text-ink-soft`, `bg-warn-bg`, …).
- Pages using `useParams`/`useSearchParams` are client components wrapped in `<Suspense>` by a tiny server
  `page.tsx` (Next 16 rule). Dev-only console warning "instant navigation" on client pages is harmless.
- Judge access: `POST /api/v1/demo/login {as}` signs in server-side with DEMO_* env and returns tokens
  (browser `setSession`). `POST /api/v1/demo/deliver {milestoneId, skipLast}` makes the demo freelancer deliver
  one generated sample image per to-do. Config returns `countries`, `currencies`, `demoPlanUrl` (DEMO_SHARE_URL).
- Seed: `npm run demo:prepare` resets Riya's deals, adds 2 finished example deals (capture ids `SEED-…`) and one
  fresh plan shared with Daniel; writes DEMO_SHARE_URL → redeploy. Re-sharing rotates the link, so reseed after.
- Gemini: retries a 5xx once, then falls back to the other free model.
- Docs: README.md, docs/DEMO.md (judge click path), LICENSE (MIT).

## Jobs, Deal Agent, demo (Phase 6)

- `POST /api/jobs/tick` (header `x-jobs-secret` = JOBS_SECRET, timing-safe) → `runTick()` in
  `services/jobs.ts`: 1) auto-release delivered milestones past `release_at` (claim → capture), 2) renew live
  holds past `honor_expires_at` (skips anything claimed or due for release; failure → `hold_at_risk` + `resecure`
  proposal with PayPal's error), 3) one in-app reminder per milestone 24 h before auto-release.
  `runTick({ dealId, now })` is used by tests and fast-forward; `releaseMilestone` takes `opts.now`.
- Scheduler: pg_cron job `pledge-tick` (`*/15 * * * *`) runs `private.call_tick()`, which reads the URL and
  secret from Supabase Vault (`pledge_tick_url`, `pledge_jobs_secret`) and calls `net.http_post`. Set/rotate
  with `npx tsx scripts/set-tick-config.ts https://pledge-one.vercel.app`. Check: `select * from net._http_response order by created desc limit 3`.
- Deal Agent: `POST /api/v1/agent-actions/:id/approve|dismiss`. Approve claims proposed → approved, runs the
  service (release_payment → capture; resecure → void + awaiting_hold; propose_addon / propose_extra_revision →
  add-on), then executed; on failure back to proposed. Auto rows: `auto_released`, `hold_renewed`,
  `reminder_release` (status auto_executed, informational).
- Demo (DEMO_MODE only): `POST /api/v1/demo/fast-forward {dealId, what: "release"|"renewal"}` moves
  `release_at` / `honor_expires_at` into the past, then runs the tick for that deal → real PayPal capture /
  reauthorize. A fresh hold reauthorized early gets PayPal's real "too soon" error → hold at risk (this is the
  "forced renewal failure"; negative testing doesn't cover reauthorize). UI: "Demo controls" box on the deal page.
- `POST /api/v1/milestones/:id/resecure` (client) for holds at risk.

## Deliveries & scope guard (Phase 5)

- Upload: `POST /milestones/:id/delivery/uploads` → one-time signed upload slots under
  `<deal>/deliveries/<ms>/incoming/<uuid>`; the browser uploads straight to storage (`uploadDeliveryFiles` in
  `src/sdk/browser.ts`), bypassing Vercel's 4.5 MB body limit. Server re-downloads, checks size + magic bytes
  (PNG/JPEG/WebP/SVG/PDF/ZIP), moves to `r<round>/original/`, writes watermarked JPEG previews to `r<round>/preview/`.
- `POST /milestones/:id/delivery/check` = AI pre-check only (no state change); `POST /milestones/:id/deliver`
  delivers (AI check stored on the delivery; AI failure never blocks delivery).
- Originals: `GET /milestones/:id/files/:index` → signed URL (120 s, download attachment). Client gets 403
  until the milestone is `released`; freelancer always allowed. Previews: signed 10 min, in the deal DTO.
- AI tasks: `checkDelivery` (vision model, unwatermarked 512px thumbnails, presence only) →
  `normalizeCheck` aligns items with real to-dos; `classifyRequest` (fast model) → add-on drafted as an
  `agent_actions` row `propose_addon`; price = `addonAmountFromWeight` (weight % of deal total, whole units, ≥5).
- Revisions: `POST /milestones/:id/request-changes` uses `consumeRevision`; clears release_at; refused while a
  capture claim exists. Out of rounds → 409 `REVISIONS_USED_UP` + `propose_extra_revision` agent action.
- Add-ons: milestones with `kind = 'addon'`; `draft` = offered. `POST /deals/:id/addons` (freelancer, optional
  `actionId` marks the proposal executed) → `POST /milestones/:id/addon {accept}` (client) → `awaiting_hold`
  (own PayPal hold) or `voided`. `openNextMilestone` ignores add-ons.
- Deal Agent rows so far: `release_payment` (for client, after a passing check), `propose_addon`,
  `propose_extra_revision` (for freelancer). `detail.for` filters who sees them. Approve/Dismiss endpoints: Phase 6.
- Gotcha: when editing files through `node -e` / sed, `\b` and `\\` get mangled (a backspace char once broke
  the mock regex). Use the Edit tool for lines with backslashes.

## Deferred to the end (user's choice)

- Live sandbox run on https://pledge-one.vercel.app: sign in as `daniel@demo.pledge.test` (DEMO_PASSWORD in
  .env.local) → open the demo deal from `npm run demo:prepare` → PayPal button → approve with the GB sandbox
  payer `PAYPAL_SANDBOX_PERSONAL_EMAIL` → freelancer delivers → client "Approve and pay" → check Riya's
  sandbox account. The user types all passwords themselves.

## PayPal (Phase 4)

- Sandbox app "Pledge" (developer account of Mehtaab Kohli). Payee (Riya) = `PAYPAL_SANDBOX_BUSINESS_EMAIL`
  (IN Business). Payer (Daniel) = `PAYPAL_SANDBOX_PERSONAL_EMAIL` (a GB Business test account; can pay).
  PayPal blocks IN→IN payments, so payer and payee must be in different countries.
- Flow: `POST /milestones/:id/hold` creates an AUTHORIZE order (payee = freelancer email) → PayPal JS SDK
  buttons → `POST /milestones/:id/hold/confirm {orderId}` authorizes server-side (order id must match the
  one stored). Capture `final_capture: true` with `Prefer: return=representation` for the fee breakdown.
- Double-capture guard: release first sets `capture_claim` (conditional update, one winner), then captures with
  `PayPal-Request-Id = <milestone>:capture:<attempt>`. Integration-tested with 3 parallel releases.
- Reauthorization rules (docs, Nov 2026): allowed only AFTER the 3-day honor period, from day 4 to 29 of the
  29-day authorization, multiple times; a reauthorized hold gets a new 3-day honor period; amount up to 115%
  (+$75 max) in the US. Early reauth returns a real PayPal error → used for the "hold at risk" demo.
  Negative testing (`PayPal-Mock-Response`) is NOT supported on reauthorize; it is on capture/void/orders.
  Renewal request id includes the row's `updated_at`, so a retry after a failure isn't replayed from cache.
- Webhook id `PAYPAL_WEBHOOK_ID` for `<APP_URL>/api/webhooks/paypal` (register: `node scripts/register-paypal-webhook.mjs <url>`).
- Demo-only: `simulateDecline` on release (INSTRUMENT_DECLINED via negative testing), `POST /api/v1/demo/refund`.

## Deploy (Vercel, user's own account "taab-cyber")

- Live: **https://pledge-one.vercel.app** (project `pledge`, team `taab-cybers-projects`).
- `node scripts/deploy-vercel.mjs` syncs env vars from .env.local (values never printed; secrets "sensitive"),
  sets APP_URL to the production domain and runs `vercel deploy --prod`. `.vercelignore` excludes `.env*`.
  VERCEL_TOKEN (30-day, project-scoped) is in .env.local.
- Run `npm run build` before deploying: Next 16 + cacheComponents requires `<Suspense>` around client
  components that read URL data (useParams/useSearchParams), or prerendering fails.

## Scripts

`npm run demo:prepare` (demo users + fresh approved demo deal) · `npx tsx scripts/reset-demo-password.ts` ·
`npx tsx scripts/check-paypal-order.ts <dealId>` (real sandbox order, read back) ·
`npm run test:integration` (real DB; payments use the mock PayPal) · `npm run db:migrate` (needs SUPABASE_DB_URL;
otherwise paste migrations into the SQL Editor; Chrome automation used so far).

## Deals API (Phase 3)

| Route                                      | Who                | What                                            |
| ------------------------------------------ | ------------------ | ----------------------------------------------- |
| `GET/POST /api/v1/deals`                   | freelancer / party | list · create (JSON or multipart + screenshots) |
| `GET /api/v1/deals/:id`                    | party (RLS)        | deal view with plan, sum check, issues          |
| `POST /api/v1/deals/:id/plan`              | freelancer         | build plan with AI (weights → allocate())       |
| `PUT /api/v1/deals/:id/plan`               | freelancer         | save edits (shared → back to draft)             |
| `POST /api/v1/deals/:id/share`             | freelancer         | new version + rotated link + wa.me URL          |
| `GET /api/v1/public/plans/:token`          | anyone             | redacted latest shared version                  |
| `POST /api/v1/public/plans/:token/changes` | anyone             | suggestion; AI summarises it                    |
| `POST /api/v1/public/plans/:token/approve` | signed-in client   | consent + approve exact version                 |

- Share links rotate on every share (only the hash is stored), so old links stop working.
- AI: `AI_PROVIDER=gemini` (free tier). `GEMINI_MODEL` default `gemini-3.6-flash` (plans, vision),
  `GEMINI_FAST_MODEL` default `gemini-3.5-flash-lite`. Every call logged in `ai_runs`; 30/user/hour.
  Free-tier prompts may be used by Google: demo data only.
- End-to-end test: `npm run test:integration` (real DB + configured AI; cleans up after itself).
- Demo chat image: `node scripts/make-demo-chat.mjs` → `docs/demo/chat-riya-daniel.png`.

## Domain modules (src/server/domain, pure, fully unit-tested)

| File                   | What                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `money.ts`             | `Money {minor: bigint, currency}`, `fromMajor`, `toMajorString`, `format`, `add/sub/sum`   |
| `currencies.ts`        | USD EUR GBP CAD AUD SGD (exp 2), JPY (exp 0); INR/BRL/MYR are in-country-only              |
| `countries.ts`         | country → currency; `suggestDealCurrency()` falls back to USD with a `reason`              |
| `allocate.ts`          | largest-remainder split; exact sum; every part ≥ 1 minor unit; ties → earlier part         |
| `milestone-machine.ts` | `transition(state, event)`, `computeReleaseAt` (null without consent), `useRevision`, etc. |
| `deal-machine.ts`      | `dealTransition`, `isPlanEditable` (draft/shared only)                                     |
| `plan.ts`              | `validatePlan` (issue list), `canShare`, `planFromWeights` (AI weights → amounts)          |
| `limits.ts`            | `LIMITS`, `checkTotal` (5–10 000 major units)                                              |
| `consent.ts`           | deterministic `consentText`, `sha256Hex`, `consentRecord`                                  |
| `share-token.ts`       | 32-byte base64url token, SHA-256 hash, timing-safe match, `whatsappLink`                   |

Milestone events: open_for_hold, hold_confirmed, deliver, request_changes, release, renewal_failed,
renewed, resecure, void. A failed renewal can hit held / delivered / changes_requested → hold_at_risk
(auto-release then stops because it only fires from `delivered`).

## Supabase

- Project `pledge`, ref `hlfxxxnyfazgafnhgmdo`, org **"Mehtaab's Org"** (the user's own). Use only this one.
  (An older project `lzpuygnsyjzjwqhzkmwn` in "vaibhavv-ux's Org" is NOT used; the Supabase MCP connector
  is signed in to that other account, so don't use the connector for this project.)
- Applying migrations: `npm run db:migrate` if `SUPABASE_DB_URL` is set in .env.local; otherwise paste the
  new migration file into the dashboard SQL Editor (each migration file also inserts its own row into
  `private.schema_migrations`). All files in `supabase/migrations/` up to `20261111220000` are applied.
- The SQL Editor warns about "destructive operations" for `delete`/`revoke` inside functions; expected.
- RLS model: `authenticated` can SELECT own rows only; the only user write is their own profile
  (columns role/full_name/profession/country_code/paypal_email; role fixed once set by trigger).
  Every other write goes through services using `adminClient()` (service role). RLS helpers live in
  schema `private` (not exposed by the API).
- RLS isolation check: `supabase/tests/rls_isolation.sql` (rolls back; every row should be `true`).
  In the SQL Editor, end with a `raise exception` carrying the results instead of `rollback` to see them.
- `events` is append-only (direct UPDATE/DELETE raise), but cascades from deleting a deal/user are allowed.
- DB functions `replace_plan`, `share_deal`, `approve_deal` do plan writes atomically; service_role only.
- Storage: private bucket `deal-inputs`; screenshots at `<dealId>/source/<n>.<ext>`.
- Rows are validated with zod in repos instead of generated DB types.
- Email OTP: the "Magic Link" email template must include `{{ .Token }}` for the code login to work.
  Supabase's built-in email only sends to org members and is heavily rate-limited; add custom SMTP before
  real users / judges (judges use demo email+password accounts in Phase 7).

## Stack (don't change without asking)

Next.js 16 App Router + TypeScript strict · Supabase (Postgres + RLS, email OTP auth, Storage) · zod 4 ·
PayPal REST Orders v2 + Payments v2 (sandbox only) · Anthropic Claude via AIProvider adapter ·
pg_cron + pg_net → /api/jobs/tick · sharp · Frankfurter (ECB) FX estimates · Vitest · Vercel.

## Commands

| Command                                           | What                                          |
| ------------------------------------------------- | --------------------------------------------- |
| `npm run dev`                                     | dev server on :3000                           |
| `npm run check`                                   | lint + typecheck + tests (run once per phase) |
| `npm run build`                                   | production build (run before deploying)       |
| `npm run lint` / `npm run typecheck` / `npm test` | individually                                  |
| `npx vitest run <path>`                           | run only related tests while working          |
| `npm run format`                                  | Prettier                                      |

Disk note: C: on this machine fills up. Use `npm_config_cache=D:/.devcache/npm` for installs.

## Folder map

```
src/
  server/            # backend; UI must never import it (ESLint enforced)
    domain/          # pure logic: money, allocation, state machines (no Next/Supabase/providers)
    services/        # use-cases (createDeal, buildPlan, secureMilestone, approveDelivery, tick…)
    repos/           # Supabase queries
    providers/       # payments/{paypal,mock} · ai/{anthropic,mock,prompts} · fx/{ecb,mock}
    http/            # route() wrapper, AppError + error mapper, request id, requireUser() guard
    env.ts           # zod-validated env; env(), requireEnv()
  app/
    (ui)/            # UI pages (login, me); import only from src/sdk
    api/v1/…         # thin route handlers: parse → service → respond (health, me)
    api/webhooks/paypal, api/jobs/tick   # added in phases 4 / 6
  sdk/               # schemas.ts (zod API contracts, shared with server), client.ts (typed fetch),
                     # browser.ts (api + supabaseBrowser for UI)
  instrumentation.ts # validates env at server boot
supabase/migrations/ # same SQL as applied via the MCP connector
supabase/tests/      # SQL checks (RLS isolation)
docs/                # DEMO.md (phase 4+)
```

## Conventions

- Money: integer minor units (bigint) + ISO-4217 currency. Never floats. AI gives weights; `allocate()` gives amounts.
- Zod on every input, API response schema and AI output.
- Error shape: `{ error: { code, message, details? }, requestId }`.
- DB status changes are conditional updates (`WHERE id = $1 AND status = $expected`); 0 rows → CONFLICT.
- Every PayPal POST sends `PayPal-Request-Id` (milestoneId + action + attempt).
- Secrets only in `.env.local`. Public vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.
- Env vars for later phases are optional in `env.ts`; code that needs one calls `requireEnv("NAME")`.
- Tests sit next to code as `*.test.ts`.
- Don't read node_modules, .next, lockfiles or generated files.
- End each phase: update this file, post the Phase Report (BUILD.md §10), `git commit -m "phase N: …"`, don't push.

## Open decisions

- AI provider: Gemini free tier (user's choice). No Anthropic adapter yet; add one behind `AIProvider` if needed.
- Vercel limits request bodies to ~4.5 MB: big screenshot sets may need direct-to-storage signed uploads later.
- Total limit is 10 000 major units in every currency (per brief), so JPY deals cap at ¥10 000 (~$65).
- PayPal reauthorization limits: read current docs in Phase 4 and note them here.
