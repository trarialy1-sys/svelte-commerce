# Partner Operating System — `web/`

A multi-tenant business OS for COD / Shopify merchants. Lives in `web/` because
the repo root still holds a separate, unrelated SvelteKit project.

## Documentation

- **[docs/architecture.md](docs/architecture.md)** — stack, multi-tenancy
  (`getOrgDb` + RLS), role model, module framework, build/deploy flow.
- **[docs/development.md](docs/development.md)** — local setup + how to add a
  module / report / migration / job.
- **Runbooks** — [environment](docs/runbooks/environment.md) ·
  [external services](docs/runbooks/external-services.md) (incl. the Shopify
  2026 Dev Dashboard) · [credential rotation](docs/runbooks/credential-rotation.md) ·
  [migrations](docs/runbooks/migrations.md) · [jobs](docs/runbooks/jobs.md) ·
  [testing & merge gate](docs/runbooks/testing.md)
- **[docs/observability.md](docs/observability.md)** — Sentry, scrub rules,
  Lighthouse, uptime.

## Stack

- **Next.js 16** (App Router, `src/`, Turbopack) + **TypeScript**, alias `@/*`
- **Tailwind CSS v4** (`@tailwindcss/postcss`, `@import "tailwindcss"` — no config file)
- **shadcn/ui** (New York, neutral base; set up manually — see note below)
- **Prisma 7** ORM → **PostgreSQL on Neon** (RLS-enforced multi-tenancy)
- **Clerk** auth (+ Organizations), **Inngest** jobs, **Resend** email,
  **Sentry** + Vercel Speed Insights observability
- Fonts: **Plus Jakarta Sans** (UI) + **JetBrains Mono** (numbers/code) via `next/font/google`
- Brand: **ODES** — indigo primary on slate neutrals, radius `0.5rem`, light + dark

## Local development

```bash
cd web
npm install
npm run dev        # http://localhost:3000
```

## Database (Neon + Prisma)

1. In the Neon Console → **Connect**, copy **both** strings into `web/.env`:
   - pooled (hostname has `-pooler`) → `DATABASE_URL` (app runtime)
   - direct (no `-pooler`) → `DIRECT_URL` (migrations)
   - both must end with `?sslmode=require`.
2. Apply the initial migration:

   ```bash
   npx prisma migrate dev --name init
   ```

> Prisma 7 note: the connection URL lives in `prisma.config.ts`, not in
> `schema.prisma`. The CLI uses `DIRECT_URL` for migrations (Neon's pooled
> connection can't run them). The runtime client (pooled, via a driver
> adapter) is wired up in chunk 0.3.

## Deploy (Vercel)

1. Import the GitHub repo in Vercel.
2. Set **Root Directory = `web`** (the app is in a subfolder).
3. Add the env vars — see the [environment runbook](docs/runbooks/environment.md).
4. Deploy. `main` = production; branches/PRs = preview URLs. The build runs
   `prisma migrate deploy && next build`, so migrations apply automatically.

## Notes / deviations

- shadcn/ui was set up **manually** (deps + `components.json` + `lib/utils` +
  `button.tsx`) because this environment's network policy blocks
  `ui.shadcn.com` (the CLI's registry returns 403). The result is identical
  to `shadcn init` + `shadcn add button`.
- `src/generated/prisma/` (Prisma client output) is git-ignored and
  regenerated via the `postinstall` script.
