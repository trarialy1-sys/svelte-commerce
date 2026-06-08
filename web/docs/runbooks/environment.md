# Runbook — Environment variables

Every key the app reads. Set locally in `web/.env`; in production set them in
**Vercel → Settings → Environment Variables** (Production + Preview) and
**redeploy**. `.env.example` is the canonical template.

> `NEXT_PUBLIC_*` values are **inlined at build time** — changing them requires
> a new deployment (a rebuild), not just an env edit. No surrounding quotes.

## Required

| Key | What | Where to get it |
|-----|------|-----------------|
| `DATABASE_URL` | Pooled Postgres URL (app runtime, via driver adapter). Host has `-pooler`, ends `?sslmode=require`. | Neon Console → Connect (pooled) |
| `DIRECT_URL` | Direct Postgres URL (migrations only). No `-pooler`. | Neon Console → Connect (direct) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key (`pk_…`). | Clerk → API Keys |
| `CLERK_SECRET_KEY` | Clerk secret (`sk_…`). | Clerk → API Keys |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL` | `/sign-in` / `/sign-up`. | static |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `_SIGN_UP_…` | `/`. | static |
| `ENCRYPTION_KEY` | 32-byte base64 key for the credential vault (AES-256-GCM). | `openssl rand -base64 32` |
| `PLATFORM_ADMIN_USER_IDS` | Comma-separated Clerk user ids with platform-admin access. | your Clerk user id |

## Auth webhook

| Key | What |
|-----|------|
| `CLERK_WEBHOOK_SECRET` | Verifies the Clerk → `/api/webhooks/clerk` svix signature (`whsec_…`). |

## Background jobs (Inngest)

| Key | What |
|-----|------|
| `INNGEST_EVENT_KEY` | Send events to Inngest (prod). Inngest → Manage → Event Keys. |
| `INNGEST_SIGNING_KEY` | Verifies Inngest → `/api/inngest` requests (`signkey-prod-…`). Inngest → Manage → Signing Key. |

Not set locally — the Inngest **Dev Server** is used in dev.

## Email (Resend)

| Key | What |
|-----|------|
| `RESEND_API_KEY` | Resend API key (`re_…`). |
| `RESEND_FROM` | Verified sender, e.g. `Partner OS <noreply@yourdomain.ma>`. Until a domain is verified, sends use Resend test mode (`onboarding@resend.dev`, delivers only to your account email). |

## Observability (Sentry)

| Key | What |
|-----|------|
| `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` | Event ingest DSN. Unset → Sentry disabled (app runs identically). |
| `SENTRY_ORG` / `SENTRY_PROJECT` | For source-map upload at build time. |
| `SENTRY_AUTH_TOKEN` | Build-time source-map upload token. Unset → upload skipped. |
| `LOG_LEVEL` | Optional pino level override (default `info`). |

## Legacy / optional

| Key | What |
|-----|------|
| `CRON_SECRET` | Bearer secret for the legacy `/api/cron/*` routes. Inngest (3.1) replaced Vercel Cron; these routes remain but are unused. Safe to leave unset unless you re-enable them. |
| `ANTHROPIC_API_KEY` | Platform AI key (label-scan helper, chunk 1.2). |

## E2E (only if you enable the Playwright job)

`E2E_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_SECRET_KEY`, `E2E_ENCRYPTION_KEY`,
`E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD` — repo **secrets**; plus the
`E2E_ENABLED` repo **variable** = `true`. See
[testing.md](./testing.md#end-to-end-playwright).

## Per-org secrets (NOT env)

OzonExpress (`customerId` + `apiKey`) and Shopify (`shopDomain` +
`adminAccessToken`) are **per-organization** and stored encrypted in the vault,
entered via **Settings → Integrations** in the app — never in env, never in
chat. See [external-services.md](./external-services.md) and
[credential-rotation.md](./credential-rotation.md).
