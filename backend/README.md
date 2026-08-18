# PPC Enterprise Backend — Modules 1–14 (complete)

Backend for the PPC (Production Planning & Control) Enterprise system for Chauhan MIS Automation
Solutions. Covers **Module 1 (Master Data Management)**, **Module 2 (Order Management)**,
**Module 3 (Daily Production Input)**, **Module 4 (OEE Monitoring)**, **Module 5 (BOM Explosion
Engine)**, **Module 6 (CTB — Clear To Build Engine)**, **Module 7 (Material Dashboard)**,
**Module 8 (Order-Wise Shortage Analysis)**, **Module 9 (Purchase Requisition Automation)**,
**Module 10 (Smart Scheduling Engine)**, **Module 11 (Risk Prediction Engine)**, **Module 12
(PPC Spotlight Search)**, **Module 13 (QC Planning Integration)**, and **Module 14 (Dashboard &
Analytics)** — **all 14 modules of the original spec are now complete.** No frontend. The AI
Roadmap features described later in the source spec (the AI Scheduling Optimizer, predictive
analytics beyond Module 11's rule-based projections, etc.) are a **distinct, not-yet-started
future phase** — nothing in Modules 1–14 should be mistaken for, or quietly grown into, that work
without an explicit new build phase.

On top of all 14 modules, this backend also has **JWT-based authentication and role-based
authorization** (`Admin` / `StoreManager` / `ProductionManager`) — every route requires a bearer
token, and write access to each module is gated by role. See "Authentication & Authorization"
below for the full role model, permission matrix, and rationale.

Also complete: a **5-part Client Flow addition** implementing the client's detailed PPC flow
document on top of the 14 completed modules — Machine master data, a daily Plan-vs-Actual
comparison, daily QC inspection results, a QC-driven completion forecast, a formal order closure
summary, and a Unified Order Status Dashboard tying it all together. **All 5 parts are complete**
— see "Client Flow Part 1" through "Client Flow Part 5" below. Part 3 is worth reading before
touching either QC module (explains how "QC Batches" (Module 13) and "QC Inspections" (Part 3) are
unrelated despite the shared name); Part 4 is worth reading before touching either
completion-prediction endpoint (explains how it and Module 11's At-Risk prediction are two
different, deliberately separate signals); Part 5's closing note maps every flow concept from the
client's document to the part that addresses it. The frontend UI for any of this remains a
separate, later phase — see the end of "Client Flow Part 5".

> **⚠️ Known limitation you will hit immediately if you use search:** `GET /api/search`'s order
> results always return `pendingQty: null` — there is no schema linkage between production output
> and a specific order today, so this cannot be honestly computed. See "Module 12" below for the
> full explanation; this is the second-most-important caveat in this backend after Module 9's
> consolidated-demand note. Client Flow Part 1 added the *schema* linkage this was missing
> (`daily_production_log.orderId`, see "Client Flow Part 1" below) but did **not** change this
> search behavior — `pendingQty` still returns `null` until a later part teaches the search
> computation to use it.

## Tech stack

Node.js + TypeScript, Express, Prisma (PostgreSQL — Neon/Supabase), Zod, Vitest + Supertest, pino,
ESLint + Prettier.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — your Neon/Supabase Postgres connection string
   - `DATABASE_URL_TEST` — a second, throwaway database used only by the test suite
3. `npx prisma migrate dev --name init` — creates all tables in your database
4. Also fill in `JWT_SECRET` (any long random string) and, optionally, `ADMIN_SEED_EMAIL` /
   `ADMIN_SEED_PASSWORD` / `ADMIN_SEED_SECURITY_QUESTION` / `ADMIN_SEED_SECURITY_ANSWER` — see
   "Authentication & Authorization" and "Self-Service Password Reset" below for what these do.
5. `npx prisma db seed` — inserts a small sample dataset (3 products, 2 lines, 3 HR teams, 5 RM
   parts, 5 BOM rows, 3 orders) **and** bootstraps the first `Admin` user from
   `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` if both are set
6. `npm run dev` — starts the API on `http://localhost:3000` (health check at `GET /health`)

## Running tests

```
npm run test
```

Runs the full Vitest + Supertest suite once (see "Test strategy" below for how it's isolated from
your dev data).

## Folder structure

```
src/
  config/env.ts        Zod-validated environment loading
  db/client.ts          Prisma client singleton
  modules/<name>/        One folder per domain module, each following:
    <name>.routes.ts      Express Router — wires paths to controller + validateRequest
    <name>.controller.ts  Parses req → calls service → formats response. No business logic.
    <name>.service.ts     All business logic and Prisma calls live here.
    <name>.schema.ts      Zod schemas for body/params/query
    <name>.test.ts         Vitest + Supertest integration tests
  modules/oee/            Module 4 only: adds oeeCalculator.ts / .test.ts — the pure OEE
                           math (calculateOee, aggregateOee), unit-tested with plain
                           inputs/outputs, kept separate from the route/controller/service
                           plumbing described above
  modules/bomExplosion/  Module 5 only: adds bomExplosionEngine.ts / .test.ts — the pure,
                           recursive explodeBom() math, same separation-of-concerns as
                           oeeCalculator.ts above
  modules/ctb/            Module 6 only: adds ctbEvaluator.ts / .test.ts — the pure
                           evaluateCtb() decision logic, same separation-of-concerns pattern
  modules/materials/      Module 7 only: adds materialAggregator.ts / .test.ts — the pure
                           aggregateShortagesByPart() grouping logic, same pattern
  modules/shortageReport/ Module 8 only: adds urgencyScorer.ts / .test.ts — the pure
                           calculateUrgencyScore() math, same pattern
  middleware/            errorHandler, validateRequest, requestLogger (pino)
  utils/                  apiResponse envelope, pagination helpers, typed error classes
  testUtils/              buildTestApp() — mounts a single module's router in isolation for tests
  app.ts / server.ts      Express app wiring / entrypoint
prisma/
  schema.prisma           1:1 Prisma port of the provided SQL schema
  seed.ts                  Sample dataset
openapi.yaml              Importable into Postman/Insomnia
```

`src/modules/dailyLogs/` follows the same pattern as every other module, with one deliberate
deviation: downtime sub-resource routes/handlers (`/api/daily-logs/:logId/downtime...`) live in
`dailyLogs.routes.ts` / `.controller.ts` / `.service.ts` rather than in a separate
`downtime.routes.ts`. A downtime entry has no lifecycle outside its parent log (it's always
created, listed, and deleted through a `:logId`-scoped path), so splitting it into its own file
would mean two files sharing the same Prisma model and the same "does this log exist" guard for
~40 lines of actual logic — not worth the indirection at this size.

## Authentication & Authorization

Every route except `POST /api/auth/login` requires a JWT bearer token
(`Authorization: Bearer <token>`); every write route (and some read routes) additionally requires
one of a small set of roles. This is a retrofit on top of Modules 1–14 — it closes a real gap
where fields like `changedBy`/`savedBy`/`generatedBy` used to be trusted verbatim from the request
body (anyone could claim to be anyone). They're now derived from the authenticated caller instead;
see "Attribution fields" below.

### Role model

Three roles, no more:

- **`Admin`** — full access everywhere. Implicitly passes every authorization check in this API;
  there is no route where `Admin` is excluded.
- **`StoreManager`** — owns the **material side**: RM Inventory (including stock adjustment — see
  the callout below), BOM, BOM Explosion, CTB, Materials, Purchase Requisitions.
- **`ProductionManager`** — owns the **floor side**: Orders, Daily Logs, Scheduling, QC Batches, HR
  Teams. There is deliberately **no separate HR role** — HR Teams is owned by `ProductionManager`,
  same as the rest of the floor.

Both `StoreManager` and `ProductionManager` can **read** everything in the API (dashboards, risk,
search, and the other side's data included) — the split only applies to **write** access.

### Permission matrix (as implemented)

| Module | Read | Write | Notes |
|---|---|---|---|
| RM Inventory (incl. stock-adjust) | StoreManager, ProductionManager | StoreManager | Stock-adjust is **not** a special exception — same write gate as every other RM Inventory route. |
| BOM | StoreManager, ProductionManager | StoreManager | |
| BOM Explosion | StoreManager, ProductionManager | StoreManager | The lazy-compute-and-cache `GET /order/:orderId` is classified as **read** (see below). |
| CTB | StoreManager, ProductionManager | StoreManager | `GET /dashboard` and `GET /order/:orderId` are **read** despite live-evaluating and persisting a snapshot; `POST /recheck-all` and `POST /order/:orderId/recheck` are **write**. |
| Materials | StoreManager, ProductionManager | StoreManager | |
| Purchase Requisitions | StoreManager, ProductionManager | StoreManager | |
| Orders | StoreManager, ProductionManager | ProductionManager | |
| Daily Logs | StoreManager, ProductionManager | ProductionManager | |
| OEE | StoreManager, ProductionManager | Admin only | Read-only module; no route in it writes anything. |
| Scheduling | StoreManager, ProductionManager | ProductionManager | |
| Risk | StoreManager, ProductionManager | Admin only | Read-only module. |
| QC Batches | StoreManager, ProductionManager | ProductionManager | |
| QC Testing Plans | StoreManager, ProductionManager | **Admin only** | Exception: testing plans are master data, not a floor action, even though the rest of QC is `ProductionManager`'s. |
| HR Teams | StoreManager, ProductionManager | ProductionManager | |
| Products | StoreManager, ProductionManager | Admin only | Shared master data. |
| Lines | StoreManager, ProductionManager | **Admin only** | Exception: `ProductionManager` works with lines daily on the floor, but line configuration itself (capacity, efficiency, compatible product types) stays `Admin`-only as physical/master config. |
| Shortage Report | StoreManager, ProductionManager | Admin only | Read-only module. |
| Search | StoreManager, ProductionManager | Admin only | Read-only module. |
| Dashboard | StoreManager, ProductionManager | Admin only | Read-only module. |
| Warehouses | StoreManager, ProductionManager | Admin only | Master data, same reasoning as Lines/Products — see README "FG Module Part 1". |
| FG Batch | StoreManager, ProductionManager | ProductionManager | FG batch *creation* only (`POST /generate`) — a continuation of QC, not a warehouse action. Later FG-module parts' warehouse/reservation/dispatch actions are StoreManager territory instead and will get their own row when built — see README "FG Module Part 1" for the full judgment call. |

"Admin only" write rows have no route in that module reachable by `StoreManager`/`ProductionManager`
at all — `Admin` passing every check is what makes those routes reachable, not a third explicit
role in the list.

**Read vs. write is classified by HTTP verb, not by side effects.** Several `GET` routes write to
the database as an internal caching/evaluation detail (BOM Explosion's lazy compute-and-cache, CTB's
live-evaluate-on-`GET`) — these are still classified as **read**, consistently, because from the
caller's perspective they're a query, and gating them behind write-only roles would block
`StoreManager`/`ProductionManager` from ever viewing a BOM Explosion or CTB result for an order they
didn't personally trigger a recompute for. `POST`/`PATCH`/`DELETE` are always write.

### JWT mechanics

- `POST /api/auth/login` returns a single access token, signed with `JWT_SECRET`, expiring in
  **8 hours** (roughly a work shift) — sent as `Authorization: Bearer <token>` on every subsequent
  request.
- **There is no refresh token.** This is a deliberate simplification for this phase, not an
  oversight: once a token expires, the client just logs in again. A refresh-token flow (rotation,
  revocation lists, etc.) adds real complexity for a system with one shift-length session; it can
  be added later without changing anything else in this design if session length becomes a problem.
- `authenticate` re-fetches the user from the database **on every request** rather than trusting
  the token's own claims (beyond the user id) — this is what makes deactivating a user
  (`PATCH /api/auth/users/:userId` with `isActive: false`) take effect immediately, even against a
  token that hasn't expired yet, instead of waiting up to 8 hours.
- Passwords and tokens are never logged, at any level. `pino-http`'s default request serializer
  logs `req.headers` verbatim (which would otherwise put every `Authorization: Bearer <token>`
  header into the logs) — `src/middleware/requestLogger.ts` explicitly redacts
  `req.headers.authorization`. Request bodies (where a login password would live) are never logged
  by `pino-http` in the first place.

### Bootstrapping the first Admin

There is no public self-registration endpoint and no "first user becomes Admin" magic — every
user after the first is created explicitly via `POST /api/auth/users` (Admin-only). The very first
Admin is bootstrapped by `prisma/seed.ts` from `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` in `.env`
(an `upsert`, so re-running the seed never resets a password that's already been changed).
**Change this seeded password immediately after first login** — it exists in your `.env` file in
plain text, same as any other local secret, and is not meant to be a long-term credential.

### Attribution fields

Every `changedBy` / `savedBy` / `generatedBy`-shaped field across the API (Orders' status history,
Daily Logs, Purchase Requisitions' generation and status history, Scheduling's un-schedule reversal)
used to be a plain optional string in the request body — a caller could claim to be anyone, or no
one. These fields have been **removed from every Zod request schema entirely** (not merely ignored
— sent-but-unrecognized values are silently dropped by Zod, same as any other unknown field) and
are now populated server-side from `req.user.name`, the authenticated caller `authenticate`
resolved for that request. The one exception is the scheduling engine's own bulk
`POST /api/scheduling/run`, which writes the fixed system label `'scheduling-engine'` as the actor
for orders it transitions itself — there is no per-order human caller to attribute a bulk pass to.

## Self-Service Password Reset

A logged-out user can reset their own password without an Admin's help, via
`POST /api/auth/forgot-password/verify` then `POST /api/auth/forgot-password/reset` — both
intentionally **public routes** (no `authenticate` middleware), since they exist precisely for
someone who can't log in.

### Why CAPTCHA *and* a security question, not either alone

A CAPTCHA only proves the caller isn't a trivial bot — it proves nothing about whether they
actually own the account being reset. A security question, set at account-creation time and
answered correctly, is the actual identity check here. Both are required together:

1. **CAPTCHA** (`GET /api/auth/captcha`) — a simple self-hosted arithmetic challenge (`"7 + 12 =
   ?"`), returned alongside a `captchaToken`: a short-lived (5 minute) JWT encoding the expected
   answer, signed with the same `JWT_SECRET` as every other token in this API (a separate secret
   would add an env var for no real security gain, since the payload is just a number). This keeps
   the CAPTCHA **stateless — no DB table, no "used" tracking** — verification is folded directly
   into `POST /api/auth/forgot-password/verify` rather than a standalone verify-captcha endpoint,
   since that's the only place it's actually used.
   - **This is a basic bot-deterrent, not true human verification.** A trivial script can solve
     arithmetic. It stops naive automated abuse the same way the rate limiter does, nothing more.
     **Documented upgrade path, not built now:** real `reCAPTCHA`/`hCaptcha` would require the
     org's own API keys and its own setup pass.
2. **Security question** (`securityQuestion` / `securityAnswerHash` on `User`) — set at account
   creation via `POST /api/auth/users` (Admin-only), from a **fixed list** in
   `src/modules/auth/securityQuestion.ts` (`SECURITY_QUESTIONS`), not free text — a known-weak
   practice for security questions. The answer is bcrypt-hashed at the same cost factor as
   passwords (`BCRYPT_SALT_ROUNDS`), and **normalized first** (trimmed, lowercased) so "Fluffy",
   "fluffy", and " FLUFFY " all compare equal — a real usability requirement here.

### The two-endpoint flow

- **`POST /api/auth/forgot-password/verify`** — body `{ email, captchaToken, captchaAnswer,
  securityAnswer }`. Verifies the CAPTCHA first (cheap, fails fast, and a wrong answer here gets
  its own clear message — it doesn't leak anything about any account). Everything after that —
  unknown email, wrong security answer, or an inactive account — collapses into **one identical
  generic error message**, the same "don't reveal which part was wrong" principle `login()`
  already uses for password vs. email, reusing that same timing-safety trick too: a `bcrypt.compare`
  runs either way (against the real hash or a dummy one), so a nonexistent email doesn't return
  measurably faster than a real one with a wrong answer. On success, issues a signed,
  **single-use, 15-minute** reset token and returns `{ resetToken }`.
- **`POST /api/auth/forgot-password/reset`** — body `{ resetToken, newPassword }`. Validates the
  token (exists, unexpired, unused, hash matches — see below), validates `newPassword` against the
  same `PASSWORD_MIN_LENGTH` every other password uses, updates the password, marks the token
  used, and **invalidates every other outstanding unused reset token for that same user** (in
  case multiple reset attempts were in flight — a stale, still-valid token from an earlier request
  shouldn't remain usable after the password has already changed).

**Reset token mechanics:** a signed JWT (`sub` = user id, a random 32-byte nonce), whose SHA-256
digest is stored in a new `password_reset_tokens` table (`tokenHash`, `expiresAt`, `usedAt`). The
JWT alone proves authenticity (signed, self-expiring); the DB row is what makes it **single-use
and revocable** — `resetPassword` checks both the JWT's own expiry *and* the DB row's `expiresAt`/
`usedAt` independently, so an already-consumed or since-invalidated token is rejected even if its
JWT `exp` claim hasn't technically elapsed yet. A fast SHA-256 (not bcrypt) is the right hash here
— unlike a password, this token is high-entropy, randomly generated, and single-use, not a
low-entropy human-chosen secret that needs slow hashing to resist offline brute force.

**The token is returned directly in the API response, not emailed** — this system has no email
infrastructure. This is acceptable **only** because the CAPTCHA + security-question check
immediately before it is the actual identity proof; in a system with real email, this token would
be emailed to the account's address instead of handed back to whoever called the endpoint. Treat
this as a deliberate, temporary tradeoff of this phase, not a pattern to keep once email exists.

**Rate limiting:** `POST /api/auth/forgot-password/verify` is rate-limited exactly like
`POST /api/auth/login` (`src/modules/auth/forgotPasswordRateLimiter.ts` — same 10-attempts/15-minute
shape, same per-IP-only tradeoff, see "Security Hardening" below) — this is exactly the kind of
endpoint brute-force protection exists for. `POST /api/auth/forgot-password/reset` is **not**
separately rate-limited: its token is a high-entropy, single-use, 15-minute-lived secret, not a
guessable email+security-answer pair, so the same brute-force risk doesn't apply there.

### Existing users: the `SECURITY_QUESTION_NOT_SET` backfill

`securityQuestion`/`securityAnswerHash` are **required** on `User` — every user needs one before
self-service reset can work for them. The migration
(`prisma/migrations/20260804064819_add_security_question_and_password_reset`) backfills every
pre-existing row with the sentinel `'NOT_SET'` (matching
`SECURITY_QUESTION_NOT_SET` in `securityQuestion.ts` — kept in sync by hand, since a SQL migration
can't import a TS constant) before adding the `NOT NULL` constraint — the standard shape for
adding a required column to a table that already has rows.

`forgotPasswordVerify` explicitly detects this sentinel and rejects with a **distinct, actionable**
error ("ask an Admin...") **before** ever attempting a `bcrypt.compare` against
`securityAnswerHash` — `'NOT_SET'` isn't a valid bcrypt hash, and `bcrypt.compare` throws (rather
than returning `false`) on a malformed one, so the check is load-bearing, not just nicer UX.

This is a deliberate, accepted tradeoff, not an oversight: unlike every other failure mode on this
endpoint, the sentinel case *does* confirm the email belongs to a real account, just one not yet
fully configured. The alternative — folding it into the fully generic error — would leave real
users of legacy accounts with no path forward and no explanation. There is **no self-service
"update my own security question" endpoint** in this pass; an Admin fixes a legacy account via the
existing `PATCH /api/auth/users/:userId` (extended to optionally accept `securityQuestion` +
`securityAnswer` together, both-or-neither). A self-service version of that is a reasonable
near-term follow-up, not built now.

`prisma/seed.ts`'s bootstrap Admin gets a real security question/answer too, from
`ADMIN_SEED_SECURITY_QUESTION`/`ADMIN_SEED_SECURITY_ANSWER` in `.env` — same "fail loudly, don't
silently create a weak/malformed account" principle as `ADMIN_SEED_PASSWORD`
(`prisma/seedPasswordPolicy.ts`'s `assertAdminSeedSecurityQuestionStrength`): missing either value
alongside `ADMIN_SEED_EMAIL`/`PASSWORD` is a hard failure (the User model requires a real one for
every user, including this one), and an unrecognized question is rejected outright.

## Security Hardening (Post-Audit)

A focused security audit (report-only, no code changes) went through auth/token handling,
authorization coverage, injection risk, sensitive-data exposure, transport/headers, dependency
vulnerabilities, and secrets hygiene. Five findings were prioritized and fixed here, in order:

**1. (High) Brute-force protection on login.** `POST /api/auth/login` had no rate limiting — an
attacker could try unlimited passwords against any known email. `src/modules/auth/loginRateLimiter.ts`
(via the shared `src/lib/rateLimiter.ts`) rate-limits that one route: `LOGIN_RATE_LIMIT_MAX_ATTEMPTS
= 10` per `LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000` (15 minutes), **keyed by IP only**. Exceeding
it returns `429` via `next(new TooManyRequestsError())`, so the response goes through the same
centralized `errorHandler` and `{ success: false, error: { message } }` envelope as every other error
in this API.
  - *Why per-IP-only, not per-IP-plus-email:* this is an internal factory tool with a small, known
    user base, not a public consumer app — per-IP is a reasonable, simple starting point. The
    tradeoff: many users behind the same office/NAT IP share one budget, and an attacker spraying
    failed attempts against one victim's specific email from many different IPs isn't slowed by this
    alone. **Flagged for later, not fixed now:** if the user base or internet-facing exposure grows,
    a combined IP+email key or a per-account lockout counter would close that gap.
  - *Originally `express-rate-limit`'s in-memory store, since migrated to Upstash Redis:* an
    in-memory counter only works when the process stays alive between requests. On Vercel's
    serverless model, each invocation can land on a different, short-lived function instance with
    nothing shared in process memory, so the in-memory counter would silently reset constantly and
    this protection would stop working in production without any error or warning. `src/lib/
    rateLimiter.ts` now backs both this and the forgot-password limiter below with
    `@upstash/ratelimit` + `@upstash/redis` (REST-based, no persistent TCP connection — a purpose
    fit for serverless/edge, unlike `rate-limit-redis`/`ioredis`), using the exact same window/max
    numbers and per-IP keying as before — only the storage mechanism changed, not the policy. See
    "Deploying to Vercel" below for the required `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
    environment variables.

**2. (Medium) `JWT_SECRET` strength validation at startup.** Previously only checked non-empty
(`.min(1)`) — a one-character secret booted the app with no warning. `src/config/env.ts` now
requires `.min(32, 'JWT_SECRET must be at least 32 characters')`. 32 characters gives an HMAC
secret entropy in line with the 256-bit key size HS256 is built around — short enough to type/copy,
long enough that a trivial value can't pass by accident. No new check mechanism was added: this
reuses the exact same Zod-`safeParse`-then-throw fail-fast pattern `env.ts` already used for every
other required variable, so a short secret makes the app refuse to boot with a clear
`Invalid environment variables` error, same as a missing `DATABASE_URL` always has.

**3. (Medium) CORS origin allowlist.** `cors()` with no options defaults to wildcarding every
origin. `src/config/cors.ts`'s `buildCorsOptions()` replaces that with an explicit allowlist read
from `CORS_ALLOWED_ORIGINS` (comma-separated). Since the real frontend doesn't exist yet, this
can't be hardcoded — behavior is entirely env-driven:
  - `CORS_ALLOWED_ORIGINS` set → only those exact origins are allowed, in every environment.
  - Unset, `NODE_ENV !== 'production'` → falls back to allowing any `http(s)://localhost[:port]` /
    `127.0.0.1[:port]` origin, so a local frontend dev server on any port works with zero config.
  - Unset, `NODE_ENV === 'production'` → `origin: false` — no origin is allowed. CORS is a
    browser-enforced mechanism (the `cors` package never blocks the request itself; it only
    conditionally sets `Access-Control-Allow-Origin`), so this only affects browser-based
    cross-origin callers, and rejects them outright rather than silently wildcarding or silently
    carrying the dev-only localhost allowance into production. **`CORS_ALLOWED_ORIGINS` must be set
    to the real frontend's deployed origin(s) once it exists and is deployed with
    `NODE_ENV=production`** — see `.env.example`.

**4. (Medium) Seed script admin password strength.** `prisma/seed.ts`'s bootstrap-Admin path
hashed and created the Admin unconditionally once `ADMIN_SEED_EMAIL`/`ADMIN_SEED_PASSWORD` were
both present, bypassing `createUserSchema`'s `PASSWORD_MIN_LENGTH` check entirely (it writes via
`bcrypt.hash` directly, not through the API). `prisma/seedPasswordPolicy.ts` adds
`assertAdminSeedPasswordStrength()`, which reuses the *same* `PASSWORD_MIN_LENGTH` constant from
`auth.schema.ts` (not a second literal) and throws — refusing to create the admin, same "fail
loudly" principle already used for missing credentials — if the seeded password is too short. Kept
in its own side-effect-free module rather than inline in `seed.ts` (which runs a real seed,
including a live DB connection, as a top-level side effect on import) so it can be unit-tested
directly.

**5. (Low) JWT algorithm pinned explicitly.** `jwt.sign`/`jwt.verify` previously relied on
`jsonwebtoken`'s library defaults — which already reject `alg: none` and, since only a symmetric
secret is used here (no RSA/EC keys), aren't vulnerable to an algorithm-confusion attack, but
weren't an explicit contract either. `src/config/jwt.ts` exports `JWT_ALGORITHM: Algorithm =
'HS256'`, now passed explicitly as `{ algorithm: JWT_ALGORITHM }` to `sign` (`auth.service.ts`) and
`{ algorithms: [JWT_ALGORITHM] }` to `verify` (`middleware/authenticate.ts`) — a single shared
constant instead of the same string duplicated in both places.

**Left as-is, deliberately, from the same audit — not gaps to fix:**
- Prisma error `meta` (column/constraint names, e.g. `{ target: ['email'] }`) stays in `P2002` /
  `P2003` / `P2025` error responses. This is useful for API consumers building forms/validation UX,
  and only exposes field *names*, not data.
- The 5 `npm audit` findings (1 critical, 1 high, 3 moderate) are confined entirely to the
  `vitest`/`vite`/`esbuild` dev-toolchain (`devDependencies`, pulled in solely by `vitest`) — no
  production runtime dependency is affected, and fixing them requires a semver-major `vitest` bump
  (`npm audit fix --force` → `vitest@4`), out of scope for this pass.

## Cross-Cutting Conventions

**Pagination.** Every list endpoint's `page`/`pageSize` query params come from the single shared
`paginationQuerySchema` in `src/utils/pagination.ts`, which in turn reads its numbers from
`src/config/pagination.ts`: `DEFAULT_PAGE_SIZE = 20`, `MAX_PAGE_SIZE = 100`. A `pageSize` above the
max is rejected with a 400 (not silently clamped), consistent with how every other out-of-range
query/body value is handled in this codebase. `/api/search` is the one deliberate exception — as a
multi-entity instant-search/spotlight endpoint (not a paginated list), it caps at the separately
named `SEARCH_MAX_RESULTS_PER_TYPE = 20` (default `SEARCH_DEFAULT_RESULTS_PER_TYPE = 5`), also in
`src/config/pagination.ts`, because trigram-ranked matches become less useful past a small number
per entity type and a lower cap keeps the multi-entity fan-out response size in check.

## Design decisions

**Soft vs hard delete.** All Module 1 master-data deletes (`products`, `lines`, `hr-teams`,
`bom`, `rm-inventory`) are **hard deletes**. The tables are small, low-churn reference data, and
the schema already has real foreign keys (`orders.sku`, `bom_components.model_ref`,
`daily_production_log.model_id/line_id`, `hr_teams.line_id`, `production_schedule.line_id`) with
no `ON DELETE CASCADE` on those specific relations. Postgres rejects deleting a row that's still
referenced (Prisma surfaces this as error code `P2003`), which `errorHandler` turns into a `400`.
In practice this means: you can freely delete a product/line/part that's unused, but deleting one
still wired into an order, BOM, or HR team fails loudly instead of silently corrupting history —
which is the behavior you want for master data feeding a production floor. If usage grows to the
point where "soft delete + reference cleanup" is needed, add a `deletedAt` column and filter it out
of list/get queries; nothing about the current API shape blocks that later.

**Transactions.** Wrapped in `prisma.$transaction` anywhere multiple writes must succeed together:
line create/update + `line_product_compatibility` sync, BOM bulk import, RM stock adjust (balance
update + `rm_transactions` ledger row), and order status transition (status update +
`order_status_history` row). List endpoints also use `$transaction` to run the `findMany` and
`count` as one round trip.

**Test strategy: separate test database, not per-test rollback.** `DATABASE_URL_TEST` points at a
second Neon/Supabase database (or branch). `src/testUtils/setupEnv.ts` swaps `DATABASE_URL` to it
before any test file runs. Tests were written to create their own uniquely-prefixed (`TEST-...`)
rows and clean them up in `afterAll`, rather than relying on transaction-rollback-per-test. This
was chosen over the rollback approach because the code under test itself calls
`prisma.$transaction(...)` for multi-step operations (order status change, stock adjustment, BOM
bulk import) — nesting the app's own transactions inside an outer per-test transaction adds
complexity (savepoints, connection pinning) for little benefit at this scale. `fileParallelism` is
disabled in `vitest.config.ts` so test files run sequentially against the one shared test database
and don't race each other's fixture rows.

**Connectivity resilience.** Neon occasionally drops a connection or takes a moment to resume from
idle, which surfaces as a Prisma error (`P1001` "Can't reach database server", and similar) on a
single query or test — one that succeeds immediately on retry. This was flagged in Module 14's
final summary as a recurring, manually-verified false alarm, and would be a real problem in an
unattended CI pipeline. Two independent layers guard against it:

1. **Application-level retry (`src/db/withRetry.ts`).** `withRetry(operation)` retries `operation`
   up to `RETRY_MAX_ATTEMPTS` (3) times with exponential backoff (`RETRY_INITIAL_BACKOFF_MS` (200ms)
   `* RETRY_BACKOFF_MULTIPLIER` (2) `^attempt` — i.e. 200ms, then 400ms between attempts), but
   **only** when `isTransientConnectionError` recognizes the failure as connection-level:
   `P1001` (can't reach server), `P1002` (server reached but timed out), `P1008` (operations timed
   out), `P1017` (server closed the connection) — see the [Prisma error
   reference](https://www.prisma.io/docs/orm/reference/error-reference). Config/auth/schema errors
   (`P1000` auth failed, `P1003` db doesn't exist, `P1010` access denied, ...) and ordinary
   business-logic errors (`P2002` unique constraint, validation errors, etc.) are **not** transient
   and propagate on the first attempt — retrying those would either mask a real bug or, for a write
   that already landed, risk double-applying it.

   That last risk is why the wrapper is applied narrowly, at exactly one point —
   `src/db/client.ts`, via a Prisma Client Extension (`$allOperations`) — rather than sprinkled
   through call sites:
   - **Wrapped:** the plain read operations `findFirst(OrThrow)`, `findUnique(OrThrow)`, `findMany`,
     `count`, `aggregate`, `groupBy`. These are idempotent by nature (a `SELECT` retried twice reads
     the same data twice), so retrying them is always safe. Every module gets this automatically —
     no call sites changed.
   - **Not wrapped: all writes** (`create`, `update`, `delete`, `upsert`, and their `*Many`
     variants) — a write can partially succeed (e.g. the row is written but the connection drops
     before the response returns), and retrying could duplicate it. These rely on Neon's connection
     stability instead, same as before this change.
   - **Not wrapped: raw queries** (`$queryRaw`/`$executeRaw`) — this codebase uses `$queryRaw` for a
     Postgres `nextval()`/`setval()` pair in `qc.service.ts` (QC serial-number reservation), which
     has side effects despite the "read" shape, and there's no generic way to tell a pure `SELECT`
     apart from that at the client-extension layer. Rather than guess, all raw queries are left
     unwrapped.
   - **Explicitly wrapped by hand:** `GET /health` in `src/app.ts` runs `withRetry(() =>
     prisma.$queryRaw\`SELECT 1\`)` — a deliberate, obviously-safe one-off call representing the
     *initial connection* case (e.g. probing right after a Neon compute resumes from idle), on 503
     if still unreachable after retrying.

2. **Test-level retry (`vitest.workspace.ts`).** Vitest's `test.retry` config is set to 2 for the
   `integration` project only — the Supertest suites listed in `INTEGRATION_TEST_FILES` that hit the
   real test database (see "Test strategy" above). The `unit` project (pure-logic files like
   `netRequirementCalculator.test.ts`, `oeeCalculator.test.ts`, `withRetry.test.ts`) never touches a
   database and keeps Vitest's default `retry: 0`, so a failure there is always a real bug, never
   connection flakiness. **Adding a new integration test file requires adding its path to
   `INTEGRATION_TEST_FILES`** or it silently lands in the `unit` project instead (no retry
   coverage).

   **This retry is a safety net for infrastructure blips, not a license to ignore flaky tests.** If
   a specific test needs its retry to pass *consistently* — not just occasionally, under an
   observed Neon incident — that is a signal to investigate the test (or the code it exercises), not
   to shrug it off. A test that's silently retried into a false pass every single run is hiding a
   real intermittent bug.

**Enum naming (`PendingRM`, `DispatchReady`, etc.).** Postgres enum labels in the spec contain
spaces (`'Pending RM'`, `'Dispatch Ready'`, `'On Track'`, ...). TypeScript/Prisma enum members can't
contain spaces, so `schema.prisma` uses `@map(...)` to keep the *stored* Postgres values exactly as
specified while giving the Prisma Client (and this API) JS-safe identifiers: `PendingRM`,
`DispatchReady`, `OnTrack`, `AtRisk`, `RMShortage`. This is why `order.status` in API responses
reads `"PendingRM"` rather than `"Pending RM"` — the database still stores the latter.

**Order creation always starts at `Open`.** `POST /api/orders` does not accept a `status` field.
Every subsequent change goes through `PATCH /api/orders/:orderId/status`, so `order_status_history`
is a complete, gap-free audit trail from the order's creation onward.

**Module 2 amendment, added during Module 10 (Smart Scheduling Engine).** The status machine
above was originally purely linear (`Open → Pending RM → Scheduled → ...`, one fixed next state
per status). Module 10 added exactly one branch: `Open` can now go to **either** `PendingRM` (the
original flow — an order that still needs material) **or** directly to `Scheduled` (new — a
CTB-Clear order the scheduling engine assigns to a line has no material shortage, so routing it
through the shortage-blocked `Pending RM` state first doesn't make business sense). Every other
status in the machine still has exactly the one linear next state it always had; this is the only
branch point anywhere in the flow. See `orders.service.ts`'s `EXTRA_ALLOWED_TRANSITIONS` and
README "Module 10" for the full reasoning, including the companion decision (un-scheduling) about
why *reverting* Scheduled back to Open is deliberately **not** handled by this same transition
validator.

**`orders.product` is a server-derived snapshot.** The client only supplies `sku`; the service
looks up the referenced `Product.productType` and stores it on the order at creation time, matching
the SQL comment ("product_type snapshot, denormalized"). It intentionally does not get updated if
the product's `productType` changes later — that's the point of a snapshot.

**RM inventory has two write paths.** `PATCH /api/rm-inventory/:partId` is a plain field overwrite
(no ledger row) to satisfy "full CRUD" on the resource. `PATCH /api/rm-inventory/:partId/adjust-stock`
is the audited path: it takes a signed `delta`, rejects adjustments that would drive stock negative,
and writes a row to the new `rm_transactions` table (not in the original sheet-derived SQL, but
explicitly required by the spec for this endpoint).

**`v_orders_with_ctb` view was not ported.** Prisma's support for database views is limited and no
Module 1/2 endpoint needs Clear-to-Build status yet. Revisit this when the dashboard/CTB-facing
module is built — the view definition from the original SQL is still valid and can be added via a
raw-SQL migration at that point.

**BigInt ids.** `bom_components.id`, `order_status_history.id`, `rm_transactions.id`, (Module 5)
`order_bom_requirements.id`, and (Module 6) `order_ctb_shortages.id` are Postgres `BIGSERIAL` →
Prisma `BigInt`. `BigInt` isn't JSON-serializable by default; `src/utils/bigint.ts`
installs a `BigInt.prototype.toJSON` that converts to a plain `number` for API responses. Given the
expected row counts here (BOM lines, status changes, stock adjustments per factory), this is safe;
it would need revisiting only if a table were expected to exceed `Number.MAX_SAFE_INTEGER` rows.

**Unseeded tables.** `prisma/seed.ts` populates exactly the tables the spec asked for (products,
lines + compatibility, HR teams, RM inventory, BOM components, orders). `production_schedule` and
`manpower_forecast` still have no endpoints and no seed data — they exist in the schema (ported
from the SQL for forward-compatibility) awaiting the modules that will use them.
`daily_production_log` / `downtime_log` now have a full API (Module 3, below) but still aren't
seeded, since the spec's seed requirements only ever named Module 1/2 tables; exercise them via the
tests or by calling `POST /api/daily-logs` directly. Same story for `order_bom_requirements`
(Module 5, below) — it starts empty for every seeded order and gets populated the first time
`GET /api/bom-explosion/order/:orderId` is called for it. Also the same story for `orders.ctbStatus`/
`ctbCheckedAt` and `order_ctb_shortages` (Module 6) — seeded orders start with `ctbStatus: null`
(`neverChecked: true` on the dashboard) until `GET /api/ctb/order/:orderId`, `.../recheck`, or
`POST /api/ctb/recheck-all` is called.

### Module 3 — Daily Production Input

**`log_id` is always server-generated**, format `DL-YYYYMMDD-NN` where `NN` resets to `01` for
each new calendar date and otherwise increments across *all* lines/shifts for that date (matching
the real data pattern: `DL-20260718-01`, `-02`, `-03`, ...). The sequence isn't backed by a
separate counter table — `nextLogId()` in `dailyLogs.service.ts` scans existing rows for the
`DL-<date>-` prefix and takes `max(suffix) + 1`. Two concurrent requests for the same date can
both compute the same candidate id; whichever insert loses raises a Postgres unique-constraint
violation (`P2002`) on the `log_id` primary key, which `createDailyLog` catches and retries (up to
5 attempts, recomputing the sequence each time) rather than taking a DB-level lock. This is
sufficient for factory-floor request volumes (a handful of daily-log submissions at a time, not a
high-frequency API) — if this ever needed to scale to heavy concurrent writes, a Postgres sequence
or advisory lock per date would remove the retry loop entirely.

**Server-computed fields, never trusted from the client.** `absentEmployees` and `attendancePct`
are not accepted in the request body at all (Zod strips unknown keys) — they're always derived
from `totalEmployees`/`presentEmployees` server-side, on both create and update. This mirrors the
same principle already applied in Module 2 (`orders.product` snapshot, `order_status_history`
written only by the server): letting the client submit a derived number invites the client and
server to disagree about it. If `totalEmployees` or `presentEmployees` is missing, or
`totalEmployees` is `0`, `attendancePct` is stored as `null` rather than dividing by zero.
`presentEmployees > totalEmployees` is rejected as a `400` validation error — checked against the
merged (existing + patch) values on update, since a `PATCH` can change just one of the two fields.

**Same-day edit window (`409`, not `400`).** `PATCH /api/daily-logs/:logId` is rejected once
`logDate` is more than `EDIT_WINDOW_DAYS` (currently `1`, defined once as a constant at the top of
`dailyLogs.service.ts`) in the past relative to today. This is a business-rule conflict on the
resource's current state — the request is well-formed, it's just too late — so it returns `409`,
consistent with how `rm-inventory/adjust-stock`'s negative-stock rejection is categorized.
`logDate` itself is **not** an updatable field (only content fields are), since allowing a client
to move a log's date would make the edit-window check meaningless. The downtime sub-resource
endpoints (`POST`/`DELETE .../downtime`) are **not** subject to this same-day restriction — the
spec scoped the rule to endpoint #4 (the main `PATCH`) only, so downtime entries can still be
corrected on older logs. Revisit this if that turns out to be an oversight rather than the
intended scope.

**`stationAssignments` replaces the flat text blob.** The old sheet stored station assignments as
`"Element: ajit, suresh | Pully: karan, arjun"`. The API now takes and returns a real JSON object
— `{"Element": ["ajit","suresh"], "Pully": ["karan","arjun"]}` — validated by Zod as a record of
non-empty-string keys to arrays of non-empty strings, stored in the `station_assignments` Json
column as-is. No more string-splitting on the client or server to answer "who worked at the Pully
station."

**Denormalized `lineName`/`modelName` snapshots stay in sync.** Like `orders.product`, this table
stores `lineName`/`modelName` alongside `lineId`/`modelId` (matching the sheet). Whenever `lineId`
or `modelId` changes — on create or via `PATCH` — the service re-looks-up the name from
`production_lines`/`products` rather than trusting a client-sent name, so the snapshot can never
drift out of sync with its own foreign key.

### Module 4 — OEE Monitoring

**The schema gap.** The original spreadsheet's Daily Log captured attendance, downtime, and model
info — everything Module 3 was built on — but never captured production *output* quantity. OEE's
Performance% and Quality% both fundamentally require actual output data (units produced, units
that passed quality), so there was no way to compute them from the existing schema. This isn't a
design oversight from Module 3; it's a genuine gap in the source spreadsheet. Module 4 closes it
with a purely additive migration on `daily_production_log`:

- `planned_minutes` (`Decimal(10,2)`, nullable) — the shift's planned production time.
- `total_output_qty` (`Decimal(12,2)`, nullable) — total units produced during the shift.
- `good_qty` (`Decimal(12,2)`, nullable) — units that passed quality; enforced `<= total_output_qty`
  at both the Zod layer (create, when both fields are in the same request) and the service layer
  (update, checked against the merged existing+patch values, mirroring how
  `presentEmployees <= totalEmployees` is already validated).

All three are optional on `POST /api/daily-logs` and `PATCH /api/daily-logs/:logId` — Module 3's
existing schema/service/tests were extended in place, not duplicated into a new module.

**Shift → planned-minutes lookup.** When `plannedMinutes` is omitted, it's defaulted from a single
named constant in `dailyLogs.service.ts` (`SHIFT_PLANNED_MINUTES`): `{ General: 480, "Full+Extended":
600 }`, falling back to `480` for any other/missing shift name. This default is only applied **the
first time** a log gets a `plannedMinutes` value — on create when omitted, and on update only when
the log doesn't already have one set. An unrelated `PATCH` (e.g. editing `notes`) never silently
recomputes or overwrites an already-set `plannedMinutes`, even if `shift` changes in the same
request; see "Assumptions" for why that boundary was drawn there.

**OEE formulas** (implemented once, in the pure `calculateOee()` in `oeeCalculator.ts`, and reused
by every endpoint):

- `downtimeMinutes` = `SUM(downtime_log.minutes)` for the log — reusing Module 3's existing
  relation, not re-derived.
- `runTimeMinutes` = `plannedMinutes - downtimeMinutes`, floored at `0`. If downtime exceeds
  planned time, that's a data-entry problem worth surfacing, not silently clamping — a note is
  added to the response's `notes` array whenever this floor kicks in.
- `availabilityPct` = `runTimeMinutes / plannedMinutes * 100`.
- `standardOutput` = `(runTimeMinutes * 60) / COALESCE(dailyLog.taktTimeOverride, product.taktTimeSec)`
  — the theoretical max units achievable in the available run time. The log's manual
  `taktTimeOverride` (Module 3) takes precedence when set; otherwise it falls back to the linked
  model's takt time.
- `performancePct` = `totalOutputQty / standardOutput * 100`.
- `qualityPct` = `goodQty / totalOutputQty * 100`.
- `oeePct` = `availabilityPct * performancePct * qualityPct / 10000` — only computed when all
  three components are non-null.

**Missing data is surfaced, never silently defaulted to zero.** Every quantity above that requires
data that isn't there (`plannedMinutes` never set, no `modelId` linked, the linked product has no
`taktTimeSec`, `totalOutputQty`/`goodQty` not yet captured, or a `0` denominator like `standardOutput
=== 0`) returns `null` for every metric downstream of the missing piece, plus a human-readable
string in the response's `notes` array explaining why. A `0` result and a `null` result mean
different things here: `totalOutputQty: 0` against a real, positive `standardOutput` is a genuine
0% Performance; `standardOutput: 0` (e.g. because `runTimeMinutes` is 0) makes Performance%
mathematically undefined, so it's `null`, not `0`. Getting this distinction right — instead of
defaulting every missing/undefined value to `0` — is the entire point of the `notes` mechanism, and
it's why `calculateOee` has dedicated unit tests for exactly these edge cases (zero planned minutes,
downtime exceeding planned minutes, missing model/takt time, missing output data, and the 0%/100%
boundary cases).

**Aggregation: summed ratios, not averaged percentages.** `GET /api/oee/summary` and
`GET /api/oee/by-line` both aggregate across multiple logs via a shared pure function,
`aggregateOee()` (also in `oeeCalculator.ts`, also independently unit-tested). It sums each
component's raw numerator and denominator *across all matching logs first*, then divides once —
e.g. aggregate Availability% = `SUM(runTimeMinutes) / SUM(plannedMinutes) * 100` — rather than
averaging each log's already-computed `oeePct`. This is the statistically correct way to combine a
ratio-of-ratios metric: a naive `AVG(oeePct)` weights a log representing 30 minutes of planned time
exactly the same as one representing 10 hours, which silently misrepresents which logs actually
drove the plant's overall performance. **Do not "simplify" this to `AVG(oeePct)`** — `oee.test.ts`
and `oeeCalculator.test.ts` both include a test that constructs two differently-weighted logs
specifically to prove the summed-ratio answer and the naive-average answer diverge (54.55% vs. a
naive 75%), so a regression here would be caught immediately.

**`excludedLogsCount` makes gaps visible.** A log missing the data a given component needs (e.g. no
`modelId`, so `standardOutput` is null) is excluded from *that component's* sums but still counted
in `logCount` and still contributes to the other components it does have data for. Each aggregate
response reports `excludedLogsCount: { availability, performance, quality }` so a dashboard can show
"Performance% is based on 18 of 20 logs" instead of quietly averaging over a smaller, unstated
sample.

**`GET /api/oee/downtime-by-reason` is a thin alias**, not a rebuild, of Module 3's
`GET /api/daily-logs/summary/downtime-by-reason`. The controller re-exports and calls the same
`downtimeByReason()` service function from `dailyLogs.service.ts`; the groupBy query itself exists
in exactly one place.

### Module 5 — BOM Explosion Engine

**Purpose and the boundary with Module 6.** Given an order's SKU and quantity, `explodeBom()`
calculates exactly how much of every raw-material component is required to build it — e.g. Order
Qty 500 × Heater Element qty-per-unit 2 = 1,000 Heater Elements required. This module answers **"how
much do we need"** only. It does not look at `rm_inventory.stock`, does not compute Clear-to-Build
status, and does not make any pass/fail decision — that's Module 6 (CTB Engine), which will consume
this module's output (`GET /api/bom-explosion/order/:orderId`) as an input, not duplicate its logic.

**Recursive, but flat with today's real data — and that's correct, not a bug.** The core
`explodeBom()` (in `bomExplosionEngine.ts`, unit-tested the same way `calculateOee()` is) is a pure,
recursive function: it walks into a component as a sub-assembly whenever that component's `partId`
also happens to exist as a `products.sku` with its own `bom_components` rows. The real seed/sample
BOM data is flat — every `bom_components.part_id` points at an `rm_inventory` part, never at another
`products.sku` — so `explodeBom()` terminates after one level (`level: 0` on every line,
`maxDepthReached: 0`) for all of today's data. This is expected, verified by a dedicated unit test
(`terminates at depth 1 ... today's real data shape`), and requires no schema changes to support
real multi-level BOMs later: the moment a `part_id` is ever also a `products.sku`, the same code path
recurses into it automatically.

- **Guards against runaway/infinite recursion**, both backed by dedicated unit tests:
  `BomCycleError` (thrown if resolving a component would revisit a SKU already on the current
  recursion path — the error message includes the full cycle, e.g. `A -> B -> A`) and
  `BomDepthExceededError` (thrown past `BOM_EXPLOSION_MAX_DEPTH = 10` nested levels). Both extend
  `AppError` (see `utils/errors.ts`) with `statusCode = 409` — a well-formed request that hit bad/
  cyclic BOM master data, not a server bug — so the existing centralized `errorHandler` maps them
  correctly with no changes needed to that middleware.
- **Aggregation across multiple paths.** If the same terminal part is reachable via more than one
  path once multi-level BOMs are real, `explodeBom()` returns one aggregated line (summed
  `requiredQty`), not duplicate rows. `qtyPerUnit`, `sourceSku`, and `level` on an aggregated line
  reflect only the *first* path encountered during the walk — `requiredQty` is the only field
  guaranteed authoritative once more than one path contributes, since a part's local qty-per-unit is
  inherently path-relative (e.g. 2 per unit of one parent vs. 3 per unit of a different parent).
  Documented in a code comment on `BomExplosionLine` right where a reader would look for it.
- **The DB fetch happens once, breadth-first, before any recursion.** `explodeBom()` never queries
  the database itself — `bomExplosion.service.ts`'s `fetchBomTree()` fetches all of a SKU's
  `bom_components` up front, then checks which of those rows' `partId`s are themselves a
  `products.sku` and fetches *their* BOM rows too, repeating until no new sub-assembly SKUs turn up
  (capped at `BOM_EXPLOSION_MAX_DEPTH` iterations as a defense-in-depth match to the pure function's
  own guard). `explodeBom()` then recurses purely over that in-memory `Map`, so it stays fast and
  trivially unit-testable without mocking a database mid-recursion.

**Lazy-compute-and-cache for the order snapshot endpoint.** `GET /api/bom-explosion/order/:orderId`
returns the existing `order_bom_requirements` rows for that order if any exist (fast path, no
recomputation) — otherwise it computes the explosion right then, persists it in a transaction, and
returns the fresh result. This was chosen over requiring a separate `POST` first because the common
case (a client just wants an order's requirement list) shouldn't need two round trips to two
different endpoints just to get data that's cheap to compute the first time and free to read every
time after. `POST .../recompute` exists specifically for the case this lazy path doesn't cover:
someone edited the BOM master after the snapshot was cached, and the cached numbers are now stale.
It always recomputes and atomically **replaces** the cached rows (`deleteMany` + `createMany` in one
`$transaction`, same all-or-nothing pattern as Module 3's daily-log + downtime create) rather than
appending — confirmed by a dedicated integration test that checks the row count stays constant
across a recompute rather than doubling. `DELETE .../order/:orderId` only clears the cache (leaves
the order itself untouched); it exists for cleanup/testing and for invalidating a snapshot after an
order's `sku`/`qty` changed, without forcing an immediate recompute.

**The persisted snapshot schema is intentionally leaner than the ad-hoc explosion result.**
`order_bom_requirements` has exactly the columns given in the Module 5 spec (`partId`, `partName`,
`qtyPerUnit`, `requiredQty`, `computedAt`) — no `sourceSku` or `level` columns. Those two fields are
still computed by `explodeBom()` and returned in full by the ad-hoc `GET /api/bom-explosion/sku/:sku`
endpoint (useful for what-if debugging/display of *how* a requirement was derived), but are dropped
when a result is persisted as an order's cached snapshot, since the given cache table has no place
to put them. An order whose SKU has zero BOM rows produces a snapshot with `totalLines: 0` — this
used to also always report `computedAt: null` and silently recompute on every `GET`, since the
lazy-cache check (`rows.length > 0`) had nothing to find for a zero-line explosion. **Fixed**: when
`explodeBom()` returns zero lines, `bomExplosion.service.ts` now persists a single sentinel row
(`partId: null, partName: '__NO_BOM__', qtyPerUnit: 0, requiredQty: 0`) instead of nothing, so the
cache-hit check has a real row to find. The sentinel is filtered out of every response — `lines`
stays `[]` and `totalLines` stays `0` for a genuinely empty BOM — but `computedAt` is now correctly
set from the very first `GET`, and a second `GET` is a real cache hit (verified by a dedicated test
asserting `computedAt` is identical across both calls and that exactly one row, the sentinel, exists
in the table).

### Module 6 — CTB (Clear To Build) Engine

**Decision logic and the boundary with Module 5.** `evaluateCtb()` (in `ctbEvaluator.ts`, unit-
tested the same way `calculateOee()`/`explodeBom()` are) takes a BOM requirement list — exactly
Module 5's output shape (`partId`, `partName`, `requiredQty`) — and a `Map<partId, currentStock>`,
and decides, per part, `shortQty = max(0, requiredQty - availableStock)`. Any part with
`shortQty > 0` goes into `shortages`; the order is `Clear To Build` iff `shortages` is empty,
`RM Shortage` otherwise. A part whose `partId` is `null` (no linked RM part on that BOM line) or
whose `partId` isn't found in the stock map is treated as `availableStock: 0` — not skipped —
because an unconfirmed/untracked part can never be proven available; this is the conservative,
correct-by-default read of "missing inventory row is a shortage, not a pass." `ctb.service.ts`
imports and calls Module 5's `getOrComputeOrderBomSnapshot()` directly for the requirement side —
Module 6 owns zero BOM-explosion logic of its own, only the stock comparison and the CTB verdict.

**Enum, not a plain string, for `ctbStatus`.** The spec snippet suggested `ctbStatus String?`;
this was changed to a Prisma enum (`CtbStatus { ClearToBuild @map("Clear To Build"), RmShortage
@map("RM Shortage") }`) to match how every other status-like column in this schema is already
modeled (`OrderStatus`, `ScheduleStatus`, `LineStatus`) — including the same `@map(...)`-for-spaces
technique `OrderStatus` already uses for `PendingRM @map("Pending RM")` etc. Postgres enforces valid
values at the database layer this way, consistent with the rest of the schema, rather than accepting
an arbitrary string on one status column while every sibling column is strongly typed.

**Freshness-window caching for endpoint #1 vs. always-live for #2.** `GET /api/ctb/order/:orderId`
reads the order's stored `ctbStatus`/`ctbCheckedAt` and, if `ctbCheckedAt` is within
`CTB_FRESHNESS_WINDOW_MS` (`ctb.service.ts`, currently **5 minutes**, named and exported so it's a
one-line tune), returns that cached result without touching `rm_inventory` or writing anything.
Once the window has passed (or the order has never been checked), it evaluates live — same code
path `POST /api/ctb/order/:orderId/recheck` always takes, unconditionally, regardless of freshness
— and persists the fresh result. This was the explicit tradeoff requested: an inventory-status
dashboard polling this endpoint shouldn't re-hit inventory and rewrite the order on every poll, but
an explicit "recheck now" (e.g. right after a stock adjustment) needs a way to bypass that window.
A response's `evaluatedLive` field tells the caller which path served it.

**Why there's an `order_ctb_shortages` table beyond the `ctbStatus`/`ctbCheckedAt` columns the spec
asked for.** `GET /api/ctb/dashboard` is explicitly required to show the shortage breakdown for
every `RM Shortage` order *without* triggering a live re-evaluation per order (that's the whole
point of it being cheap to poll). With only `ctbStatus`/`ctbCheckedAt` on `orders`, there's nowhere
to read a shortage breakdown from without recomputing it — which would defeat both the dashboard's
"don't re-evaluate everything on every call" requirement and endpoint #1's freshness-window cache
(a cache hit within the window would have no shortages to return). `order_ctb_shortages` (additive
migration, same materialized-cache pattern as Module 5's `order_bom_requirements`) is written every
time a *live* evaluation runs (endpoints #1-on-cache-miss, #2, #4) — replaced (delete + insert) each
time, not appended — and read by the dashboard and by endpoint #1's cache-hit path alike. This is a
deliberate, minimal schema addition beyond the literal snippet in the spec, called out here because
the literal snippet alone can't satisfy the dashboard's explicit requirement.

**`GET /api/ctb/dashboard` always excludes `Closed` orders**, per spec, regardless of an explicit
`?status=Closed` filter — the exclusion and the `status` filter are combined with `AND`, so asking
for `status=Closed` returns an empty page rather than an error or a silent override of the
exclusion. `ctbStatus IS NULL` orders (never evaluated) appear with `ctbStatus: null,
ctbCheckedAt: null, neverChecked: true` rather than being omitted, per spec.

**`POST /api/ctb/recheck-all` batches the two genuinely expensive parts, not every part.** It fetches
every non-Closed order once, then every order's Module 5 BOM snapshot (still one call per order —
each call is a single indexed read once that order has an explosion cached, since it goes through
the same lazy-get-or-compute path as endpoint #1/#2 — not a full re-explosion), then every involved
`rm_inventory` row in exactly **one** query for the whole batch (not one query per order per part,
which is the fan-out the spec explicitly called out to avoid). Evaluation is pure in-memory. All
writes happen in a single transaction: two grouped `updateMany` calls on `orders` (bucketed by
resulting status, since there are only two possible values, instead of one `UPDATE` per order) plus
one bulk `deleteMany` + one bulk `createMany` on `order_ctb_shortages` — a constant number of
queries regardless of how many orders are being rechecked. Returns only the summary
(`{ totalEvaluated, clearToBuildCount, rmShortageCount }`); per-order detail is what the dashboard
endpoint is for.

### Module 7 — Material Dashboard

**Read-only over Module 6's cache — never recomputes CTB or BOM explosion.** Module 6 is
order-centric ("is this order buildable?"); Module 7 flips the view to material-centric ("which
orders need this part, and how short are we?"). Every shortage view in this module
(`getShortagesByPart`, and everything composed from it: the summary and per-part detail endpoints)
reads directly from `order_ctb_shortages` joined with `orders` — the exact same table Module 6
already writes on every live evaluation. `materials.service.ts` calls zero BOM-explosion or
CTB-evaluation logic of its own. The direct consequence: a part's shortage figures here are only as
fresh as whichever affected order was *last* CTB-checked, which can differ order-to-order (one
order might have been rechecked seconds ago, another five days ago via a stale cache hit that never
got force-rechecked). Rather than hide this, every affected-order entry carries its own
`ctbCheckedAt`, and the dashboard's job is to surface staleness, not paper over it — a materials
planner deciding whether to trust a number needs to see how old it is. If this module needed
guaranteed-fresh numbers, the right lever is `POST /api/ctb/recheck-all` (Module 6) before reading
from here, not re-deriving shortages independently in Module 7.

**No global default `criticalThreshold`.** The spec's migration snippet makes it nullable and this
was kept literally: `null` means "no threshold set," full stop — such a part simply never appears
in `GET /api/materials/critical`, no matter how low its stock is. A tempting alternative would be
some formula-derived default (e.g. "threshold = 10% of typical order qty"), but there's no reliable
signal in this schema for what a *meaningful* threshold is per part — inventing one would produce
alerts a materials planner has no reason to trust, which is worse than no alert. Thresholds are
opt-in per part via `PATCH /api/materials/:partId/critical-threshold`.

**Sort order: priority first, quantity second — same principle as Module 6.** `GET
/api/materials/shortages` sorts by a part's `highestPriority` (the highest priority among every
order currently short on it) descending, then `totalShortQty` descending as the tiebreaker. A part
blocking even one High-priority order ranks above a part with a much larger total shortage that
only blocks Low-priority orders — the same "don't let quantity alone hide urgency" reasoning as
Module 6's CTB decision being per-order rather than volume-weighted. The `priority` query filter is
a *threshold* on a part's `highestPriority` (≥ the given value), not a per-row filter — a qualifying
part still lists every affected order in its `affectedOrders`, including lower-priority ones, since
hiding them would misrepresent how many orders that part actually blocks.

**`rm_inventory` has no `partName` column.** The given schema only ever gave raw materials an
identity via `partId`; `partName` has always lived on `bom_components` (and is snapshotted forward
into `order_bom_requirements`/`order_ctb_shortages`). For material-centric views that start from
`rm_inventory` itself (`GET /api/materials/critical`, and the base row for `GET
/api/materials/:partId`), there's no partName to read — `resolvePartNames()` in `materials.service.ts`
best-effort-resolves one from the most recent `bom_components` row referencing that `partId`,
falling back to the bare `partId` if the part has never appeared in any BOM (exercised directly by a
dedicated integration test). This is a display convenience only; `partId` remains the part's
canonical identity everywhere in this API.

**`GET /api/materials/critical` filters in application code, not SQL.** Comparing two columns of the
same row (`stock <= criticalThreshold`) isn't expressible in Prisma's `where` without dropping to
raw SQL. `rm_inventory` is a small, bounded master-data table (one row per raw material a factory
stocks), so fetching every row with a threshold set and filtering/sorting in memory is simpler than
introducing this codebase's first raw-SQL query for a table this size — revisit if `rm_inventory`
ever grows large enough for that filter to matter.

**`GET /api/materials/summary` composes, rather than re-queries.** Its four counts come from running
the exact same `fetchShortageJoinRows()` + `aggregateShortagesByPart()` (endpoint #1's data path)
and `getCriticalParts()` (endpoint #2's) that the other endpoints already use, called via
`Promise.all` and read from once — not a third independent set of aggregate queries, per spec.

**Module 9 (Purchase Requisition Automation) is explicitly out of scope.** No PR-status field is
guessed at from `rm_transactions.reason` strings or otherwise invented; `materials.service.ts`
carries a single `// TODO: link procurement status once Module 9 (PR Automation) exists` comment on
`MaterialPartDetail` and stops there, per the spec's explicit instruction not to expand scope here.

### Module 8 — Order-Wise Shortage Analysis

**Read-only over Modules 2 and 6 — no new stored data, no new migration.** Same principle as
Module 7: this is a reporting layer, not a new source of truth. `shortageReport.service.ts` reads
`orders` joined with `order_ctb_shortages` (via the existing `Order.ctbShortages` relation) and
does nothing else — no BOM explosion, no CTB re-evaluation. The only genuinely new logic in this
module is the urgency-scoring math itself (`urgencyScorer.ts`), which is pure arithmetic over data
already in hand.

**The urgency formula, worked example.** `urgencyScore = (priorityWeight * 20) + (shortagePct *
0.5) + dueDateTerm`, where `priorityWeight` is High=3/Medium=2/Low=1, and `dueDateTerm` is
`min(-daysToDue * 5, 100)` when overdue (`daysToDue < 0`) or `max(0, (14 - daysToDue) * 2)`
otherwise (0 once due date is 14+ days out). Worked example: a **High**-priority order (`3 * 20 =
60`), **50%** short on its missing components (`50 * 0.5 = 25`), **3 days overdue**
(`min(3 * 5, 100) = 15`) scores `60 + 25 + 15 = 100`. Change any one input and the effect on the
score is easy to isolate — that traceability, not any claim of statistical rigor, is the point of
keeping the formula this simple. The overdue term is capped at 100 so a wildly overdue order (say,
200 days late) doesn't produce an unbounded number that would make every other order look
insignificant by comparison; retune the multipliers/cap directly in `urgencyScorer.ts` if real
usage shows the weighting needs adjusting; `today` is an explicit optional parameter (default
`new Date()`) purely so the function stays deterministic and unit-testable.

**`shortagePct` is severity among the *short* components only, not overall BOM completeness.**
`order_ctb_shortages` only ever contains rows for components that are actually short — a
fully-covered part is never written there (see Module 6). So `totalRequiredQty`/`totalShortQty`
(and therefore `shortagePct`) are summed across the order's missing components alone, per the
spec's explicit definition ("summed across all its short components"). This means `shortagePct:
100` doesn't mean "0% of this order's total BOM is available" — it means "of the parts that
*are* short, on average none of what's required is in stock." Computing true overall-BOM
completeness would require Module 5's full BOM snapshot, which this module deliberately never
touches.

**`procurementRequiredQty` is Module 6's `shortQty`, renamed for this report's audience.** Same
underlying number (`GET /api/ctb/...`'s `shortages[].shortQty` and `GET /api/materials/...`'s
`totalShortQty`), relabeled here because a materials/production-manager report
answering "how much do we need to go buy" reads more naturally in procurement language than in the
CTB engine's internal vocabulary. No new computation, purely a response-shape naming choice.

**`GET /api/shortage-report/orders/:orderId`: 404 vs. a meaningful 200.** A truly nonexistent
`orderId` is a `404`. An order that exists but has nothing to report — `reportStatus:
"not_in_shortage"` (Clear To Build), `"never_checked"` (`ctbStatus` still `null`), or `"closed"`
(the order is `Closed`, even if a stale `RM Shortage` status is still sitting on it from before it
closed) — is a `200` with `report: null`, per spec: asking "what's wrong with this order" about a
healthy order is a valid question with a valid, non-error answer. The `"closed"` case isn't named in
the spec explicitly but follows the same exclusion principle threaded through the CTB dashboard
(Module 6) and the material shortage view (Module 7): a Closed order never reads as "currently at
risk" anywhere in this API, even via a direct single-order lookup, rather than leaking a stale
shortage figure that's no longer actionable.

**Sorting is in-memory, same tradeoff as Module 7.** `urgencyScore` is computed in application code,
not a stored/indexed column, so `GET /api/shortage-report/orders` fetches every matching order (all
non-Closed, `RM Shortage` orders — already a small, bounded working set for one factory), scores and
sorts them in memory, then paginates the sorted array. `ORDER BY` at the database level isn't an
option here without either persisting the score (which would immediately go stale relative to
`dueDate`, since "today" moves every day even if nothing else about the order changes) or a raw SQL
expression — both more machinery than this reporting layer needs at the expected scale.

**`overdueOnly` avoids the `z.coerce.boolean()` footgun.** `Boolean("false")` is `true` in
JavaScript — `z.coerce.boolean()` would silently treat `?overdueOnly=false` the same as
`?overdueOnly=true`. `shortageReport.schema.ts` instead accepts the literal strings `"true"`/`"false"`
and transforms explicitly, so only an actual `?overdueOnly=true` turns the filter on.

**Deferred, not built: shortage aging/history.** "How long has this order been in RM Shortage"
would need a first-detected-shortage timestamp, which doesn't exist today — `order_ctb_shortages`
rows are replaced (not appended) on every re-evaluation, so history isn't recoverable after the
fact. Adding it would mean touching Module 6's write path (e.g. preserving a `firstShortAt` across
recomputes) — a real feature, but more scope than a read-only reporting module should take on
unprompted. Noted here as a candidate for a future module/enhancement, not built.

### Module 9 — Purchase Requisition Automation

> **⚠️ Why this module recomputes consolidated demand instead of reusing Modules 6/7/8's numbers —
> read this before "simplifying" anything in `purchaseRequisitions.service.ts`.**
>
> Modules 6, 7, and 8 all evaluate CTB **per order, independently** — each order's shortage check
> compares its own requirement against total current stock, as if that order had the entire
> warehouse to itself. That's the correct question for "can THIS order build" (Module 6), "which
> orders need this part" (Module 7), and "how urgent is THIS order's shortage" (Module 8) — but it
> is the **wrong** question for procurement planning. Concretely: if five active orders each need
> 200 units of the same part and only 500 are in stock, each order's *individual* CTB check can
> still come back "Clear To Build" in isolation (each one only "sees" its own 200-unit ask against
> 500 in stock) — while the true combined shortfall, once all five orders' demand lands on the same
> finite stock at the same time, is 500 units (1000 required − 500 in stock), not zero. A PR built
> by summing Module 6/7/8's already-short parts only would silently miss every part that looks fine
> order-by-order but is actually oversubscribed in aggregate — exactly the parts procurement most
> needs to know about.
>
> `purchaseRequisitions.service.ts` therefore never reads `order_ctb_shortages` (Module 6's cache)
> or Module 7's aggregation. `POST /api/purchase-requisitions/generate` independently: (1) fetches
> every non-Closed order, (2) gets each order's BOM requirement via Module 5's
> `getOrComputeOrderBomSnapshot` (reused directly, not reimplemented), (3) sums every order's
> requirement into one `partId -> totalRequiredQty` map across the *entire* active order book, (4)
> fetches all of `rm_inventory` once, and (5) nets the combined total against stock **once**, in
> `netRequirementCalculator.ts`'s `calculateNetPurchaseRequirement`. That worked example (five
> orders × 200 vs. 500 in stock → net 500) is asserted directly in
> `netRequirementCalculator.test.ts` and in the `POST /generate` integration test — it is the single
> scenario this whole module exists to get right.

> **⚠️ Why `POST /generate` used to create a duplicate Draft PR on every call, and the two-gap fix
> — read this before touching the net-requirement formula.**
>
> Calling `/generate` twice in a row with nothing else changed used to produce a second, redundant
> Draft PR every time. The root cause was two connected gaps in the consolidated-demand math above,
> not a "block duplicate clicks" problem:
>
> - **Gap 1 — a `Fulfilled` PR didn't update stock.** When a PR transitioned to `Fulfilled`
>   (materials physically received), nothing touched `rm_inventory.stock` — the arrival was recorded
>   administratively (the status flip + `PrStatusHistory` row) but never credited to the actual
>   inventory count. Fixed: `updatePrStatus` now, inside the same transaction as the status write,
>   iterates every `PrLineItem` on the PR and increases `rm_inventory.stock` by `netRequirementQty`
>   for each one with a non-null `partId`, reusing Module 1's `adjustStock` directly (extended to
>   accept an optional `Prisma.TransactionClient` so it composes into this transaction instead of
>   opening a second, independent one) with reason `"PR Fulfillment: <prNumber>"`. Line items with a
>   null `partId` (Module 9's existing null-handling — see above) can't be credited to any inventory
>   row; they're skipped, and the count of skipped items is returned in the response
>   (`skippedLineItemsCount`) and folded into the response `message`.
> - **Gap 2 — the net-requirement formula didn't know about the open-PR pipeline.** Even with Gap 1
>   fixed, `calculateNetPurchaseRequirement` only netted demand against `currentStockQty` — it had no
>   way to know that some of that demand had *already* been asked for via a still-open PR. The
>   formula is now:
>   ```
>   netRequirementQty = max(0, totalRequiredQty - currentStockQty - alreadyRequisitionedByPart[partId])
>   ```
>   where `alreadyRequisitionedByPart` is the sum of `netRequirementQty` across every `PrLineItem`
>   belonging to a PR currently `Draft`, `Sent`, or `Approved` — i.e. still "in the pipeline," asked
>   for but not yet received. `Cancelled` PRs are excluded (never actually ordered) and, thanks to
>   Gap 1, `Fulfilled` PRs are excluded too — their quantity is now reflected in `currentStockQty`
>   instead, which is the right place for it. Counting a `Fulfilled` PR in *both* maps would
>   double-subtract the same quantity; counting it in *neither* would make it look perpetually still
>   needed. `purchaseRequisitions.service.ts`'s `sumAlreadyRequisitionedByPart` builds this map with
>   one `groupBy` query over `PrLineItem` filtered to those three statuses.
>
> **Worked example.** Five orders × 200 units of part `P-SCREW` against 500 in stock nets to a
> shortfall of 500 (the Module 9 core scenario above) and creates PR `PR-...-01` with a `P-SCREW`
> line item of `netRequirementQty: 500`, still `Draft`. Calling `/generate` again with nothing else
> changed now computes `totalRequiredQty (1000) - currentStockQty (500) - alreadyRequisitionedByPart
> ["P-SCREW"] (500) = 0` — `P-SCREW` is correctly excluded from the result entirely, and since it was
> the only part short, the call returns `{ created: false }` instead of a duplicate PR. This exact
> scenario is asserted in the `POST /generate` integration test.

**No PR is created when nothing is short.** If `calculateNetPurchaseRequirement` returns an empty
result — every part's combined demand across all active orders is covered by current stock plus
what's already sitting in an open PR — `POST /generate` returns `200` with `{ created: false,
message: "No purchase requirement — all active orders are within current stock." }` and writes
nothing. A `PurchaseRequisition` row is only ever created when there is at least one real line item
to put on it; an empty draft would just be clutter in the PR history with nothing for a procurement
user to act on.

**Status flow, and why `Cancelled` is restricted.** `Draft -> Sent -> Approved -> Fulfilled` is
strictly sequential — same rigor as Module 2's order status transitions, enforced by
`purchaseRequisitions.service.ts`'s `PR_STATUS_FLOW`, no skipping and no moving backwards.
`Cancelled` is reachable only from `Draft` or `Sent` (`CANCELLABLE_FROM`): once a requisition has
been `Approved`, procurement has already committed to it, and once it's `Fulfilled`, the materials
have already been received — both are too far along to silently cancel without leaving a dangling
real-world commitment or delivery unaccounted for. Every successful transition (including
`Cancelled`) writes a `PrStatusHistory` row, same audit-trail shape Module 2 already established
for order status (`oldStatus`, `newStatus`, `changedBy`, `changedAt`). Transitioning to `Fulfilled`
additionally credits `rm_inventory.stock` for every line item with a linked part — see the Gap 1/Gap
2 callout above.

**The "Sent" transition is explicitly not integrated with anything.** There is no real procurement
system to notify yet, so `PATCH /:prId/status` does not fake an email/webhook send when
transitioning to `Sent` — it logs the transition normally via pino and carries a single
`// TODO: wire real procurement notification once an external system exists` comment at the call
site. A function that *looks* like it sends a notification but silently does nothing would be worse
than no integration at all, since it would give a false sense that procurement has actually been
notified. The standard success text (`"Purchase Requisition Successfully Sent to Procurement
Department"`) is returned only in the API response's `message` field — it describes the state
change that happened (Draft/Sent status flip + history row), not a notification that was sent.

### Module 10 — Smart Scheduling Engine

**This is a deterministic, rule-based baseline scheduler (greedy heuristic) — NOT the AI
Scheduling Optimizer from the spec's later AI roadmap.** That future feature ("10,000+
simulations") is a different, unbuilt module. `runSchedulingPass` makes exactly one greedy pass
over eligible orders in a fixed priority-then-due-date order and never explores alternative
assignments or backtracks — it is reproducible and explainable by design, not "smart" in the AI
sense. Nothing in this module should be confused for, or later quietly repurposed as, that
optimizer.

**Capacity formula, worked example.** For each (order, candidate line) pair:

```
theoreticalOutput = (AVAILABLE_MINUTES_PER_DAY * 60) / product.taktTimeSec
workerRatio       = min(1, presentWorkers / product.manpowerRequired)
dailyOutput       = theoreticalOutput * (line.efficiencyPct / 100) * workerRatio
daysNeeded        = ceil(order.qty / dailyOutput)
estEndDate        = startDate + daysNeeded - 1
slackDays         = order.dueDate - estEndDate   (days; negative = at risk)
```

Worked example: `taktTimeSec = 60`, `manpowerRequired = 2`, line `efficiencyPct = 100`,
`presentWorkers = 2`, order `qty = 960`. `theoreticalOutput = (480 * 60) / 60 = 480` units/day.
`workerRatio = min(1, 2/2) = 1`. `dailyOutput = 480 * 1.00 * 1 = 480`. `daysNeeded = ceil(960/480)
= 2`. If `startDate` is day 0, `estEndDate` is day 1 (2 days inclusive of the start day). A due
date 10 days out gives `slackDays = 10 - 1 = 9` → `On Track`. This exact scenario is asserted in
`schedulingEngine.test.ts`.

**`AVAILABLE_MINUTES_PER_DAY = 480` is a deliberate whole-day simplification.** This module plans
in whole-day increments, not per-shift — it does not do the kind of per-shift scheduling a real
multi-shift factory floor might need. This is a different concern from Module 4's
`SHIFT_PLANNED_MINUTES` lookup (`dailyLogs.service.ts`), which reports *actual* minutes for a
shift that already happened, for OEE math on a single already-logged day. The two constants
happen to both be `480` today (a coincidence of one "General" shift also being a standard 8-hour
day), not because they share a definition — they are never imported from one another and are not
meant to be unified.

**The worker-ratio cap at 1 is deliberate, not an oversight.** Extra workers beyond a line's
`manpowerRequired` don't increase throughput past the line's physical capacity — station count and
takt time already bound it (`schedulingEngine.test.ts`'s cap test schedules an order with 100
present workers against a line needing only 2, and asserts the identical `dailyOutput` as the
exactly-staffed case).

**Sequential line-availability updates, not a static starting snapshot.** `lineAvailableFrom` is
read fresh from `production_schedule` (max `estEndDate + 1` per line already committed; today if a
line has no rows yet) once, at the start of a pass — but as orders are assigned within that same
pass, each chosen line's availability is pushed forward (`estEndDate + 1`) in a working copy before
the next order is considered. Two orders sharing the same single compatible line in one pass will
never be given overlapping days; the second one's `startDate` always begins after the first one's
`estEndDate`. Computing every order against the same static starting availability (i.e. not
updating it order-by-order) would let unrelated orders double-book a line — this is asserted
directly in `schedulingEngine.test.ts`.

**Tie-break chain: earliest `estEndDate` → highest `dailyOutput` → lowest `lineId`
alphabetically.** When two candidate lines are functionally equivalent for an order (same
`estEndDate` and `dailyOutput`), the choice must still be deterministic — "smart" scheduling that
silently picks randomly between equally-good options isn't reproducible, and a materials/
production planner re-running the same pass twice should get the same answer. `lineId` is the
final, always-decisive tiebreaker.

**Design decision #1 — `Open → Scheduled` added to the order status machine.** See "Design
decisions" above (the retroactive Module 2 note) for the full reasoning: a CTB-Clear order has no
shortage, so forcing it through `Pending RM` first doesn't make sense. This is the only branch
point added to an otherwise still-strictly-linear machine.

**Design decision #2 — un-scheduling is a deliberate administrative bypass, not a normal
transition.** `DELETE /api/scheduling/schedule/:orderId` needs to move an order's status
*backward*, from `Scheduled` to `Open` — the forward-only transition validator in
`orders.service.ts` correctly refuses to allow that as a normal transition, and it should keep
refusing it there. Rather than special-casing the validator to allow backward moves (which would
weaken the guarantee "status only ever moves forward through PATCH" for every other caller),
`scheduling.service.ts`'s `unscheduleOrder` writes `orders.status` back to `Open` directly via a
plain `prisma.order.update`, deletes the `production_schedule` row, and still writes a complete
`order_status_history` row (`oldStatus: 'Scheduled'`, `newStatus: 'Open'`, plus `changedBy` and the
new `notes` column for the caller's `reason`) so the audit trail stays intact even though this one
path skips the usual validation. **This is meant to remain a rare, deliberate admin action — not a
pattern to copy elsewhere.** No other endpoint in this API bypasses the transition validator, and
none should without equally deliberate justification.

**Why `POST /run`'s persistence isn't one single transaction across the whole batch.** The spec
frames dryRun:false as "in a single transaction, create the schedule rows and transition each
order's status ... using Module 2's status-transition service directly." In practice these two
goals are in tension: `updateOrderStatus` (Module 2) manages its own `prisma.$transaction`
internally using the shared `prisma` client. Calling it from inside an outer
`prisma.$transaction(async (tx) => ...)` would not actually compose into one atomic unit — the
inner call still runs against the global client, not `tx`, so it's really two independent
transactions racing for connections, and the outer transaction would hold a connection open across
every order in the batch for zero real atomicity benefit — a genuine risk against a small
serverless Postgres connection pool (this project runs on Neon). `runScheduling` instead processes
each scheduled order sequentially: create its `production_schedule` row, then call the reused,
unmodified `updateOrderStatus`. Per-order consistency (a given order's schedule row and status flip
happening together) is what actually matters here — the eligible orders in one pass are
independent of each other, so cross-order atomicity across the whole batch isn't necessary, and
changing Module 2's function signature to accept an external transaction client would be a larger,
riskier change than this module's scope warrants.

**Partial-failure handling: one order's write failure never aborts the batch, and is never
hidden.** Because persistence is per-order rather than one enclosing transaction (see above), a
naive `for` loop with no error handling would have two problems if, say, the 3rd of 5 orders'
writes threw partway through: (1) the first 2 orders' writes had already been individually
committed, so they'd stay scheduled regardless — but (2) the thrown error would propagate straight
out of `runScheduling` to the centralized error handler, aborting orders 4 and 5 entirely and
turning what's actually a **partial success** into an HTTP response that looks like a **total
failure**, with no indication anything succeeded. `runScheduling` wraps each order's persistence
(`production_schedule` create + `updateOrderStatus`) in its own try/catch: a failure is caught,
recorded in a new `failed: [{ orderId, error }]` array (the batch continues to the next order), and
— if the `production_schedule` row was already created before the status transition itself
failed — a best-effort delete of that row runs first, so the order is left fully eligible again for
the next `/run` call rather than stuck with an orphaned schedule row on a still-`Open` order. The
response's `summary.failedCount` and `scheduled` (which now only lists orders actually persisted,
not just proposed, when `dryRun: false`) make a partial run's real outcome visible instead of
ambiguous. Exercised directly in `scheduling.test.ts` by forcing the 3rd of 5 orders'
`productionSchedule.create` call to throw and asserting the first two stayed scheduled, the 4th and
5th were still attempted, and the 3rd is reported in `failed` with its error message.

### Module 11 — Risk Prediction Engine

**Slack itself is Module 10's output — this module never recomputes or duplicates it.** `Slack =
Due Date − Planned End Date` is already computed and stored (`slackDays`/`status`) on every
`production_schedule` row the moment Module 10 schedules an order. `risk.service.ts` reads that
stored value directly (`GET /api/risk/at-risk-orders` sorts by the stored `slackDays`; `GET
/api/risk/summary` counts the stored `status`) and never re-derives it. What's genuinely new here
is (1) a dedicated at-risk view and (2) **recommendations** for closing the gap on an at-risk
order — three "what if" options (Overtime / Extended Shift / Additional Line), which is where this
module's actual value lives.

**Minimal `schedulingEngine.ts` refactor: `computeDailyOutput` extracted and exported.** Before
this module, the capacity formula (`theoreticalOutput` / `workerRatio` capped at 1 / `dailyOutput`)
lived inline inside `computeCandidate`, private to Module 10. It's now `computeDailyOutput(inputs)`,
a standalone exported pure function that `computeCandidate` itself now calls too — behavior is
byte-for-byte identical (confirmed: all of Module 10's existing tests still pass unchanged).
`round2` and `diffDaysUTC` were also exported (previously private) since Module 11 needs the exact
same rounding and day-diff conventions Module 10 uses, not a re-implementation of either.
`riskRecommendationEngine.ts` imports all three, plus `addDaysUTC` (already exported), rather than
re-deriving any of this math independently.

**The three options, and why their constants are explicitly flagged as heuristics.**
`OVERTIME_EXTRA_MINUTES = 120` and `EXTENDED_SHIFT_EXTRA_MINUTES = 240` are **planning heuristics,
not labor-law-verified figures** — there is no real-world validation here that 2 hours of overtime
or a 4-hour shift extension is actually achievable, legal, or safe for a given line/shift/region.
They exist so a planner sees a concrete "what if we added N more minutes" projection, not a
guarantee. Every option in the response carries `isEstimate: true`, and the whole result carries a
top-level `disclaimer` string, precisely so this reads as a planning aid rather than a promise —
see `RECOMMENDATION_DISCLAIMER` in `riskRecommendationEngine.ts`.

- **Option A (Overtime)** and **Option B (Extended Shift)** both recompute `dailyOutput` for the
  **same** current line and **same** present workers, only changing
  `availableMinutesPerDay` (`480 + 120` / `480 + 240`), then recompute `daysNeeded`, `newEstEndDate`
  (from the order's *original* `startDate` — unchanged, since the order isn't moving lines), and
  `newSlackDays`.
- **Option C (Additional Line)** evaluates running the order across **both** the current line and
  each other Active, compatible line (excluding the current one) *simultaneously*:
  `combinedDailyOutput = currentLineDailyOutput + candidateLineDailyOutput`. The combined run's
  start date is the **later** of the order's own `startDate` and the candidate line's own
  next-available date (`RiskCandidateLineInput.availableFrom`, computed the same
  max-existing-`estEndDate`-plus-one-or-today way Module 10 computes `lineAvailableFrom` — never
  assumed to be day 0, since a candidate line might already be busy with something else). Among
  multiple feasible candidates, the one with the best (least negative / most positive)
  `newSlackDays` is picked as the recommended line (tie-broken by lowest `lineId`, same determinism
  chain as Module 10); `otherFeasibleLineCount` reports how many *other* candidates were also
  feasible, without listing all of them — enough for a planner to know alternatives exist, without
  bloating the response.
- Every option carries `closesGap: boolean` (`newSlackDays >= 0`), and **every option is always
  present in the response**, even when it doesn't apply (`applicable: false` with a `reason`, e.g.
  no compatible candidate line exists at all for Option C) or doesn't fully close the gap. Omitting
  a lever a planner didn't get to evaluate would be worse than showing it didn't help — see
  `generateRiskRecommendations`'s tests for the "order so far behind that nothing closes the gap"
  case, which is still a legitimate, useful answer.

**The `not_scheduled` / `not_at_risk` response pattern.** `GET
/api/risk/at-risk-orders/:orderId/recommendations` follows the same principle Module 8 already
established: asking "what's the risk story for this order" about an order that isn't actually a
problem is a valid question with a valid, non-error answer. A genuinely unknown `orderId` is a
`404`; an order that exists but has no `production_schedule` row yet is `200` with `reportStatus:
'not_scheduled'`; an order that's scheduled but currently `'On Track'` (not At Risk) is `200` with
`reportStatus: 'not_at_risk'` — both with `recommendations: null`, never a fabricated or
force-computed set of options for a non-problem.

### Module 12 — PPC Spotlight Search

> **⚠️ The `pendingQty` gap — read this before "fixing" it to return a real number.**
>
> The spec's example search result includes a "Pending Quantity" figure for an order. **Nothing in
> the current schema tracks production output against a specific order.** `daily_production_log`
> (Module 3) records output per line/model/day, not per order — the source spreadsheet never
> linked a day's output back to which order(s) it fulfilled, and multiple orders of the same SKU
> could plausibly share a single production run. This means there is no honest way to compute "how
> much of this order is still pending" today.
>
> Every order result from `GET /api/search` therefore returns `pendingQty: null` alongside
> `pendingQtyNote: "Production-to-order linkage not yet implemented — daily production logs are not
> currently tied to specific orders."` **Do not default this to the full order quantity or any other
> guess** — that would look like real tracking while being fabricated, which is worse than
> admitting the gap. Fixing this properly would need a schema change (linking
> `daily_production_log`, or a new production-run table, to specific `order_id`s) — that is out of
> scope for this module. `search.service.ts`'s `PENDING_QTY_NOTE` constant is the single source of
> this text; `search.test.ts` asserts `pendingQty` is always `null` on every returned order
> precisely so this can't silently regress into a fabricated number later.

**Trigram search setup.** `pg_trgm` and five (extended to seven — see below) GIN trigram indexes
were added via a hand-authored raw-SQL migration
(`prisma/migrations/20260801090000_add_pg_trgm_search_indexes/migration.sql`), not
`prisma migrate dev` — Prisma's schema DSL has no first-class support for `CREATE EXTENSION` or GIN
trigram operator classes, so there is no corresponding `schema.prisma` model change for this
migration at all. Applied explicitly to **both** the dev and test Neon databases (via
`prisma migrate deploy` against each `DATABASE_URL` in turn) — this project has hit the
dev-vs-test migration gap before (Module 9, Module 10) and the same two-database discipline applies
here.

- **Indexed columns**: `orders.client`, `orders.sku`, `orders.product`; `products.model_name`,
  `products.sku`, `products.product_type`; `production_lines.line_name` — seven total, two more
  than the spec's literal five-index snippet (`orders.product` and `products.product_type`), added
  because the endpoint's own "Search fields" list includes `product`/`productType` and leaving them
  unindexed would make `similarity()` queries against them a sequential scan.
- **Not indexed with trigram**: `orders.order_id`, `production_lines.line_id`. Both are already
  primary keys (b-tree indexed) and are matched via `ILIKE 'prefix%'`, not `similarity()` — a
  b-tree index already serves a left-anchored prefix match efficiently; a GIN trigram index would
  add nothing here.
- **`SEARCH_SIMILARITY_THRESHOLD = 0.15`** (`search.service.ts`) — rows scoring below this on every
  `similarity()` check are excluded from the SQL candidate set entirely. Tunable: this is a
  judgment-call starting point, not a validated-optimal figure; raise it for stricter matching,
  lower it to surface more speculative results.

**Ranking priority (`resultRanker.ts`'s `mergeAndRankResults`).** Exact case-insensitive match on
*any* of an entity's searched fields ranks first, then a starts-with match on *any* field, then the
raw trigram similarity score, descending — this three-tier chain is what makes an order like
`SO-1014` rank first for `q=SO-101` even though a structured id's trigram similarity score alone
might not be the highest among the candidates (structured ids don't share much character-trigram
overlap the way natural-language text does). The SQL layer's job is only to gather a reasonably
broad, cheap candidate pool (via `similarity() > threshold` OR `ILIKE 'prefix%'` for the
identifier fields); the tiering/final ordering is deliberately application-level pure logic, not a
single SQL `ORDER BY` expression, since it needs to reason across several differently-named columns
per entity type at once.

**Lighter payloads for products/lines.** Only order results get the full "instant result" shape the
spec describes (client, qty, dueDate, currentStage, materialStatus, pendingQty,
expectedCompletionDate, ...) — products and lines return a small identifying payload
(`modelId, sku, modelName, productType` / `lineId, lineName`) since a spotlight search result's job
is "help the user find and jump to the right record," not replicate that record's full detail view
(which its own existing endpoint already provides).

**Integration tests use their own `TEST-`-prefixed fixtures, not the literal `prisma/seed.ts`
rows.** The spec asked for tests against "real seeded data," but the shared test database has never
been seeded (confirmed directly before writing any test), and seeding it with the actual seed
dataset would introduce **permanent** orders — most importantly `SO-1001` (qty 500) against
`SP10B2`'s BOM, which needs 500 of `PART-MOTOR-SP10` against only 300 in seeded stock: a genuine
200-unit shortfall. Module 9's `POST /api/purchase-requisitions/generate` sums BOM requirements
across **every** non-Closed order in the whole database, by design (see Module 9's README note) —
its "no purchase requirement when nothing is short" test currently passes only because the test
database starts clean of any such order. Seeding the real dataset would silently break that test
the next time it ran, for a reason completely unrelated to whatever anyone happened to be working
on. `search.test.ts` instead follows the same isolated, self-cleaning `TEST-`-prefixed-fixture
convention every other module's test file already uses — the search logic itself is exercised
identically either way, since it operates on whatever rows exist in the tables, not specifically on
`prisma/seed.ts`'s own rows.

### Module 13 — QC Planning Integration

**There is no real external QC system — this module builds the generation and storage of the data
it would consume, not an integration to it.** The original spec describes an external `PRO_QC`
system auto-updating with Order ID/SKU/Batch Number/Barcode/Serial Number Range/Testing Plan once
scheduling finalizes. No such system exists in this project. `qc_batches` and `testing_plans` are
this backend's own tables; a real export/integration to an actual external QC system is future
work, out of scope here.

**Explicit generation endpoint, not a hook off Module 10 — same consistency principle as every
other automation feature so far.** Module 9's PR generation and Module 10's scheduling pass are
both explicit, separately-triggered endpoints, never a hidden side effect silently wired into
another module's write path. `POST /api/scheduling/run` does **not** call QC batch generation.
`POST /api/qc/generate` is its own explicit action a caller triggers deliberately, processing every
currently-`Scheduled` order without a QC batch yet. This keeps modules loosely coupled: Module 10
has no idea Module 13 exists, and nothing breaks if Module 13 is never called at all.

**Barcode value only — never an image.** `barcodeValue` stores the data payload a barcode would
encode (the `batchNumber` itself — simplest, and directly traceable back to the batch). This module
does **not** render that value as a scannable barcode graphic; producing an actual barcode image is
a frontend/rendering concern, entirely out of scope here. Do not mistake `barcodeValue`'s presence
for a missing image-generation feature later — it was never meant to be one.

**Serial number reservation: a native Postgres sequence, with a documented small race window.**
`qc_serial_seq` (created via hand-authored raw SQL, same approach as Module 12's `pg_trgm`
extension — Prisma's schema DSL doesn't model sequences) hands out the actual serial numbers.
Within one order's generation transaction: `nextval('qc_serial_seq')` gives the block's start,
then `setval('qc_serial_seq', start + qty - 1, true)` reserves the rest of the block in one call
rather than calling `nextval()` `qty` times. **There is a small, real, theoretical race between
those two calls** under concurrent QC generation (a different transaction's `nextval()` could land
between them) — this is accepted as a documented tradeoff, not hidden or treated as perfectly safe,
because QC batch generation is an infrequent, explicit batch action (a human clicking "generate,"
not a hot request path), not a scenario where tight concurrent races are a realistic operational
risk today. A heavier locking mechanism (e.g. `SELECT ... FOR UPDATE` on a dedicated counter row)
would close this gap if usage patterns ever change to need it.

**Batch number generation reuses the shared `sequentialIdGenerator` directly — a third caller, no
reimplementation.** `batchNumber` follows the exact `PREFIX-YYYYMMDD-NN` date-sequence-with-retry
scheme Module 3's `log_id` and Module 9's `prNumber` already use, via the same
`buildDateSequencePrefix`/`nextSequentialId`/`generateWithRetry` functions extracted during the
Module 9/10 refactor — prefix `BATCH`.

**Per-order partial-failure handling mirrors Module 10's, with one addition: a `skipped` bucket.**
Like `POST /api/scheduling/run`, `POST /api/qc/generate` wraps each order's generation in its own
try/catch so one order's failure doesn't abort the rest of the run — failures land in `failed`
with the underlying error message, and the run continues. `skipped` is additionally checked via a
fresh `qc_batches` existence lookup immediately before generating: since the eligibility query
already excludes orders with an existing batch, this branch is normally unreachable in single-caller
operation — it exists specifically for the (theoretically possible under true concurrent
`/generate` calls) case where a batch was created for an order *after* the eligibility snapshot was
taken but *before* this order was actually processed. Distinguishing that from a genuine failure
(rather than lumping both into `failed`) is what the `skipped` bucket is for.

**Testing plans are genuine master data, not a QC-only afterthought.** `TestingPlan` gets full CRUD
(`GET` list/by-id, `POST`, `PATCH`, `DELETE`) with the same validation rigor as any Module 1 entity
— `productType` uniqueness enforced by the DB's own unique constraint (same convention as
`Product.sku`), `PATCH` requires at least one field, hard delete (a plan still referenced by a
`qc_batches` row has `testingPlanId` set to `NULL` on delete via `onDelete: SetNull`, not blocked).
It should probably have existed since Module 1 but genuinely wasn't needed until QC batch
generation required a `productType -> plan` lookup.

**Folder layout: testing-plan CRUD lives in `src/modules/qc/` as its own files, not a separate
top-level module folder.** `testingPlans.{routes,controller,service,schema,test}.ts` sit alongside
`qc.{routes,controller,service,schema,test}.ts` in the same folder — `qc.routes.ts` mounts
`testingPlansRouter` as a sub-router at `/testing-plans`. Kept in one folder (rather than a
separate `src/modules/testingPlans/`) since the two concerns are tightly related and small enough
not to warrant their own top-level module, while still staying in clearly separate files rather
than scattered together in one.

**No dedicated pure-function file for this module.** Unlike every module since Module 4, there's no
`*Engine.ts`/`*Calculator.ts` here — the serial-range math (`start`, `end = start + qty - 1`) is a
single line, and the rest of this module's logic (eligibility query, per-order try/catch, testing
plan lookup) is genuinely database orchestration, not something meaningfully isolable as pure,
DB-independent logic. Forcing an artificial pure-function split here would add a layer of
indirection without a real testability benefit — the per-order behaviors are exercised directly
via integration tests instead (including the partial-failure case, via mocking `prisma.qcBatch
.findUnique`, the same technique Module 10's forced-failure test established).

### Module 14 — Dashboard & Analytics

**This module is almost entirely a read/composition layer — it introduces exactly two new
calculations and reuses everything else.** Wherever a metric already had a home in an earlier
module, `dashboard.service.ts` calls that module's existing service function directly rather than
writing a second, parallel query. That's how two versions of "the same number" quietly diverge over
time, and this module is deliberately built to make that impossible: `oeePct`/`capacityUtilizationPct`
come from Module 4's `getOeeSummary()`, `ctbBreakdown` from a new but tiny Module 6 export
(`getCtbBreakdown()`), `rmShortagePartsCount` from Module 7's `getMaterialsSummary()`,
`procurementStatusBreakdown` from a new but tiny Module 9 export (`getPrStatusBreakdown()`), and
`atRiskCount` from Module 11's `getRiskSummary()`. The only genuinely new logic anywhere in this
module is the two pure functions in `dashboardMath.ts` (`calculateWeightedEfficiency`,
`calculateOnTimeRate`) plus the `deliveryPerformancePct` and `delayedCount` queries, neither of
which any earlier module already computes.

> **⚠️ Four management metrics that are easy to conflate — get these exactly right.**
>
> - **OEE** = Module 4's aggregate `oeePct` (`GET /api/oee/summary`), for the requested range.
>   Called directly; never recomputed.
> - **Capacity Utilization** = Module 4's aggregate `performancePct` (actual output ÷ theoretical
>   standard output) for the **same** range. This is **the literal same number** as OEE's
>   Performance component — not a coincidence, not an approximation — just surfaced under a
>   different, business-familiar label for this dashboard. `dashboard.test.ts` asserts this
>   equivalence directly (`capacityUtilizationPct === Module 4's own performancePct` for the same
>   date range via two separate API calls), specifically so this can never silently drift into two
>   different numbers later.
> - **Production Efficiency** is a genuinely **different** metric: the **output-weighted average of
>   `production_lines.efficiencyPct`** across lines that actually produced output in the period,
>   weighting each line's static *rated* efficiency by its `totalOutputQty` from
>   `daily_production_log` over the range (`calculateWeightedEfficiency`). This measures how
>   efficiently the *lines that ran* are rated — not actual-vs-theoretical output. A line with zero
>   output in the period contributes zero weight, not zero score dragging the average down.
> - **Delivery Performance** = the on-time completion rate (`calculateOnTimeRate`): among orders
>   whose `order_status_history` shows a transition into `Dispatch Ready` within the requested date
>   range, what percentage did so on or before `orders.dueDate`? Orders with no `dueDate` are
>   excluded from the rate (there's nothing to judge on-time-ness against) but reported separately
>   as `excludedNoDueDateCount`, never silently dropped.

**Why `Dispatch Ready`'s timestamp, not `Closed`'s, is Delivery Performance's completion event.**
Module 2's status machine is strictly linear — every order that ever reaches `Closed` necessarily
passed through `Dispatch Ready` first, at an earlier (or equal) timestamp. Using `Dispatch Ready`'s
transition as "completed" therefore already captures every eventually-`Closed` order; a second
lookup keyed on `Closed` would only ever re-find the same orders (via a later, less meaningful
timestamp — administrative closure, not production completion), never surface new ones. `Dispatch
Ready` is also the more meaningful milestone for this metric: it's the moment production/QC
actually finished, which is what "did we deliver on time" is really asking about.

> **⚠️ "Delayed" and "At Risk" are different signals — do not merge them into one query.**
>
> - **At Risk** = `production_schedule.status = 'At Risk'` — Module 10/11's existing,
>   **forward-looking** projection based on slack. An order can be At Risk well before its due date
>   ever arrives; reused directly via Module 11's `getRiskSummary().totalAtRisk`, never recomputed.
> - **Delayed** = a **lagging** indicator, computed fresh at query time: orders whose own
>   `dueDate` has already passed (`< now`) while the order's status is **not yet** `Dispatch Ready`
>   or `Closed` — i.e. it is actually overdue right now, not just projected to be. `orders.dueDate`
>   was chosen over `production_schedule.estEndDate` deliberately: it's the commitment made to the
>   client, and it exists for every order (scheduled or not), so an order that was never even
>   scheduled can still show up as delayed — `production_schedule.estEndDate` would silently miss
>   that case entirely, since there'd be no schedule row to compare against.
> - **Scheduled** = orders with a `production_schedule` row whose current order status is
>   `Scheduled` or `Running`.
>
> These are two independently-computed queries against two different signals (a stored projection
> vs. a fresh date comparison) — `dashboard.test.ts` constructs a scenario with one order that
> qualifies only as delayed (no schedule row at all) and one that qualifies only as at-risk (a
> future due date, so it can never be "delayed"), and confirms removing the at-risk order's
> schedule row changes `atRiskCount` alone, leaving `delayedCount` completely unaffected — direct
> proof the two counts don't secretly share a code path.

### Client Flow Part 1 — Machine Master Data & Order/Daily Log Extensions

The client provided a detailed production-planning flow document introducing concepts not covered
by Modules 1–14 above: per-**Machine** tracking (previously only per-Line), a daily Plan-vs-Actual
comparison, daily QC inspection results distinct from the existing QC Batch/traceability module,
a QC-driven completion forecast, and a formal order closure summary. This is being built in 5
parts; **this is Part 1**, laying the foundation Parts 2–5 build on. Nothing below should be
mistaken for those later parts being complete.

**Machine master data.** We previously only tracked capacity/status at the Line level
(`production_lines.capPerDay`, `status`). The client's flow tracks individual **Machines** within
a Line — a Line can have several. `machines` is a new table (`Machine` model) with `machineId`
(client-supplied, unique), `machineName`, a required `lineId` FK to `production_lines`, three
optional capacity fields (`capacityPerHour`, `capacityPerShift`, `capacityPerDay`), a `status`
enum (`Active` / `Offline` / `Maintenance` — a superset of `LineStatus`, since a machine can be
down for scheduled maintenance in a way the coarser Line-level status doesn't distinguish), and
free-text `notes`. Full CRUD at `/api/machines`, same permission convention as Lines: read is
`STORE_AND_PRODUCTION`, write is `Admin`-only — physical equipment configuration, same reasoning
as why Lines write is Admin-only (see "Permission matrix" above). List/detail responses include
the parent line's basic info (`line: { lineId, lineName }`) so the UI doesn't need a second
lookup.

At least one of the three capacity fields must be present — enforced at the Zod layer
(`machines.schema.ts`), not a DB constraint, matching the pattern already used elsewhere in this
codebase (e.g. Module 4's OEE fields) for validation that's about API input shape rather than data
integrity Postgres itself should police. If more than one capacity field is given, they are stored
exactly as provided with **no** attempt to reconcile them against each other (e.g. nothing checks
that `capacityPerShift ≈ capacityPerHour × shift hours`) — that reconciliation, if ever wanted, is
a distinct future feature, not implicit validation. On `PATCH`, the same "at least one" rule is
enforced only when a single request would explicitly null out all three fields at once; a request
that doesn't touch capacity at all, or only touches some of the three fields, is unaffected — this
is a payload-local Zod check (no DB read to compute the post-merge state), consistent with the
instruction that validation stays at the Zod layer.

**`daily_production_log.order_id` — the Module 12 gap-closure note.** Module 12 (PPC Spotlight
Search) explicitly documented that `daily_production_log` was never linked to a specific order, so
`GET /api/search`'s `pendingQty` could never be honestly computed (always `null` — see "Module 12"
above, `PENDING_QTY_NOTE`). `daily_production_log.orderId` (nullable, FK to `orders.orderId`) is
the schema-level fix for that: `POST /api/daily-logs` and `PATCH /api/daily-logs/:logId` now both
accept an optional `orderId`, validated against `orders` exactly like `lineId`/`modelId` already
are (`ValidationError` with a clear message, not a silent no-op, if the order doesn't exist).
**This is schema linkage only** — it lets new (and edited) daily log rows record which order they
fulfilled going forward. It deliberately does **not**, by itself, change `GET /api/search`'s
`pendingQty: null` behavior or `PENDING_QTY_NOTE` — teaching the search/pending-quantity
computation to actually use this new linkage is follow-up work for a later part, not silently
folded into this one. `orderId` stays nullable: historical rows and any daily log that genuinely
isn't tied to one order (e.g. a mixed run) remain valid.

**Self-reported vs. QC-verified reject/rework — read before conflating these.**
`daily_production_log` gained two new nullable fields, `rejectedQty` and `reworkQty`. These are
the **production team's own self-reported** figures, entered by whoever files the daily log —
not an independently verified count. A dedicated, authoritative QC inspection result (with its own
pass/reject numbers, entered by QC, not production) is planned for **Part 3** of this 5-part build
and does **not exist yet**. The two are kept as separate fields on separate rows/tables by design,
never merged into one number, precisely so a future comparison between "what production reported"
and "what QC actually found" stays possible — merging them now would silently destroy that
audit trail before Part 3 even exists to use it.

**`orders.specialRequirements`.** A simple, optional free-text field for anything about an order
that doesn't fit the structured columns (special packaging, client-specific labeling, etc.).
Accepted on `POST /api/orders` (create) and the new general-purpose `PATCH /api/orders/:orderId`
(update) — the latter is new in this part: previously `orders` only had a dedicated
status-transition endpoint (`PATCH /api/orders/:orderId/status`, governed by the sequential
status-flow validator — see "Module 2 amendment" above) and no route for editing any other order
field. `PATCH /api/orders/:orderId` is deliberately narrow (currently only `specialRequirements`)
and entirely separate from the status endpoint's transition rules — it does not touch `status` and
the status endpoint does not touch `specialRequirements`.

### Client Flow Part 2 — Daily Production Plan & Plan vs. Actual

**Part 2** of the 5-part Client Flow addition (see "Client Flow Part 1" above). Adds an explicit
day-by-day production plan per order, generated once it's scheduled, and a daily comparison
against what actually happened.

**`daily_production_plan` — one row per calendar day.** New table, `orderId` + `planDate` +
`lineId` (nullable) + `machineId` (nullable, always `null` today — see below) + `plannedQty`, with
a `@@unique([orderId, planDate])` constraint (one row per order per day). `Order` gains the
corresponding back-relation (`productionPlan`).

**Explicit generation, same convention as Module 9/Module 13.** `POST
/api/production-plan/generate/:orderId` is a deliberate, caller-triggered action — it is **not**
auto-triggered from Module 10's `POST /api/scheduling/run`, matching the same "generate on demand,
not a silent side effect" convention already established by Module 9's PR generation and Module
13's QC batch generation. It reads the order's existing `production_schedule` row (Module 10):
`startDate`, `estEndDate`, `dailyOutput`. If there's no schedule yet (or the schedule row exists
but is missing one of those three fields), it fails with a clear `409` pointing at
`POST /api/scheduling/run` rather than guessing a plan from incomplete data — this genuinely can't
run before scheduling. Re-generating an order that already has a plan **replaces** it wholesale
(delete + recreate in one transaction) — the same "force recompute replaces the cache" pattern
Module 5's `POST /api/bom-explosion/order/:orderId/recompute` already uses, not an append.

**The day-by-day distribution algorithm (`planDistributor.ts`'s `distributeDailyPlanQty`).** A
pure, isolated, unit-tested function: given `totalQty` (the order's `qty`), `dailyOutput` (from the
schedule), and `numDays` (`estEndDate − startDate + 1`, inclusive), it returns an array of
`numDays` quantities. Every day gets `min(dailyOutput, remaining)` **except the last**, which
always gets exactly whatever is left (`remaining`) — never an independently-rounded `dailyOutput`.
This is what guarantees the returned values always sum to exactly `totalQty`, in every case:

- **Even division** — `totalQty=3000, dailyOutput=1000, numDays=3` → `[1000, 1000, 1000]`. The
  "last day gets the remainder" rule still applies; it just happens that the remainder equals
  `dailyOutput` here.
- **Remainder case (the interesting one)** — `totalQty=2500, dailyOutput=1000, numDays=3` →
  `[1000, 1000, 500]`, not `[1000, 1000, 1000]` (which would over-allocate the plan by 500 units
  beyond what the order actually needs).
- **Over-allocated span** — if the schedule's day-count works out larger than `totalQty ÷
  dailyOutput` actually needs (e.g. `estEndDate` rounded up to a whole extra day it doesn't fully
  use), `remaining` can hit `0` before the last day. Every day from that point on — including the
  last — gets `0`, never negative.
- **Single-day order** — `numDays=1` always returns `[totalQty]` (the "last day" and "only day"
  are the same day).

Each value is rounded to 2 decimal places (matching `plannedQty`'s `Decimal(12,2)` column) using
the same running-remainder-subtraction approach the codebase already uses for OEE (see
`schedulingEngine.ts`'s `round2`) — because the last day absorbs "whatever's left" rather than an
independently-rounded `dailyOutput`, any per-day rounding drift is caught there too, so the sum
across the whole plan is always exact, never off by a cent from accumulated rounding.
`planDistributor.test.ts` asserts this exact-sum property directly for even division, remainder,
single-day, and over-allocated-span cases.

**`lineId`/`machineId` per plan row.** `lineId` is populated from the schedule's assigned line.
`machineId` is **always `null` for now** — machine-level scheduling assignment (deciding which of
a line's Machines an order's daily output actually runs on) isn't built. That's a materially bigger
future feature (its own assignment algorithm, capacity-aware balancing across a line's machines,
...) and this part deliberately does not invent one; it leaves the column present and null so a
later part can populate it without another schema change.

**`GET /api/production-plan/:orderId`** returns the day-by-day rows, `404` if none have been
generated yet — the same "not computed yet, not an error" framing used elsewhere (e.g. Module 6's
`neverChecked`), except surfaced as `404` here (per this part's spec) rather than a `200` with a
sentinel field, with the error message itself pointing the caller at the generate endpoint.

**`GET /api/production-plan/:orderId/plan-vs-actual` — the comparison, and the `noDataLogged`
distinction.** For each planned day, this joins against `daily_production_log` rows sharing the
same `orderId` **and** exact `logDate` — the linkage Part 1's `daily_production_log.orderId` field
made possible (see "Client Flow Part 1" above: this is precisely the follow-up work that note said
was still needed). If multiple daily-log entries exist for the same order/day (e.g. separate
General/Extended shift entries), their `totalOutputQty` values are summed into that day's
`actualQty`. Downtime reasons (`downtime_log`, already using the client's exact vocabulary:
Material Not Available, Machine Breakdown, Changeover Activity, Operator Unavailable, Power
Failure, Other) from the matching log(s) are pulled through as `gapReasons: [{ reason,
totalMinutes }]`, summed per reason across the day's log(s) — reusing Module 3's existing capture
mechanism directly rather than asking for a second, duplicate one.

A day with **zero** matching daily-log rows reports `actualQty: 0, gapReasons: [], noDataLogged:
true`. A day that **does** have a matching log reporting genuinely zero output (or simply no
downtime rows) reports the same `actualQty: 0`/`gapReasons: []` shape but `noDataLogged: false`.
This distinction matters: `noDataLogged: true` means "nobody has filed a daily log for this
order/day at all" (a data-entry gap to chase), while `noDataLogged: false` with `actualQty: 0`
means "someone did file a log, and it genuinely recorded zero output" (a production problem, not a
missing-data problem) — collapsing the two into one `actualQty: 0` would make it impossible to
tell which situation you're looking at.

Per day: `gap = actualQty − plannedQty` (signed — negative is a shortfall, positive is
over-achievement), `achievementPct = actualQty / plannedQty × 100` guarded against
`plannedQty === 0` (returns `null`, never a division-by-zero `Infinity`/`NaN`). The response also
carries a `summary`: `cumulativePlannedQty`, `cumulativeActualQty`, and an `overallAchievementPct`
computed the same guarded way over the cumulative totals (not an average of each day's
`achievementPct` — same "sum first, then divide" principle Module 4's OEE aggregation already
established, for the same reason: an average-of-percentages would let a single low-volume day skew
the overall figure as much as a high-volume one).

**Permissions: same as Scheduling (Module 10).** Read: `STORE_AND_PRODUCTION`; write (i.e.
`POST /api/production-plan/generate/:orderId`): `PRODUCTION_ONLY` in the permissions table, which
— combined with `authorize()` always letting `Admin` through — means exactly `Admin` and
`ProductionManager` can generate a plan, `StoreManager` is read-only, matching this part's spec
verbatim.

**Gap closed from Part 1, real this time.** Part 1's README note explicitly said `orderId` closed
the Module 12 gap only at the schema level and that "teaching the search/pending-quantity
computation to actually use this new linkage is follow-up work for a later part." This
plan-vs-actual endpoint is that follow-up, for the production-plan feature specifically — it does
**not** change `GET /api/search`'s `pendingQty: null` behavior, which remains a distinct, still-open
gap for a future part to address if the client's flow calls for it there too.

### Client Flow Part 3 — Daily QC Inspection

**Part 3** of the 5-part Client Flow addition (see "Client Flow Part 1" above). Adds daily QC
inspection tracking: every day production happens, QC records pass/reject/rework counts against it.

> **⚠️ "QC Batches" vs. "QC Inspections" — two completely different modules that happen to share
> the word "QC". Read this before touching either.**
>
> - **QC Batches (Module 13, `/api/qc`, `qc_batches`/`testing_plans` tables)** is **traceability**:
>   a batch number, barcode value, and serial-number range generated **once** when an order is
>   scheduled, so every unit produced can be traced back to its batch. It has no concept of daily
>   pass/reject counts.
> - **QC Inspections (Part 3, `/api/qc-inspections`, `daily_qc_inspections` table, this section)**
>   is **daily inspection results**: every day production happens, QC inspects what was made and
>   records how many passed, were rejected, or need rework. It has no concept of batch numbers,
>   barcodes, or serial ranges.
>
> They are unrelated data models serving unrelated purposes, deliberately kept in separate module
> folders (`src/modules/qc/` vs. `src/modules/qcInspection/`) and separate API prefixes (`/api/qc`
> vs. `/api/qc-inspections`) specifically so they're never confused or accidentally merged. An
> order can have both a QC batch AND any number of daily QC inspections — they coexist, they don't
> compete.

**`daily_qc_inspections` — one row per inspection event.** `orderId` (required), `inspectionDate`,
an optional `dailyLogId` link to the `daily_production_log` row this inspection's production came
from (validated — see below — but **not** a DB-level foreign key, matching how Part 2's
`daily_production_plan.lineId`/`machineId` are also plain, service-validated strings rather than
enforced FKs), `producedQty`, an optional `sampleQty` (how many of `producedQty` were actually
inspected, for partial-sample inspection), `passedQty`, `rejectedQty`, `reworkQty` (defaults to 0),
`defectType`, `qcStatus` (server-derived, see below), `remarks`, and a required `inspectorName`.

**The quantity-tolerance rule.** `passedQty + rejectedQty + reworkQty` is allowed to be **less
than** `producedQty` — partial-sample inspection is realistic; not every unit produced has
necessarily been inspected yet, and this endpoint doesn't force a caller to account for 100% of
`producedQty` in one inspection row. What it does reject is the sum **exceeding** `producedQty` by
more than `QUANTITY_SUM_TOLERANCE = 0.01` (`qcInspection.schema.ts`) — that small an allowance
exists purely to absorb harmless floating-point/rounding slop at the `Decimal(12,2)` boundary, not
to permit real overcounting (categorizing more units as passed/rejected/reworked than were actually
produced is always a data error, tolerance or not).

**`qcStatus` is always server-derived, never client-supplied.** `deriveQcStatus(passedQty,
rejectedQty, reworkQty)` in `qcInspection.service.ts` — small enough to live inline rather than in
its own file, matching this part's own "don't force isolation for a one-liner" guidance — reduces
to three reachable outcomes:

- `passedQty > 0` and nothing rejected/reworked → **`Passed`**
- `passedQty > 0` and something rejected and/or reworked → **`PartialPass`**
- `passedQty <= 0` (including the all-zero edge case: nothing recorded as passed, rejected, OR
  reworked) → **`Rejected`**

Any `qcStatus` a caller sends in the request body is silently dropped (it isn't in
`createQcInspectionSchema`'s accepted fields at all) — same "ignore any client override" pattern
Module 3's daily logs already use for `absentEmployees`/`attendancePct`. **`Pending`** exists in
the `QcInspectionStatus` enum for completeness (representing "not yet inspected") but this create
endpoint never produces it — every call supplies real quantities, so there's no "not yet inspected"
state to represent here. The all-zero edge case resolving to `Rejected` (rather than some other
status, or requiring a separate code path) is a judgment call, not a workflow this part tries to
build — if a genuine "inspection pending, no numbers yet" flow is ever wanted, that would be a
distinct future feature (e.g. a nullable-quantities draft row), not implied by anything built here.

**`dailyLogId` cross-order validation.** If provided, it must both (a) exist as a real
`daily_production_log.logId` and (b) belong to the **same** `orderId` as the inspection being
created — checked explicitly at the service layer (`validateDailyLogBelongsToOrder`), not left to
a DB constraint. A `dailyLogId` that exists but points at a different order's daily log is rejected
just as clearly as one that doesn't exist at all: silently accepting it would let one order's QC
inspection reference another order's production entry, corrupting exactly the kind of
order-to-production linkage Part 1/Part 2 were built to establish.

**`GET /api/qc-inspections/summary/:orderId` and `acceptedProductionQty`.** Returns
`{ totalProducedQty, totalPassedQty, totalRejectedQty, totalReworkQty, acceptedProductionQty,
overallPassRatePct }`, computed via Prisma's `aggregate` (`_sum`) over every inspection row for the
order — `overallPassRatePct` is `null` (never a division-by-zero `NaN`/`Infinity`) when
`totalProducedQty` is 0. `acceptedProductionQty` is **exactly** `totalPassedQty`, given its own,
explicitly-named field rather than making a caller infer "accepted production" means "the passed
total" — this is deliberately the client's own "Accepted Production" vocabulary, named so it reads
unambiguously wherever it's consumed. That matters concretely: **Part 4's completion prediction is
the first consumer**, and `getQcInspectionSummary` (`qcInspection.service.ts`) is written as a
plain, reusable exported function returning this shape — not just an HTTP handler's private logic —
specifically so Part 4 can call it directly instead of re-deriving the same sums a second time.

**Permissions.** Read: `STORE_AND_PRODUCTION`; write (`POST /api/qc-inspections`):
`PRODUCTION_ONLY` in the permissions table — combined with `authorize()` always letting `Admin`
through, this means `Admin` and `ProductionManager` can record inspections, `StoreManager` is
read-only. Identical to QC Batches' (Module 13) permission shape, for the same reason: this is the
same floor/quality domain, and `StoreManager` doesn't write QC data of either kind.

### Client Flow Part 4 — QC-Adjusted Completion Forecast & Order Closure Summary

**Part 4** of the 5-part Client Flow addition (see "Client Flow Part 1" above). Two independent
pieces: Part A projects when an order will actually finish based on real QC-accepted output; Part
B automatically captures a permanent closing snapshot the moment an order reaches `Closed`.

#### Part A — QC-Adjusted Completion Forecast

> **⚠️ This is NOT Module 11's At-Risk/On-Track prediction. Read this before conflating the two.**
>
> - **Module 11 (Risk Prediction Engine)** is **schedule-based**: it reads `slackDays` from
>   `production_schedule` (planned dates vs. `dueDate`) — it never looks at what was actually
>   produced. An order can look `'On Track'` there while nothing has actually been produced yet.
> - **The QC-Adjusted Completion Forecast (Part 4A, here)** is **QC-acceptance-based**: it
>   projects forward from *actual accepted (QC-passed) production so far*. A schedule can look
>   On Track while real accepted output is quietly falling behind, or an order behind on paper can
>   be catching up fast on the floor — these are genuinely different, complementary signals, not
>   two views of the same number.
>
> The two are kept **completely separate** on purpose: different endpoints
> (`/api/risk/at-risk-orders` vs. `/api/production-plan/:orderId/completion-forecast`), different
> modules, and deliberately different response vocabulary — `isDelayedByForecast: boolean` here,
> never Module 11's `'On Track'`/`'At Risk'` string literals — specifically so a UI showing both
> side by side can never visually blur them into one signal.

**The formula (`completionForecast.ts`'s `computeCompletionForecast`, pure and unit-tested).**

1. `balanceQty = order.qty − acceptedProductionQty` — `acceptedProductionQty` comes directly from
   Part 3's `getQcInspectionSummary(orderId)`, called as-is (not recomputed) per this part's own
   instruction.
2. `currentAvgDailyAccepted = (sum of passedQty across the trailing window) ÷
   COMPLETION_FORECAST_WINDOW_DAYS` (= **7**, `completionForecast.ts`). A recent-trend window, not
   the whole order-to-date average — a whole-history average reacts too slowly to a recent
   slowdown or speedup (a line down for the last 3 days would still show a healthy multi-week
   average). 7 days is long enough to smooth over one bad or exceptional day, short enough to
   actually react to a real trend change within about a week. Tunable, not validated-optimal.
3. `remainingProductionDays = balanceQty ÷ currentAvgDailyAccepted` — **divide-by-zero guarded**:
   if there's no accepted production at all in the window, this returns `null` with a
   `noDataReason` string, never `Infinity`/`NaN`/a crash.
4. `expectedCompletionDate = today + ceil(remainingProductionDays)` — the fractional day count is
   rounded **up** for the date itself (never claim completion sooner than the math supports), while
   `remainingProductionDays` in the response keeps the precise fractional value for display.
5. `isDelayedByForecast = expectedCompletionDate > order.dueDate` (`null` if the order has no
   `dueDate` to compare against, or no forecast could be computed at all).

**Two edge cases worth knowing about**, both covered directly in `completionForecast.test.ts`:
- **No dueDate at all**: `isDelayedByForecast: null` — there's nothing to be "delayed" relative to.
- **`balanceQty <= 0` (order already fully accepted, possibly over-produced)**: checked *before*
  the divide-by-zero guard, deliberately. An order that finished production days ago will
  legitimately show zero QC activity in the trailing window — that must read as "already done"
  (`remainingProductionDays: 0`, `expectedCompletionDate: today`), not as the unrelated "no data to
  project from" case, even though both start from `currentAvgDailyAccepted` being effectively zero.

**`GET /api/production-plan/:orderId/completion-forecast`** — lives in the `productionPlan` module
folder from Part 2 (conceptually part of the same "how is this order actually progressing" story,
not a new module for one endpoint). Returns `{ orderId, balanceQty, currentAvgDailyAccepted,
remainingProductionDays, expectedCompletionDate, dueDate, isDelayedByForecast, windowDaysUsed,
noDataReason? }` — always `200`, even in the no-recent-data case (a `noDataReason` string in an
otherwise-null-fielded response, not an error). Read permission matches Module 10/11's convention
(`STORE_AND_PRODUCTION`, i.e. all roles) — reuses `productionPlan`'s existing `read` middleware, no
new permissions-table entry needed.

#### Part B — Order Closure Summary

**`order_closure_summaries` — one row per order, written exactly once, only by the system.** Never
created or edited directly by a user; the only write path is the automatic capture described below.
`totalOrderedQty`/`totalProducedQty`/`totalQcPassedQty`/`totalRejectedQty`/`totalReworkQty` are
permanent point-in-time totals as of closure (not live-recomputed later), `plannedCompletionDate`
is the schedule's `estEndDate` if one ever existed (`null` otherwise), `actualCompletionDate` is
stamped from the moment the `Closed` transition is processed, and `delayDays` is **signed**:
positive means closed after `plannedCompletionDate` (late), negative means closed early, `null`
only when there was never a schedule to compare against.

**Automatic capture on `DispatchReady → Closed`, hooked into Module 2's existing transition —
same pattern as Module 9's `Fulfilled → stock-credit` hook.** `orders.service.ts`'s
`updateOrderStatus` already wraps the status update + `order_status_history` write in one
`prisma.$transaction`; `createOrderClosureSummary` is called from inside that same transaction
whenever `input.newStatus === 'Closed'` — mirroring exactly how `purchaseRequisitions.service.ts`'s
`updatePrStatus` calls `adjustStock(..., tx)` inline when `input.newStatus === PrStatus.Fulfilled`.
This only ever fires once per order: `Closed` is terminal in `STATUS_FLOW` (no allowed next state)
and is reachable *only* from `DispatchReady` (it never appears in `EXTRA_ALLOWED_TRANSITIONS`), so
by the time this hook runs, the transition itself has already been validated as the one and only
path that can reach `Closed`.

**Reusing Part 3's summary math from inside a transaction — an added `db` parameter, not a
duplicate implementation.** `getQcInspectionSummary` (Part 3) now takes an optional second
parameter, `db: PrismaTransactionClient = prisma` — the exact same optional-transaction-client
convention `rmInventory.service.ts`'s `adjustStock` already established. Part 4A's read-only
forecast endpoint calls it with no second argument (its own transaction, or none, doesn't matter —
there's no atomicity requirement on a plain `GET`). Part 4B's closure hook calls
`getQcInspectionSummary(order.orderId, tx)`, passing its own transaction client through, so that
read participates in the exact same transaction as the `order_closure_summaries` write — no
separate, un-atomic read outside the transaction, and no second copy of the summing logic to drift
out of sync with Part 3's original. `totalProducedQty` (summed from `daily_production_log`, not
part of Part 3's summary) is aggregated the same way, directly via `tx.dailyProductionLog.aggregate`.

**`delayReason`/`finalRemarks` — accepted generally, persisted only on `Closed`.** Rather than a
discriminated-union schema that only allows these fields when `newStatus: 'Closed'`,
`updateOrderStatusSchema` accepts them unconditionally as optional strings on every status
transition — the simplest possible shape. `updateOrderStatus` only ever reads and stores them
inside the `input.newStatus === 'Closed'` branch; sent alongside any other transition, they're
accepted by validation but have **no effect anywhere** — not stored, not logged, not rejected. This
was a deliberate choice over the stricter, more complex schema: the failure mode of "harmlessly
ignored on the wrong transition" was judged less surprising for a caller than a validation error on
a field that's optional everywhere else.

**`GET /api/orders/:orderId/closure-summary`** — `404` with **two distinguishable messages**: a
genuinely unknown `orderId` reads "Order 'X' not found" (the standard `NotFoundError` shape used
everywhere else in this codebase); an order that exists but hasn't reached `Closed` yet reads "...
has not been closed yet — no closure summary exists," pointing at the fact that a summary is
captured automatically on closure rather than looking like a generic missing-record error. Read
permission follows Orders' own convention (`STORE_AND_PRODUCTION`, all roles) — the summary is
system-written, but reading it is exactly as open as reading the order itself.

### Client Flow Part 5 — Unified Order Status Dashboard (final part)

**Part 5**, the final part of the 5-part Client Flow addition (see "Client Flow Part 1" above).
`GET /api/order-status-dashboard` gives one row per non-`Closed` order:
**Order → Line → Machine → Plan → Actual → QC → Balance → Expected Completion**, plus a status
badge — exactly the client's requested single-view composition.

**Pure composition layer, like Module 14's dashboard — every number here has a home elsewhere.**
`orderStatusDashboard.service.ts` introduces **no new business logic or duplicated calculations**.
Per order, it calls:

| Dashboard field                          | Source                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Order context (`client`, `sku`, `qty`, `priority`, `dueDate`, `status`) | `orders` table directly (Module 2)                     |
| `line`                                    | `production_schedule` (Module 10), if scheduled                        |
| `plan` (cumulative planned qty **to date**) | Part 2's new `getCumulativePlannedQtyToDate(orderId)`                |
| `qc` (`passedQty`/`rejectedQty`/`reworkQty`) | Part 3's `getQcInspectionSummary(orderId)`, reused as-is             |
| `balanceQty`, `expectedCompletionDate`, and the `isDelayedByForecast` badge input | Part 4A's `getCompletionForecast(orderId)`, reused as-is — **not recomputed** as `qty - qc.passedQty` a second time |
| `statusBadge`'s schedule-based input       | `production_schedule.status` (Module 10/11), reused verbatim           |
| `actual` (cumulative actual to date)       | A fresh direct sum of `daily_production_log.totalOutputQty` — see note below |
| `machines`                                | Always `[]` — see note below                                          |

Two fields are direct reads rather than calls into an existing exported function, and both are
called out explicitly rather than silently treated as "just another reused service call":

- **`actual`** is a one-line `daily_production_log` aggregate. The *identical* aggregate already
  exists inside `orders.service.ts`'s private `createOrderClosureSummary` (Part 4B) — but that
  function isn't exported for reuse (it's an internal hook on a specific transition, not a general
  service function), and exporting it purely so this read-only dashboard could import it would mean
  changing already-shipped, already-tested Part 4B code for no functional benefit. Re-issuing the
  same one-line `aggregate` here is a fresh, equally-trivial read, not duplicated *business logic*
  (there's no derivation, formula, or judgment call in "sum this column").
- **`machines` is always `[]`.** The Part 5 request text assumed Part 1 had added a `machineId`
  column to `daily_production_log` — **it didn't.** Part 1's actual, already-shipped scope added
  exactly `orderId`, `rejectedQty`, and `reworkQty` to that table (see "Client Flow Part 1" above);
  no field links a daily log row to a specific `Machine`. Retroactively adding one now, three parts
  later, would mean a new migration plus changes to Part 1's already-tested create/update
  endpoints — real scope creep for a field this dashboard would still show as unpopulated for every
  historical row anyway. This part's own instructions explicitly cover this outcome ("if it's empty
  ..., that's fine, return an empty array, don't fabricate data"), so `[]` is followed literally
  rather than inventing data or silently expanding Part 1's scope. Machine-level tracking of daily
  output is a real gap — same shape as `daily_production_plan.machineId` (Part 2) staying `null`
  for the same underlying reason — worth a dedicated future part if the client's flow needs it, not
  a quiet addition here.

**A deliberate performance tradeoff, not an oversight.** Composing four other services' functions
per row (`getCumulativePlannedQtyToDate`, `getQcInspectionSummary`, `getCompletionForecast` — which
itself calls `getQcInspectionSummary` again internally — plus the direct `actual`/`machines`/line
reads) issues several extra database round trips per order compared to one hand-written mega-query.
That's the explicit tradeoff this part's own instructions ask for: reuse over invention, even at
some query-count cost, so this dashboard can never silently drift out of sync with Parts 2–4's own
canonical numbers. Rows are fetched with `Promise.all` to parallelize the per-row work; this is
fine at the list endpoint's normal page sizes (default 20, max 100) and would be the first thing to
revisit (e.g. a purpose-built batched query) if this ever became a real hot path.

**The `statusBadge` precedence table — the single most important thing to get right here, since it
combines signals from three different subsystems.** Most urgent/definitive wins; the first matching
rule short-circuits every rule below it (`statusBadge.ts`'s `deriveStatusBadge`):

| # | Badge            | Condition                                                                 | Why it outranks what's below                                                              |
| - | ---------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1 | ✅ Completed      | `order.status === 'DispatchReady'`                                        | A hard state fact. `Closed` orders never reach this function (excluded upstream), so this is the only "production is actually finished" state left to represent — once here, forward-looking risk signals (is it at risk? is QC still pending?) stop being the useful question. |
| 2 | 🔴 Delayed        | Part 4A's `isDelayedByForecast === true`                                  | The most concrete, most urgent signal available: a real projected due-date miss computed from actual accepted output — outranks the coarser schedule-slack signal below it. |
| 3 | 🟡 At Risk        | `production_schedule.status === 'AtRisk'` (Module 10/11, reused verbatim) AND not already Delayed | Reuses Module 10/11's own signal rather than reinventing it. Deliberately does **not** treat `'RMShortage'` schedule status as At Risk here — that's Module 6's distinct material-shortage concept, with its own dedicated surfaces (CTB dashboard, shortage report); folding it in here would blur two different problems into one badge. |
| 4 | 🔵 QC Pending     | Production has been logged (`actual > 0`) AND zero `daily_qc_inspections` rows exist for the order | A precisely-defined gap — production happened, nothing has been QC'd yet — checked via a row **count**, not a rejection-rate threshold guess. A threshold (e.g. "reject rate above X%") was considered and deliberately rejected: it answers a different question ("is quality bad?") than the one this badge is actually for ("has anyone checked yet?"), and picking an arbitrary percentage would be a much less precisely-defined rule than a plain existence check. |
| 5 | 🟢 On Track       | None of the above                                                          | —                                                                                             |

`statusBadge.test.ts` unit-tests every state individually and includes an explicit
precedence-collision test (all of Delayed/At Risk/QC Pending simultaneously true on a
`DispatchReady` order still resolves to `Completed`; Delayed still beats At Risk and QC Pending
when those are also simultaneously true; and so on down the table) — read that file alongside this
table before changing the precedence order.

**Permissions.** Read-only, all three roles (`STORE_AND_PRODUCTION` in the permissions table, plus
`Admin` via `authorize()`'s always-allow) — identical shape to Module 14's `dashboard`, per this
part's own instruction.

---

**This completes the 5-part Client Flow addition.** A mapping from the flow concepts described
across these five prompts to what was actually built — written from what this backend was told in
each part's prompt, **not** a literal quote of the client's own source document (this backend was
never shown that document's exact text, only its concepts filtered through five separate prompts;
phrasing it as a direct citation would overstate what's actually known here):

| Flow concept                                                     | Addressed by                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Order creation, structured special requirements                   | Module 2 (pre-existing) + **Part 1**'s `specialRequirements`           |
| Per-Machine capacity/status within a Line                         | **Part 1**'s `Machine` master data                                     |
| Linking daily production to the specific order it fulfills        | **Part 1**'s `daily_production_log.orderId` (closing Module 12's documented gap) |
| A day-by-day production plan once an order is scheduled           | **Part 2**'s `DailyProductionPlan` + generate endpoint                 |
| Daily Plan vs. Actual comparison, with downtime-linked gap reasons | **Part 2**'s plan-vs-actual endpoint                                   |
| Daily QC inspection results (pass/reject/rework), distinct from batch traceability | **Part 3**'s `DailyQcInspection` module                       |
| Tracking Accepted (QC-passed) Production against ordered qty       | **Part 3**'s `acceptedProductionQty` on the cumulative summary         |
| Projecting completion date from real QC-accepted output pace       | **Part 4A**'s QC-Adjusted Completion Forecast                          |
| Capturing a final production/QC/delay summary when an order closes | **Part 4B**'s automatic `OrderClosureSummary` capture                  |
| One unified per-order view: Order → Line → Machine → Plan → Actual → QC → Balance → Expected Completion | **Part 5**'s Unified Order Status Dashboard (this section) |

The **frontend UI** for any of this — Parts 1 through 5 alike — is explicitly **out of scope** for
this backend work and is a separate, later set of prompts once this backend has been reviewed.

### FG Module Part 1 — Warehouse + FG Batch Core

A **new, separate module** — not part of the 5-part Client Flow addition above, though it reuses
several of that addition's pieces (the Daily QC Inspection module, the shared sequential-id
generator). Built for the plywood manufacturing client's own specific requirement, quoted directly
from their spec and treated as load-bearing for every part of this module, not just Part 1:

> *"FG stock ko manually simple quantity entry ke roop mein na banaya jaye. FG should be
> transaction-based and linked with PPC/Production, QC, Sales Order, Warehouse and Dispatch. Only
> QC-passed quantity should become dispatch-eligible FG."*

Concretely: there is **no endpoint anywhere in this module that accepts a raw FG quantity**. The
only way an `fg_batches` row ever comes into existence is `POST /api/fg-batches/generate`, and
every field on it is either copied from a real, already-validated Daily QC Inspection row or
derived from the order/product that inspection belongs to — never a number a caller just types in.

**Warehouse — new lightweight master data.** `warehouses` (`warehouseId`, `warehouseName`,
`location?`, `isActive`), full CRUD at `/api/warehouses`, `Admin`-only write — same convention as
Lines/Machines/Products (physical/master config, not a day-to-day floor or warehouse action).
`isActive` is a normal settable field (like `Machine.status`), not the only way to remove a
warehouse — `DELETE` also exists, same as Machines/Lines/Products; `fg_batches.warehouseId` has no
DB-level FK to it (see below), so deleting a warehouse a batch still references never fails
underneath a caller — deactivate via `isActive: false` instead if batches should keep pointing at
a real-but-retired warehouse record.

**Plywood attributes on `Product`.** `plywoodGrade` (`MR`/`BWR`/`BWP`/`Other`), `thickness`,
`sheetLength`, `sheetWidth` — all nullable, added to the *existing* Model Master table rather than
a new one, because these are product properties (every unit of a given SKU has the same nominal
grade/thickness/sheet size), not batch-specific data. This is what lets an FG batch default its own
plywood fields from the product it was made from instead of asking an operator to re-enter them
every time (see below). Nullable because most products in this system aren't plywood at all — no
existing product, and no existing `products.test.ts` assertion, is affected by their addition.

**The QC-Inspection-to-FG-Batch trigger — strictly 1:1, explicit, never automatic.** `POST
/api/fg-batches/generate` takes `{ qcInspectionId, warehouseId?, rackBinLocation?, salesOrderId?,
productionDate?, plywoodGrade?, thickness?, sheetLength?, sheetWidth? }` and, in order:

1. Loads the inspection via `qcInspection.service.ts`'s own `getQcInspectionById` (reused as-is,
   not re-queried) — 404 if it doesn't exist.
2. Rejects with `409` if `passedQty <= 0` — the client's core rule, enforced at the one place a
   batch can be created, not left to be a documentation-only convention.
3. Rejects with `409` (a clear "already converted to FG batch '`X`'" message, not a raw DB error)
   if this inspection already has a batch. Checked proactively first (the common case, and the
   nicest error path); `fg_batches.qc_inspection_id`'s `@unique` constraint is the actual
   enforcement underneath, and a P2002 on specifically *that* constraint (distinguished from an
   `fgBatchNo` sequence collision via the Prisma error's `meta.target` — see
   `isQcInspectionIdConflict` in `fgBatch.service.ts`) is caught and translated to the same clear
   error, closing the race a plain pre-check alone can't.
4. Loads the inspection's order (`productionOrderId` := `inspection.orderId`, `customer` :=
   `order.client`, `productName`/`sku` := `order.product`/`order.sku`) together with that order's
   product (via `Order.productRef`) for the plywood defaults. **These four order-derived fields are
   never accepted as body overrides** — only the plywood attributes are — so a batch can never be
   pointed at a different order or product than the inspection it actually came from, preserving
   the traceability the client's spec asks for. The plywood attributes *are* overridable: a real
   batch's physical dimensions can legitimately differ from its product's nominal master-data spec
   (cutting tolerance, a one-off variant run, ...), so `input.plywoodGrade ?? product.plywoodGrade`
   (and likewise for thickness/sheetLength/sheetWidth) rather than always trusting the master data.
5. Validates `warehouseId` against the real `warehouses` table if supplied (service-layer check,
   same pattern as `dailyLogId`'s cross-order validation in Part 3) — a clear `400` for an unknown
   one, not a silently-accepted dangling reference.
6. `productionDate` defaults to the inspection's own `inspectionDate` if omitted — the closest
   thing to "when this became real" already on hand — but is accepted as an override too, since
   actual production can predate the day QC certified it.
7. Generates `fgBatchNo` via the **same shared `sequentialIdGenerator`** Module 3's `logId` and
   Module 9's `prNumber` already use (`FG-YYYYMMDD-NN`, date-sequence-with-retry-on-collision) —
   not a third reimplementation of that scheme. Sequenced off the batch's own `productionDate`
   (not "today"), so batches from the same production day number together meaningfully, mirroring
   `logId`'s own choice over `prNumber`'s "today" default.
8. Creates the row inside a `prisma.$transaction`. `qcStatus` is explicitly set to `Pass` in code
   (not just left to the schema default) precisely because it's a real business decision worth
   reading in the service, not something a reader should have to cross-reference
   `schema.prisma` to understand: this endpoint only ever fires from an inspection with a real
   `passedQty` (checked in step 2), so there is no code path here that could produce
   `Fail`/`Hold`/`Pending` — those become reachable later, via Part 2's hold mechanism, not at
   creation time. `reservedQty`/`dispatchedQty`/`stockStatus`/`dispatchStatus` are left to their
   schema defaults (`0`/`0`/`Available`/`Ready`) — a freshly QC-passed batch is immediately
   dispatch-eligible unless something later puts it on hold, which is exactly what the client's
   core rule implies ("only QC-passed quantity *should become* dispatch-eligible FG" — passing QC
   is the trigger, not a separate manual "make it dispatchable" step).

**`availableQty` is deliberately NEVER a stored column — read this before adding one.**
`fg_batches` stores `qcPassedQty`, `reservedQty`, `dispatchedQty`; "how much of this batch is
actually free to sell/dispatch right now" is `qcPassedQty - reservedQty - dispatchedQty`, computed
by one shared function (`computeAvailableQty` in `fgBatch.service.ts`) that every code path
returning an `FgBatch` — list, detail, and the create response itself — goes through via `toOutput`.
The alternative (a stored `available_qty` column, updated alongside every reservation/dispatch
write) was deliberately rejected: it would require every future write path (Part 2's reservation,
Part 3/4's transfer/dispatch) to remember to keep a fourth number in sync with the other three, and
any missed update — a bug, a partial transaction, a direct DB edit — would silently drift the
stored total away from the truth with no way to detect it short of an audit. Computing it fresh
every time makes that entire class of bug structurally impossible instead of something to
discipline yourself into remembering.

**The role-split judgment call — confirmed as proposed.** FG batch *creation* (`fgBatch.write`) is
`Admin`/`ProductionManager`: it's the natural continuation of a QC pass, same domain as
`qcInspections`, and happens on the production floor's own timeline (right after an inspection),
not the warehouse's. Warehouse master data (`warehouses.write`) is `Admin`-only, same convention as
Lines/Machines/Products. This part deliberately does **not** yet grant `StoreManager` any write
access in this module — Parts 2–4's actual warehouse/bin assignment, reservation, and dispatch
actions are where that inventory-side territory begins, and each will get its own permissions-table
entry when built, rather than this part speculatively granting `StoreManager` write access to an
endpoint (`generate`) that isn't really theirs. Both roles can already **read** everything here
(`STORE_AND_PRODUCTION`), consistent with the rest of this codebase's "reads are shared, writes are
split" convention.

**What's deferred to Part 2, on purpose.** The initial `BatchCreated` movement-ledger entry the
original brief mentions is **not** built in Part 1 — Part 2 is explicitly where that ledger table
gets designed, and stubbing a throwaway version of it now (before its real shape is known) risked
either blocking this part on a guess or getting redesigned/discarded the moment Part 2 actually
defines it. `generateFgBatch`'s create already runs inside a `prisma.$transaction` specifically so
Part 2 can add that movement-log insert into the *same* atomic unit without restructuring this
function — nothing here needs to change shape to accommodate it later, only grow. Also deferred:
`FgQcStatus.Fail`/`Hold`, warehouse/bin *reassignment* (this part only accepts an initial
`warehouseId`/`rackBinLocation` at creation), reservation, transfer, and dispatch — all Parts 2–4.

**`GET /api/fg-batches`** — paginated, filterable by `productionOrderId`, `salesOrderId`,
`warehouseId`, `qcStatus`, `stockStatus`, `dispatchStatus`; every row includes the computed
`availableQty`. **`GET /api/fg-batches/:fgBatchNo`** — the same fields plus the linked order's and
QC inspection's basic info inlined (`order`/`qcInspectionSummary`, a small hand-picked subset of
each — see `fgBatch.service.ts`'s `includeLinked`), so the most commonly-needed context doesn't
cost a second round trip; not a substitute for `GET /api/orders/:orderId` or
`GET /api/qc-inspections/:id` themselves.

## Assumptions

- Client-supplied primary keys (`modelId`, `lineId`, `teamId`, `orderId`, `partId`) are provided by
  the caller (matching the sheet-derived `MDL-8074` / `L1` / `HR1` / `SO-1014` style codes), not
  auto-generated by the server.
- `PATCH` endpoints for master-data resources accept a partial body (any subset of fields); at
  least one field is required or the request is rejected as a validation error.
- HR team `lineId` and BOM `partId`/`modelRef` foreign-key checks return `400 Validation failed`
  (the caller sent a bad reference), not `404` (which is reserved for "the resource in the URL
  doesn't exist").
- Order status transitions are strictly sequential — `Open → PendingRM → Scheduled → Running → QC →
  DispatchReady → Closed` — with no skipping and no moving backwards. There's no "cancelled"/"reject"
  state; the spec didn't define one, so it wasn't added.
- Order deletion is blocked with `400` (not `409`) once status has moved past `Open`, per the
  spec's wording.
- `dueDate` on order creation is optional (nullable in the schema) but, when provided, must be
  today or later.
- An `adjust-stock` request that would drive `rm_inventory.stock` negative is rejected with `409`
  (a business-rule conflict on the resource's current state), while a malformed `adjust-stock`
  payload (e.g. `delta: 0`) is rejected with `400` at the Zod layer.
- `activeLinesCount` defaults to `1` when omitted on create (a single-line daily log is the common
  case; multi-line logs must state the count explicitly).
- The fixed downtime `reason` set (`Material Not Available`, `Machine Breakdown`, `Changeover
  Activity`, `Operator Unavailable`, `Power Failure`, `Other`) is enforced by a Zod enum, not a
  database enum/lookup table — the source spec didn't ask for a `downtime_reasons` master table,
  and a Zod enum is easy to extend later without a migration if that changes.
- `GET /api/daily-logs/summary/downtime-by-reason`'s `dateFrom`/`dateTo` are both optional; omitting
  either aggregates over an open-ended range rather than requiring a bounded window.
- Query parameter and JSON body field names across this API are camelCase (`lineId`, `logDate`,
  `presentEmployees`, `dateFrom`...) even where the original spec text used snake_case
  (`line_id`, `log_date`, ...) — this matches the convention already established in Modules 1 & 2,
  where the same snake_case-in-spec-prompt vs. camelCase-in-API choice was made. The
  `@map(...)` in `schema.prisma` is what keeps the underlying Postgres column names exactly as
  specified regardless of the JSON-facing casing.
- **Module 4 (OEE):** `GET /api/oee`, `/summary`, and `/by-line` all require `dateFrom`/`dateTo` in
  the query string (`400` if either is missing or `dateFrom > dateTo`), following the spec's
  explicit "don't allow unbounded queries" instruction — unlike `/api/daily-logs/summary/downtime-by-reason`
  (Module 3), whose date range is optional. Route/query naming (`:logId`, `dateFrom`/`dateTo`,
  `lineId`/`modelId`/`shift`) stays camelCase, matching the convention above rather than the
  `log_id`/`date_from` spelling used in the Module 4 spec prompt.
- **`plannedMinutes` is only auto-defaulted the first time it's set** — on create when omitted, or
  on update when the log doesn't already have a value. A `PATCH` that touches unrelated fields (or
  even changes `shift`) never recomputes an already-set `plannedMinutes` out from under a manually
  entered value. If that turns out to be wrong (e.g. changing `shift` *should* re-derive it), it's
  a one-line change in `updateDailyLog`'s `plannedMinutesPatch` logic.
- **`taktTimeOverride` (Module 3) takes precedence over `products.taktTimeSec` in the OEE
  calculation.** `calculateOee` sources Standard Output's takt time via
  `COALESCE(dailyLog.taktTimeOverride, product.taktTimeSec)`: a manually entered override on the log
  wins when present, and the linked model's takt time is only used as a fallback. This applies
  everywhere `standardOutput` is derived (`GET /api/oee/:logId`, `/summary`, `/by-line`), since they
  all funnel through the same pure function.
- **Pre-Module-4 rows have `plannedMinutes`/`totalOutputQty`/`goodQty` all `null`** (the migration
  is additive with no backfill). `GET /api/oee/:logId` on such a row returns `availabilityPct`,
  `performancePct`, `qualityPct`, and `oeePct` all `null`, each with a `notes` entry — this is
  working as intended, not an error state.
- **Module 5:** `GET /api/bom-explosion/sku/:sku` 404s on an unknown `sku` (it's a path-param
  resource lookup, same convention as `GET /api/oee/:logId` and every other `:id`-shaped route in
  this API) rather than a `400 Validation failed` like the BOM module's `modelRef`/`partId`
  *body*-field checks — the distinction being path-param-identifies-a-resource vs.
  body-field-references-one, consistent with how the rest of this API already draws that line.
- **Module 5:** `DELETE /api/bom-explosion/order/:orderId` 404s if the order itself doesn't exist,
  even though deleting a cache row for a nonexistent order is otherwise a harmless no-op — kept
  consistent with the other three BOM Explosion endpoints (and the rest of this API) always
  validating the `:orderId` path param names a real order, rather than special-casing `DELETE` to
  skip that check.
- **Module 5:** BOM Explosion's `qtyPerUnit`/`requiredQty` are returned as plain JS `number`s in
  every response (both the ad-hoc and order-snapshot endpoints), converted from Prisma `Decimal` in
  the service layer — matching Module 4's convention (`oee.service.ts`'s `toNumberOrNull`) rather
  than Module 1's convention of passing `Decimal` straight through (which serializes as a numeric
  *string*, e.g. `bom.service.ts`'s raw `BomComponent` rows). Chosen because `explodeBom()` itself
  needs plain numbers to do arithmetic (`Decimal` doesn't support `*`/`+`), so the conversion has to
  happen somewhere on the way in regardless — doing it once, consistently, in the service layer
  avoids a response shape that's `Decimal`-as-string for the cached snapshot but a plain number for
  the ad-hoc explosion.
- **Module 6:** `order_ctb_shortages` was added beyond the spec's literal `ctbStatus`/`ctbCheckedAt`
  migration snippet, because `GET /api/ctb/dashboard`'s explicit "show the shortage breakdown for
  RM Shortage orders without live-re-evaluating everything" requirement has no way to be satisfied
  from those two columns alone — see README "Module 6" above for the full reasoning.
- **Module 6:** the freshness-window cache-hit path for `GET /api/ctb/order/:orderId` never touches
  `rm_inventory` — it reads `orders.ctbStatus`/`ctbCheckedAt` plus the persisted
  `order_ctb_shortages` rows from the last live evaluation. This means a cache-hit response can go
  stale relative to a stock change that happened *within* the freshness window (e.g. someone adjusts
  stock via `PATCH /api/rm-inventory/:partId/adjust-stock` 30 seconds after a CTB check) — that's the
  accepted tradeoff of the 5-minute window the spec asked for; `POST .../recheck` exists precisely to
  bypass it when freshness actually matters (e.g. right after a stock adjustment).
- **Module 6:** `POST /api/ctb/recheck-all` evaluates *every* non-Closed order regardless of each
  order's individual freshness window — it's an explicit, deliberate bulk action, not a batched
  version of the freshness-window-respecting endpoint #1.
- **Module 7:** `PATCH /api/materials/:partId/critical-threshold`'s body schema uses plain
  `z.number().nullable()`, deliberately **not** `z.coerce.number()`, because coercion would turn a
  request meaning "clear the threshold" (`criticalThreshold: null`) into `Number(null) === 0` (a
  request meaning "set the threshold to zero"), silently changing the caller's intent.
- **Module 7:** `GET /api/materials/:partId`'s `deficit` field is `criticalThreshold - stock`
  *unclamped* (can be negative, meaning stock currently exceeds the threshold) when a threshold is
  set, and `null` when it isn't — unlike `GET /api/materials/critical`'s `deficit`, which is always
  `>= 0` by construction of that endpoint's own filter (`stock <= criticalThreshold`). Both are the
  same formula; the difference is just which rows can reach each endpoint.
- **Module 8:** an order with no `dueDate` set contributes `0` from the due-date term of the
  urgency formula (same as a far-future due date) rather than being treated as maximally urgent or
  rejected — `daysToDue` is returned as `null` in that case so the report can display "no due date"
  distinctly from "due in 0 days," but the score itself doesn't penalize or reward the order for
  simply lacking a date.
- **Module 8:** `GET /api/shortage-report/orders`'s `priority` filter is an exact match on the
  order's own `priority` (same as every other `priority` query param in this API, e.g. Module 7's),
  **not** a "this priority or higher" threshold — that "or higher" semantics only applies to Module
  7's `GET /api/materials/shortages?priority=`, where it's filtering a *part* by the highest
  priority among several different orders touching it. An order only ever has one priority, so
  "or higher" isn't a meaningful distinction here; an exact filter is simpler and matches the rest
  of the API's convention for this parameter name.
- **Module 9:** `calculateNetPurchaseRequirement`'s first input map carries `partName` (and the
  nullable `partId`) alongside `totalRequiredQty`, rather than being a bare `partId -> number` map
  as the spec snippet's prose literally suggests. `rm_inventory` has no `partName` column (see
  Module 7's README note), so the only place a part's name is available is on the *requirement*
  side (order BOM snapshots), not the *stock* side — carrying it through the first map is what lets
  the output line items be self-describing without a second lookup.
- **Module 9:** a BOM line with no linked `rm_inventory` part (`partId: null`, same nullability as
  `bom_components.part_id` / `order_bom_requirements.part_id`) is treated as having **zero**
  trackable stock, so its entire summed requirement is always short. There is no `rm_inventory` row
  such a part could ever net against; grouping still dedupes correctly across orders via the same
  `partId ?? NAME:${partName}` key Module 5's `bomExplosionEngine` already uses for this exact
  situation.
- **Module 9:** `prNumber` (`PR-YYYYMMDD-NN`) uses the same date-sequence-with-retry-on-P2002
  scheme as Module 3's `log_id` — both now call the shared `src/utils/sequentialIdGenerator.ts`
  (`buildDateSequencePrefix`, `nextSequentialId`, `generateWithRetry`), extracted out of
  `dailyLogs.service.ts` once Module 9 needed the identical pattern under a different prefix
  (`DL` vs `PR`). Each module still owns its own Prisma query for "existing ids sharing today's
  prefix," since that query targets a different table — the shared utility owns only the id
  parse/increment/format math and the retry loop.
- **Module 9:** `POST /generate` does not check for an already-open (`Draft`/`Sent`/`Approved`) PR
  covering the same parts before creating a new one — every call is treated as an explicit,
  intentional "generate a fresh consolidated PR right now" action (the spec's "Generate PR button"
  framing), not an idempotent upsert. Calling it twice in a row with unchanged demand and stock
  produces two PRs with identical line items and sequential `prNumber`s, by design — deduping or
  merging against an existing open PR would be a real feature but is out of scope here.
- **Module 9:** `GET /api/purchase-requisitions` (list) returns bare `PurchaseRequisition` rows
  without nested `lineItems`/`statusHistory`, while `GET /api/purchase-requisitions/:prId` (detail)
  includes both in full — the same summary-vs-full-detail split every other list/detail pair in
  this API already follows (e.g. Module 2's order list vs. `GET /api/orders/:orderId/history` being
  a separate call).
- **Module 9:** `prId` in the two `:prId` routes is `PurchaseRequisition.id` (the numeric primary
  key), not `prNumber` — consistent with every other numeric-id path param already in this API
  (e.g. `downtimeId` in Module 3), while human-facing lookups/searches would use `prNumber`.
- **Module 10:** `production_schedule.order_id` was made `@unique` (migration
  `production_schedule_order_unique`). The original ported schema only indexed it; both the
  scheduling engine's eligibility rule ("no existing production_schedule row yet") and `GET
  /api/scheduling/schedule/:orderId` (a single-row-per-order lookup) already assumed one schedule
  row per order, so this constraint enforces an invariant the API was already relying on, at the DB
  level. The table was confirmed empty before adding it (no module had built an API for it yet), so
  no backfill/dedup was needed.
- **Module 10:** an order with no `dueDate` gets `slackDays: null` and `status: 'On Track'` rather
  than being treated as maximally at-risk — same "missing date is neutral, not urgent" precedent as
  Module 8's urgency scorer. Within the priority-then-due-date sort, a no-`dueDate` order sorts
  *last* within its priority tier (no deadline pressure to schedule it ahead of dated orders in the
  same tier).
- **Module 10:** `presentWorkersByLine` sums `hr_teams.workers` (the planned/rostered headcount
  assigned to a line), per the spec's explicit instruction — it does **not** apply `hr_teams
  .attendancePct`. This is a forward-looking planning figure ("how many workers are we planning to
  have on this line"), deliberately distinct from Module 3's `presentEmployees`, which records
  actual same-day attendance after the fact.
- **Module 10:** `GET /api/scheduling/schedule`'s `status` query value uses the JS-safe enum
  spelling (`OnTrack`/`AtRisk`), not the spec's literal `'On Track'`/`'At Risk'` text — same
  convention Module 2's `orderStatus` already established (`PendingRM`, `DispatchReady`, ...) for
  every Postgres enum label containing a space.
- **Module 10:** the date-range filters on `GET /api/scheduling/schedule` are two independent
  optional ranges — `startDateFrom`/`startDateTo` and `estEndDateFrom`/`estEndDateTo` — rather than
  one combined range applied to both columns, since the spec names both columns explicitly and
  they can reasonably be filtered independently (e.g. "what starts this week" vs. "what's due to
  finish this week" are different questions).
- **Module 10:** un-scheduling (`DELETE /api/scheduling/schedule/:orderId`) is rejected with `400`
  if the order's current status isn't exactly `Scheduled` (e.g. it has already progressed to
  `Running` or beyond). An order that far along has real production activity behind it that a bare
  status flip back to `Open` can't undo — this guard isn't explicitly named in the spec but follows
  the same principle as `orders.service.ts`'s existing `deleteOrder` guard (blocking deletion once
  status has moved past `Open`).
- **Module 10:** `shiftMode` on every `production_schedule` row this module creates is set to the
  fixed literal `'General'`, reflecting the single-standard-shift-day assumption baked into
  `AVAILABLE_MINUTES_PER_DAY` — this module does not do per-shift scheduling, so there is no other
  meaningful value to put there.
- **Module 10:** `POST /api/scheduling/run`'s bulk `Open -> Scheduled` transitions record
  `changedBy: 'scheduling-engine'` on the `order_status_history` row — there is no per-order
  `changedBy` field on this endpoint's request body (it acts over every eligible order in one
  batch, not a single order), so a fixed system-actor label is used instead of `null`.
- **Module 11:** an At-Risk `production_schedule` row is trusted to always have `lineId`,
  `startDate`, `dueDate`, `slackDays`, and `qty` all populated — the same capacity math that
  produces `status: 'At Risk'` also produces every one of these fields together, so there is no
  code path where one is set without the others. `getRiskRecommendationsForOrder` relies on this
  invariant (non-null assertions on these fields) rather than adding defensive null-checks for a
  state that Module 10's own write path can't actually produce.
- **Module 11:** `generateRiskRecommendations`'s `order` parameter carries only `productType` (used
  to filter Option C's candidate lines) — `qty`/`dueDate`/`startDate` all come from the `schedule`
  parameter instead, since Module 10 already snapshots them onto `production_schedule`. The spec's
  function signature lists `schedule` and `order` as two separate parameters; this is what each one
  actually contributes.
- **Module 11:** the "current line" passed into `generateRiskRecommendations` doesn't need its own
  `compatibleProductTypes` (Options A/B never move the order to a different line, so compatibility
  never needs re-checking for it) — only `candidateLines` are filtered by compatibility, matching
  exactly what Option C actually needs.
- **Module 11:** the per-candidate-line "next-available date" lookup for Option C
  (`computeLineAvailableFrom`) is exported from Module 10's `scheduling.service.ts` and imported
  directly by `risk.service.ts` — originally a scoped local copy in `risk.service.ts`, extracted
  into a single shared implementation once both modules needed the identical logic (see git
  history: "Refactor: share line-availability logic between Modules 10 and 11"). Scoping the query
  to exactly the given `lineIds` (rather than scanning every `production_schedule` row) is a pure
  efficiency improvement over the original Module 10 version, not a behavior change.
- **Module 11:** `presentWorkersByLine` for the recommendations endpoint sums `hr_teams.workers`
  exactly like Module 10 does (not `attendancePct`) — same forward-looking "rostered headcount"
  convention, for the same reason (see Module 10's equivalent assumption).
- **Module 12:** `q` requires a minimum of 2 characters (`400` otherwise) — a single character
  against `similarity()` and trigram indexes is both noisy (near-meaningless similarity scores) and
  expensive (a 1-character trigram has very low selectivity), so the spec's stated minimum is
  enforced strictly, not treated as a soft suggestion.
- **Module 12:** `limit` is capped at 20 (Zod `max(20)`) — this is an instant-search/spotlight
  endpoint modeled on "show me a small handful of best matches now," not a paginated list; a caller
  wanting more than a few results per entity type should use that entity's own list endpoint
  (`GET /api/orders`, `/api/products`, `/api/lines`) instead.
- **Module 12:** the SQL layer fetches up to `CANDIDATE_POOL_SIZE = 50` rows per entity type
  (ordered by `similarity DESC`) before the application-level `mergeAndRankResults` pass reranks and
  caps to the caller's requested `limit` (default/max still per the values above) — this pool size
  is an unexposed internal implementation detail, not an API parameter, sized generously enough
  that the final ranking has real candidates to choose from without ever pulling an entire table
  for one search.
- **Module 12:** `currentStage` on an order result is exactly `order.status` (Module 2's enum,
  e.g. `Open`, `PendingRM`, `Scheduled`, ...) and `materialStatus` is exactly `order.ctbStatus`
  (Module 6's enum, nullable) — no separate "stage" vocabulary was invented, since the spec's intent
  (show where this order stands in production) is already fully represented by fields Module 2 and
  Module 6 already maintain.
- **Module 12:** this is the first raw-SQL (`$queryRaw`/`Prisma.sql`) usage anywhere in this
  codebase — every prior module either used Prisma's query builder or, where SQL would have been
  needed (e.g. Module 7's `criticalThreshold` comparison), avoided it because the read pattern was
  simple enough to filter in application code instead (see Module 7's README note). Trigram
  `similarity()` scoring has no query-builder equivalent in Prisma, so raw SQL is genuinely
  necessary here, not a convenience shortcut — every interpolated value in every query is a bound
  parameter via `Prisma.sql` tagged templates, never string-concatenated.
- **Module 13:** `POST /api/qc/generate` eligibility is `status: 'Scheduled'` with no `qc_batches`
  row (`{ qcBatch: null }`) — an order that has progressed further (`Running`, `QC`, ...) is no
  longer eligible for *fresh* generation, but its existing batch (if generated while it was still
  `Scheduled`) is untouched; this module doesn't re-evaluate or regenerate batches as an order's
  status continues to advance.
- **Module 13:** `qc_batches.order_id` and `.batch_number` are both `@unique` per the spec's given
  schema (one batch per order; batch numbers are globally unique identifiers) — `QcBatch
  .testingPlanId` is nullable and has no uniqueness constraint (many batches can share one testing
  plan, which is the whole point of a plan being reusable master data).
- **Module 13:** `GET /api/qc/batches/:batchNumber` looks up by `batchNumber` (the human-facing,
  traceable identifier), not the numeric `id` primary key — consistent with Module 9's PR module
  using `prNumber` for human lookups while `id` stays the internal path-param key elsewhere; here,
  since `batchNumber` is what actually appears on the physical batch/barcode, it's the natural
  lookup key for this one detail endpoint.
- **Module 13:** `testing_plans.id` (not `productType`) is the path-param key for the CRUD routes
  (`GET/PATCH/DELETE /api/qc/testing-plans/:id`) — consistent with every other numeric-autoincrement
  master-data key in this API (e.g. Module 9's `:prId`), while `productType` remains the field QC
  batch generation actually looks up by internally.
- **Module 14:** `calculateWeightedEfficiency` returns `0` (not `null`/`NaN`) when total output
  weight is zero (empty input, or every line had zero output) — there's no meaningful weighted
  average over zero total output, and `0` is a safer default for a dashboard percentage field than
  surfacing `NaN` to a caller.
- **Module 14:** `calculateOnTimeRate` likewise returns `rate: 0` (not `null`) when `totalCount` is
  zero after excluding no-`dueDate` completions — including when the input is empty entirely. A
  dashboard consumer should treat a `totalCount` of 0 (visible in the same response) as "no data,"
  not read `rate: 0` alone as "0% on-time performance."
- **Module 14:** `GET /api/dashboard/overview`'s production section always uses `period: 'daily'`
  — the spec doesn't specify a period for the composed overview call, and daily is the most
  granular, generally useful default for a single landing-page view; a caller wanting
  weekly/monthly grouping uses `GET /api/dashboard/production` directly.
- **Module 14:** `GET /api/dashboard/planning` and `/materials` take no date-range parameters —
  both are explicitly current-state snapshots (today's schedule health, today's material
  situation), not historical views, so there's nothing to range over. Only `/production`,
  `/management`, and `/overview` (which needs the range for the sections that use it) require
  `dateFrom`/`dateTo`.

## API docs

`openapi.yaml` covers every route in this phase and can be imported directly into Postman or
Insomnia.

## Deploying to Vercel

This backend deploys to Vercel as a single serverless Express function: `api/index.ts` imports
`createApp()` from `src/app.ts` and default-exports the resulting Express app (Vercel's Node.js
runtime accepts a default-exported Express app directly — an Express app is itself a callable
`(req, res)` handler, no `serverless-http` wrapper needed), and `vercel.json` rewrites every
incoming path to it. `createApp()` runs once per cold start, so the `src/db/client.ts` Prisma
singleton it wires up is created once and reused for every request a warm function instance
handles.

### ⚠️ Use Neon's *pooled* connection string, not the direct one

**Production `DATABASE_URL` must be Neon's pooled connection string** — the one with `-pooler` in
the hostname, found in the Neon dashboard's connection details (e.g.
`postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require`). This matters far
more here than it would for a traditional long-running server: many concurrent Vercel function
instances can each try to open a database connection, and Neon's direct connection string has no
pooling in front of it — a burst of concurrent invocations could exhaust Postgres's own connection
limit. Neon's pooler (PgBouncer-based) is what makes that safe. **Using the direct connection
string in production is a real outage risk under load, not just a performance tweak.**

This is a values-only change — an environment variable you set in Vercel's dashboard, not a code
change. While you're there, also append `&pgbouncer=true` to the pooled connection string (Prisma's
own recommendation when connecting through PgBouncer in transaction-pooling mode, which is what
Neon's pooler uses) — without it, Prisma's prepared-statement caching can intermittently collide
across the many short-lived connections a serverless deploy opens.

### Running migrations: manual, deliberately not automatic

`prisma migrate deploy` is **not** run automatically on every build/deploy. This is a deliberate
safety choice — schema migrations should be a conscious, separate action, not something that fires
on every push just because the build script happened to run. Instead:

1. Deploy the new code (build/push as normal).
2. Separately, run `npx prisma migrate deploy` yourself against the production `DATABASE_URL` (the
   pooled one above) whenever a deploy includes a schema change — before or after the code deploy,
   whichever order the specific change requires (e.g. an additive column can go either way; a
   column removal that old code still reads from must happen after the old code is gone).

Be careful with this going forward: it's easy to forget the manual migration step once deploys feel
routine. A deploy that depends on a schema change but skips this step will fail at runtime, not at
build time.

The build command itself (`"build": "prisma generate && tsc -p tsconfig.json"` in `package.json`)
only runs `prisma generate` — regenerating the Prisma Client from `schema.prisma` so the generated
client exists at build time, which a serverless deploy requires. It does not touch the database.
`package.json` also runs `prisma generate` from a `postinstall` script, so it's guaranteed to run
after every `npm install` even if Vercel's dependency caching skips re-running `build`.

`schema.prisma`'s `generator client` block also pins `binaryTargets = ["native",
"rhel-openssl-3.0.x"]` — `"rhel-openssl-3.0.x"` is the query-engine binary Vercel's Node.js
serverless runtime needs, which Prisma doesn't always auto-detect correctly during a Vercel build;
without it, a deploy can fail at runtime with `PrismaClientInitializationError` even though
`prisma generate` succeeded during the build. `"native"` is kept alongside it so local dev/test
still works on whatever platform you run `prisma generate` on.

### Required Vercel environment variables

Set these in the Vercel dashboard (Project Settings → Environment Variables) for the Production
environment:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Neon's **pooled** (`-pooler`) connection string — see above |
| `JWT_SECRET` | At least 32 characters — generate a real random value, never reuse a local/dev one |
| `ADMIN_SEED_EMAIL` | Bootstrap-only; only used if you run `prisma db seed` against production |
| `ADMIN_SEED_PASSWORD` | Same — change it after first login, same as local setup |
| `ADMIN_SEED_SECURITY_QUESTION` | Same — must be one of `SECURITY_QUESTIONS` in `securityQuestion.ts`, verbatim |
| `ADMIN_SEED_SECURITY_ANSWER` | Same — change it after first login |
| `UPSTASH_REDIS_REST_URL` | From the Upstash console's database "REST API" tab — the REST URL, not the TCP/Redis connection string |
| `UPSTASH_REDIS_REST_TOKEN` | Same tab — the REST token |
| `CORS_ALLOWED_ORIGINS` | See the chicken-and-egg note below |
| `NODE_ENV` | `production` |

`PORT`, `DATABASE_URL_TEST`, and `LOG_LEVEL` don't need to be set — `PORT` is irrelevant to a
serverless function, `DATABASE_URL_TEST` is test-suite-only, and `LOG_LEVEL` defaults to `info`.

### `CORS_ALLOWED_ORIGINS`: a chicken-and-egg step in deploy order

The backend needs to go out before the frontend's Vercel URL exists (the frontend's build/deploy
is what generates it), but `CORS_ALLOWED_ORIGINS` needs that URL to be set correctly — see README
"Security Hardening (Post-Audit)" for why an unset value means `origin: false` (all cross-origin
browser requests rejected) in production. The order in practice:

1. Deploy the backend first with `CORS_ALLOWED_ORIGINS` left unset, or set to a placeholder —
   accept that the frontend can't reach it cross-origin yet.
2. Deploy the frontend; note its real Vercel URL (or custom domain, once attached).
3. Update `CORS_ALLOWED_ORIGINS` on the backend's Vercel project to that real origin(s), then
   redeploy (or use Vercel's "Redeploy" so the new env var takes effect) the backend.

Don't leave step 3 undone — a permissive-for-now value should not become the permanent production
setting.
