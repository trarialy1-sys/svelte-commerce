# Runbook — External-service setup

Build/merge first; wire external accounts last. Each service degrades
gracefully when unconfigured.

---

## Shopify — custom app via the 2026 Dev Dashboard ⚠️

This is the connection-pain runbook. **Use the new Shopify Dev Dashboard, NOT
the old store-admin "Settings → Apps and sales channels → Develop apps" path** —
that legacy flow is being retired and behaves differently.

1. Go to the **Shopify Dev Dashboard** (the developer dashboard at
   `dev.shopify.com` / your developer account) → **Apps → Create app** →
   **custom / single-store app**.
2. Under **Configuration → Admin API access scopes**, grant exactly what we
   use (read-only where possible):
   - `read_products`, `read_inventory`, `write_inventory`
   - `read_orders` (and `read_all_orders` if you need orders older than 60 days)
   - `read_customers`
3. **Install** the app on the target store. On install you get the **Admin API
   access token** (`shpat_…`) — copy it once.
4. In Partner OS → **Settings → Integrations → Shopify**, enter:
   - **Shop domain** (`your-store.myshopify.com`)
   - **Admin API access token**
   - (optional) API version — defaults to the app's pinned `SHOPIFY_API_VERSION`.

### Gotchas (hard-won)
- **`Forbidden` / 403 on a query** → a **missing dependent scope**. Shopify
  requires scopes for *every* field a query touches (e.g. reading order
  line-item products needs product scopes too). Add the scope, **re-install**,
  retry.
- **Tokens can't be rotated in place.** There's no "regenerate token" button.
  To rotate: **uninstall the app from the store and reinstall it** — that issues
  a fresh `shpat_…`. Then update the vault (Settings → Integrations).
- After changing scopes you must **reinstall** for them to take effect.

---

## OzonExpress

Per-org API credentials, entered in **Settings → Integrations → OzonExpress**:
- **Customer ID** (numeric, e.g. `7123`)
- **API key** (e.g. `xxxxxx-xxxxxx-…`)

The client builds `https://api.ozonexpress.ma/customers/{ID}/{KEY}/<action>`
(server-only; the base URL embeds the key, so it is never logged). Order of the
two path segments matters — **customer id first, then key**. Credentials are
stored unverified; the first real parcel send confirms them.

> Live parcel creation **costs money** — never test by creating a real parcel.
> Tests mock the API (see testing runbook).

Rotation: see [credential-rotation.md](./credential-rotation.md).

---

## Resend (email — daily digest)

1. Create a Resend account → **API Keys** → copy `re_…` into `RESEND_API_KEY`.
2. **Verify a sending domain** (Resend → Domains → add your domain → add the
   DNS records). Until then sends use test mode (`onboarding@resend.dev`,
   delivers only to your own account email).
3. Set `RESEND_FROM` to a verified sender, e.g.
   `Partner OS <noreply@yourdomain.ma>`. Redeploy.

---

## Inngest (background jobs)

1. Create an Inngest account → it has a **Production** environment.
2. **Manage → Event Keys** → copy → `INNGEST_EVENT_KEY` (Vercel).
   **Manage → Signing Key** → copy (`signkey-prod-…`) → `INNGEST_SIGNING_KEY`.
3. Redeploy so the keys apply.
4. **Apps → Sync new app** → enter the serve URL
   `https://<app>.vercel.app/api/inngest` → **Sync**. This registers the app
   `partner-os` and its functions. (Or enable the Inngest **Vercel
   integration** to inject keys + auto-sync on every deploy.)
5. Verify under **Functions** that the four functions appear with next-run
   times. See [jobs.md](./jobs.md).

---

## Sentry (observability)

1. Create a Sentry project (Next.js) → copy the DSN into `NEXT_PUBLIC_SENTRY_DSN`
   + `SENTRY_DSN`.
2. For source maps: **Settings → Auth Tokens** → create a token; set
   `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` in Vercel.
3. Redeploy. Then set up alert rules (integration/job/new-issue). Full detail in
   [../observability.md](../observability.md).

---

## Clerk

See `CLERK_SETUP.md` (keys) + enable **Organizations**. Add the
`/api/webhooks/clerk` endpoint in Clerk → Webhooks and set `CLERK_WEBHOOK_SECRET`.
