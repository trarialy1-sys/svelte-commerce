import "server-only";

import * as Sentry from "@sentry/nextjs";

import { logError } from "./logger";

/**
 * Report a background-job (Inngest) failure: structured log + Sentry capture
 * (tagged `job` + `orgId`), then flush before the serverless function unwinds.
 * Call this in the handler's catch and rethrow so Inngest still retries and the
 * run shows as failed in its dashboard.
 */
export async function captureJobError(
  job: string,
  err: unknown,
  orgId?: string
): Promise<void> {
  logError(`inngest:${job} failed`, err, { job, orgId, outcome: "error" });
  await Sentry.flush(2000).catch(() => {});
}
