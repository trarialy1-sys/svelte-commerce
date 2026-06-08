# Runbook — Credential rotation

Golden rule: **rotate at the source first, then update where we store it, then
verify. Never paste a secret into chat, a commit, an issue, or a log.**

Per-org integration secrets live in the encrypted vault (re-enter via the UI);
platform secrets live in Vercel env (require a redeploy).

## OzonExpress key (per-org)

1. In the OzonExpress customer dashboard, **regenerate the API key**.
2. Partner OS → **Settings → Integrations → OzonExpress** → enter the new key
   (customer id unchanged) → save. The vault re-encrypts it.
3. Verify with a real, low-risk action (e.g. a tracking lookup) — **not** by
   creating a throwaway parcel.
4. If the old key leaked (e.g. appeared in a screenshot/chat), regenerating at
   source immediately invalidates it.

## Shopify access token (per-org)

Tokens **cannot be rotated in place**. To rotate:
1. **Uninstall** the custom app from the store, then **reinstall** it → new
   `shpat_…`.
2. Settings → Integrations → Shopify → paste the new token → save.
3. Re-run a sync to confirm. See
   [external-services.md](./external-services.md#shopify--custom-app-via-the-2026-dev-dashboard-).

## Clerk keys (platform)

1. Clerk → API Keys → roll the secret key.
2. Update `CLERK_SECRET_KEY` in Vercel → **redeploy**.
3. The publishable key (`pk_…`) is public and inlined at build — changing it
   also needs a redeploy.

## ENCRYPTION_KEY (vault master key) — handle with care

Rotating this **invalidates every stored credential** (they were encrypted with
the old key). Procedure: set the new key, then have each org re-enter its
OzonExpress + Shopify credentials. Do this only if the key is compromised.

## Resend / Inngest / Sentry (platform)

- **Resend:** create a new API key, update `RESEND_API_KEY`, delete the old key.
- **Inngest:** rotate the Event/Signing key in Inngest → Manage, update the
  Vercel env, redeploy, re-sync the app.
- **Sentry:** rotate the auth token (source maps only); the DSN is low-risk but
  can be rolled in the project settings.

## CRON_SECRET

Generate a fresh random value (`openssl rand -hex 32`), update Vercel, redeploy.
(Legacy — the cron routes are unused now that Inngest drives scheduling.)
