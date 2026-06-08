# Development & how-to-extend

## Local setup

```bash
cd web
npm install            # postinstall runs `prisma generate`
cp .env.example .env   # then fill in the values below
npm run dev            # http://localhost:3000
```

### What you need in `.env`

The minimum to boot: a database + Clerk. Full key reference in
[runbooks/environment.md](./runbooks/environment.md).

1. **Database (Neon + Prisma).** In the Neon Console → **Connect**, copy both
   strings:
   - pooled (host has `-pooler`) → `DATABASE_URL` (runtime)
   - direct (no `-pooler`) → `DIRECT_URL` (migrations)
   - both end with `?sslmode=require`.
   Then apply migrations: `npx prisma migrate deploy` (or `migrate dev` when
   authoring — see [runbooks/migrations.md](./runbooks/migrations.md)).
   > Prisma 7: the datasource URL lives in `prisma.config.ts` (`env("DIRECT_URL")`),
   > not in `schema.prisma`.
2. **Auth (Clerk).** Set the `NEXT_PUBLIC_CLERK_*` + `CLERK_SECRET_KEY` keys
   (see `CLERK_SETUP.md`). Enable **Organizations** in the Clerk dashboard.
   Add your own Clerk user id to `PLATFORM_ADMIN_USER_IDS` for admin access.
3. **Encryption.** `ENCRYPTION_KEY` — a 32-byte base64 key for the credential
   vault: `openssl rand -base64 32`.
4. **Optional services** (the app degrades gracefully without them): Resend,
   Inngest, Sentry. See [runbooks/external-services.md](./runbooks/external-services.md).

### Running background jobs locally (Inngest Dev Server)

Inngest functions (parcel sync, digest) run through a local dev server — no
keys needed locally:

```bash
# terminal 1
npm run dev
# terminal 2
npx inngest-cli@latest dev      # http://localhost:8288, auto-discovers /api/inngest
```

Open the Inngest dev UI to see functions, trigger them, and inspect runs.

### Tests

```bash
npm test          # Vitest (unit + integration). DB tests need DATABASE_URL/DIRECT_URL.
npm run test:e2e  # Playwright (needs a built+running app; auth specs need Clerk test creds)
```

See [runbooks/testing.md](./runbooks/testing.md) for the test-DB + non-superuser
setup and the merge gate.

---

## How to extend

### Add a module (a new list screen)

1. Add the Prisma model (if new) → migration (see migrations runbook). Tenant
   tables need `orgId` + RLS + an `@@index([orgId, …])`.
2. Create `src/modules/<name>.ts` exporting a `ModuleConfig` (columns,
   `searchFields`, `filters`, `defaultSort`, optional `minRole`,
   `exportColumns`). Register it in `src/lib/module/registry.ts`.
3. Add a page under `src/app/(app)/<name>/page.tsx` that renders `<DataTable>`
   with the module key. Server pagination/filter/sort/export come for free via
   `/api/m/[module]`.
4. Add a nav entry in `src/config/nav.ts` (set `minRole` to gate it).
5. Custom behaviour? Provide `list` / `exportRows` / `bulkHandlers` overrides
   in the registry entry.

### Add a report

1. Add the aggregate fn in `src/lib/reports/` (org-scoped via `getOrgDb`,
   **aggregates only** — `groupBy`/`count`/`aggregate` or a grouped raw query
   in `withOrg`; reuse the COD-by-status defs in `src/lib/parcel-status.ts`).
2. Add a page under `src/app/(app)/reports/<name>/page.tsx`, gate with
   `requireOrgRole("admin")`, render `<ReportsControls>` + your view. For a
   table breakdown reuse `<BreakdownView>`.
3. Add a tab in `reports-controls.tsx` and an `export` branch in
   `src/app/api/reports/[report]/export/route.ts`.
4. Add btree indexes for the columns you group/filter by.

### Add a migration

```bash
# author against a dev/branch DB (never prod):
npx prisma migrate dev --name <change>
```

This updates `schema.prisma`, generates `prisma/migrations/<ts>_<change>/`, and
regenerates the client. On deploy, `prisma migrate deploy` applies it over
`DIRECT_URL`. **Never** `migrate reset`/`--force` against prod — see
[runbooks/migrations.md](./runbooks/migrations.md).

### Add a background job

Add an Inngest function in `src/lib/inngest/functions.ts` (cron or event
trigger), export it in the `functions` array. Wrap external work so failures
report to Sentry (`captureJobError`). See [runbooks/jobs.md](./runbooks/jobs.md).
