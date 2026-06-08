# Runbook — Testing & the merge gate

## Three hard rules

1. **Never hit live external APIs in tests.** Ozon / Shopify / Resend are
   mocked (`vi.mock` the vault + stub `fetch`). A live Ozon parcel create costs
   money — it's a hazard, not a test.
2. **Isolation tests run as a NON-superuser Postgres role.** Superusers bypass
   RLS, so an owner-role test would pass for the wrong reason.
3. **Separate test DB, never prod.** A dedicated Neon branch or a throwaway
   Postgres. The suite writes and resets.

## Layers

- **Vitest** (`npm test`) — unit + integration: tenant isolation, RBAC /
  money-gating (payload level), the logic engines (city resolver, SKU
  tokenizer, `mapOzonStatus`, COD-by-status, import coercion, finance period,
  search), and integration mapping with mocked Ozon. Logic tests run anywhere;
  DB-backed tests need `DATABASE_URL`/`DIRECT_URL`.
- **Playwright** (`npm run test:e2e`) — a few critical journeys; see below.

## Running the DB tests locally as a non-superuser

Mirror CI: migrate as a superuser (DIRECT_URL), run the suite as a
non-superuser app role so RLS is enforced.

```bash
# with a local/branch Postgres:
export DIRECT_URL="postgresql://postgres@localhost:5432/appdb"
export DATABASE_URL="postgresql://app_user:app_pw@localhost:5432/appdb"

# 1. create the non-superuser role
psql "$DIRECT_URL" -c "CREATE ROLE app_user LOGIN PASSWORD 'app_pw' NOSUPERUSER NOBYPASSRLS;"
# 2. migrate as the superuser
npx prisma migrate deploy
# 3. grant the app role table access
psql "$DIRECT_URL" -c "GRANT USAGE ON SCHEMA public TO app_user;" \
  -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;" \
  -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO app_user;"
# 4. run the suite (connects as app_user → RLS genuinely applies)
npm test
```

This is exactly what `.github/workflows/web-test.yml` does in CI.

## End-to-end (Playwright)

- **Smoke** (always runs): `/api/health` returns ok; a guarded route redirects
  to sign-in. No auth needed.
- **Authenticated journeys** use `@clerk/testing` and are **skipped** unless
  `E2E_CLERK_USER_EMAIL` / `_PASSWORD` are set. To enable in CI
  (`web-e2e.yml`): set the repo **variable** `E2E_ENABLED=true` and the repo
  **secrets** `E2E_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_SECRET_KEY`,
  `E2E_ENCRYPTION_KEY`, `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD` (a
  test user that is admin/owner in a test org). Externals must be mocked in that
  instance — never run E2E against prod or live Ozon.

## The merge gate (CI)

`web-test.yml` runs the full Vitest suite (as non-superuser) on every PR. To
make it **block merge**, mark it required on `main`:

**Settings → Rules → Rulesets → New branch ruleset**
1. Name it (e.g. `protect main`); **Enforcement: Active**.
2. **Target branches → Include default branch**.
3. **Require status checks to pass** → **Add checks** → `isolation` (GitHub
   Actions); tick **Require branches to be up to date**.
4. **Require a pull request before merging** (Required approvals **0** for a
   solo maintainer).
5. Leave **Block force pushes** + **Restrict deletions** on. **Create.**

> The check only appears in the picker after the workflow has run on a PR once.
> Once Active, no PR can merge into `main` with a failing/missing `isolation`
> check, and direct pushes to `main` are blocked.

Coverage focuses on the catastrophic-if-wrong paths (isolation, RBAC, logic,
integration mapping) — we don't chase a % for its own sake.
