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
- Phase 1 — Database, auth, security base: **done** (OTP login still to be confirmed by the user)
- Next: Phase 2 — Domain core (money, currencies, allocate(), state machines). No credentials needed.

## Supabase

- Project `pledge`, ref `lzpuygnsyjzjwqhzkmwn`, region ap-south-1 (Mumbai), free plan, org "vaibhavv-ux's Org".
- Managed through the Supabase MCP connector (apply_migration / execute_sql / get_advisors). Keep each
  migration also saved in `supabase/migrations/` with the same SQL.
- RLS model: `authenticated` can SELECT own rows only; the only user write is their own profile
  (columns role/full_name/profession/country_code/paypal_email; role fixed once set by trigger).
  Every other write goes through services using `adminClient()` (service role). RLS helpers live in
  schema `private` (not exposed by the API).
- RLS isolation check: run `supabase/tests/rls_isolation.sql` via execute_sql (rolls back; all rows should be `true`).
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

- AI provider/key: ask at Phase 3 (default assumption: Anthropic).
- PayPal reauthorization limits: read current docs in Phase 4 and note them here.
