# Observability (Chunk 3.3)

How we know the platform breaks (errors, failed jobs, integration failures) and
whether it's healthy/fast (performance, Web Vitals, uptime). Observability is
**platform/dev-facing** — there is no per-org user UI. The PII/secret scrub
governs everything that leaves the app into third-party tooling.

---

## Pass A — errors & reliability

### Sentry

`@sentry/nextjs` is wired through the Next instrumentation hooks:

| File | Runtime |
|------|---------|
| `src/instrumentation.ts` | server boot (`register`) + `onRequestError` |
| `src/instrumentation-client.ts` | browser + `onRouterTransitionStart` |
| `sentry.server.config.ts` | Node (API routes, RSC, Inngest) |
| `sentry.edge.config.ts` | Edge (the Clerk proxy) |
| `next.config.ts` → `withSentryConfig` | release tagging + source-map upload |

All four share `src/lib/observability/sentry-options.ts` (one DSN, one scrub,
environment + release). **No DSN set → Sentry is disabled and the app runs
identically**, so local dev needs nothing.

What reaches Sentry:

- Frontend errors and unhandled API/RSC errors (`onRequestError`).
- **Inngest job failures** — captured in the handler catch with `job` + `orgId`
  tags, flushed, then rethrown (so Inngest still retries and the run shows
  failed). See `src/lib/observability/jobs.ts`.
- **Integration failures** (Ozon / Shopify) — captured at the client boundary
  with a `provider` tag. See `src/lib/shipping/ozon.ts`,
  `src/lib/integrations/shopify/client.ts`.

### The scrub (non-negotiable) — `src/lib/observability/scrub.ts`

`beforeSend` + breadcrumb scrub run in **every runtime**. Deny-by-default at the
field level:

- **Redacted** (key-name match, recursive): credentials/tokens
  (`apiKey`, `customerId`, `accessToken`, `authorization`, `secret`, …),
  customer **phone / email / address / name**, and **money** (`codPrice`,
  `amount`, `price`, `totalPrice`, …).
- **Free-form strings** (messages, breadcrumbs, URLs, exception values) have
  **emails and Moroccan phone numbers** stripped.
- Request **headers + cookies are dropped wholesale**; query string + body are
  scrubbed.
- **Only `orgId` + `userId` survive** — attached per-request from the auth
  resolver (`setSentryContext`). `sendDefaultPii: false`.

Verified by `src/lib/observability/__tests__/scrub.test.ts`. **If you add a new
sensitive field, add its key to `SENSITIVE_KEY` and a test.**

### Structured logging — `src/lib/observability/logger.ts`

`pino`, JSON to stdout (Vercel logs), consistent fields (`orgId`, `route`,
`provider`, `job`, `outcome`), redacted paths. `logError(msg, err, ctx)` logs
**and** captures to Sentry in one call.

### Health — `GET /api/health`

Prisma `SELECT 1` over the pooled URL → `200 {status:"ok"}` / `503
{status:"error"}`. Public route, no detail leakage. Used by the uptime monitor.

### Alerting (Sentry dashboard)

In Sentry → **Alerts**, create issue alerts that notify email/Slack on:

- any **new** issue,
- issues tagged `provider:ozon` or `provider:shopify` (integration failures),
- issues tagged `job:*` (Inngest job failures).

---

## Pass B — performance & web quality

### Performance + Web Vitals

- **Sentry tracing** is enabled (`tracesSampleRate` 0.1 in prod, 1.0 in dev);
  `browserTracingIntegration` records pageload/navigation spans and Core Web
  Vitals on the client. Key transactions (dashboard, reports, search,
  status-sync) appear under **Performance** in Sentry.
- **Vercel Speed Insights** (`<SpeedInsights/>` in the root layout) gives a
  first-party **LCP / CLS / INP** dashboard on real traffic, per route.

### Lighthouse

Budgets live in `web/lighthouserc.json`:

| Category | Budget |
|----------|--------|
| Performance | ≥ 0.80 (warn) |
| Accessibility | ≥ 0.90 (**error**) |
| Best-practices | ≥ 0.90 (warn) |
| SEO | ≥ 0.90 (warn) |
| LCP | ≤ 2.5 s · FCP ≤ 2.0 s · CLS ≤ 0.1 · TBT ≤ 300 ms (warn) |

**Public pages (CI):** the `web - Lighthouse` GitHub Action
(`.github/workflows/lighthouse.yml`) runs on manual dispatch against a deployed
URL (default: prod `/sign-in`) and asserts the budgets.

**Authenticated key routes (manual pass):** dashboard / orders / customers /
reports require a Clerk session + DB, so audit them locally against a logged-in
session:

```bash
# 1. Run the app (or use a Vercel preview URL)
cd web && npm run build && npm start          # http://localhost:3000

# 2. In Chrome, sign in, open DevTools → Lighthouse, run on each route:
#    /dashboard  /orders  /customers  /reports
#    (mode: Navigation, device: Desktop)

# Compare scores against the budgets above; fix obvious regressions
# (oversized images, layout shift, render-blocking, a11y contrast/labels).
```

Re-run after any significant UI change to the key routes.

### Uptime monitor (external)

Point an uptime service (UptimeRobot, Better Stack, Vercel monitor, …) at:

- `https://<app>/api/health` — expect **HTTP 200**, body `{"status":"ok"}`,
  interval 1–5 min.
- (optional) a key route like `/sign-in` for the public shell.

Alert to email/Slack on non-200 / downtime.

---

## Setup checklist (external accounts — the last step)

1. **Sentry** → create a project → copy the DSN. In Vercel set
   `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, and (for source maps)
   `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`. Redeploy.
2. **Sentry alerts** → integration-failure + job-failure + new-issue rules.
3. **Vercel** → enable Speed Insights for the project (free).
4. **Uptime monitor** → ping `/api/health`.

Verify: throw a deliberate error in a credential/customer path → it appears in
Sentry **scrubbed** (orgId/userId only); force an Inngest failure → captured +
alert fires; `/api/health` returns 200 (503 when the DB is down).
