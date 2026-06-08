import "server-only";

import pino from "pino";
import * as Sentry from "@sentry/nextjs";

import { redactString } from "./scrub";

/**
 * Light structured logger for server / integration / job paths. JSON lines to
 * stdout (picked up by Vercel logs), consistent fields, no transport/worker
 * threads (serverless-safe). Errors are logged AND captured by Sentry with the
 * same context tags — one call, both sinks.
 */
export interface LogContext {
  orgId?: string;
  userId?: string | null;
  route?: string;
  provider?: "ozon" | "shopify";
  job?: string;
  outcome?: "ok" | "error" | "skipped" | "retry";
  [key: string]: unknown;
}

// Defense-in-depth: pino redacts these object paths even though structured
// fields below shouldn't carry them. (Sentry has its own scrub for events.)
const REDACT_PATHS = [
  "*.token",
  "*.apiKey",
  "*.secret",
  "*.password",
  "*.authorization",
  "*.phone",
  "*.email",
  "*.address",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: {
    service: "partner-os",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
  },
  redact: { paths: REDACT_PATHS, censor: "[redacted]" },
});

export function logInfo(msg: string, ctx: LogContext = {}): void {
  logger.info(ctx, redactString(msg));
}

export function logWarn(msg: string, ctx: LogContext = {}): void {
  logger.warn(ctx, redactString(msg));
}

/** Tags Sentry can index on — only non-empty primitives. */
function tagsFrom(ctx: LogContext): Record<string, string> {
  const tags: Record<string, string> = {};
  if (ctx.orgId) tags.orgId = ctx.orgId;
  if (ctx.userId) tags.userId = ctx.userId;
  if (ctx.provider) tags.provider = ctx.provider;
  if (ctx.route) tags.route = ctx.route;
  if (ctx.job) tags.job = ctx.job;
  if (ctx.outcome) tags.outcome = ctx.outcome;
  return tags;
}

/**
 * Log an error and capture it in Sentry with the same context. The error's
 * message is redacted before it hits stdout; Sentry's `beforeSend` scrubs the
 * captured event. Returns the error so callers can `throw logError(...)`.
 */
export function logError(msg: string, err: unknown, ctx: LogContext = {}): unknown {
  const safeMsg = redactString(msg);
  const errInfo =
    err instanceof Error
      ? { name: err.name, message: redactString(err.message) }
      : { message: redactString(String(err)) };
  logger.error({ ...ctx, outcome: ctx.outcome ?? "error", err: errInfo }, safeMsg);
  Sentry.captureException(err, { tags: tagsFrom({ ...ctx, outcome: ctx.outcome ?? "error" }) });
  return err;
}
