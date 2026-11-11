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
- Next: Phase 1 — Database, auth, security base (needs Supabase credentials)

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
    http/            # auth guard, error mapper, request id, rate limit
    env.ts           # zod-validated env; env(), requireEnv()
  app/
    (ui)/            # UI pages; import only from src/sdk
    api/v1/…         # thin route handlers: parse → service → respond
    api/webhooks/paypal, api/jobs/tick   # added in phases 4 / 6
  sdk/               # typed fetch client for /api/v1 (types from zod schemas)
  instrumentation.ts # validates env at server boot
supabase/migrations/
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
