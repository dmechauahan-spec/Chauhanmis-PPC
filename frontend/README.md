# Chauhanmis PPC — Frontend

The frontend for the PPC (Production Planning & Control) system — a factory floor's control
surface, consumed by production managers and store managers for hours at a time. See
`../chauhanmis PPC` (the backend, `ppc-backend`) for the 86-endpoint REST API this talks to.

## Setup

```bash
npm install
cp .env.example .env   # then edit VITE_API_BASE_URL if your backend runs on a different port
npm run dev
```

Runs at `http://localhost:5173`. The backend must be running separately (`npm run dev` in the
backend folder, default `http://localhost:3000`) — its CORS config allows any `http://localhost:*`
origin automatically when its own `NODE_ENV` isn't `production`, so no backend config change is
needed for local dev as long as both run on `localhost`.

## Tech stack

- React 18-line API surface on React 19 + Vite + TypeScript.
- **Routing**: `react-router` v7 (the unified package — most hooks/components are imported from
  `react-router` directly; only `BrowserRouter` comes from `react-router-dom`, per v7's own
  convention).
- **Server state**: `@tanstack/react-query`, via `src/lib/api-client.ts` — an `axios` instance
  with a request interceptor that attaches the JWT bearer token and a response interceptor that
  clears auth and redirects to `/login` on any `401`, centrally.
- **Styling**: Tailwind CSS v4 (CSS-first config — the token system lives entirely in
  `src/index.css`'s `@theme` block, not a separate `tailwind.config.ts`; v4 doesn't need one for
  this).
- **Component primitives**: hand-built shadcn-style components in `src/components/ui/` — see
  "About the shadcn components" below for why they're hand-built rather than CLI-generated.
- **Forms**: `react-hook-form` + `zod` (`@hookform/resolvers`), for client-side UX validation
  ahead of the backend's own (authoritative) validation.

## About the shadcn components

`npx shadcn init` needs to reach `ui.shadcn.com` to fetch its registry, and that host wasn't
reachable from the sandbox this was built in (`getaddrinfo ENOTFOUND ui.shadcn.com`). Rather than
block on that, every component in `src/components/ui/` was hand-written directly against the same
Radix primitives shadcn itself uses (`@radix-ui/react-*`), following shadcn's own component
patterns (the `cva` variant approach, `data-slot` attributes, the `cn()` merge helper) — the
result is functionally and structurally equivalent to what `shadcn add` would have generated, just
typed and restyled by hand instead of fetched. Components built this way: **Button, Card, Badge,
Input, Label, Table, Separator, Avatar, DropdownMenu, Skeleton, Alert**. `components.json` is
still present (documents the intended aliases/conventions) in case network access to the registry
is available later and more components need adding the normal way.

Every one of these was restyled through the token system from scratch — none use shadcn's default
zinc/slate palette, default `rounded-lg`/`rounded-xl` radii, or default shadow treatment. See
"Design System" below.

## Design System

Full rationale lives as comments in `src/index.css` (the `@theme` block) and
`src/components/pipeline-stepper.tsx`; this is the short version.

**Palette.** One dark theme only — this is a control-room tool, not a light/dark-toggle consumer
app. Surfaces step from `surface-base` (app background) → `surface-raised` (cards) →
`surface-sunken` (recessed: table zebra, inputs, code). `signal-amber` is the **only** accent,
reserved for the one primary action per view and the pipeline stepper's current-stage indicator —
never spread across every button. Status colors (`status-critical` / `-success` / `-info`) encode
*state*, never used for a plain action button.

**Type.** Three faces, three jobs: **Space Grotesk** (display/headings only), **Inter** (body/UI),
**JetBrains Mono** (every literal identifier or number — order IDs, SKUs, batch numbers,
quantities, timestamps, percentages — right-aligned in table columns). All three are self-hosted
via `@fontsource-variable/*` rather than loaded from Google Fonts' CDN at runtime — same font
files, but no external network dependency, no FOUC/CLS from a blocking `<link>`, and it keeps
working if a factory floor machine has flaky internet. This is a deliberate substitution for the
brief's literal "Google Fonts" instruction, not a shortcut — worth flagging as a judgment call.

