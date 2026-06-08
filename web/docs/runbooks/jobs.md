# Runbook — Background jobs (Inngest)

Durable functions in `src/lib/inngest/functions.ts`, served at
**`/api/inngest`** (app id `partner-os`), authed by `INNGEST_SIGNING_KEY`.
Inngest replaced Vercel Cron (the Hobby plan caps cron at once/day) — so
`vercel.json` has **no** `crons`; don't re-add them.

## The functions

| Function | Trigger | What it does |
|----------|---------|--------------|
| `parcel-sync-schedule` | cron `0 */2 * * *` (every 2h) | Lists active orgs, fans out `parcel/sync.requested` per org. |
| `parcel-sync-org` | event `parcel/sync.requested` | Concurrency 3, 4 retries. Pulls OzonExpress tracking, updates parcel statuses, emits `parcel/status.changed` per transition. |
| `digest-schedule` | cron `30 6 * * *` (~07:30 Casablanca) | Fans out `digest/send.requested` per active org. |
| `digest-send-org` | event `digest/send.requested` | Concurrency 5, 2 retries. Idempotency guard (skips if a digest already went out today), then sends via Resend. |

Failures are logged + captured to Sentry (`captureJobError`, tagged `job` +
`orgId`) and rethrown so Inngest retries and the run shows failed.

## Setup / sync

See [external-services.md](./external-services.md#inngest-background-jobs):
set the keys in Vercel, redeploy, then **Apps → Sync** the serve URL. After any
function signature change, the app re-syncs on the next deploy (or hit **Resync**
in the Inngest dashboard).

## Verify / trigger

- **Locally:** `npx inngest-cli@latest dev` → open `http://localhost:8288` →
  Functions → **Invoke** to trigger; inspect runs/steps.
- **Production:** Inngest dashboard (Production env) → **Functions** shows
  next-run times; **Runs** shows attempts, retries, and fan-out. To smoke-test,
  open `parcel-sync-schedule` → **Invoke** and watch it fan out per org.
- **Health of the endpoint:** a plain GET to `/api/inngest` is signature-gated
  (401 in a browser is expected).

## Common issues

- **App shows "unreachable" on sync** → the redeploy carrying the keys hasn't
  finished, or `INNGEST_SIGNING_KEY` is wrong/missing.
- **Functions don't run in prod** → keys not set, or the app was never synced.
- **Digest didn't send** → check Resend (`RESEND_FROM`/domain); the idempotency
  guard also skips if one already went out today.
