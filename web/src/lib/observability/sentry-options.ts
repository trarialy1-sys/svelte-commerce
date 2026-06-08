import { scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * Shared Sentry.init options for every runtime (browser / node / edge). The DSN
 * is read from env — when unset (local dev, or before the account is wired up)
 * Sentry is effectively disabled, so the app runs identically without it.
 *
 * `environment` distinguishes prod / preview / development; `release` is the
 * Vercel commit SHA so events tie back to a deploy (source maps uploaded by the
 * build plugin in next.config).
 */
export const sentryEnabled = Boolean(
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN
);

const environment =
  process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

const release =
  process.env.NEXT_PUBLIC_SENTRY_RELEASE ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  undefined;

export const baseSentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN,
  enabled: sentryEnabled,
  environment,
  release,
  // Light sampling — these are tuned up in Pass B (performance).
  tracesSampleRate: environment === "production" ? 0.1 : 1.0,
  // Never let the SDK collect local variables / default PII.
  sendDefaultPii: false,
  // The privacy gate — applied to every event + breadcrumb, every runtime.
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
} as const;
