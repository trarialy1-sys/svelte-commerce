# Runbook — Migration discipline

Prisma 7 + Neon. The datasource URL is in **`prisma.config.ts`**
(`env("DIRECT_URL")`), not in `schema.prisma`.

## The two URLs

- **`DIRECT_URL`** — direct (non-pooled) connection. **Migrations use this**
  (Neon's pooled endpoint can't run DDL).
- **`DATABASE_URL`** — pooled. The app runtime uses this via the driver adapter.

## Authoring a migration (dev / branch DB only)

```bash
npx prisma migrate dev --name <change>
```

Edit `schema.prisma` first, then run the above against a **dev or Neon-branch**
database. It writes `prisma/migrations/<timestamp>_<change>/migration.sql`,
applies it, and regenerates the client. Commit the migration folder.

- Tenant tables need `orgId`, RLS (the `org_isolation` policy + FORCE), and an
  `@@index([orgId, …])`. Copy the RLS block from an existing tenant-table
  migration.
- Add btree indexes for columns that reports/lists group/filter/sort by.

## Deploying

The Vercel build command is **`prisma migrate deploy && next build`** — pending
migrations apply (over `DIRECT_URL`) before the app builds. Nothing manual.

## Hard rules

- **Never** `prisma migrate reset`, `db push --force-reset`, or `--force`
  against a database with partner data. These drop/recreate tables.
- **Never** point `migrate dev` at production. Author on dev/branch DBs;
  production only ever sees `migrate deploy`.
- One migration per logical change; never hand-edit an already-applied
  migration — add a new one.
- A failed `migrate deploy` blocks the deploy (good) — fix forward with a new
  migration, don't force.

## Baseline (history)

Production was originally schema-applied by hand (no `_prisma_migrations`
table). It was **baselined** once — recording the existing migrations as applied
(with checksums) — so `migrate deploy` works going forward. If you ever attach
Prisma Migrate to a hand-managed DB again, baseline it the same way
(`prisma migrate resolve --applied <migration>`) rather than resetting.

## Verify

```bash
npx prisma migrate status     # against DIRECT_URL
```
Should report no pending migrations after a deploy.
