# Architecture

Partner OS is a **multi-tenant SaaS** for Moroccan COD (cash-on-delivery)
e-commerce partners who ship via OzonExpress and (optionally) sync a Shopify
catalogue. One deployment serves many partner organizations; the data layer
keeps them strictly isolated.

> New here? Read this, then [development.md](./development.md) to run it
> locally, then the [runbooks](./runbooks/) for operating it.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 16** (App Router, `src/`, Turbopack), TypeScript, alias `@/*` |
| UI | Tailwind v4, shadcn/ui (New York), Recharts, lucide-react |
| Auth | **Clerk** (+ Organizations) → DB-backed roles |
| DB | **Prisma 7** → **PostgreSQL (Neon)**, RLS-enforced |
| Background jobs | **Inngest** (durable functions, crons) |
| Email | **Resend** (daily digest) |
| Files/PDF | `@react-pdf/renderer` (server-side, no Chromium), SheetJS (`xlsx`) |
| Observability | **Sentry** + Vercel Speed Insights + structured logging — see [observability.md](./observability.md) |
| Hosting | **Vercel** (Root Directory = `web`), Neon, Inngest Cloud |

The app lives in **`web/`**; the repo root holds an unrelated SvelteKit project.

## Multi-tenancy — the core invariant

Every tenant table has an `orgId` and **Postgres Row-Level Security (FORCE)**
via an `org_isolation` policy keyed on `current_setting('app.current_org_id')`.
Two access paths, both in `src/lib/db/`:

- **`getOrgDb(orgId)`** — the single entry point for tenant data. Returns an
  extended Prisma client that (1) injects/stamps `orgId` on every operation
  (app-layer guard) and (2) runs inside a transaction that sets the
  `app.current_org_id` GUC so the **database** RLS policy also passes. The
  injected `orgId` is merged **last**, so a spoofed `where: { orgId: other }`
  is overridden — never an escape hatch.
- **`withOrg(orgId, tx => …)`** — same GUC, for raw SQL (`$queryRaw`).

**Global (non-RLS) tables:** `Organization`, `User`, `CityCatalog` — use the
base `db` client. The tenant set is `TENANT_MODELS` in `src/lib/db/index.ts`.

> With FORCE RLS, a tenant table returns **zero rows** when the GUC is unset —
> so forgetting to scope fails closed, not open. Verified by the isolation
> tests (run as a non-superuser so RLS genuinely applies).

## Role model (RBAC)

Four DB-backed roles in `Membership.role`: **owner > admin > operator >
viewer** (`src/lib/auth/roles.ts`). Clerk's coarse org role
(`org:admin` / `org:member`) maps in on first sight; the DB role is
authoritative.

- `getAuthContext()` — memoized per request; resolves `userId`, `orgId`,
  `appRole`, `isPlatformAdmin`. Also attaches `orgId`/`userId` to the Sentry
  scope (the only context that leaves the app).
- `requireOrgRole(min)` — server guard, redirects on failure.
- `meetsOrgRole(role, min)` — non-throwing check (API routes, conditional UI).
- **Money/strategy surfaces (Finance, Reports) are admin/owner only** — gated
  at the page, the nav (`canSee`), and the API/export route. The dashboard
  `finance` block is never serialized for operators/viewers.
- Platform super-admins: `PLATFORM_ADMIN_USER_IDS` (env allowlist).

## Module framework

Most list screens (orders, customers, stock, …) are driven by a config in
`src/modules/*` + the registry in `src/lib/module/`. A `<DataTable>` renders
server-side pagination / filter / sort / export from that config. Optional
per-module overrides: `list`, `exportRows`, `bulkHandlers`, and `minRole`.
See [development.md](./development.md#add-a-module) to add one.

## Reports

`src/lib/reports/` — `period.ts` (presets + equal-length previous window),
`performance.ts` (over-time aggregates), `breakdowns.ts` (par ville / produit).
Aggregates only, org-scoped, reusing the COD-by-status defs in
`src/lib/parcel-status.ts`.

## Integrations

Per-org credentials live in an **encrypted vault** (`src/lib/integrations/vault.ts`,
AES-256-GCM via `ENCRYPTION_KEY`) — entered in the UI (Settings → Integrations),
never in env. Clients:

- **OzonExpress** (`src/lib/shipping/ozon.ts`) — parcel creation, BL, tracking.
- **Shopify** (`src/lib/integrations/shopify/`) — catalogue + order sync.

Both wrap failures with a `provider` tag for Sentry. See
[runbooks/external-services.md](./runbooks/external-services.md).

## Build & deploy flow

1. Develop on a branch → PR. CI (`web-test.yml`) runs the full Vitest suite as
   a non-superuser Postgres role; **a passing `isolation` check is required to
   merge** (branch ruleset on `main`).
2. Squash-merge to `main`.
3. Vercel auto-deploys `main` → Production. The build is
   **`prisma migrate deploy && next build`**, so migrations apply (over
   `DIRECT_URL`) before the build. Branches/PRs get preview URLs.

See [runbooks/migrations.md](./runbooks/migrations.md) and
[runbooks/jobs.md](./runbooks/jobs.md).
