# Partner Operating System — `web/`

The Next.js foundation for a multi-tenant business OS for COD / Shopify
merchants (Chunk 0.1). Lives in `web/` because the repo root still holds a
separate, unrelated SvelteKit project.

## Stack

- **Next.js 16** (App Router, `src/`, Turbopack) + **TypeScript**, alias `@/*`
- **Tailwind CSS v4** (`@tailwindcss/postcss`, `@import "tailwindcss"` — no config file)
- **shadcn/ui** (New York, neutral base; set up manually — see note below)
- **Prisma 7** ORM → **PostgreSQL on Neon**
- Fonts: **Plus Jakarta Sans** (UI) + **JetBrains Mono** (numbers/code) via `next/font/google`
- Brand: terracotta `#C1542D` primary on warm off-white `#FAF8F5`, radius `0.6rem`, light + dark

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
3. Add env vars `DATABASE_URL` and `DIRECT_URL`.
4. Deploy. `main` = production; branches/PRs = preview URLs.

## Notes / deviations

- shadcn/ui was set up **manually** (deps + `components.json` + `lib/utils` +
  `button.tsx`) because this environment's network policy blocks
  `ui.shadcn.com` (the CLI's registry returns 403). The result is identical
  to `shadcn init` + `shadcn add button`.
- `src/generated/prisma/` (Prisma client output) is git-ignored and
  regenerated via the `postinstall` script.