**Layout.** A fixed 240px left "instrument rail" (`src/components/app-shell/instrument-rail.tsx`),
not a top navbar — grouped by domain (Overview / Production / Materials / Quality / Admin).
Precise 4–6px radii throughout (Tailwind's stock `rounded-sm`/`rounded-md` already land there —
the discipline is in *never* reaching for `rounded-lg`/`xl`/`2xl`, which is where the generic
bubbly-SaaS look usually creeps back in). No drop shadows for depth — only the surface-color steps
and hairline `surface-border`.

**The pipeline stepper** (`src/components/pipeline-stepper.tsx`) is the signature component — a
real rendering of the backend's actual `OrderStatus` state machine (`src/lib/order-pipeline.ts`
mirrors `prisma/schema.prisma`'s enum exactly: `Open → PendingRM → Scheduled → Running → QC →
DispatchReady → Closed`), not decorative step numbers. One component, a `size: "full" | "compact"`
prop. The current stage pulses (`animate-signal-pulse`, defined in `index.css`); global CSS
disables all animation duration under `prefers-reduced-motion: reduce`, so the pulse degrades to a
static amber dot rather than being separately coded per-component.

Review it all in one place at `/style-guide` (route exists, not linked in the nav — see "Roadmap").

## Authentication

**Token storage: `localStorage`, not in-memory-only** — see the full reasoning as a comment in
`src/lib/auth-storage.ts`. Short version: this app stays open for hours on a shop floor where a
reload is routine, and the backend has **no refresh-token endpoint at all** (a documented,
deliberate simplification on its side — a single 8h token, log in again after it expires). That
means in-memory-only storage buys no real silent-reauth capability here — there's nothing to
silently reauth *with* — it would just mean re-entering a password on every accidental refresh,
for no corresponding security gain against this backend's actual design. `localStorage` was the
informed choice, not the default one. Revisit if this app later gets a real refresh-token flow or
a public-facing deployment.

On boot, a stored token is **re-validated** against `GET /api/auth/me` (not just trusted) —
`src/features/auth/auth-context.tsx`. A `401` anywhere (not just at boot) clears storage and
redirects to `/login` via a central handler registered with the API client.

**Nav visibility is a UX nicety, not a security boundary** — said explicitly in
`src/lib/nav-config.ts`. It's worth noting `StoreManager` and `ProductionManager` can both *read*
every module per the backend's actual permission matrix (only *writes* are role-split) — so
almost nothing is actually hidden between those two roles; User Management is the one real
Admin-only case. The backend's `authenticate`/`authorize` middleware is the real enforcement, on
every request, regardless of what this nav shows.

## Scope built so far (Phase 1)

- Design system foundation: tokens, fonts, `/style-guide` review page, the pipeline stepper.
- Auth: login page, token handling, protected-route wrapper, role-aware nav shell.
- Dashboard overview page (`GET /api/dashboard/overview`): production output (a small hand-built
  bar chart — see the "why not a charting library" note in
  `src/features/dashboard/mini-bar-chart.tsx`), planning health, material health (CTB breakdown +
  PR pipeline), and the four management KPIs.

## Roadmap (not built yet)

Every other nav item (Orders, Daily Logs, Scheduling, Risk, RM Inventory, BOM, CTB, Material
Dashboard, Purchase Requisitions, QC Batches, Testing Plans, Products, Lines, HR Teams, Users)
currently renders a placeholder (`src/components/coming-soon.tsx`) — routed and nav-visible so the
shell can be reviewed end-to-end, not implemented. Later phases build these module by module,
including the order detail page where the pipeline stepper's `size="full"` variant gets its real
home.

## A note on `react-router` / `react-router-dom`'s current npm audit finding

`npm audit` reports a high-severity advisory against `react-router` (CSRF bypass in **RSC
Framework Mode**). This app is a plain client-side SPA (`<BrowserRouter>`, no RSC/framework mode
opted into), so the vulnerable code path isn't in use — kept at the installed version rather than
downgrading to the pre-vulnerable-range release `npm audit fix --force` suggests, which would lose
several patch releases' worth of unrelated fixes for a risk that doesn't apply to how this app
uses the library.
